// Paiements mobile money (SasPay, mode test) : recharge du portefeuille par la page de paiement hébergée,
// crédit uniquement après vérification serveur, une seule fois ; refus ; notification signée ; montant incomplet ;
// garde-fous clé/mode ; suivi au backoffice. SasPay est simulé par un petit serveur local (aucun appel réel).
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { mkdirSync } from 'node:fs';

const PORT = 8784, URL = `http://localhost:${PORT}/`, MOCK = 8794, MOCKURL = `http://localhost:${MOCK}`;
const KEY = 'sk_test_banc_wunago', WHSEC = 'whsec_banc_wunago';

/* ---------- faux SasPay ---------- */
const sessions = new Map(); let seq = 0; const calls = [];
const mock = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, MOCKURL); const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString(); const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  calls.push(req.method + ' ' + u.pathname);
  if (u.pathname.startsWith('/api/v1/') && req.headers.authorization !== 'Bearer ' + KEY) return send(401, { success: false, error: { message: 'bad key', code: 'auth' }, code: 401 });
  if (req.method === 'POST' && u.pathname === '/api/v1/checkout-sessions/') {
    const b = JSON.parse(raw); const id = 'cs_' + (++seq);
    sessions.set(id, { id, amount: Number(b.amount), body: b, status: 'PENDING', tx: null, txStatus: null, paidAmount: Number(b.amount) });
    return send(201, { success: true, data: { id, slug: 'slug' + seq, checkout_url: `${MOCKURL}/checkout/${id}`, status: 'PENDING' }, code: 201 });
  }
  let m = u.pathname.match(/^\/api\/v1\/checkout-sessions\/([\w]+)\/status\/$/);
  if (m) { const s = sessions.get(m[1]); if (!s) return send(404, { success: false, error: { message: 'nf' }, code: 404 });
    return send(200, { success: true, data: { status: s.status, transaction_status: s.txStatus, transaction_id: s.tx, amount: String(s.paidAmount) + '.00', network: 'mtn_cm' }, code: 200 }); }
  m = u.pathname.match(/^\/api\/v1\/payments\/([\w-]+)\/verify\/$/);
  if (m) { const s = [...sessions.values()].find(x => x.tx === m[1]); if (!s) return send(404, { success: false, error: { message: 'nf' }, code: 404 });
    return send(200, { success: true, data: { id: s.tx, status: s.txStatus, amount: String(s.paidAmount) + '.00', fee: '100.00', net_amount: String(s.paidAmount - 100) }, code: 200 }); }
  m = u.pathname.match(/^\/checkout\/([\w]+)$/);
  if (m && req.method === 'GET') { const s = sessions.get(m[1]);
    return send(200, `<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:Arial;padding:24px"><h2>SasPay (simulé)</h2><p>Montant : ${s.amount} XAF</p>
      <form method=post action="/checkout/${s.id}/pay?ok=1"><button id=payer style="font-size:20px;padding:12px">Payer avec MTN MoMo</button></form>
      <form method=post action="/checkout/${s.id}/pay?ok=0"><button id=refuser>Refuser</button></form></body>`, 'text/html'); }
  m = u.pathname.match(/^\/checkout\/([\w]+)\/pay$/);
  if (m && req.method === 'POST') { const s = sessions.get(m[1]); s.tx = 'tx-' + s.id + '-' + Date.now();
    if (u.searchParams.get('ok') === '1') { s.status = 'PAID'; s.txStatus = 'SUCCESS'; res.writeHead(302, { location: s.body.return_url }); return res.end(); }
    s.txStatus = 'FAILED'; return send(200, '<p id=echec>Paiement refusé. Fermez cet onglet.</p>', 'text/html'); }
  return send(404, { success: false });
});
await new Promise(r => mock.listen(MOCK, r));
const setSession = (id, patch) => Object.assign(sessions.get(id), patch);

const srv = spawn('node', ['tests/dev-server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, WG_PUSH_DRY: '1', ADMIN_PHONES: '690000001', SASPAY_SECRET_KEY: KEY, SASPAY_WEBHOOK_SECRET: WHSEC, SASPAY_API_BASE: MOCKURL + '/api/v1' } });
const stop = () => { srv.kill('SIGTERM'); mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.error(e); stop(); process.exit(1); });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('ready') && r()));
const results = []; const ok = (n, c, info = '') => { const l = `${c ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`; results.push(l); console.error(l); };
const call = async (p, m, b, tok, headers = {}) => { const r = await fetch(URL + 'api' + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...headers }, body: b == null ? undefined : (typeof b === 'string' ? b : JSON.stringify(b)) }); let j = {}; try { j = await r.json(); } catch (e) {} j._status = r.status; return j; };
async function tokenFor(phone, name) { let r = await call('/auth/request', 'POST', { phone }); r = await call('/auth/verify', 'POST', { phone, code: r.demoCode }); if (name) await call('/me', 'PATCH', { name }, r.token); return r.token; }
const sign = (body, ts = Math.floor(Date.now() / 1000)) => ({ 'x-webhook-timestamp': String(ts), 'x-webhook-signature': createHmac('sha256', WHSEC).update(ts + '.' + body).digest('hex'), 'x-webhook-event': 'transaction.success' });
const CAP = 'tests/captures/paiements/'; mkdirSync(CAP, { recursive: true });

/* 0. garde-fous : la clé doit correspondre au mode (jamais d'argent réel par erreur) */
const guard = (vars) => execFileSync('node', ['-e', 'import("./server/saspay.mts").then(m=>console.log(m.saspayOn()+"|"+m.payMode()))'],
  { env: { PATH: process.env.PATH, ...vars }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
ok('Sans clé : paiements désactivés', guard({}) === 'false|test');
ok('Clé de test en mode test : activé, hôte de bac à sable', guard({ SASPAY_SECRET_KEY: 'sk_test_x' }) === 'true|test');
ok('Clé de production en mode test : refusée', guard({ SASPAY_SECRET_KEY: 'sk_live_x' }) === 'false|test');
ok('Clé de test en mode production : refusée', guard({ SASPAY_SECRET_KEY: 'sk_test_x', SASPAY_MODE: 'live' }) === 'false|live');
ok('Clé de production en mode production : activé', guard({ SASPAY_SECRET_KEY: 'sk_live_x', SASPAY_MODE: 'live' }) === 'true|live');
const src = (await import('node:fs')).readFileSync('server/saspay.mts', 'utf8');
ok('Mode test : hôte sandbox-api.saspay.me', src.includes('test: "https://sandbox-api.saspay.me/api/v1"'));

/* 1. l'API annonce le paiement réel ; la recharge simulée est fermée */
const h = await call('/health');
ok('Santé : paiement mobile money actif en mode test', h.pay === 'test', JSON.stringify({ pay: h.pay }));
const t1 = await tokenFor('691005501', 'Awa Client');
ok('Recharge simulée refusée quand SasPay est actif', (await call('/wallet/topup', 'POST', { amount: 5000 }, t1))._status === 409);
ok('Montant trop faible refusé', (await call('/pay/topup', 'POST', { amount: 100 }, t1))._status === 400);
ok('Sans connexion : refusé', (await call('/pay/topup', 'POST', { amount: 1000 }))._status === 401);

/* 2. parcours complet dans l'app : montant → page SasPay → retour → crédit */
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
await fixClock(ctx);
await ctx.addInitScript(() => { window.WG_ALL_SERVICES = false; window.WG_CLASSIC_FORM = false; });
await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(e.message));
await P.goto(URL); await P.waitForFunction(() => window.WAPI && WAPI.status.checked);
await P.fill('[data-bind="phone"]', '691005502'); await P.click('[data-action="requestOtp"]'); await P.waitForSelector('[data-action="otpKey"]');
const code = (await P.locator('b').first().textContent()).trim(); for (const ch of code) await P.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await P.waitForSelector('text=Comment vous appelle'); await P.locator('input').first().fill('Mireille Ngo'); await P.press('input >> nth=0', 'Enter');
await P.waitForSelector('[data-bind="quickCode"]');
const tok = await P.evaluate(() => localStorage.getItem('wunago.token'));
const bal0 = (await call('/me', 'GET', null, tok)).user.wallet.balance;
await P.click('[data-action="switchTab"][data-arg="wallet"]');
await P.click('[data-action="toggleWalletPanel"][data-arg="topup"]');
await P.waitForSelector('[data-action="setTopUpAmount"]');
ok('Recharge : montants rapides, mention de la page sécurisée', await P.isVisible('text=page sécurisée SasPay') && (await P.locator('[data-action="setTopUpAmount"]').count()) === 3);
ok('Mention « mode test : aucun argent réel »', await P.isVisible('text=MODE TEST · AUCUN ARGENT RÉEL'));
ok('Plus de choix Orange/MTN dans l\'app (choisi sur la page de paiement)', (await P.locator('[data-action="setTopUpMethod"]').count()) === 0);
await P.click('[data-action="setTopUpAmount"][data-arg="5000"]');
await P.screenshot({ path: CAP + '01-montant.png' });
await P.click('[data-action="doTopUp"]');
await P.waitForURL(/\/checkout\/cs_/);
const sess1 = [...sessions.values()].at(-1);
ok('Session créée : 5 000 XAF, Cameroun, montant en texte décimal', sess1.body.amount === '5000.00' && sess1.body.currency === 'XAF' && sess1.body.country === 'CM');
ok('Adresse de retour vers l\'app, référence du paiement jointe', /\/#paiement=[0-9a-f-]{36}$/.test(sess1.body.return_url) && sess1.body.return_url.endsWith(sess1.body.metadata.wg_payment));
ok('Aucun crédit avant le paiement', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0);
await P.screenshot({ path: CAP + '02-page-saspay.png' });
await P.click('#payer');
await P.waitForURL(u => String(u).startsWith(URL), { timeout: 10000 });
await P.waitForSelector('text=Portefeuille rechargé : +5 000 F', { timeout: 10000 });
ok('Retour dans l\'app : portefeuille crédité de 5 000 F', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0 + 5000);
ok('Adresse nettoyée après le retour', !(await P.evaluate(() => location.hash)));
ok('Paiement en attente effacé du téléphone', (await P.evaluate(() => localStorage.getItem('wunago.pay'))) === null);
await P.screenshot({ path: CAP + '03-credite.png' });
const pid1 = sess1.body.metadata.wg_payment;
ok('Vérification croisée par la transaction (verify)', calls.some(c => /\/payments\/tx-cs_\d+-\d+\/verify\/$/.test(c)));

/* 3. une seule fois : retours répétés, notification, vérification planifiée */
await call('/pay/' + pid1, 'GET', null, tok); await call('/pay/' + pid1, 'GET', null, tok);
const wb = JSON.stringify({ event: 'transaction.success', data: { id: sess1.tx, status: 'SUCCESS', metadata: { wg_payment: pid1 } } });
await call('/saspay/webhook', 'POST', wb, null, sign(wb));
ok('Crédit unique malgré retours et notification', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0 + 5000);
const st1 = await call('/pay/' + pid1, 'GET', null, tok);
ok('État « payé »', st1.payment.status === 'paid' && st1.payment.amount === 5000);

/* 4. refus : la session reste ouverte, l'app propose de reprendre */
await P.click('[data-action="toggleWalletPanel"][data-arg="topup"]'); await P.fill('[data-bind="topUpAmount"]', '2000');
await P.click('[data-action="doTopUp"]'); await P.waitForURL(/\/checkout\/cs_/);
const sess2 = [...sessions.values()].at(-1), pid2 = sess2.body.metadata.wg_payment;
await P.click('#refuser'); await P.waitForSelector('#echec');
await P.goto(URL); await P.waitForSelector('.pay-pending', { timeout: 10000 });
await P.waitForSelector('text=dernière tentative a été refusée', { timeout: 10000 });
ok('Refus : carte « paiement en cours » avec reprise possible', await P.isVisible('[data-action="resumePayUrl"]') && await P.isVisible('[data-action="checkPay"]'));
ok('Refus : rien n\'est crédité', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0 + 5000);
await P.screenshot({ path: CAP + '04-refus.png' });
ok('Carte d\'attente : possibilité de la masquer', await P.isVisible('[data-action="dismissPay"]'));

/* 5. notification signée : le client a payé puis fermé l'onglet */
setSession(sess2.id, { status: 'PAID', txStatus: 'SUCCESS' });
const wb2 = JSON.stringify({ event: 'transaction.success', data: { id: sess2.tx, status: 'SUCCESS' } });
ok('Notification mal signée : refusée', (await call('/saspay/webhook', 'POST', wb2, null, { 'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'x-webhook-signature': '00'.repeat(32) }))._status === 403);
ok('Notification trop ancienne : refusée', (await call('/saspay/webhook', 'POST', wb2, null, sign(wb2, Math.floor(Date.now() / 1000) - 900)))._status === 403);
ok('Contenu modifié après signature : refusé', (await call('/saspay/webhook', 'POST', wb2.replace('SUCCESS', 'SUCCESS '), null, sign(wb2)))._status === 403);
ok('Rien crédité par une notification invalide', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0 + 5000);
const wr = await call('/saspay/webhook', 'POST', wb2, null, sign(wb2));
ok('Notification valide : acceptée', wr._status === 200 && wr.ok);
ok('Notification valide : portefeuille crédité après revérification', (await call('/me', 'GET', null, tok)).user.wallet.balance === bal0 + 7000);
await P.click('[data-action="checkPay"]'); await P.waitForSelector('text=Portefeuille rechargé : +2 000 F', { timeout: 10000 });
ok('L\'app se met à jour et retire la carte d\'attente', !(await P.isVisible('.pay-pending')));

/* 6. montant payé inférieur : pas de crédit automatique */
const r3 = await call('/pay/topup', 'POST', { amount: 10000 }, tok);
ok('Création de paiement par l\'API', r3._status === 201 && /\/checkout\/cs_/.test(r3.checkoutUrl));
const sess3 = [...sessions.values()].at(-1); setSession(sess3.id, { status: 'PAID', txStatus: 'SUCCESS', tx: 'tx-short', paidAmount: 4000 });
const st3 = await call('/pay/' + r3.payment.id, 'GET', null, tok);
ok('Montant incomplet : mis « à vérifier », rien crédité', st3.payment.status === 'review' && st3.wallet.balance === bal0 + 7000);

/* 7. confidentialité : le paiement d'un autre client est introuvable */
ok('Paiement d\'un autre client : introuvable', (await call('/pay/' + pid1, 'GET', null, t1))._status === 404);

/* 8. backoffice */
const ta = await tokenFor('690000001', 'Admin');
const ad = await call('/admin/payments', 'GET', null, ta);
ok('Backoffice : liste et totaux des paiements', ad.enabled && ad.mode === 'test' && ad.totals.paid === 2 && ad.totals.amount === 7000 && ad.totals.fees === 200 && ad.totals.review === 1, JSON.stringify(ad.totals));
ok('Backoffice réservé à l\'équipe', (await call('/admin/payments', 'GET', null, tok))._status === 403);
const A = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
await A.goto(URL + 'admin.html'); await A.evaluate(t => localStorage.setItem('wunago.token', t), ta); await A.goto(URL + 'admin.html');
await A.click('[data-a="nav"][data-v="payments"]'); await A.waitForSelector('text=Mode test', { timeout: 10000 });
ok('Backoffice : vue « Paiements » (mode test signalé)', await A.isVisible('text=Mode test') && (await A.locator('tbody tr').count()) >= 3);
await A.screenshot({ path: CAP + '05-backoffice.png', fullPage: true });

ok('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
stop(); process.exit(failed ? 1 : 0);
