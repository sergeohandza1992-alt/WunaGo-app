// Lot « Envoi par lien » : envoyer à un numéro / recevoir de quelqu'un, lieu choisi par l'autre personne,
// qui paie la livraison, confirmation du prix, retour à l'expéditeur.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=8774;
const srv=spawn('node',['tests/dev-server.mjs',String(PORT)],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL=`http://localhost:${PORT}/`;
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});const j=await r.json();j._status=r.status;return j};
async function tokenFor(phone,name){let r=await call('/auth/request','POST',{phone});r=await call('/auth/verify','POST',{phone,code:r.demoCode});if(name)await call('/me','PATCH',{name},r.token);return r.token}

/* ---------- 1. API ---------- */
const adm=await tokenFor('690000001','Admin WunaGo');
const shop=await tokenFor('691111111','Boutique Mado');
const place=await call('/places','POST',{lat:4.0489,lng:9.6996,label:'Boutique',placeName:'Mado Shop',hint:'Face pharmacie du Port'},shop);
ok('Commerçant : Code WunaGo de la boutique',/^WG-/.test(place.place.code));
let L=await call('/links','POST',{direction:'send',phone:'6 77 22 33 44',name:'Paul',mineCode:place.place.code,payer:'them',size:'small'},shop);
ok('Lien créé avec un simple numéro',L._status===201&&L.link.status==='waiting_place'&&L.link.token.length>=10,JSON.stringify(L).slice(0,200));
const tok1=L.link.token;
let pub=await call('/lien/'+tok1);
ok('Page publique : expéditeur et sens affichés, sans compte',pub.from==='Boutique Mado'&&pub.direction==='send'&&pub.status==='waiting_place');
let bad=await call('/lien/'+tok1+'/confirm','POST',{});
ok('Pas de confirmation avant le choix du lieu',bad._status===409);
pub=await call('/lien/'+tok1+'/place','POST',{mode:'gps',lat:4.0960,lng:9.7380,hint:'Portail bleu après la boulangerie',person:{name:'Tante Rose',phone:'655443322'}});
ok('Lieu choisi par le destinataire : prix calculé',pub.status==='waiting_confirm'&&pub.price>=500&&pub.other.person.name==='Tante Rose',JSON.stringify(pub).slice(0,200));
pub=await call('/lien/'+tok1+'/confirm','POST',{});
ok('Le destinataire paie : il confirme lui-même, course lancée',pub.status==='ordered'&&/^WUN-/.test(pub.order.code)&&/^\d{4}$/.test(pub.order.deliveryCode||''),JSON.stringify(pub).slice(0,240));
let orders=(await call('/orders','GET',null,shop)).orders;
const o1=orders[0];
ok('Commande au nom du commerçant : départ = son code, arrivée = lieu choisi',o1.pickup.includes(place.place.code)&&o1.dropoffGeo&&Math.abs(o1.dropoffGeo.lat-4.096)<1e-6);
ok('Livraison à régler par le destinataire, au livreur',o1.paymentMethod==='cash'&&o1.details.payBy.role==='recipient'&&o1.details.payBy.other===true);
ok('Personne qui reçoit = celle indiquée par le destinataire',o1.details.recipient.name==='Tante Rose'&&o1.details.recipient.phone==='655443322'&&o1.details.hints.dropoff.includes('Portail bleu'));
const again=await call('/lien/'+tok1+'/confirm','POST',{});
ok('Double confirmation impossible',again._status===409);

/* 2. « Recevoir de… » : je paie, l'autre indique le départ, je confirme */
const cli=await tokenFor('699887766','Ariane Ngono');
await call('/push/subscribe','POST',{subscription:{endpoint:'https://push.example/ariane',keys:{p256dh:'x',auth:'y'}}},cli);
const home=await call('/places','POST',{lat:4.0700,lng:9.7400,label:'Maison',hint:'Immeuble jaune'},cli);
L=await call('/links','POST',{direction:'receive',phone:'677001122',name:'Maman',mineCode:home.place.code,payer:'me',paymentMethod:'orange_money',size:'medium'},cli);
const tok2=L.link.token;
pub=await call('/lien/'+tok2);
ok('Recevoir de… : la page demande d\'où part le colis',pub.direction==='receive'&&pub.mineArea.length>0);
await call('/lien/'+tok2+'/place','POST',{mode:'code',code:place.place.code.slice(3)});
pub=await call('/lien/'+tok2+'/confirm','POST',{});
ok('Celui qui crée le lien paie : l\'autre ne peut pas confirmer',pub._status===409);
let mine=(await call('/links','GET',null,cli)).links;
ok('Lien en attente de ma confirmation, avec le prix',mine[0].status==='waiting_confirm'&&mine[0].price>0&&mine[0].other.code===place.place.code);
const conf=await call('/links/'+mine[0].id+'/confirm','POST',{},cli);
ok('Confirmation en un geste : course lancée',conf._status===201&&conf.order.paymentMethod==='orange_money',JSON.stringify(conf).slice(0,200));
const o2=conf.order;
ok('Départ = code choisi par l\'expéditeur, arrivée = mon code',o2.pickup.includes(place.place.code)&&o2.dropoff.includes(home.place.code)&&o2.weightKg===15);
ok('Personne qui remet le colis enregistrée',o2.details.pickupContact&&o2.details.pickupContact.phone==='677001122'&&o2.details.payBy.role==='recipient'&&!o2.details.payBy.other);
const log=(await call('/push/_log','GET',null,cli)).log||[];
ok('Notification au créateur quand le lieu est choisi',log.some(x=>/indiqué d'où part le colis/.test(x.title)&&x.url==='/#liens'),JSON.stringify(log.slice(-3)).slice(0,300));

/* 3. annulation et validations */
L=await call('/links','POST',{direction:'send',phone:'699887766',mineGeo:{lat:4.05,lng:9.70},payer:'me',paymentMethod:'cash'},cli);
ok('Son propre numéro refusé',L._status===400);
L=await call('/links','POST',{direction:'send',phone:'12345',mineGeo:{lat:4.05,lng:9.70},payer:'me'},cli);
ok('Numéro invalide refusé',L._status===400);
L=await call('/links','POST',{direction:'send',phone:'655000111',mineGeo:{lat:4.05,lng:9.70},payer:'me',paymentMethod:'cash'},cli);
const cx=await call('/links/'+L.link.id+'/cancel','POST',{},cli);
ok('Lien annulé : la page ne permet plus de choisir',cx.link.status==='cancelled'&&(await call('/lien/'+L.link.token+'/place','POST',{mode:'gps',lat:4.06,lng:9.71}))._status===409);
const far=await call('/links','POST',{direction:'send',phone:'655000112',mineGeo:{lat:4.05,lng:9.70},payer:'them'},cli);
ok('Lieu hors de Douala refusé',(await call('/lien/'+far.link.token+'/place','POST',{mode:'gps',lat:3.87,lng:11.52}))._status===400);
const stats=(await call('/admin/stats','GET',null,adm)).stats, adl=(await call('/admin/links','GET',null,adm)).links;
ok('Backoffice : liens en attente comptés et listés',stats.links_waiting>=1&&adl.some(x=>x.contactPhone==='655000112'&&x.creator.name==='Ariane Ngono'));

/* 4. retour à l'expéditeur */
await call('/admin/couriers','POST',{phone:'677000010',name:'Kevin Moto',vehicle:'bike'},adm);
const liv=await tokenFor('677000010');
await call('/courier/status','POST',{online:true},liv); await call('/courier/position','POST',{lat:4.05,lng:9.70},liv);
await call('/courier/orders/'+o1.id+'/accept','POST',{},liv);
const early=await call('/courier/orders/'+o1.id+'/step','POST',{to:'return'},liv);
ok('Retour impossible avant d\'être chez le destinataire',early._status===409);
await call('/courier/orders/'+o1.id+'/step','POST',{to:'picked_up'},liv);
await call('/courier/orders/'+o1.id+'/step','POST',{to:'en_route'},liv);
await call('/courier/orders/'+o1.id+'/step','POST',{to:'arrived'},liv);
const ret=await call('/courier/orders/'+o1.id+'/step','POST',{to:'return',reason:'refused'},liv);
const R=ret.order.details.returned;
ok('Retour : frais = 50 % du transport, à régler par l\'expéditeur (aller compris si le destinataire devait payer)',R&&R.fee>0&&R.due===R.fee+o1.price.net&&ret.order.price.net===o1.price.net+R.fee,JSON.stringify(R));
const withCode=await call('/courier/orders/'+o1.id+'/step','POST',{to:'delivered',code:pub.order?.deliveryCode||'0000'},liv);
ok('Retour : le code du destinataire ne sert pas, nom + photo exigés',withCode._status===400);
const photo='data:image/jpeg;base64,'+Buffer.from('x'.repeat(200)).toString('base64');
const back=await call('/courier/orders/'+o1.id+'/step','POST',{to:'delivered',receivedBy:'Mado',photo},liv);
ok('Colis rendu à l\'expéditeur',back.order.status==='delivered'&&back.order.deliveredWith==='returned');
const hist=await call('/courier/history','GET',null,liv);
ok('Le livreur est payé aussi pour le retour',hist.summary.earned>=Math.round((o1.price.net+R.fee)*0.8/50)*50-50,JSON.stringify(hist.summary));

/* ---------- 5. app : envoyer à un numéro, page du lien, confirmation, livreur ---------- */
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
async function phone(geo){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block',
    ...(geo?{permissions:['geolocation'],geolocation:geo}:{})}); await fixClock(ctx);
  await ctx.route('https://*.tile.openstreetmap.org/**',r=>r.abort()); await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
  await ctx.addInitScript(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {}};});
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
const S=await phone({latitude:4.0489,longitude:9.6996});
await login(S,'691111111');
await S.waitForSelector('[data-bind="quickCode"]');
ok('Accueil : « Envoyer à… » accepte un numéro',(await S.getAttribute('[data-bind="quickCode"]','placeholder')).includes('Numéro'));
await S.fill('[data-bind="quickCode"]','6 77 55 44 33'); await S.click('[data-action="quickGo"]');
await S.waitForSelector('[data-action="linkCreate"]');
ok('Numéro tapé : écran d\'envoi avec mon code en départ',await S.isVisible('text=+237 6 77 55 44 33')&&await S.isVisible('[data-action="linkMine"][aria-pressed="true"]'));
await S.fill('[data-bind="linkName"]','Paul Etoa');
await S.click('[data-action="linkSet"][data-arg="payer|them"]');
ok('Le destinataire paie : pas de choix de paiement pour moi',!(await S.isVisible('[data-arg="pay|cash"]')));
await S.screenshot({path:'tests/captures/lien-1-envoi.png'});
await S.click('[data-action="linkCreate"]');
await S.waitForSelector('text=ENVOIS EN ATTENTE');
const wa=(await S.evaluate(()=>window.__opened))[0]||'';
ok('WhatsApp ouvert sur le numéro, avec le lien',wa.startsWith('https://wa.me/237677554433?text=')&&decodeURIComponent(wa).includes('/lien.html?t=')&&decodeURIComponent(wa).includes('Paul'),wa.slice(0,90));
ok('Accueil : envoi en attente du lieu',await S.isVisible('text=Lien envoyé · attend le lieu'));
await S.screenshot({path:'tests/captures/lien-2-attente.png'});
const link1=decodeURIComponent(wa).match(/(\/lien\.html\?t=[\w-]+)/)[1];
/* le destinataire ouvre le lien, sans compte */
const P=await phone({latitude:4.0960,longitude:9.7380});
await P.goto(URL+link1.slice(1));
await P.waitForSelector('text=vous envoie un colis');
ok('Page du lien : qui envoie, d\'où, et qui paie',await P.isVisible('text=Boutique Mado vous envoie un colis')&&await P.isVisible('text=La livraison est à votre charge'));
ok('4 choix de lieu',await P.locator('.opt').count()===4);
await P.screenshot({path:'tests/captures/lien-3-page.png',fullPage:true});
await P.click('.opt[data-mode="gps"]');
await P.waitForSelector('text=Position trouvée ✓');
await P.fill('#hint','Portail bleu, 2e étage');
await P.click('#go');
await P.waitForSelector('#confirm');
ok('Prix affiché au destinataire, à régler au livreur',await P.isVisible('text=Prix de la livraison')&&await P.isVisible('text=À régler au livreur'));
await P.screenshot({path:'tests/captures/lien-4-prix.png',fullPage:true});
await P.click('#confirm');
await P.waitForSelector('.bigcode');
ok('Course lancée : code de remise affiché au destinataire',/^\d{4}$/.test((await P.textContent('.bigcode')).trim()));
await P.screenshot({path:'tests/captures/lien-5-lancee.png',fullPage:true});
await P.click('text=Suivre la livraison');
await P.waitForSelector('text=Suivi de livraison, text=Pour Paul Etoa',{timeout:8000}).catch(()=>{});
ok('Suivi de la livraison depuis le lien',P.url().includes('suivi.html?c='));

/* l'expéditeur paie : l'autre choisit « Autre lieu », je confirme sur l'accueil */
await S.fill('[data-bind="quickCode"]','655001122'); await S.click('[data-action="quickGo"]');
await S.waitForSelector('[data-action="linkCreate"]');
await S.click('[data-action="linkSet"][data-arg="direction|receive"]');
await S.click('[data-action="linkCreate"]');
await S.waitForFunction(()=>window.__opened.length===2);
const link2=decodeURIComponent((await S.evaluate(()=>window.__opened))[1]).match(/(\/lien\.html\?t=[\w-]+)/)[1];
const Q=await phone(null);
await Q.goto(URL+link2.slice(1));
await Q.waitForSelector('text=attend un colis de votre part');
ok('Recevoir de… : la page demande d\'où part le colis',await Q.isVisible('text=D\'où part le colis ?'));
await Q.click('.opt[data-mode="map"]');
await Q.selectOption('#area','Bonamoussadi');
await Q.waitForSelector('#map .leaflet-marker-icon');
await Q.fill('#hint','Carrefour Bonamoussadi, boutique verte');
await Q.click('button[data-other="1"]'); await Q.fill('#pname','Jules'); await Q.fill('#pphone','699001100');
await Q.click('#go');
await Q.waitForSelector('text=C\'est noté ✓');
ok('Lieu sur la carte : prix affiché, l\'expéditeur confirme',await Q.isVisible('text=Payée par Boutique'));
await Q.screenshot({path:'tests/captures/lien-6-carte.png',fullPage:true});
await S.evaluate(()=>{location.hash='#liens'});
await S.waitForSelector('[data-action="linkConfirm"]',{timeout:15000});
ok('Accueil : lieu choisi, prix à confirmer en un geste',(await S.textContent('[data-action="linkConfirm"]')).includes('Confirmer ·'));
await S.screenshot({path:'tests/captures/lien-7-confirmer.png'});
await S.click('[data-action="linkConfirm"]');
await S.waitForSelector('text=Recherche d\'un livreur, text=WUN-',{timeout:8000}).catch(()=>{});
const orders2=(await call('/orders','GET',null,shop)).orders;
ok('Course lancée depuis l\'accueil',orders2[0].details.via==='link'&&orders2[0].details.pickupContact.name==='Jules');
await Q.reload(); await Q.waitForSelector('text=Un livreur WunaGo arrive ✓');
ok('La page du lien passe à « course lancée » (sans code : c\'est l\'expéditeur)',!(await Q.isVisible('.bigcode')));

/* code WunaGo + le destinataire paie */
await S.click('[data-action="switchTab"][data-arg="home"]').catch(()=>{});
await S.evaluate(()=>{location.hash='#liens'});
await S.fill('[data-bind="quickCode"]',home.place.code); await S.click('[data-action="quickGo"]');
await S.waitForSelector('[data-action="flashPayer"]');
await S.click('[data-action="flashPayer"][data-arg="them"]');
ok('Envoi par code : « le destinataire paie » masque mon paiement',!(await S.isVisible('[data-action="flashPay"]')));
await S.click('[data-action="flashConfirm"]');
await S.waitForTimeout(800);
const o3=(await call('/orders','GET',null,shop)).orders[0];
ok('Commande par code payée par le destinataire',o3.details.payBy&&o3.details.payBy.role==='recipient'&&o3.paymentMethod==='cash'&&o3.details.payBy.name==='Ariane Ngono');

/* livreur : remis par, encaissement, retour */
const LV=await phone({latitude:4.05,longitude:9.70});
await login(LV,'677000010');
await LV.waitForSelector('[data-action="openCourse"]',{timeout:15000});
const o4=orders2[0];
const acc=await call('/courier/orders/'+o4.id+'/accept','POST',{},liv); if(acc._status!==200) console.error('ACCEPT',JSON.stringify(acc).slice(0,200));
await LV.evaluate(()=>{location.hash='#courses'}); await LV.waitForTimeout(500);
await LV.reload(); await LV.waitForSelector(`[data-action="openCourse"][data-arg="${o4.id}"]`,{timeout:15000});
await LV.click(`[data-action="openCourse"][data-arg="${o4.id}"]`);
await LV.waitForSelector('text=REMET LE COLIS');
ok('Livreur : personne qui remet le colis, avec bouton d\'appel',await LV.isVisible('text=Jules'));
for(const st of ['picked_up','en_route','arrived']) await call('/courier/orders/'+o4.id+'/step','POST',{to:st},liv);
await LV.reload(); await LV.waitForSelector(`[data-action="openCourse"][data-arg="${o4.id}"]`); await LV.click(`[data-action="openCourse"][data-arg="${o4.id}"]`);
await LV.click('[data-action="courseReturnAsk"]');
await LV.click('[data-action="courseReturn"][data-arg$="|absent"]');
await LV.waitForSelector('text=Itinéraire retour');
ok('Livreur : retour à l\'expéditeur, itinéraire et montant affichés',await LV.isVisible('text=Itinéraire retour')&&await LV.isVisible('text=Retour · à encaisser'));
await LV.screenshot({path:'tests/captures/lien-8-retour.png'});
ok('Livreur : bouton « Rendu à l\'expéditeur » (nom + photo, sans code)',(await LV.textContent('[data-action="startProof"]')).includes('Rendu'),await LV.textContent('[data-action="startProof"]'));

ok('Aucune erreur JavaScript',[S,P,Q,LV].every(p=>!p.errors.length),[S,P,Q,LV].flatMap(p=>p.errors).join(' | '));
console.log(results.join('\n'));
await browser.close(); srv.kill('SIGTERM');
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
