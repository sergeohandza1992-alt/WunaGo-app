// Deuxième livraison : backoffice, vrai livreur (position en direct), messagerie client / livreur / service client, notifications.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['tests/dev-server.mjs','8772'],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL='http://localhost:8772/';
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const pages=[];
async function open(opts={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block',...opts});
  await ctx.route('https://*.tile.openstreetmap.org/**',r=>r.abort());
  await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
  const page=await ctx.newPage(); page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message)); pages.push(page); return page;
}
async function login(page,num,name){
  await page.goto(URL);
  await page.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
  await page.fill('[data-bind="phone"]',num); await page.click('[data-action="requestOtp"]');
  await page.waitForSelector('[data-action="otpKey"]');
  const code=(await page.locator('b').first().textContent()).trim();
  for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
  if(name){ await page.waitForSelector('[data-bind="nameInput"]'); await page.fill('[data-bind="nameInput"]',name); await page.click('[data-action="saveName"]'); }
}
const T=30000;
import { mkdirSync, writeFileSync } from 'node:fs';
const CAP=process.env.CAPTURE?'tests/captures/livraison2/':null; if(CAP) mkdirSync(CAP,{recursive:true});
const shot=async(page,name)=>{ if(CAP){ await page.waitForTimeout(400); await page.screenshot({path:CAP+name+'.png'});
  writeFileSync(CAP+name+'.html',await page.evaluate(()=>{const r=document.getElementById('app')||document.getElementById('admin');return r.innerHTML})); } };
const sub=(page,ep)=>page.evaluate(e=>fetch('/api/push/subscribe',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({subscription:{endpoint:'https://push.example/'+e,keys:{p256dh:'k',auth:'a'}}})}),ep);

/* 1. Backoffice : connexion administrateur, ajout d'un livreur */
const ADM=await open({viewport:{width:1280,height:820},isMobile:false,hasTouch:false});
await ADM.goto(URL+'admin.html');
await ADM.fill('[data-k="login.phone"]','6 90 00 00 01'); await ADM.click('[data-a="sendCode"]');
const code=(await ADM.locator('.pill.y').textContent()).replace(/\D/g,'');
await ADM.fill('[data-k="login.code"]',code); await ADM.click('[data-a="verify"]');
await ADM.waitForSelector('text=CA WunaGo',{timeout:T});
ok('Backoffice : connexion administrateur (ADMIN_PHONES)',true);
await shot(ADM,'10-backoffice-tableau-de-bord');
await ADM.click('[data-a="nav"][data-v="couriers"]');
await ADM.click('[data-a="addCourier"]');
await ADM.fill('[data-k="drawer.name"]','Marcel Kamga'); await ADM.fill('[data-k="drawer.phone"]','677000002');
await ADM.selectOption('#cv','bike'); await ADM.fill('[data-k="drawer.plate"]','LT 123 AB');
await ADM.click('[data-a="saveCourier"]');
await ADM.waitForSelector('td:has-text("Marcel Kamga")');
ok('Backoffice : livreur ajouté',true);

/* 2. Livreur : espace livreur, passage en ligne avec position */
const LIV=await open({geolocation:{latitude:4.0600,longitude:9.7100},permissions:['geolocation']});
await login(LIV,'6 77 00 00 02');
await LIV.waitForSelector('[data-action="toggleOnline"]');
ok('Livreur : espace livreur affiché (onglets Courses / Messages / Compte)',await LIV.isVisible('.tab-label:has-text("Courses")')&&await LIV.isVisible('.tab-label:has-text("Compte")'));
await sub(LIV,'livreur');
await LIV.click('[data-action="toggleOnline"]');
await LIV.waitForSelector('text=Passer hors ligne');
ok('Livreur : en ligne',true);

/* 3. Client : commande sans livreur → « recherche d'un livreur » */
const CLI=await open();
await login(CLI,'6 99 00 00 03','Ariane Ngono');
await CLI.waitForSelector('text=Ariane Ngono');
await sub(CLI,'client');
await CLI.click('[data-action="pickService"][data-arg="parcel"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="pickup"]'); await CLI.click('[data-action="pickQuartier"][data-arg="Akwa"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="dropoff"]'); await CLI.click('[data-action="pickQuartier"][data-arg="Bonamoussadi"]');
for(let i=0;i<3;i++) await CLI.click('[data-action="orderNext"]');
await CLI.click('[data-action="pickPay"][data-arg="cash"]');
await CLI.click('[data-action="confirmPay"]');
await CLI.waitForSelector("text=Recherche d'un livreur");
ok('Client : commande créée, recherche d\'un livreur',true);
ok('Client : onglet « Messages » à la place d\'« Aide »',await CLI.isVisible('.tab-label:has-text("Messages")'));

/* 4. Livreur : reçoit l'offre, l'accepte */
await LIV.waitForSelector('[data-action="acceptCourse"]',{timeout:T});
ok('Livreur : course disponible affichée avec son gain',await LIV.isVisible('text=Gain estimé'));
await shot(LIV,'05-livreur-courses-disponibles');
await LIV.click('span[data-action="acceptCourse"]');
await LIV.waitForSelector('text=J\'ai récupéré');
ok('Livreur : course acceptée, appel et discussion avec le client',await LIV.isVisible('text=Ariane Ngono')&&await LIV.isVisible('a[href^="tel:+237699000003"]'));
await shot(LIV,'06-livreur-course-en-cours');
await LIV.evaluate(()=>fetch('/api/courier/position',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({lat:4.052,lng:9.703})}));

/* 5. Client : voit le vrai livreur et sa position */
await CLI.waitForSelector('text=Marcel Kamga',{timeout:T});
await shot(CLI,'01-client-suivi-vrai-livreur');
ok('Client : vrai livreur affiché (nom, plaque, appel)',await CLI.isVisible('text=LT 123 AB')&&await CLI.isVisible('a[href="tel:+237677000002"]'));
ok('Client : plus de bouton de simulation quand un livreur réel est assigné',!(await CLI.isVisible('[data-action="advanceOrder"]')));

/* 6. Discussion de la commande client ↔ livreur */
await CLI.click('[data-action="openOrderChat"]');
await CLI.waitForSelector('[data-bind="msgDraft"]');
await CLI.fill('[data-bind="msgDraft"]','Bonjour, je suis au portail bleu'); await CLI.press('[data-bind="msgDraft"]','Enter');
await CLI.waitForSelector('.bubble.me:has-text("portail bleu")');
await LIV.click('[data-action="switchTab"][data-arg="support"]');
await LIV.waitForSelector('.unread',{timeout:T});
ok('Livreur : message non lu signalé',true);
await LIV.click('text=Ariane Ngono');
await LIV.waitForSelector('.bubble:has-text("portail bleu")');
await LIV.fill('[data-bind="msgDraft"]','Bien reçu, j\'arrive'); await LIV.click('[data-action="sendMsg"]');
await CLI.waitForSelector('.bubble:not(.me):has-text("j\'arrive")',{timeout:T});
ok('Messagerie instantanée client ↔ livreur',true);
await shot(CLI,'02-client-discussion-livreur');

/* 7. Livreur : étapes, preuve de livraison */
await LIV.click('[data-action="switchTab"][data-arg="courses"]');
if(await LIV.isVisible('[data-action="openCourse"]')) await LIV.click('[data-action="openCourse"]');
await LIV.click('text=J\'ai récupéré'); await LIV.waitForSelector('text=Je suis en route');
await LIV.click('text=Je suis en route'); await LIV.waitForSelector('[data-action="startProof"]');
await LIV.click('[data-action="startProof"]');
await LIV.click('[data-action="confirmDelivery"]');
ok('Livreur : nom du réceptionnaire obligatoire',await LIV.isVisible('text=Nom de la personne qui a reçu'));
await LIV.fill('[data-bind="proofName"]','A. Ngono');
await LIV.setInputFiles('input[data-file="proof"]',{name:'colis.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')});
await LIV.waitForSelector('label img');
await shot(LIV,'07-livreur-preuve-de-livraison');
await LIV.click('[data-action="confirmDelivery"]');
await LIV.waitForSelector('[data-action="toggleOnline"]');
ok('Livreur : livraison confirmée avec photo',true);
await CLI.click('[data-action="switchTab"][data-arg="orders"]');
await CLI.click('[data-action="switchTab"][data-arg="orders"]');
await CLI.waitForTimeout(500);
const orders=await CLI.evaluate(async()=>(await (await fetch('/api/orders',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).orders);
ok('Client : commande livrée, preuve enregistrée (nom + photo)',orders[0].status==='delivered'&&orders[0].proofName==='A. Ngono'&&/^data:image/.test(orders[0].proofPhoto||''));

/* 8. Service client : client → backoffice → client */
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await CLI.click('[data-action="openSupport"]');
await CLI.waitForSelector('[data-bind="msgDraft"]');
await CLI.fill('[data-bind="msgDraft"]','Bonjour, puis-je payer en Orange Money la prochaine fois ?'); await CLI.click('[data-action="sendMsg"]');
await CLI.waitForSelector('.bubble.me:has-text("Orange Money")');
await ADM.click('[data-a="nav"][data-v="messages"]');
await ADM.waitForSelector('button.row:has-text("Ariane Ngono")',{timeout:T});
ok('Backoffice : message du client reçu dans la messagerie',true);
await ADM.click('button.row:has-text("Ariane Ngono") >> nth=0');
await ADM.waitForSelector('.bubble:has-text("Orange Money")');
await ADM.fill('#draft','Bien sûr Ariane, choisissez Orange Money au paiement.'); await ADM.press('#draft','Enter');
await CLI.waitForSelector('.bubble:not(.me):has-text("Bien sûr Ariane")',{timeout:T});
await shot(CLI,'03-client-service-client');await shot(ADM,'11-backoffice-messages');
ok('Client : réponse du service client reçue en direct',await CLI.isVisible('.bubble-author:has-text("Service client WunaGo")'));

/* 9. Discussion directe entre deux clients */
const CL2=await open();
await login(CL2,'6 99 00 00 04','Paul Ebode');
await CL2.waitForSelector('text=Paul Ebode');
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await shot(CLI,'04-client-messages');
await CLI.click('[data-action="openScreen"][data-arg="newChat"]');
await CLI.fill('[data-bind="newChatPhone"]','655555555'); await CLI.click('[data-action="startDirect"]');
await CLI.waitForSelector("text=Ce numéro n'utilise pas encore WunaGo");
ok('Discussion directe : numéro inconnu signalé',true);
await CLI.fill('[data-bind="newChatPhone"]','6 99 00 00 04'); await CLI.click('[data-action="startDirect"]');
await CLI.waitForSelector('[data-bind="msgDraft"]');
await CLI.fill('[data-bind="msgDraft"]','Salut Paul, je te recommande WunaGo !'); await CLI.click('[data-action="sendMsg"]');
await CLI.waitForSelector('.bubble.me:has-text("Salut Paul")');
await CL2.click('[data-action="switchTab"][data-arg="support"]');
await CL2.waitForSelector('.tab-badge, .unread',{timeout:T});
await CL2.click('text=Ariane Ngono');
await CL2.waitForSelector('.bubble:has-text("Salut Paul")');
ok('Discussion directe entre deux clients',true);

/* 10. Réclamation traitée dans le backoffice, réponse dans la messagerie du client */
await CLI.evaluate(async(id)=>fetch('/api/disputes',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({orderId:id,reason:'late',desc:'Livré avec 1 h de retard'})}),orders[0].id);
await ADM.click('[data-a="nav"][data-v="disputes"]');
await ADM.waitForSelector('tr:has-text("LIT-")');
await ADM.click('tr:has-text("LIT-")');
await ADM.fill('#reply','Toutes nos excuses : votre prochaine livraison est offerte.');
await ADM.selectOption('#dst','closed'); await ADM.click('[data-a="saveDispute"]');
await ADM.waitForSelector('text=RÉSOLUE');
ok('Backoffice : réclamation résolue',true);
await shot(ADM,'12-backoffice-reclamations');
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await CLI.click('[data-action="switchTab"][data-arg="support"]');
await CLI.click('button:has-text("Service client WunaGo")');
await CLI.waitForSelector('.bubble:has-text("prochaine livraison est offerte")',{timeout:T});
ok('Client : réponse à la réclamation reçue dans la messagerie',true);

/* 11. Backoffice : suivi des commandes et des livreurs */
await ADM.click('[data-a="nav"][data-v="orders"]');
await ADM.waitForSelector('text=Historique des commandes'); await ADM.waitForSelector('.sumbar');
ok('Historique : jour en cours par défaut, avec totaux',await ADM.isVisible('.plabel:has-text("(aujourd\'hui)")')&&await ADM.isVisible('.sumbar'));
for(const [m,re] of [['week',/^Semaine du/],['month',/^[A-ZÉ][a-zéû]+ \d{4}$/],['year',/^Année \d{4}$/]]){
  await ADM.click(`[data-a="pMode"][data-v="hist|${m}"]`); await ADM.waitForSelector('.sumbar');
  ok('Historique : filtre '+({week:'semaine',month:'mois',year:'année'})[m],re.test((await ADM.locator('.plabel').textContent()).trim()),(await ADM.locator('.plabel').textContent()).trim());
}
ok('Historique : commandes regroupées par jour',await ADM.isVisible('tr.dayrow'));
await ADM.click('[data-a="pShift"][data-v="hist|-1"]'); await ADM.waitForSelector('.sumbar');
ok('Historique : année précédente sans commande',(await ADM.locator('.sumbar').textContent()).includes('0 commande'));
await ADM.click('[data-a="pMode"][data-v="hist|day"]'); await ADM.click('[data-a="pToday"][data-v="hist"]'); await ADM.waitForSelector('.sumbar');
await ADM.waitForSelector('td:has-text("Marcel Kamga")');
await shot(ADM,'13-backoffice-commandes');
ok('Backoffice : commande suivie avec client et livreur',await ADM.isVisible('td:has-text("Ariane Ngono")'));
await ADM.click('[data-a="nav"][data-v="couriers"]');
await ADM.waitForSelector('.leaflet-marker-icon');
ok('Backoffice : livreurs sur la carte',true);
await shot(ADM,'14-backoffice-livreurs');

/* 11 bis. Assignation par le backoffice + rapports du tableau de bord */
await CLI.evaluate(async()=>fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},
  body:JSON.stringify({service:'parcel',pickup:'Akwa',dropoff:'Bonapriso',pickupGeo:{lat:4.0489,lng:9.6996},dropoffGeo:{lat:4.0310,lng:9.6920},weightKg:2,vehicle:'bike',paymentMethod:'orange_money'})}));
await ADM.click('[data-a="nav"][data-v="orders"]');
await ADM.click('[data-a="histStatus"][data-v="unassigned"]');
await ADM.waitForSelector('[data-a="quickAssign"]');
await ADM.click('[data-a="quickAssign"]');
ok('Backoffice : liste des livreurs avec distance au point de départ',/Marcel Kamga · Moto · en ligne/.test(await ADM.locator('#assign-sel').textContent()));
await ADM.click('[data-a="assign"]');
await ADM.waitForSelector('text=Livreur assigné');
await LIV.click('[data-action="switchTab"][data-arg="courses"]'); await LIV.click('[data-action="switchTab"][data-arg="courses"]');
await LIV.waitForSelector('text=Bonapriso',{timeout:T});
ok('Livreur : course assignée par le backoffice reçue',await LIV.isVisible('text=Mes courses en cours'));
await ADM.click('[data-a="nav"][data-v="dash"]');
await ADM.waitForSelector("text=Chiffre d'affaires par canal de paiement",{timeout:T});
await ADM.waitForSelector('.rt td:has-text("Orange Money")',{timeout:T});
const dash=await ADM.locator('main').textContent();
ok('Tableau de bord : CA par canal de paiement',/Espèces/.test(dash)&&/Orange Money/.test(dash));
ok('Tableau de bord : CA par service, jour, heure, zone',['Chiffre d\'affaires par service','Évolution du chiffre d\'affaires','Commandes par heure','Par zone de livraison'].every(x=>dash.includes(x)));
ok('Tableau de bord : caisse des livreurs, clients, portefeuille, réclamations',['Performance et caisse des livreurs','Meilleurs clients','Portefeuille clients','Réclamations par motif','Marge brute','Panier moyen'].every(x=>dash.includes(x)));
await shot(ADM,'15-backoffice-rapports');
await ADM.click('[data-a="preset"][data-v="30"]');
await ADM.waitForSelector('text=Indicateurs · du');
ok('Tableau de bord : changement de période',true);
const [dl]=await Promise.all([ADM.waitForEvent('download'),ADM.click('[data-a="exportCsv"]')]);
const csv=await (await import('node:fs')).promises.readFile(await dl.path(),'utf8');
ok('Export Excel (CSV) des commandes',csv.includes('Code;Date;Heure;Service')&&csv.split('\n').length>=3,dl.suggestedFilename());

/* 11 ter. Courses et gains du livreur : backoffice et app livreur */
await ADM.click('[data-a="nav"][data-v="couriers"]');
await ADM.click('tr[data-a="openCourier"]');
await ADM.waitForSelector('text=Gains du livreur',{timeout:T});
const fiche=await ADM.locator('main').textContent();
ok('Backoffice : fiche livreur avec gains, espèces et solde',['Espèces encaissées','Solde à reverser','CA généré','Bonamoussadi'].every(x=>fiche.includes(x)));
await ADM.click('[data-a="pMode"][data-v="ch|week"]'); await ADM.waitForSelector('.plabel:has-text("Semaine du")'); await ADM.waitForSelector('text=Gains du livreur');
ok('Backoffice : courses du livreur filtrées par semaine',await ADM.isVisible('text=Gains du livreur'));
await shot(ADM,'16-backoffice-fiche-livreur');
await LIV.click('[data-action="switchTab"][data-arg="account"]');
await LIV.waitForSelector('text=Mes courses et mes gains');
await LIV.waitForFunction(()=>/\d/.test(document.querySelector('#app').textContent.match(/GAINS\s*([^\n]*?F)/)?.[1]||''));
const g=await LIV.evaluate(()=>document.querySelector('#app').innerText);
ok('App livreur : gains du jour et courses',/GAINS\s*\n?\s*[1-9][\d\s\u202f]* FCFA/.test(g),g.match(/GAINS[^\n]*\n[^\n]*/)?.[0]);
await LIV.click('[data-action="earnMode"][data-arg="month"]');
await LIV.waitForSelector('text=livrée(s)');
ok('App livreur : gains du mois',true);
await shot(LIV,'08-livreur-gains');

/* 12. Notifications envoyées (mode test, sans envoi réel) */
const log=await CLI.evaluate(async()=>(await (await fetch('/api/push/_log',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).log);
const kinds=log.map(l=>l.title+' : '+l.body);
ok('Notifications : nouvelle course, livreur trouvé, étapes, messages',['Nouvelle course','Livreur trouvé','Colis livré','Bien sûr Ariane'].every(s=>kinds.some(k=>k.includes(s))),log.length+' notifications');
ok('Accès : un client ne peut pas ouvrir le backoffice',(await CLI.evaluate(async()=>(await fetch('/api/admin/stats',{headers:{authorization:'Bearer '+WAPI.token()}})).status))===403);

ok('Aucune erreur JavaScript',pages.every(p=>!p.errors.length),pages.flatMap(p=>p.errors).join(' | '));
await browser.close();
console.log('\n'+results.join('\n'));
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
process.exit(0);
