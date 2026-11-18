// Étape 4 : l'app branchée sur l'API (Postgres local), parcours complet et données conservées côté serveur.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['tests/dev-server.mjs','8771'],{stdio:['ignore','pipe','inherit']});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL='http://localhost:8771/';
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
async function phone(){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block'}); await fixClock(ctx);
  await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
  const page=await ctx.newPage(); page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message)); return page;
}
async function login(page,num){
  await page.goto(URL);
  await page.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
  await page.fill('[data-bind="phone"]',num); await page.click('[data-action="requestOtp"]');
  await page.waitForSelector('[data-action="otpKey"]');
  const code=(await page.locator('b').first().textContent()).trim();
  for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
}
const A=await phone();
await login(A,'6 99 12 34 56');
ok('API détectée par l\'app',await A.evaluate(()=>WAPI.status.on));
await A.waitForSelector('[data-bind="nameInput"]');
ok('Nouveau client : nom demandé',true);
await A.fill('[data-bind="nameInput"]','Ariane Ngono'); await A.click('[data-action="saveName"]');
await A.waitForSelector('text=Ariane Ngono');
ok('Connexion par code + compte créé sur le serveur',!!(await A.evaluate(()=>WAPI.token())));
ok('Portefeuille d\'un nouveau compte à 0 FCFA',await A.isVisible('text=0 FCFA'));
// recharge (démo) puis commande payée par portefeuille
await A.click('[data-action="switchTab"][data-arg="wallet"]');
await A.click('[data-action="toggleWalletPanel"][data-arg="topup"]');
await A.fill('[data-bind="topUpAmount"]','10000'); await A.click('[data-action="doTopUp"]');
await A.waitForSelector('text=10 000 FCFA');
ok('Recharge enregistrée sur le serveur',true);
// adresse enregistrée (préférences serveur)
await A.click('[data-action="openMenu"]'); await A.waitForSelector('.drawer'); await A.click('.drawer [data-action="openScreen"][data-arg="addresses"]');
await A.click('[data-action="newAddress"]');
await A.fill('[data-bind="addrForm.addr"]','Akw');
await A.click('.sg-item:has-text("Akwa, Douala")');
await A.click('[data-action="saveAddrForm"]');
await A.waitForTimeout(1200);
await A.click('[data-action="switchTab"][data-arg="home"]');
await A.click('[data-action="pickService"][data-arg="parcel"]');
ok('Adresse enregistrée proposée d\'office au départ',(await A.inputValue('[data-bind="draft.pickup"]'))==='Akwa, Douala');
await A.click('[data-action="pickQuartier"][data-arg="Bonamoussadi"]');
await A.click('[data-action="orderNext"]');
for(let i=0;i<5;i++) await A.click('[data-action="incWeight"]');
await A.click('[data-action="setWhen"][data-arg="tomorrow"]');
for(let i=0;i<2;i++) await A.click('[data-action="orderNext"]');
await A.click('[data-action="pickPay"][data-arg="wallet"]');
await A.click('[data-action="confirmPay"]');
await A.waitForSelector('text=Recherche d\'un livreur');
const api=async(page,path,method='GET',body)=>page.evaluate(async([p,m,b])=>{const r=await fetch('/api'+p,{method:m,headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:b?JSON.stringify(b):undefined});return r.json()},[path,method,body]);
let orders=(await api(A,'/orders')).orders;
ok('Commande enregistrée sur le serveur (code WUN, prix serveur)',orders.length===1&&/^WUN-\d{4}-\d{3}$/.test(orders[0].code)&&orders[0].price.net>0&&orders[0].priceLines.length>0,orders[0].code+' · '+orders[0].price.net+' FCFA');
const net1=orders[0].price.net;
ok('Portefeuille débité côté serveur',(await api(A,'/me')).user.wallet.balance===10000-net1,String(10000-net1));
ok('Adresse enregistrée dans le compte',(await api(A,'/me')).user.prefs.addresses?.[0]?.text==='Akwa, Douala');
// le suivi se met à jour tout seul quand le statut change sur le serveur (simulation du livreur)
await api(A,'/orders/'+orders[0].code+'/advance','POST');
await A.waitForFunction(()=>document.querySelectorAll('#app .col span[style*="#0B1F3A"]').length>0);
await A.waitForTimeout(16000);
const tl=await A.locator('text=Colis récupéré').getAttribute('style');
ok('Suivi rafraîchi automatiquement (statut venu du serveur)',/color:#0B1F3A/.test(tl||''));
ok('Annulation impossible une fois le colis récupéré',!(await A.isVisible('[data-action="askCancel"]')));
for(let i=0;i<3;i++){ await A.click('[data-action="advanceOrder"]'); await A.waitForTimeout(500); }
await A.waitForSelector('text=Colis livré');
await A.click('[data-action="rate"][data-arg$="|4"]');
await A.waitForTimeout(400);
ok('Livraison et note enregistrées',(await api(A,'/orders')).orders[0].rating===4);
await A.click('[data-action="openDispute"]');
await A.click('[data-action="setDisputeReason"][data-arg="1"]');
await A.fill('[data-bind="disputeForm.desc"]','Il manque un des deux paquets.');
await A.click('[data-action="sendDispute"]');
await A.waitForTimeout(500);
const disp=(await api(A,'/disputes')).disputes;
ok('Réclamation enregistrée sur le serveur',disp.length===1&&/^LIT-\d{4}-001$/.test(disp[0].code),disp[0]?.code);
// commande en espèces annulée
await A.click('[data-action="switchTab"][data-arg="home"]');
await A.click('[data-action="switchTab"][data-arg="home"]');
await A.click('[data-action="pickService"][data-arg="ride"]');
await A.click('[data-action="pickQuartier"][data-arg="Deïdo"]');
await A.click('[data-action="orderNext"]'); await A.click('[data-action="setWhen"][data-arg="tomorrow"]');
for(let i=0;i<2;i++) await A.click('[data-action="orderNext"]');
await A.click('[data-action="pickPay"][data-arg="cash"]');
await A.click('[data-action="confirmPay"]');
await A.click('[data-action="askCancel"]');
await A.click('[data-action="pickCancelReason"][data-arg="3"]');
await A.click('[data-action="confirmCancel"]');
await A.waitForSelector('text=Commande annulée');
orders=(await api(A,'/orders')).orders;
ok('Annulation enregistrée sur le serveur',orders[0].status==='cancelled'&&orders[0].cancelReason==="J'ai commandé par erreur");
// même compte sur un autre téléphone : tout est retrouvé
const B=await phone();
await login(B,'699123456');
await B.waitForSelector('text=Ariane Ngono');
await B.click('[data-action="switchTab"][data-arg="orders"]');
await B.waitForSelector('text=WUN-');
ok('Autre téléphone : commandes retrouvées',await B.locator('text=WUN-').count()===2);
await B.click('[data-action="switchTab"][data-arg="wallet"]');
ok('Autre téléphone : solde et adresse retrouvés',await B.isVisible('text='+(10000-net1).toLocaleString('fr-FR').replace(/\u202f/g,' ')+' FCFA') && await (async()=>{await B.click('[data-action="openMenu"]'); await B.waitForSelector('.drawer'); return (await B.locator('.drawer [data-action="openScreen"][data-arg="addresses"] .di-m').textContent())==='1';})());
// déconnexion
await B.click('.drawer [data-action="openSettings"]');
await B.click('[data-action="logOut"]');
await B.waitForSelector('[data-action="requestOtp"]');
ok('Déconnexion : session supprimée',await B.evaluate(()=>!WAPI.token()));
// code faux refusé
await B.fill('[data-bind="phone"]','6 77 00 00 00'); await B.click('[data-action="requestOtp"]');
for(const ch of '0000') await B.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await B.waitForSelector('.toast');
ok('Code faux refusé par le serveur',(await B.locator('.toast').textContent()).includes('Code incorrect')||(await B.evaluate(()=>!WAPI.token())));
ok('Aucune erreur JavaScript',A.errors.length+B.errors.length===0,[...A.errors,...B.errors].join(' | '));
console.log(results.join('\n'));
await browser.close(); srv.kill('SIGTERM');
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);

