// Parcours simplifiés : « Livraison colis » et « Déplacement » en un seul écran ; bilan du jour du livreur.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=8775;
const srv=spawn('node',['tests/dev-server.mjs',String(PORT)],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL=`http://localhost:${PORT}/`;
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});const j=await r.json();j._status=r.status;return j};
async function tokenFor(phone,name){let r=await call('/auth/request','POST',{phone});r=await call('/auth/verify','POST',{phone,code:r.demoCode});if(name)await call('/me','PATCH',{name},r.token);return r.token}
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
async function phone(geo){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block',
    ...(geo?{permissions:['geolocation'],geolocation:geo}:{})}); await fixClock(ctx);
  await ctx.addInitScript(()=>{window.WG_ALL_SERVICES=false;window.WG_CLASSIC_FORM=false;window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {}};});
  await ctx.route('https://*.tile.openstreetmap.org/**',r=>r.abort());
  await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
  const page=await ctx.newPage(); page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message)); return page;
}
async function login(page,num){
  await page.goto(URL); await page.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
  await page.fill('[data-bind="phone"]',num); await page.click('[data-action="requestOtp"]');
  await page.waitForSelector('[data-action="otpKey"]');
  const code=(await page.locator('b').first().textContent()).trim();
  for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
}
const cli=await tokenFor('691112233','Nadia Kamga');
const C=await phone({latitude:4.0489,longitude:9.6996});
await login(C,'691112233');
await C.waitForSelector('[data-action="pickService"][data-arg="parcel"]');

/* 1. Livraison colis : un seul écran, à une adresse */
await C.click('[data-action="pickService"][data-arg="parcel"]');
await C.waitForSelector('[data-bind="sendTo"]');
ok('Tuile « Livraison colis » : un seul écran, sans adresse fictive',!(await C.isVisible('text=rue 4.212'))&&!(await C.isVisible('text=Étape 1/3'))&&await C.isVisible('text=À QUI ?'));
ok('Bouton bloqué tant qu\'on ne sait pas à qui envoyer',await C.isDisabled('[data-action="linkCreate"]'));
await C.click('[data-action="sendMode"][data-arg="addr"]');
await C.selectOption('[data-bind="sendArea"]','Bonamoussadi');
await C.fill('[data-bind="sendHint"]','Portail bleu après la boulangerie');
await C.fill('[data-bind="linkName"]','Paul Etoa');
await C.fill('[data-bind="sendPhone"]','677 11 22 33');
await C.click('[data-action="sendSize"][data-arg="large"]');
await C.click('[data-action="sendWhen"][data-arg="1h"]');
await C.waitForSelector('[data-action="sendAddr"]:not([disabled])');
const label=await C.textContent('[data-action="sendAddr"]');
ok('Prix affiché sur le bouton',/Envoyer · [\d\s ]+ FCFA/.test(label),label);
await C.screenshot({path:'tests/captures/simple-1-colis-adresse.png'});
await C.click('[data-action="sendAddr"]');
await C.waitForSelector('text=CODE DE SECOURS',{timeout:15000});
let o=(await call('/orders','GET',null,cli)).orders[0];
ok('Commande créée en un écran : destinataire, repère, quartier',o.details.recipient.name==='Paul Etoa'&&o.details.recipient.phone==='677112233'&&o.details.hints.dropoff.includes('Portail bleu')&&o.dropoff.includes('Bonamoussadi'));
ok('« Gros » → tricycle ; « Dans 1 h » → programmée',o.vehicle==='tricycle'&&o.weightKg===80&&o.scheduledAt>Date.now()+50*60e3,JSON.stringify({v:o.vehicle,w:o.weightKg}));

/* 2. Numéro → lien WhatsApp ; code → écran éclair */
await C.click('[data-action="switchTab"][data-arg="home"]'); await C.click('[data-action="switchTab"][data-arg="home"]');
await C.click('[data-action="pickService"][data-arg="parcel"]');
await C.fill('[data-bind="sendTo"]','677 55 44 33');
await C.waitForSelector('[data-action="linkCreate"]:not([disabled])');
ok('Un numéro tapé : fiche contact et bouton WhatsApp',await C.isVisible('text=+237 6 77 55 44 33')&&(await C.textContent('[data-action="linkCreate"]')).includes('WhatsApp'));
await C.click('[data-action="sendSize"][data-arg="medium"]');
await C.click('[data-action="linkCreate"]');
await C.waitForSelector('text=ENVOIS EN ATTENTE');
const links=(await call('/links','GET',null,cli)).links;
ok('Lien créé avec la taille choisie',links[0].size==='medium'&&links[0].contactPhone==='677554433');
const other=await tokenFor('699001122','Rita');
const pl=await call('/places','POST',{lat:4.07,lng:9.74,label:'Maison',hint:'Immeuble jaune'},other);
await C.click('[data-action="pickService"][data-arg="parcel"]');
await C.fill('[data-bind="sendTo"]',pl.place.code.slice(3).toLowerCase());
await C.waitForSelector('[data-action="flashConfirm"]',{timeout:10000});
ok('Un Code WunaGo tapé : écran éclair vers ce contact',await C.isVisible('text=Rita'));
await C.click('[data-action="flashSize"][data-arg="xl"]');
await C.waitForSelector('[data-action="flashConfirm"]:not([disabled])');
await C.click('[data-action="flashConfirm"]');
await C.waitForSelector('text=CODE DE SECOURS',{timeout:15000});
o=(await call('/orders','GET',null,cli)).orders[0];
ok('Envoi par code : « Très gros » → camionnette',o.vehicle==='van'&&o.dropoff.includes(pl.place.code));

/* 3. Déplacement : un seul écran, destination par quartier */
await C.click('[data-action="switchTab"][data-arg="home"]'); await C.click('[data-action="switchTab"][data-arg="home"]');
await C.click('[data-action="pickService"][data-arg="ride"]');
await C.waitForSelector('[data-bind="rideArea"]');
ok('Tuile « Déplacement » : « Où allez-vous ? » dans un seul écran',await C.isVisible('text=OÙ ALLEZ-VOUS ?')&&await C.isDisabled('[data-action="flashConfirm"]'));
await C.selectOption('[data-bind="rideArea"]','Akwa');
await C.fill('[data-bind="ridePlace"]','Hôtel Akwa Palace');
await C.click('[data-action="flashVehicle"][data-arg="car"]');
await C.click('[data-action="flashPassengers"][data-arg="3"]');
await C.waitForSelector('[data-action="flashConfirm"]:not([disabled])');
ok('Espèces : « au chauffeur » pour un trajet',await C.isVisible('text=Espèces au chauffeur'));
await C.screenshot({path:'tests/captures/simple-2-trajet.png'});
await C.click('[data-action="flashConfirm"]');
await C.waitForSelector('text=Recherche d\'un chauffeur',{timeout:15000});
o=(await call('/orders','GET',null,cli)).orders[0];
ok('Trajet commandé : voiture, 3 passagers, lieu précis',o.service==='ride'&&o.vehicle==='car'&&o.details.ride.passengers===3&&o.dropoff.includes('Hôtel Akwa Palace'),JSON.stringify({d:o.details,dr:o.dropoff}));

/* 4. Livreur : bilan du jour, gain lisible */
const adm=await tokenFor('690000001','Admin');
await call('/admin/couriers','POST',{phone:'677000010',name:'Kevin Moto',vehicle:'bike'},adm);
const L=await phone({latitude:4.05,longitude:9.70});
await login(L,'677000010');
await L.waitForSelector('[data-action="toggleOnline"]');
await L.click('[data-action="toggleOnline"]');
await L.waitForSelector('text=AUJOURD\'HUI',{timeout:15000});
ok('Livreur : bilan du jour (courses, gains, espèces)',await L.isVisible('text=ESPÈCES REÇUES'));
await L.waitForSelector('text=GAIN ESTIMÉ',{timeout:15000});
ok('Livreur : gain estimé bien visible sur chaque course',true);
await L.screenshot({path:'tests/captures/simple-3-livreur.png'});

ok('Aucune erreur JavaScript',[C,L].every(p=>!p.errors.length),[C,L].flatMap(p=>p.errors).join(' | '));
console.log(results.join('\n'));
await browser.close(); srv.kill('SIGTERM');
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
