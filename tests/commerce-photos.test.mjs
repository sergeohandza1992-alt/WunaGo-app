// Espace commerçant v27 : secteur d'activité proposé pendant la saisie, Code WunaGo de la boutique créé sur place (QR),
// photo du commerce, photo du colis (envoi simple et groupé), contacts du répertoire, partage du lien, pages publiques.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const PORT = 8783, URL = `http://localhost:${PORT}/`;
const srv = spawn('node', ['tests/dev-server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, WG_PUSH_DRY: '1' } });
process.on('exit', () => srv.kill('SIGTERM'));
process.on('uncaughtException', e => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('ready') && r()));
const results = []; const ok = (n, c, info = '') => { const l = `${c ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`; results.push(l); console.error(l); };
const call = async (p, m, b, tok) => { const r = await fetch(URL + 'api' + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.clone().json(); } catch (e) {} j._status = r.status; j._type = r.headers.get('content-type'); return j; };
const CAP = 'tests/captures/commerce/'; mkdirSync(CAP, { recursive: true });

/* images de test dessinées dans le navigateur */
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block',
  permissions: ['geolocation'], geolocation: { latitude: 4.0489, longitude: 9.6996 } });
await fixClock(ctx);
await ctx.addInitScript(() => {
  window.WG_ALL_SERVICES = false; window.WG_CLASSIC_FORM = false; window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; };
  /* répertoire du téléphone simulé (API Contact Picker d'Android) */
  navigator.contacts = { select: async () => [{ name: ['Mireille Ngo'], tel: ['+237 677 11 22 44'] }, { name: ['Jules'], tel: ['655667788'] }, { name: ['Sans numéro'], tel: [] }] };
});
await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(e.message));
const dir = mkdtempSync(join(tmpdir(), 'wg-img-'));
async function drawImg(file, color, label) {
  const data = await P.evaluate(([color, label]) => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 900, 600);
    x.fillStyle = '#fff'; x.font = 'bold 80px Arial'; x.fillText(label, 60, 320); return c.toDataURL('image/jpeg', .85); }, [color, label]);
  const f = join(dir, file); writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); return f;
}

/* connexion */
await P.goto(URL); await P.waitForFunction(() => window.WAPI && WAPI.status.checked);
const shopImg = await drawImg('boutique.jpg', '#0B1F3A', 'CHEZ MAMA'), parcelImg = await drawImg('colis.jpg', '#C49660', 'COLIS'), parcel2 = await drawImg('colis2.jpg', '#8A5A2B', 'PLAT');
await P.fill('[data-bind="phone"]', '691002200'); await P.click('[data-action="requestOtp"]'); await P.waitForSelector('[data-action="otpKey"]');
const code = (await P.locator('b').first().textContent()).trim(); for (const ch of code) await P.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await P.waitForSelector('text=Comment vous appelle'); await P.locator('input').first().fill('Mama Ngo'); await P.press('input >> nth=0', 'Enter');
await P.waitForSelector('[data-bind="quickCode"]');
const tok = await P.evaluate(() => localStorage.getItem('wunago.token'));

/* 1. création de l'espace : secteur, photo, Code WunaGo sur place */
await P.click('[data-action="openMenu"]'); await P.click('.drawer [data-action="openMerchant"]');
await P.waitForSelector('[data-bind="m.name"]');
await P.fill('[data-bind="m.name"]', 'Chez Mama Ngo');
await P.locator('[data-bind="m.activity"]').pressSequentially('rest', { delay: 30 });
await P.waitForSelector('.act-list');
const sugg = await P.locator('.act-list button').allInnerTexts();
ok('Secteur : propositions pendant la saisie', sugg.includes('Restaurant') && sugg.length <= 6, sugg.join(', '));
await P.locator('[data-bind="m.activity"]').fill(''); await P.locator('[data-bind="m.activity"]').pressSequentially('pharm', { delay: 30 });
ok('Recherche sans accents ni majuscules', (await P.locator('.act-list button').allInnerTexts()).some(t => t === 'Pharmacie'));
await P.locator('[data-bind="m.activity"]').fill(''); await P.locator('[data-bind="m.activity"]').pressSequentially('grill', { delay: 30 });
await P.click('.act-list button:has-text("Grillades")');
ok('Secteur choisi dans la liste', (await P.inputValue('[data-bind="m.activity"]')) === 'Grillades et poissons braisés' && !(await P.isVisible('.act-list')));
await P.setInputFiles('input[data-file="shop"]', shopImg);
await P.waitForSelector('.shop-photo img');
ok('Photo du commerce affichée avant l\'enregistrement', await P.isVisible('.shop-photo img'));
ok('Pas encore de code : création proposée sur place', await P.isVisible('text=Créer le Code WunaGo de la boutique'));
await P.fill('[data-bind="m.hint"]', 'Face au carrefour Ndokoti, bâche rouge');
await P.screenshot({ path: CAP + '01-creation.png' });
await P.click('[data-action="mCreateCode"]');
await P.waitForSelector('.qr-mini svg', { timeout: 10000 });
const shopCode = (await P.locator('.qr-mini + .col .mono').first().textContent()).trim();
ok('Code WunaGo créé devant la boutique, avec son QR code', /^WG-[0-9A-Z]{4}$/.test(shopCode) && await P.isVisible('text=Face au carrefour Ndokoti'), shopCode);
await P.screenshot({ path: CAP + '02-code-cree.png' });
await P.click('[data-action="saveMerchant"]');
await P.waitForSelector('text=Clients fréquents');
let me = await call('/merchant', 'GET', null, tok);
ok('Commerce enregistré une fois : nom, secteur, type déduit, code, photo', me.merchant.name === 'Chez Mama Ngo' && me.merchant.activity === 'Grillades et poissons braisés' && me.merchant.kind === 'restaurant' && me.merchant.placeCode === shopCode && me.merchant.hasPhoto === true, JSON.stringify(me.merchant));
ok('Tableau du commerce : photo, secteur et QR code', await P.isVisible('.shop-photo img') && await P.isVisible('text=GRILLADES ET POISSONS BRAISÉS') && await P.isVisible('.qr-mini svg'));
await P.waitForFunction(() => { const i = document.querySelector('.shop-photo img'); return i && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
ok('Photo du commerce chargée (accès réservé au compte)', await P.evaluate(() => { const i = document.querySelector('.shop-photo img'); return !!i && i.naturalWidth > 0; }));
await P.screenshot({ path: CAP + '03-tableau.png' });
ok('Photo du commerce refusée sans compte', (await call('/merchant/photo')).
  _status === 401);
const pubPhoto = await fetch(URL + 'api/shop/' + shopCode + '/photo');
ok('Photo publique du commerce (autocollant, lien)', pubPhoto.status === 200 && /image\/jpeg/.test(pubPhoto.headers.get('content-type')));
const pubCode = await call('/code/' + shopCode);
ok('Page Code : secteur et photo du commerce', pubCode.merchant.activity === 'Grillades et poissons braisés' && pubCode.merchant.photo === '/api/shop/' + shopCode + '/photo');

/* 2. envoi groupé : répertoire, photo par colis, partage */
await P.click('button[data-action="openBatch"]'); await P.waitForSelector('[data-bind="m.paste"]');
ok('Départ : le code de la boutique', await P.isVisible(`[data-action="batchCode"][aria-pressed="true"]:has-text("${shopCode}")`) || await P.isVisible(`text=${shopCode}`));
await P.click('[data-action="batchContacts"]');
await P.waitForFunction(() => document.querySelector('[data-bind="m.batch.0.phone"]') && document.querySelector('[data-bind="m.batch.0.phone"]').value === '677112244');
ok('Répertoire : 2 contacts ajoutés d\'un coup (sans le contact sans numéro)', (await P.inputValue('[data-bind="m.batch.1.name"]')) === 'Jules' && await P.locator('[data-bind$=".phone"]').count() === 2);
await P.setInputFiles('input[data-file="batch:0"]', parcel2);
await P.waitForSelector('[data-action="dropPhoto"][data-arg="batch:0"] img');
ok('Photo du colis jointe au premier client', true);
await P.fill('[data-bind="m.batch.0.note"]', 'Poisson braisé + plantain');
await P.screenshot({ path: CAP + '04-envoi-groupe.png' });
await P.click('[data-action="batchCreate"]'); await P.waitForSelector('text=Liens créés');
ok('Résultat : WhatsApp et « partager autrement » pour chaque client', await P.locator('[data-action="batchWa"]').count() === 2 && await P.locator('[data-action="batchShare"]').count() === 2);
await P.evaluate(() => { window.__shared = []; navigator.share = async (d) => { window.__shared.push(d.text); }; });
await P.click('[data-action="batchShare"] >> nth=0');
const shared = await P.evaluate(() => window.__shared[0] || '');
ok('Partager autrement : message prêt avec le lien', shared.includes('/lien.html?t='), shared.slice(0, 80));
await P.screenshot({ path: CAP + '05-liens.png' });
const links = (await call('/links', 'GET', null, tok)).links;
const lM = links.find(l => l.contactPhone === '677112244');
const lpub = await call('/lien/' + lM.token);
ok('Page du lien : commerce, secteur, photo de la boutique et du colis', lpub.from === 'Chez Mama Ngo' && lpub.activity === 'Grillades et poissons braisés' && !!lpub.shopPhoto && lpub.parcelPhoto === true, JSON.stringify(lpub).slice(0, 160));
const lphoto = await fetch(URL + 'api/lien/' + lM.token + '/photo');
ok('Photo du colis visible par le destinataire (lien)', lphoto.status === 200);
const lJ = links.find(l => l.contactPhone === '655667788');
ok('Pas de photo pour le second client', (await call('/lien/' + lJ.token)).parcelPhoto === false);

/* le destinataire ouvre son lien : il voit la boutique et le colis */
const R = await ctx.newPage();
await R.goto(URL + 'lien.html?t=' + lM.token); await R.waitForSelector('.opt');
await R.waitForFunction(() => [...document.querySelectorAll('.shop-id img, figure.parcel img')].filter(i => i.naturalWidth > 0).length === 2, null, { timeout: 10000 }).catch(() => {});
ok('Lien : photo de la boutique et du colis affichées', await R.isVisible('.shop-id img') && await R.isVisible('figure.parcel img') && await R.isVisible('text=Grillades et poissons braisés'));
await R.screenshot({ path: CAP + '06-lien-destinataire.png' });
await call('/lien/' + lM.token + '/place', 'POST', { mode: 'gps', lat: 4.09, lng: 9.74, hint: 'Portail bleu' });
await call('/links/' + lM.id + '/confirm', 'POST', { paymentMethod: 'cash' }, tok);
const cf = { order: (await call('/lien/' + lM.token)).order };
const tr = await call('/suivi/' + cf.order.trackToken);
ok('Suivi : photo du colis signalée', tr.parcelPhoto === true);
ok('Suivi : photo du colis servie', (await fetch(URL + 'api/suivi/' + cf.order.trackToken + '/parcel-photo')).status === 200);
await R.goto(URL + 'suivi.html?c=' + cf.order.trackToken); await R.waitForSelector('text=Photo du colis');
ok('Page de suivi : photo du colis pour vérifier à la remise', await R.isVisible('text=Vérifiez que c\'est bien ce colis'));
const orders = (await call('/orders', 'GET', null, tok)).orders;
const o1 = orders.find(o => o.trackToken === cf.order.trackToken);
ok('Commande : photo du colis rattachée', o1.parcelPhoto === true && (await fetch(URL + 'api/orders/' + o1.id + '/parcel-photo', { headers: { authorization: 'Bearer ' + tok } })).status === 200);
const other = await (async () => { let r = await call('/auth/request', 'POST', { phone: '699000111' }); r = await call('/auth/verify', 'POST', { phone: '699000111', code: r.demoCode }); return r.token; })();
ok('Photo du colis refusée à un autre client', (await call('/orders/' + o1.id + '/parcel-photo', 'GET', null, other))._status === 404);

/* 3. envoi simple depuis l'accueil : photo du colis */
await P.click('[data-action="batchDone"]'); await P.click('[data-action="switchTab"][data-arg="home"]');
await P.fill('[data-bind="quickCode"]', '699887700'); await P.click('[data-action="quickGo"]'); await P.waitForSelector('[data-bind="linkName"]');
await P.setInputFiles('input[data-file="parcel"]', parcelImg);
await P.waitForSelector('[data-action="dropPhoto"][data-arg="parcel"]');
ok('Envoi simple : photo du colis ajoutée', await P.isVisible('text=Le destinataire et le livreur la verront'));
await P.screenshot({ path: CAP + '07-envoi-photo.png' });
await P.click('[data-action="linkCreate"]'); await P.waitForSelector('text=ENVOIS EN ATTENTE');
await P.waitForTimeout(800);
const l3 = (await call('/links', 'GET', null, tok)).links.find(l => l.contactPhone === '699887700');
ok('Photo jointe au lien envoyé', (await call('/lien/' + l3.token)).parcelPhoto === true);

/* 4. autocollant : photo et secteur */
await R.goto(URL + 'code.html?c=' + shopCode + '&shop=1'); await R.waitForSelector('.who');
await R.waitForFunction(() => { const i = document.querySelector('img[alt="Chez Mama Ngo"]'); return i && i.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
ok('Autocollant : photo, secteur, nom', await R.isVisible('text=Grillades et poissons braisés · livré par WunaGo') && await R.isVisible('img[alt="Chez Mama Ngo"]'));
await R.screenshot({ path: CAP + '08-autocollant.png' });

ok('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter(r => r.startsWith('FAIL'));
console.log(`${results.length - fails.length}/${results.length} réussis`);
srv.kill('SIGTERM'); process.exit(fails.length ? 1 : 0);
