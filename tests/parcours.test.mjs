import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { quote } from '../web/pricing.mjs';
const tomorrow8=(()=>{const d=new Date(Date.now()+3600000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)-3600000+8*3600000})();

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/captures',{recursive:true});
const server=spawn('python3',['-m','http.server','8765','--directory','web'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const URL='http://localhost:8765/';
const results=[]; const ok=(n,c,info='')=>{results.push(`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`)};
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',
  geolocation:{latitude:4.0612,longitude:9.7295},permissions:['geolocation']}); await fixClock(ctx);
// Services externes simulés (tuiles OpenStreetMap, recherche Photon) : le test ne dépend pas du réseau
const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==','base64');
// Mode local (sans serveur) : l'API répond qu'elle n'est pas disponible
await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false}'}));
await ctx.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:TILE}));
await ctx.route('https://photon.komoot.io/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[
  {geometry:{coordinates:[9.6941,4.0291]},properties:{name:'Pharmacie de Bonapriso',street:'Rue Joss',district:'Bonapriso',city:'Douala'}},
  {geometry:{coordinates:[9.6990,4.0310]},properties:{street:'Rue Koloko',district:'Bonapriso',city:'Douala'}}]})}));
await ctx.route('https://photon.komoot.io/reverse**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[
  {geometry:{coordinates:[9.7295,4.0612]},properties:{street:'Rue de la Joie',district:'Bepanda',city:'Douala'}}]})}));
const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error'&&!/ERR_INTERNET_DISCONNECTED/.test(m.text()))errors.push(m.text())}); // hors connexion : erreurs réseau attendues
const shot=async n=>{await page.waitForTimeout(350);await page.screenshot({path:`tests/captures/${n}.png`})};
await page.goto(URL); await page.waitForSelector('[data-action="requestOtp"]');
await shot('01-connexion');
// manifest + installability
const cdp=await ctx.newCDPSession(page);
const sw=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return !!r.active});
ok('Service worker actif',sw);
await page.reload(); await page.waitForTimeout(500);
const ctrl=await page.evaluate(()=>!!navigator.serviceWorker.controller); ok('Page contrôlée par le service worker',ctrl);
const inst=await cdp.send('Page.getInstallabilityErrors'); const instErr=inst.installabilityErrors.filter(e=>e.errorId!=='in-incognito'); // le navigateur de test est en navigation privée
ok('Installable (critères Chrome)',instErr.length===0,JSON.stringify(instErr));
const man=await cdp.send('Page.getAppManifest'); ok('Manifeste lu sans erreur',man.errors.length===0 && !!man.data,JSON.stringify(man.errors));
// login
await page.fill('[data-bind="phone"]','6 99 12 34 56');
await page.click('[data-action="requestOtp"]');
const code=await page.locator('b').first().textContent();
await shot('02-otp');
for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await page.waitForSelector('text=Ariane Ngono');
ok('Connexion par OTP',true,'code '+code);
await page.waitForTimeout(350); await shot('03-accueil');
// order
await page.click('[data-action="pickService"][data-arg="parcel"]');
await shot('04-commande-trajet');
await page.click('[data-action="pickQuartier"][data-arg="Bonapriso"]');
ok('Choix du quartier (raccourci)',await page.inputValue('[data-bind="draft.dropoff"]')==='Bonapriso, Douala');
// Suggestions pendant la frappe : quartier local + résultats OpenStreetMap
await page.fill('[data-bind="draft.dropoff"]','Bonap');
await page.waitForSelector('.sg-item:has-text("Pharmacie de Bonapriso")',{timeout:3000});
ok('Suggestions : quartier de Douala proposé',await page.isVisible('.sg-item:has-text("Bonapriso, Douala")'));
ok('Suggestions : adresses OpenStreetMap proposées',true);
await shot('04b-suggestions-adresses');
await page.click('.sg-item:has-text("Pharmacie de Bonapriso")');
ok('Adresse choisie dans les suggestions',await page.inputValue('[data-bind="draft.dropoff"]')==='Pharmacie de Bonapriso, Rue Joss, Bonapriso');
await page.click('[data-action="saveAddress"][data-arg="dropoff"]');
await page.waitForTimeout(150);
ok('Adresse enregistrée',await page.evaluate(()=>JSON.parse(localStorage.getItem('wunago.client.v1')).addresses.length===1));
// Ma position (géolocalisation + adresse retrouvée)
await page.click('[data-action="useMyLocation"]');
await page.waitForFunction(()=>document.querySelector('[data-bind="draft.pickup"]').value.includes('Rue de la Joie'),null,{timeout:3000});
ok('Bouton Ma position : adresse retrouvée',true,await page.inputValue('[data-bind="draft.pickup"]'));
await shot('04c-ma-position');
const dist=await page.locator('.mono:has-text("km")').first().textContent();
ok('Distance estimée affichée',/≈ [\d,]+ km/.test(dist),dist.trim());
await page.click('[data-action="pickQuartier"][data-arg="Bonapriso"]');
ok('Choix du quartier',await page.inputValue('[data-bind="draft.dropoff"]')==='Bonapriso, Douala');
await page.click('[data-action="orderNext"]');
await shot('05-commande-details');
for(let i=0;i<5;i++) await page.click('[data-action="incWeight"]'); // 2 -> 4,5 kg
await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
await page.click('[data-action="orderNext"]');
const total=await page.locator('text=Total').locator('xpath=..').textContent();
const expected=quote({service:'parcel',pickupGeo:{lat:4.0612,lng:9.7295},dropoffGeo:{lat:4.03,lng:9.695},weightKg:4.5,vehicle:'bike',scheduledAt:tomorrow8},Date.now()).net;
ok('Tarif colis 4,5 kg = grille (distance, poids, zone, heure)',total.replace(/\s/g,'').includes(String(expected)+'FCFA'),total.trim()+' / attendu '+expected);
await shot('06-commande-estimation');
await page.click('[data-action="orderNext"]');
await shot('07-paiement');
await page.click('[data-action="confirmPay"]');
await page.waitForSelector('text=Marcel K.',{timeout:5000});
await page.waitForSelector('#track-map .leaflet-container',{timeout:3000});
ok('Carte OpenStreetMap affichée au suivi',await page.locator('#track-map .leaflet-marker-icon').count()>=3);
ok('Durée restante affichée',/Arrivée · \d+ min/.test(await page.locator('#track-eta').textContent()));
await page.click('[data-action="advanceOrder"]'); await page.click('[data-action="advanceOrder"]');
const p0=await page.evaluate(()=>{const m=document.querySelector('.wg-courier').closest('.leaflet-marker-icon');return m.style.transform});
await page.waitForTimeout(2300);
const p1=await page.evaluate(()=>{const m=document.querySelector('.wg-courier').closest('.leaflet-marker-icon');return m.style.transform});
ok('Le livreur se déplace sur la carte',p0!==p1);
await shot('08b-suivi-carte');
ok('Paiement Orange Money puis suivi',true);
await shot('08-suivi');
// back button test from track
for(let i=0;i<2;i++) await page.click('[data-action="advanceOrder"]');
await page.waitForSelector('text=Colis livré');
await page.click('[data-action="rate"][data-arg$="|5"]');
await shot('09-livraison');
await page.click('[data-action="finishProof"]');
ok('Retour accueil après livraison',await page.isVisible('text=Que faisons-nous pour vous ?'));
// wallet
await page.click('[data-action="switchTab"][data-arg="wallet"]');
await page.click('[data-action="toggleWalletPanel"][data-arg="topup"]');
await page.fill('[data-bind="topUpAmount"]','5000');
await page.click('[data-action="doTopUp"]');
await page.waitForTimeout(200);
const bal=await page.locator('#app').textContent();
ok('Recharge portefeuille 12 400 → 17 400',/17\s400 FCFA/.test(bal));
await shot('10-portefeuille');
// history
await page.click('[data-action="switchTab"][data-arg="orders"]');
ok('Historique contient WUN-2026-001',await page.isVisible('text=WUN-2026-001'));
await shot('11-commandes');
// chat
await page.click('[data-action="switchTab"][data-arg="support"]');
await page.fill('[data-bind="chatDraft"]','Bonjour');
await page.click('[data-action="sendChat"]');
await page.waitForSelector('text=un agent WunaGo',{timeout:3000});
ok('Assistance répond',true);
await shot('12-assistance');
// android back button
await page.click('[data-action="switchTab"][data-arg="home"]');
await page.click('[data-action="pickService"][data-arg="laundry"]');
await page.goBack(); await page.waitForTimeout(300);
ok('Bouton retour du téléphone ramène à l\'accueil',await page.isVisible('text=Que faisons-nous pour vous ?'));
// persistence
await page.reload(); await page.waitForSelector('#app >> text=Ariane Ngono');
ok('Session et commandes conservées après rechargement',await page.evaluate(()=>JSON.parse(localStorage.getItem('wunago.client.v1')).orders.length===1));
// offline
await ctx.setOffline(true);
await page.reload(); await page.waitForTimeout(600);
ok('Fonctionne hors connexion',await page.isVisible('text=Que faisons-nous pour vous ?'));
// Playwright ne bascule pas navigator.onLine : on le simule pour vérifier le bandeau
await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false});window.dispatchEvent(new Event('offline'))});
await page.waitForTimeout(200);
ok('Bandeau hors connexion affiché',await page.isVisible('.offline-bar'));
await shot('13-hors-connexion');
await ctx.setOffline(false);
// desktop
const dp=await browser.newPage({viewport:{width:1280,height:900}});
await dp.goto(URL); await dp.waitForTimeout(500); await dp.screenshot({path:'tests/captures/14-ordinateur.png'});
// small phone overflow check
const sp=await browser.newPage({viewport:{width:320,height:640}});
await sp.goto(URL); await sp.waitForTimeout(400);
const over=await sp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
ok('Pas de débordement horizontal sur petit écran (320 px)',!over);
ok('Aucune erreur JavaScript',errors.length===0,errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.kill();
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
