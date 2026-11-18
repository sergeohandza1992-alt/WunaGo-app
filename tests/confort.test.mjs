// Confort de navigation : menu latéral, retour Android fiable, position de défilement, transitions,
// envoi à reprendre, pastille « en cours », touche Entrée, glisser pour revenir.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const PORT = 8781, URL = `http://localhost:${PORT}/`;
const srv = spawn('node', ['tests/dev-server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, WG_PUSH_DRY: '1' } });
process.on('exit', () => srv.kill('SIGTERM'));
process.on('uncaughtException', e => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('ready') && r()));
const results = []; const ok = (n, c, info = '') => { const l = `${c ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`; results.push(l); console.error(l); };
const call = async (p, m, b, tok) => { const r = await fetch(URL + 'api' + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} j._status = r.status; return j; };
const CAP = 'tests/captures/confort/'; mkdirSync(CAP, { recursive: true });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 4.0489, longitude: 9.6996 } });
await fixClock(ctx);
await ctx.addInitScript(() => { window.WG_ALL_SERVICES = false; window.WG_CLASSIC_FORM = false; window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(e.message));
const screenText = () => P.evaluate(() => (document.querySelector('.screen-body') || {}).innerText || '');

/* connexion : la touche Entrée envoie le code */
await P.goto(URL); await P.waitForFunction(() => window.WAPI && WAPI.status.checked);
await P.fill('[data-bind="phone"]', '699445566'); await P.press('[data-bind="phone"]', 'Enter');
ok('Touche Entrée : le code est demandé', !!(await P.waitForSelector('[data-action="otpKey"]', { timeout: 5000 }).catch(() => null)));
const code = (await P.locator('b').first().textContent()).trim();
for (const ch of code) await P.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await P.waitForSelector('text=Comment vous appelle'); await P.locator('input').first().fill('Ariane Ngono'); await P.press('input >> nth=0', 'Enter');
await P.waitForSelector('[data-bind="quickCode"]');
ok('Touche Entrée : prénom validé, accueil ouvert', true);

/* menu latéral */
ok('Bouton menu sur l\'accueil', await P.isVisible('button.menu-btn[data-action="openMenu"]'));
await P.click('[data-action="openMenu"]'); await P.waitForSelector('.drawer');
const items = await P.locator('.drawer .drawer-item').allInnerTexts();
ok('Menu : compte, envois, préférences, aide', ['Mon profil', 'Mes adresses', 'Moyens de paiement', 'Espace commerçant', 'Notifications', 'Aide', 'Devenir livreur'].every(k => items.some(t => t.includes(k))), items.join(' | ').slice(0, 200));
const top = await P.locator('.drawer').innerText();
ok('Menu : nom, numéro et version', top.includes('Ariane Ngono') && top.replace(/\s/g,'').includes('+237699445566') && top.includes('Version 26'), top.slice(0, 120).replace(/\n/g, ' '));
await P.waitForTimeout(300); await P.screenshot({ path: CAP + '01-menu.png' });
await P.goBack(); await P.waitForTimeout(300);
ok('Retour du téléphone : ferme le menu sans quitter l\'accueil', !(await P.isVisible('.drawer')) && await P.isVisible('[data-bind="quickCode"]'));
await P.click('[data-action="openMenu"]'); await P.click('.drawer-backdrop', { position: { x: 360, y: 300 } });
ok('Toucher à côté ferme le menu', !(await P.isVisible('.drawer')));

/* une entrée du menu, puis le retour : pas d'appui « pour rien » */
await P.click('[data-action="openMenu"]'); await P.click('.drawer [data-action="openScreen"][data-arg="addresses"]');
await P.waitForSelector('text=Mes adresses');
ok('Entrée du menu : écran ouvert, menu fermé', !(await P.isVisible('.drawer')));
await P.goBack(); await P.waitForTimeout(400);
ok('Un seul retour ramène à l\'accueil', await P.isVisible('[data-bind="quickCode"]'));
await P.click('[data-action="openMenu"]'); await P.click('.drawer [data-action="openScreen"][data-arg="notifs"]');
await P.waitForSelector('[data-action="popScreen"]');
await P.click('[data-action="popScreen"]'); await P.waitForTimeout(300);
const hl = await P.evaluate(() => history.length);
await P.goBack(); await P.waitForTimeout(400);
ok('Flèche ← puis retour du téléphone : « Appuyez encore pour quitter », on reste dans l\'app', await P.isVisible('text=Appuyez encore pour quitter') && P.url().startsWith(URL) && await P.isVisible('[data-bind="quickCode"]'), 'historique ' + hl);
await P.waitForTimeout(2700);

/* onglet ouvert depuis un autre onglet : le retour revient d'abord à l'accueil */
await P.click('[data-action="switchTab"][data-arg="wallet"]'); await P.waitForTimeout(300);
ok('Portefeuille allégé : solde, paiement et accès au menu', await P.isVisible('text=Profil, adresses, Code WunaGo, aide') && !(await P.isVisible('.scroll [data-action="openScreen"][data-arg="addresses"]')));
await P.goBack(); await P.waitForTimeout(400);
ok('Retour depuis un autre onglet : retour à l\'accueil', await P.isVisible('[data-bind="quickCode"]'));

/* envoi commencé puis abandonné : carte « Reprendre » */
await P.evaluate(() => { window.__anims = []; new MutationObserver(() => { const b = document.querySelector('.screen-body'); if (b) window.__anims.push(b.className); }).observe(document.getElementById('app'), { childList: true }); });
await P.fill('[data-bind="quickCode"]', '677554433'); await P.click('[data-action="quickGo"]');
await P.waitForSelector('[data-bind="linkName"]'); await P.fill('[data-bind="linkName"]', 'Paul Etoa');
const animFwd = (await P.evaluate(() => window.__anims)).join(' ');
await P.click('[data-action="popScreen"]'); await P.waitForTimeout(300);
const animBack = await P.evaluate(() => document.querySelector('.screen-body').className);
ok('Transitions : vers la droite en avançant, vers la gauche en revenant', /slide-fwd/.test(animFwd) && /slide-back/.test(animBack), animFwd + ' / ' + animBack);
ok('Envoi non terminé proposé sur l\'accueil', await P.isVisible('text=ENVOI NON TERMINÉ') && await P.isVisible('text=À Paul Etoa'));
await P.screenshot({ path: CAP + '02-reprendre.png' });
await P.click('[data-action="resumeDraft"]'); await P.waitForSelector('[data-bind="linkName"]');
ok('Reprendre : le formulaire est intact', (await P.inputValue('[data-bind="linkName"]')) === 'Paul Etoa' && (await screenText()).includes('77 55 44 33'));
await P.click('[data-action="popScreen"]'); await P.click('[data-action="dropDraft"]');
ok('Effacer le brouillon', !(await P.isVisible('text=ENVOI NON TERMINÉ')));

/* glisser depuis le bord gauche */
await P.click('[data-action="openMenu"]'); await P.click('.drawer [data-action="openScreen"][data-arg="addresses"]'); await P.waitForSelector('text=Mes adresses');
await P.evaluate(() => {
  const app = document.getElementById('app').getBoundingClientRect();
  const mk = (x, y) => new Touch({ identifier: 1, target: document.body, clientX: app.left + x, clientY: y });
  document.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(8, 400)], changedTouches: [mk(8, 400)], bubbles: true }));
  document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(150, 410)], bubbles: true }));
});
await P.waitForTimeout(400);
ok('Glisser depuis le bord gauche : retour', await P.isVisible('[data-bind="quickCode"]'));

/* position de défilement : gardée pendant les rafraîchissements et au retour */
await P.evaluate(() => { document.querySelector('.screen-body .scroll').scrollTop = 200; });
const y0 = await P.evaluate(() => document.querySelector('.screen-body .scroll').scrollTop);
await P.evaluate(() => window.dispatchEvent(new Event('online'))); await P.waitForTimeout(300);
const y1 = await P.evaluate(() => document.querySelector('.screen-body .scroll').scrollTop);
ok('Rafraîchissement : la page ne remonte plus', y0 > 50 && Math.abs(y1 - y0) < 2, y0 + ' → ' + y1);
await P.click('[data-action="pickService"] >> nth=0'); await P.waitForTimeout(300);
await P.click('[data-action="popScreen"]'); await P.waitForTimeout(300);
const y2 = await P.evaluate(() => document.querySelector('.screen-body .scroll').scrollTop);
ok('Retour : on retrouve l\'endroit où l\'on était', Math.abs(y2 - y0) < 2, String(y2));
await P.click('[data-action="switchTab"][data-arg="home"]'); await P.waitForTimeout(300);
ok('Toucher l\'onglet ouvert remonte en haut', (await P.evaluate(() => document.querySelector('.screen-body .scroll').scrollTop)) === 0);

/* pastille « en cours » sur l'onglet Commandes */
const tok = await P.evaluate(() => localStorage.getItem('wunago.token'));
const l = (await call('/links', 'POST', { direction: 'send', phone: '677554433', name: 'Paul', payer: 'them', size: 'small', mineGeo: { lat: 4.05, lng: 9.70 }, mineHint: 'Portail vert' }, tok)).link;
await call('/lien/' + l.token + '/place', 'POST', { mode: 'gps', lat: 4.09, lng: 9.74, hint: 'Portail bleu' });
const cf = await call('/lien/' + l.token + '/confirm', 'POST', {});
ok('Commande créée pour la pastille', cf.status === 'ordered', JSON.stringify(cf).slice(0, 120));
await P.click('[data-action="switchTab"][data-arg="orders"]'); await P.waitForTimeout(800);
await P.click('[data-action="switchTab"][data-arg="home"]'); await P.waitForTimeout(300);
ok('Pastille sur l\'onglet Commandes', (await P.locator('.tab-badge.live').textContent().catch(() => '')) === '1');
await P.screenshot({ path: CAP + '03-pastille.png' });

/* bouton en cours : roue et double appui impossible */
await P.fill('[data-bind="quickCode"]', '655001122'); await P.click('[data-action="quickGo"]'); await P.waitForSelector('[data-bind="linkName"]');
await ctx.route('**/api/links', async r => { if (r.request().method() === 'POST') { await new Promise(x => setTimeout(x, 900)); } r.continue(); });
await P.click('[data-primary][data-action="linkCreate"]');
await P.waitForTimeout(250);
ok('Bouton principal : roue pendant l\'envoi', await P.locator('[data-action="linkCreate"][data-loading], [data-action="linkCreate"][disabled]').count() === 1);
await P.waitForSelector('text=ENVOIS EN ATTENTE', { timeout: 8000 });
ok('Un seul envoi créé malgré l\'attente', (await call('/links', 'GET', null, tok)).links.filter(x => x.contactPhone === '655001122').length === 1);

ok('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter(r => r.startsWith('FAIL'));
console.log(`${results.length - fails.length}/${results.length} réussis`);
srv.kill('SIGTERM'); process.exit(fails.length ? 1 : 0);
