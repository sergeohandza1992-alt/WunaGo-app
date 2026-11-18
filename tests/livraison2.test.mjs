// Deuxième livraison : backoffice, vrai livreur (position en direct), messagerie client / livreur / service client, notifications.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
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
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block',...opts}); await fixClock(ctx);
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
  writeFileSync(CAP+name+'.html',await page.evaluate(()=>{const r=document.getElementById('app')||document.getElementById('admin')||document.body;return r.innerHTML})); } };
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
await CLI.context().addInitScript(()=>{ try { Object.defineProperty(navigator,'contacts',{value:{select:async()=>[{name:['Paul Mbarga'],tel:['+237 677 11 22 33']}]}}); } catch(e){} });
await login(CLI,'6 99 00 00 03','Ariane Ngono');
await CLI.waitForSelector('text=Ariane Ngono');
await sub(CLI,'client');
await CLI.click('[data-action="pickService"][data-arg="parcel"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="pickup"]'); await CLI.click('[data-action="pickQuartier"][data-arg="Akwa"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="dropoff"]'); await CLI.click('[data-action="pickQuartier"][data-arg="Bonamoussadi"]');
await CLI.fill('[data-bind="draft.hint.dropoff"]','Portail bleu après la pharmacie');
await CLI.click('[data-action="setRecipient"][data-arg="other"]');
ok('Client : prix affiché dès le choix des adresses',/Continuer · [\d\s\u202f]+ FCFA/.test(await CLI.locator('[data-action="orderNext"]').textContent()));
await CLI.click('[data-action="orderNext"]');
ok('Client : destinataire obligatoire quand ce n\'est pas le client',await CLI.isVisible('[data-bind="draft.rname"]'));
await CLI.click('[data-action="pickContact"]');
await CLI.waitForFunction(()=>document.querySelector('[data-bind="draft.rphone"]')?.value==='677112233');
ok('Client : destinataire choisi dans les contacts du téléphone',(await CLI.inputValue('[data-bind="draft.rname"]'))==='Paul Mbarga');
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
ok('Client : invitation à activer les notifications',await CLI.isVisible('text=Soyez prévenu sur votre téléphone'));
ok('Client : code de remise affiché avec bouton de partage',/^\d{4}$/.test((await CLI.locator('.mono[style*="letter-spacing:.3em"]').textContent()).trim())&&await CLI.isVisible('[data-action="shareTracking"]'));
const myOrder=(await CLI.evaluate(async()=>(await (await fetch('/api/orders',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).orders))[0];
const PUB=await open({geolocation:{latitude:4.0962,longitude:9.7415},permissions:['geolocation']});
await PUB.goto(URL+'suivi.html?c='+myOrder.trackToken);
await PUB.waitForSelector('text=Marcel',{timeout:T});
ok('Lien de suivi public (sans compte) : livreur et repère visibles',await PUB.isVisible('text=Pour Paul Mbarga')&&await PUB.isVisible('text=Portail bleu après la pharmacie'));
await PUB.click('#share-pos');
await PUB.waitForSelector('text=Position exacte reçue ✓',{timeout:T});
ok('Destinataire : position exacte envoyée depuis le lien de suivi',true);
await shot(PUB,'17-suivi-public');
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
await LIV.click('[data-arg$="|arrived"]');
await LIV.waitForSelector('text=Client prévenu de votre arrivée');
await PUB.waitForSelector('text=Votre livreur est arrivé',{timeout:T});
ok('Livreur « Je suis arrivé » : client et destinataire prévenus',true);
await LIV.waitForSelector('text=Position exacte envoyée par le destinataire',{timeout:T});
ok('Livreur : position exacte du destinataire signalée',true);
ok('Livreur : destinataire et repère affichés',await LIV.isVisible('text=Paul Mbarga')&&await LIV.isVisible('text=Portail bleu après la pharmacie')&&await LIV.isVisible('a[href="tel:+237677112233"]'));
await LIV.click('[data-action="startProof"]');
await LIV.fill('[data-bind="proofCode"]',myOrder.deliveryCode==='0000'?'1111':String((Number(myOrder.deliveryCode)+1)%10000).padStart(4,'0'));
await LIV.click('[data-action="confirmDelivery"]');
await LIV.waitForSelector('text=Code de remise incorrect');
ok('Livreur : mauvais code refusé',true);
await LIV.click('[data-action="toggleNoCode"]');
await LIV.fill('[data-bind="proofName"]','A. Ngono');
await LIV.click('[data-action="confirmDelivery"]');
ok('Livreur : sans code, la photo est obligatoire',await LIV.isVisible('text=Photo de la remise (obligatoire sans code)'));
await LIV.click('[data-action="toggleNoCode"]');
await LIV.fill('[data-bind="proofCode"]',myOrder.deliveryCode);
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
ok('Client : commande remise avec le code, photo enregistrée',orders[0].status==='delivered'&&orders[0].deliveredWith==='code'&&/^data:image/.test(orders[0].proofPhoto||''));

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
const CL2=await open({geolocation:{latitude:4.0921,longitude:9.7388},permissions:['geolocation']});
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
await LIV.waitForSelector('text=Mes courses en cours',{timeout:T});
ok('Livreur : course assignée par le backoffice reçue',await LIV.isVisible('text=Bonapriso'));
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

/* 11 quater. Client : dépenses par période dans l'historique */
await CLI.click('[data-action="switchTab"][data-arg="orders"]'); await CLI.click('[data-action="switchTab"][data-arg="orders"]');
await CLI.waitForSelector('text=DÉPENSÉ');
let txt=await CLI.evaluate(()=>document.querySelector('#app').innerText);
ok('Client : total dépensé, par service et par moyen de paiement',/DÉPENSÉ\s*\n?\s*[1-9]/.test(txt)&&txt.includes('Par service')&&txt.includes('Par moyen de paiement'),txt.match(/DÉPENSÉ[^\n]*\n[^\n]*/)?.[0]);
await CLI.click('[data-action="spendMode"][data-arg="month"]');
await CLI.waitForSelector('text=Par moyen de paiement');
txt=await CLI.evaluate(()=>document.querySelector('#app').innerText);
ok('Client : dépenses du mois',/DÉPENSÉ · [A-ZÉÛ]+ \d{4}/.test(txt),txt.match(/DÉPENSÉ[^\n]*/)?.[0]);
await shot(CLI,'09-client-depenses');
await CLI.click('[data-action="spendMode"][data-arg="year"]'); await CLI.click('[data-action="spendShift"][data-arg="-1"]');
await CLI.waitForSelector('text=Aucune commande sur cette période');
ok('Client : année précédente sans dépense',(await CLI.evaluate(()=>document.querySelector('#app').innerText)).includes('0 FCFA'));
await CLI.click('[data-action="spendMode"][data-arg="all"]');

/* 11 quinquies. Versement du livreur, course proposée d'abord aux plus proches, recommander */
await ADM.click('[data-a="nav"][data-v="couriers"]'); await ADM.click('tr[data-a="openCourier"]');
await ADM.waitForSelector('text=Caisse du livreur');
await ADM.click('[data-a="addPayment"]');
await ADM.click('[data-a="savePayment"]');
await ADM.waitForSelector('text=Versement enregistré');
await ADM.waitForSelector('text=Versements enregistrés',{timeout:T});
ok('Backoffice : versement du livreur enregistré, caisse remise à zéro',(await ADM.locator('.balance b').textContent()).startsWith('0 F'),(await ADM.locator('.balance b').textContent()));
await LIV.click('[data-action="switchTab"][data-arg="account"]');
await LIV.waitForSelector('text=Mes versements');
ok('App livreur : solde et versements visibles',await LIV.isVisible('text=Remis à WunaGo'));
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});return r.json()};
const admTok=await ADM.evaluate(()=>WAPI.token());
await call('/admin/couriers','POST',{phone:'677000009',name:'Jean Loin',vehicle:'bike'},admTok);
let rr=await call('/auth/request','POST',{phone:'677000009'}); rr=await call('/auth/verify','POST',{phone:'677000009',code:rr.demoCode});
const farTok=rr.token;
await call('/courier/status','POST',{online:true},farTok); await call('/courier/position','POST',{lat:4.25,lng:9.95},farTok);
const cliTok=await CLI.evaluate(()=>WAPI.token());
await call('/orders','POST',{service:'parcel',pickup:'Akwa',dropoff:'Deido',pickupGeo:{lat:4.0489,lng:9.6996},dropoffGeo:{lat:4.0600,lng:9.7100},weightKg:1,vehicle:'bike',paymentMethod:'cash'},cliTok);
const farOffers=(await call('/courier/offers','GET',null,farTok)).offers, nearOffers=(await call('/courier/offers','GET',null,await LIV.evaluate(()=>WAPI.token()))).offers;
ok('Nouvelle course proposée d\'abord aux livreurs proches',!farOffers.some(o=>o.dropoff==='Deido')&&nearOffers.some(o=>o.dropoff==='Deido'));
const al=await call('/admin/run-alerts','POST',{},admTok);
ok('Alertes automatiques : rien à signaler avant 3 / 10 minutes',al.broadcast===0&&al.late===0);
await CLI.click('[data-action="switchTab"][data-arg="home"]'); await CLI.click('[data-action="switchTab"][data-arg="home"]');
await CLI.waitForSelector('text=Vos trajets récents');
ok('Client : trajets récents sur l\'accueil, recommandables en un geste',await CLI.isVisible('button[data-action="reorder"]:has-text("Akwa → Bonamoussadi")'));
await CLI.click('[data-action="switchTab"][data-arg="orders"]'); await CLI.click('[data-action="switchTab"][data-arg="orders"]');
await CLI.click('[data-action="openOrder"] >> nth=-1');
await CLI.waitForSelector('[data-action="reorder"]');
await CLI.click('[data-action="reorder"]');
await CLI.waitForSelector('[data-action="confirmPay"], [data-action="orderNext"]');
const atRecap=await CLI.isVisible('text=3/3');
await CLI.click('[data-action="orderBack"]'); await CLI.click('[data-action="orderBack"]');
ok('Client : « Recommander » reprend le même trajet et va au récapitulatif',atRecap&&(await CLI.inputValue('[data-bind="draft.dropoff"]')).includes('Bonamoussadi')&&(await CLI.inputValue('[data-bind="draft.rname"]'))==='Paul Mbarga');
await CLI.click('[data-action="orderBack"]');

/* 11 sexies. Commande saisie par l'équipe pour un client qui appelle */
await ADM.click('[data-a="nav"][data-v="orders"]');
await ADM.click('[data-a="newOrder"]');
await ADM.fill('[data-k="drawer.phone"]','699000005'); await ADM.fill('[data-k="drawer.name"]','Grace Ekane');
await ADM.locator('select[data-k="drawer.pickupQ"]').selectOption('Akwa');
await ADM.locator('select[data-k="drawer.dropoffQ"]').selectOption('Deïdo');
await ADM.fill('[data-k="drawer.hintD"]','Face au marché');
await ADM.waitForSelector('.drawer .sumbar');
ok('Backoffice : prix calculé pendant la saisie d\'une commande',/Prix [\d\s\u202f]+ F/.test(await ADM.locator('.drawer .sumbar').textContent()));
await ADM.click('[data-a="noSave"]');
await ADM.waitForSelector('text=Commande enregistrée ✓');
ok('Backoffice : commande créée pour un client par téléphone, lien WhatsApp prêt',/wa\.me\/237699000005/.test(await ADM.locator('.drawer a.btn-yellow').getAttribute('href')));
await ADM.click('[data-a="closeDrawer"] >> nth=1');

/* 11 septies. Prix visible sans compte, depuis l'écran de connexion */
const VIS=await open();
await VIS.goto(URL); await VIS.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
await VIS.click('[data-action="openPrice"]');
await VIS.locator('select[data-sim="from"]').selectOption('Akwa'); await VIS.locator('select[data-sim="to"]').selectOption('Makepe');
await VIS.waitForSelector('text=PRIX ESTIMÉ');
ok('Visiteur : prix affiché sans compte',/[1-9][\d\s\u202f]* FCFA/.test(await VIS.locator('#app').innerText()));
await shot(VIS,'18-prix-sans-compte');

/* 11 octies. Code WunaGo : adresse en 6 caractères + QR code */
await CL2.click('[data-action="switchTab"][data-arg="home"]'); await CL2.click('[data-action="switchTab"][data-arg="home"]');
await CL2.waitForSelector('text=Votre adresse en 6 caractères');
await CL2.click('button[data-arg="codeForm"]');
await CL2.click('[data-action="codeLabel"][data-arg="Maison"]');
await CL2.fill('[data-bind="codeForm.hint"]','Portail vert, 2e étage');
await CL2.click('[data-action="createCode"]');
await CL2.waitForSelector('[data-action="shareCode"]',{timeout:T});
const myCode=(await CL2.locator('.mono[style*="font-size:34px"]').textContent()).trim();
ok('Client : Code WunaGo créé avec son QR code',/^WG-[2-9A-HJKMNP-Z]{4}$/.test(myCode)&&await CL2.isVisible('svg'),myCode);
await shot(CL2,'19-code-wunago');
const CPUB=await open();
await CPUB.goto(URL+'code.html?c='+myCode);
await CPUB.waitForSelector('text=Me faire livrer ici avec WunaGo');
ok('Page publique du code : QR, nom et quartier (sans numéro ni GPS)',await CPUB.isVisible('text=Paul')&&await CPUB.isVisible('.qr svg')&&!(await CPUB.content()).includes('699000004'));
await shot(CPUB,'20-code-public');
await CLI.click('[data-action="switchTab"][data-arg="home"]'); await CLI.click('[data-action="switchTab"][data-arg="home"]');
await CLI.click('[data-action="pickService"][data-arg="parcel"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="pickup"]'); await CLI.click('[data-action="pickQuartier"][data-arg="Akwa"]');
await CLI.click('[data-action="setAddrTarget"][data-arg="dropoff"]');
await CLI.click('[data-action="openCodeEntry"]');
await CLI.fill('[data-bind="codeEntry"]',myCode.replace('WG-','').toLowerCase());
await CLI.click('[data-action="applyCode"]');
await CLI.waitForFunction(c=>(document.querySelector('[data-bind="draft.dropoff"]')||{}).value?.includes(c),myCode);
ok('Commande : le code remplit adresse, repère et destinataire',(await CLI.inputValue('[data-bind="draft.hint.dropoff"]'))==='Portail vert, 2e étage'&&(await CLI.inputValue('[data-bind="draft.rname"]'))==='Paul Ebode');
for(let i=0;i<3;i++) await CLI.click('[data-action="orderNext"]');
await CLI.click('[data-action="pickPay"][data-arg="cash"]');
await CLI.click('[data-action="confirmPay"]');
await CLI.waitForSelector("text=CODE DE SECOURS");
const coded=(await CLI.evaluate(async()=>(await (await fetch('/api/orders',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).orders))[0];
ok('Commande enregistrée au point exact du code',coded.dropoff.includes(myCode)&&Math.abs(coded.dropoffGeo.lat-4.0921)<1e-6&&coded.details.recipient.phone==='699000004');
await CLI.evaluate(async(id)=>fetch('/api/orders/'+id+'/cancel',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({reason:'Test'})}),coded.id);
await CLI.goto(URL+'#code='+myCode);
await CLI.waitForSelector('[data-action="flashConfirm"]',{timeout:T});
ok('QR code scanné (lien) : envoi éclair vers ce code',await CLI.isVisible('text=Paul Ebode'));
await CLI.click('[data-action="popScreen"]');
await ADM.click('[data-a="nav"][data-v="orders"]'); await ADM.click('[data-a="newOrder"]');
await ADM.fill('[data-k="drawer.phone"]','699000007');
await ADM.locator('select[data-k="drawer.pickupQ"]').selectOption('Akwa');
await ADM.fill('[data-k="drawer.dropoffCode"]',myCode);
await ADM.click('[data-a="noSave"]');
await ADM.waitForSelector('text=Commande enregistrée ✓');
ok('Backoffice : commande par téléphone avec un Code WunaGo',true);
await ADM.click('[data-a="closeDrawer"] >> nth=1');

/* 11 nonies. Commande éclair : envoyer à un contact du carnet comme on l'appelle */
await CLI.context().grantPermissions(['geolocation']); await CLI.context().setGeolocation({latitude:4.0489,longitude:9.6996});
await CLI.click('[data-action="switchTab"][data-arg="home"]'); await CLI.click('[data-action="switchTab"][data-arg="home"]');
await CLI.waitForSelector('text=MON CARNET');
ok('Accueil : « Envoyer à… » et carnet de codes (contact ajouté automatiquement)',await CLI.isVisible('button[data-action="flashTo"]:has-text("Paul Ebode")'));
await shot(CLI,'21-accueil-envoyer-a');
await CLI.click('button[data-action="flashTo"]:has-text("Paul Ebode")');
await CLI.waitForSelector('[data-action="flashConfirm"]:not([disabled])',{timeout:T});
ok('Commande éclair : un seul écran, départ = ma position, prix affiché',/Envoyer · [\d\s\u202f]+ FCFA/.test(await CLI.locator('[data-action="flashConfirm"]').textContent())&&await CLI.isVisible('text=Ma position actuelle'));
await shot(CLI,'22-commande-eclair');
await CLI.click('[data-action="flashConfirm"]');
await CLI.waitForSelector('text=CODE DE SECOURS',{timeout:T});
let fo=(await CLI.evaluate(async()=>(await (await fetch('/api/orders',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).orders))[0];
ok('Colis envoyé en 3 gestes (destinataire, repère, position exacte remplis)',fo.service==='parcel'&&fo.details.recipient.name==='Paul Ebode'&&fo.details.hints.dropoff==='Portail vert, 2e étage');
await CLI.evaluate(async(id)=>fetch('/api/orders/'+id+'/cancel',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({reason:'Test'})}),fo.id);
await CLI.click('[data-action="switchTab"][data-arg="home"]'); await CLI.click('[data-action="switchTab"][data-arg="home"]');
await CLI.click('[data-action="quickService"][data-arg="ride"]');
await CLI.fill('[data-bind="quickCode"]',myCode.replace('WG-',''));
await CLI.press('[data-bind="quickCode"]','Enter');
await CLI.waitForSelector('[data-action="flashConfirm"]:not([disabled])',{timeout:T});
await CLI.click('[data-action="flashVehicle"][data-arg="car"]');
await CLI.click('[data-action="flashConfirm"]');
await CLI.waitForSelector('[data-action="askCancel"]',{timeout:T});
fo=(await CLI.evaluate(async()=>(await (await fetch('/api/orders',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).orders))[0];
ok('Trajet réservé en tapant un code (voiture)',fo.service==='ride'&&fo.vehicle==='car'&&fo.dropoff.includes(myCode));
await CLI.evaluate(async(id)=>fetch('/api/orders/'+id+'/cancel',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+WAPI.token()},body:JSON.stringify({reason:'Test'})}),fo.id);
await CLI.click('[data-action="switchTab"][data-arg="home"]'); await CLI.click('[data-action="switchTab"][data-arg="home"]');

/* 12. Notifications envoyées (mode test, sans envoi réel) */
const log=await CLI.evaluate(async()=>(await (await fetch('/api/push/_log',{headers:{authorization:'Bearer '+WAPI.token()}})).json()).log);
const kinds=log.map(l=>l.title+' : '+l.body);
ok('Notifications : nouvelle course, livreur trouvé, étapes, messages',['Nouvelle course','Livreur trouvé','Votre livreur est arrivé','Colis livré','Bien sûr Ariane'].every(s=>kinds.some(k=>k.includes(s))),log.length+' notifications');
ok('Accès : un client ne peut pas ouvrir le backoffice',(await CLI.evaluate(async()=>(await fetch('/api/admin/stats',{headers:{authorization:'Bearer '+WAPI.token()}})).status))===403);

ok('Aucune erreur JavaScript',pages.every(p=>!p.errors.length),pages.flatMap(p=>p.errors).join(' | '));
await browser.close();
console.log('\n'+results.join('\n'));
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
process.exit(0);
