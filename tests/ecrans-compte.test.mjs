// Étape 3 : Mes adresses, moyens de paiement, notifications, annulation, litiges.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('tests/captures',{recursive:true});
const server=spawn('python3',['-m','http.server','8767','--directory','web'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const results=[]; const ok=(n,c,info='')=>results.push(`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`);
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',
  geolocation:{latitude:4.0612,longitude:9.7295},permissions:['geolocation','notifications']});
await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
await ctx.route('https://photon.komoot.io/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[
  {geometry:{coordinates:[9.6941,4.0291]},properties:{name:'Immeuble Victoria',street:'Rue Joss',district:'Bonapriso',city:'Douala'}}]})}));
await ctx.route('https://photon.komoot.io/reverse**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[
  {geometry:{coordinates:[9.7295,4.0612]},properties:{street:'Rue de la Joie',district:'Bepanda',city:'Douala'}}]})}));
const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const shot=async n=>{await page.waitForTimeout(350);await page.screenshot({path:`tests/captures/${n}.png`})};
const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wunago.client.v1')));
await page.goto('http://localhost:8767/');
await page.fill('[data-bind="phone"]','6 99 12 34 56'); await page.click('[data-action="requestOtp"]');
const code=await page.locator('b').first().textContent(); for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await page.waitForSelector('text=Ariane Ngono');

// ---- Mes adresses
await page.click('[data-action="switchTab"][data-arg="wallet"]');
await page.click('[data-action="openScreen"][data-arg="addresses"]');
ok('Écran Mes adresses (vide) affiché',await page.isVisible('text=Aucune adresse enregistrée'));
await page.click('[data-action="newAddress"]');
await page.click('[data-action="saveAddrForm"]');
ok('Adresse refusée sans emplacement précis',await page.isVisible('.toast'));
await page.fill('[data-bind="addrForm.addr"]','Victoria');
await page.click('.sg-item:has-text("Immeuble Victoria")');
await page.click('[data-action="setAddrLabel"][data-arg="Bureau"]');
await shot('20-ajout-adresse');
await page.click('[data-action="saveAddrForm"]');
await page.waitForSelector('text=Immeuble Victoria');
ok('Adresse « Bureau » enregistrée',(await store()).addresses[0].label==='Bureau');
await page.click('[data-action="newAddress"]');
await page.click('[data-action="useMyLocation"][data-arg="addr"]');
await page.waitForFunction(()=>document.querySelector('[data-bind="addrForm.addr"]').value.includes('Rue de la Joie'),null,{timeout:3000});
await page.click('[data-action="saveAddrForm"]');
await page.waitForTimeout(200);
ok('Adresse « Maison » via Ma position',(await store()).addresses.length===2);
await shot('21-mes-adresses');
await page.click('[data-action="deleteAddress"][data-arg="1"]');
ok('Suppression d\'une adresse',(await store()).addresses.length===1);
await page.click('[data-action="popScreen"]');

// ---- Moyens de paiement
await page.click('[data-action="openScreen"][data-arg="paymethods"]');
ok('Écran Moyens de paiement',await page.isVisible('text=Orange Money') && await page.isVisible('text=PAR DÉFAUT'));
await page.click('[data-action="openPayForm"]');
await page.click('[data-action="setPayFormOp"][data-arg="mtn_momo"]');
await page.fill('[data-bind="payForm.number"]','12345');
await page.click('[data-action="savePayAccount"]');
ok('Numéro invalide refusé',await page.isVisible('text=Numéro à 9 chiffres'));
await page.fill('[data-bind="payForm.number"]','677123456');
await page.click('[data-action="savePayAccount"]');
await page.waitForTimeout(150);
ok('Numéro MTN MoMo enregistré',(await store()).payAccounts.some(a=>a.op==='mtn_momo'&&a.number==='6 77 12 34 56'));
await page.click('[data-action="setDefaultPay"][data-arg="mtn_momo"]');
ok('MTN MoMo choisi par défaut',(await store()).defaultPay==='mtn_momo');
await shot('22-moyens-paiement');
await page.click('[data-action="popScreen"]');

// ---- Notifications
await page.click('[data-action="openScreen"][data-arg="notifs"]');
await page.click('[data-action="toggleNotif"][data-arg="promos"]');
await page.click('[data-action="toggleNotif"][data-arg="push"]');
await page.waitForTimeout(400);
const np=(await store()).notifPrefs;
ok('Préférences de notification enregistrées',np.promos===false && np.push===true);
await shot('23-notifications');
await page.click('[data-action="popScreen"]');

// ---- Commande payée par défaut (MTN), puis annulation
await page.click('[data-action="switchTab"][data-arg="home"]');
await page.click('[data-action="pickService"][data-arg="parcel"]');
for(let i=0;i<3;i++) await page.click('[data-action="orderNext"]');
ok('Le moyen par défaut est présélectionné',await page.getAttribute('[data-action="pickPay"][data-arg="mtn_momo"]','style').then(s=>s.includes('#101010')));
await page.click('[data-action="pickPay"][data-arg="wallet"]');
await page.click('[data-action="confirmPay"]');
await page.waitForSelector('[data-action="askCancel"]');
const balBefore=(await store()).wallet.balance;
await page.click('[data-action="askCancel"]');
await shot('24-annulation');
ok('Confirmation impossible sans motif',await page.isDisabled('[data-action="confirmCancel"]'));
await page.click('[data-action="pickCancelReason"][data-arg="1"]');
await page.click('[data-action="confirmCancel"]');
await page.waitForSelector('text=Commande annulée');
const st=await store();
ok('Commande annulée et remboursée sur le portefeuille',st.orders[0].status==='cancelled' && st.wallet.balance===balBefore+2500,`${balBefore} → ${st.wallet.balance}`);
await shot('25-commande-annulee');

// ---- Commande livrée puis litige
await page.click('[data-action="switchTab"][data-arg="home"]');
await page.click('[data-action="pickService"][data-arg="laundry"]');
for(let i=0;i<3;i++) await page.click('[data-action="orderNext"]');
await page.click('[data-action="pickPay"][data-arg="cash"]');
await page.click('[data-action="confirmPay"]');
await page.waitForSelector('[data-action="advanceOrder"]');
ok('Annulation proposée avant récupération',await page.isVisible('[data-action="askCancel"]'));
await page.click('[data-action="advanceOrder"]');
ok('Annulation retirée après récupération',!(await page.isVisible('[data-action="askCancel"]')));
for(let i=0;i<3;i++) await page.click('[data-action="advanceOrder"]');
await page.waitForSelector('[data-action="openDispute"]');
await page.click('[data-action="openDispute"]');
await page.click('[data-action="sendDispute"]');
ok('Réclamation refusée si incomplète',await page.isVisible('text=Choisissez le problème'));
await page.click('[data-action="setDisputeReason"][data-arg="0"]');
await page.fill('[data-bind="disputeForm.desc"]','Une chemise est arrivée tachée.');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==','base64');
writeFileSync('/tmp/wg-photo.png',png);
await page.setInputFiles('input[data-file="dispute"]','/tmp/wg-photo.png');
await page.waitForSelector('text=Photo ajoutée',{timeout:3000});
ok('Photo jointe à la réclamation',true);
await shot('26-reclamation');
await page.click('[data-action="sendDispute"]');
await page.waitForTimeout(200);
const d=(await store()).disputes[0];
ok('Réclamation enregistrée (code LIT)',/^LIT-\d{4}-001$/.test(d.code) && d.reason==='Colis endommagé' && !!d.photo,d.code);
await page.click('[data-action="switchTab"][data-arg="wallet"]');
await page.click('[data-action="openScreen"][data-arg="help"]');
ok('Réclamation visible dans Aide et litiges',await page.isVisible(`text=${d.code}`) && await page.isVisible('text=OUVERTE'));
await shot('27-aide-litiges');
await page.click('[data-action="switchTab"][data-arg="orders"]');
ok('Commande annulée visible dans l\'historique',await page.isVisible('text=ANNULÉE'));
ok('Aucune erreur JavaScript',errors.length===0,errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.kill();
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
