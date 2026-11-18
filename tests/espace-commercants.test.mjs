// Lot « Espace commerçants » : profil du commerce, envoi groupé, statistiques et taux de réussite, clients fréquents,
// reçu de livraison, autocollant au nom du commerce, photo du livreur visible par le client, « Je suis disponible ».
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const PORT=8779;
const srv=spawn('node',['tests/dev-server.mjs',String(PORT)],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL=`http://localhost:${PORT}/`;
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){};j._status=r.status;return j};
async function tokenFor(phone,name){let r=await call('/auth/request','POST',{phone});r=await call('/auth/verify','POST',{phone,code:r.demoCode});if(name)await call('/me','PATCH',{name},r.token);return r.token}
const JPG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAYABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC5RRRW58uFFFFABRRRQAUUUUAf/9k=';
const CV=readFileSync('server/contract.mts','utf8').match(/CONTRACT_VERSION\s*=\s*"([^"]+)"/)[1];

/* ---------- 1. profil commerçant ---------- */
const adm=await tokenFor('690000001','Admin WunaGo');
const shop=await tokenFor('691234567','Awa Mbida');
let me=await call('/merchant','GET',null,shop);
ok('Pas encore commerçant',me.merchant===null&&me.stats===null);
const place=await call('/places','POST',{lat:4.0489,lng:9.6996,label:'Boutique',placeName:'Chez Awa',hint:'Face pharmacie du Port'},shop);
ok('Nom obligatoire',(await call('/merchant','PUT',{name:'A'},shop))._status===400);
const other=await tokenFor('699000777','Voisin');
const op=await call('/places','POST',{lat:4.06,lng:9.71,label:'Maison'},other);
ok('Impossible d\'utiliser le Code WunaGo de quelqu\'un d\'autre',(await call('/merchant','PUT',{name:'Resto Awa',placeCode:op.place.code},shop))._status===400);
me=await call('/merchant','PUT',{name:'Resto Awa',kind:'restaurant',area:'Akwa',placeCode:place.place.code},shop);
ok('Espace commerçant créé (restaurant, code de la boutique)',me._status===200&&me.merchant.name==='Resto Awa'&&me.merchant.kind==='restaurant'&&me.merchant.placeCode===place.place.code&&me.stats.month.sent===0);
const pubCode=await call('/code/'+place.place.code);
ok('Page Code publique : nom du commerce pour l\'autocollant',pubCode.merchant&&pubCode.merchant.name==='Resto Awa');

/* ---------- 2. envoi groupé ---------- */
ok('Envoi groupé : 20 au maximum',(await call('/merchant/batch','POST',{items:Array.from({length:21},(_,i)=>({phone:'6770000'+String(10+i)}))},shop))._status===400);
const B=await call('/merchant/batch','POST',{items:[{phone:'677112233',name:'Paul',note:'Ndolé x2'},{phone:'655443322',name:'Rose'},{phone:'12345',name:'Faux'}],payer:'them',size:'small'},shop);
ok('Envoi groupé : 2 liens créés, le numéro invalide signalé',B._status===201&&B.created===2&&B.results[2].ok===false&&/Numéro/.test(B.results[2].error),JSON.stringify(B).slice(0,200));
const l1=B.results[0].link;
ok('Lien parti du code de la boutique, consigne gardée',l1.mine.code===place.place.code&&l1.note==='Ndolé x2'&&l1.payer==='them');
let pub=await call('/lien/'+l1.token);
ok('Le client voit le nom du commerce sur le lien',pub.from==='Resto Awa'&&pub.merchant===true);
await call('/lien/'+l1.token+'/place','POST',{mode:'gps',lat:4.0960,lng:9.7380,hint:'Portail bleu'});
pub=await call('/lien/'+l1.token+'/confirm','POST',{});
ok('Le client confirme : course lancée',pub.status==='ordered');
const trk=pub.order.trackToken;
let tr=await call('/suivi/'+trk);
ok('Suivi : expéditeur = commerce, disponibilité demandée',tr.sender==='Resto Awa'&&tr.canSayReady===true&&tr.recipientReady===null);

/* ---------- 3. « Je suis disponible » ---------- */
await call('/push/subscribe','POST',{subscription:{endpoint:'https://push.example/awa',keys:{p256dh:'x',auth:'y'}}},shop);
const rd=await call('/suivi/'+trk+'/ready','POST',{state:'later',note:'Après 17 h'});
ok('Le destinataire indique sa disponibilité',rd.ok&&rd.recipientReady.state==='later');
tr=await call('/suivi/'+trk);
ok('Disponibilité visible sur le suivi',tr.recipientReady.note==='Après 17 h');
let orders=(await call('/orders','GET',null,shop)).orders;
const o1=orders.find(o=>o.trackToken===trk);
ok('Le commerçant voit la disponibilité du client',o1.details.recipientReady.state==='later');
const log=(await call('/push/_log','GET',null,shop)).log||[];
ok('Notification au commerçant',log.some(x=>/Destinataire/.test(x.title)&&/plus tard/.test(x.body)),JSON.stringify(log.slice(-2)).slice(0,200));

/* ---------- 4. livreur validé avec photo : visible par le client ---------- */
const na=await call('/admin/applications','POST',{phone:'677550011',name:'Eric Moto'},adm);
const appId=na.application.id;
for(const k of ['cni_recto','cni_verso','permis','photo']) await call('/courier-app/docs/'+k+'?app='+appId,'PUT',{image:JPG},adm);
await call('/courier-app?app='+appId,'PATCH',{lastName:'MOTO',firstNames:'Eric',birthDate:'1992-02-02',cniNumber:'111222333',licenseNumber:'LT777',vehicle:'bike',homeArea:'Bepanda',homeAddress:'Près du marché',guarantor:{name:'Paul',phone:'677000888'}},adm);
const sub=await call('/courier-app/submit?app='+appId,'POST',{accept:true,version:CV},adm);
const ap=await call('/admin/applications/'+appId+'/approve','POST',{},adm);
ok('Livreur validé',sub.application&&sub.application.status==='submitted'&&ap._status===200,JSON.stringify(ap).slice(0,150));
const liv=await tokenFor('677550011');
await call('/courier/status','POST',{online:true},liv);
await call('/courier/position','POST',{lat:4.05,lng:9.70},liv);
const acc=await call('/courier/orders/'+o1.id+'/accept','POST',{},liv);
ok('Course acceptée par le livreur',acc._status===200,JSON.stringify(acc).slice(0,150));
tr=await call('/suivi/'+trk);
ok('Suivi : photo du livreur disponible',tr.courier&&tr.courier.hasPhoto===true);
const ph=await fetch(URL+'api/suivi/'+trk+'/photo');
ok('Photo servie (image JPEG)',ph.status===200&&/image\/jpeg/.test(ph.headers.get('content-type')));
orders=(await call('/orders','GET',null,shop)).orders;
ok('App : fiche livreur avec photo et nombre de livraisons',orders.find(o=>o.id===o1.id).courier.hasPhoto===true);
ok('Photo réservée à la commande (autre client refusé)',(await call('/orders/'+o1.id+'/courier-photo','GET',null,other))._status===404);
ok('Reçu indisponible avant la livraison',(await call('/recu/'+trk))._status===409);

/* livraison avec le code du livreur */
await call('/courier/orders/'+o1.id+'/step','POST',{to:'picked_up'},liv);
await call('/courier/orders/'+o1.id+'/step','POST',{to:'en_route'},liv);
const cv=(await call('/courier/orders','GET',null,liv)).orders.find(o=>o.id===o1.id);
const rc=await call('/suivi/'+trk+'/receive','POST',{code:cv.handoverCode});
ok('Réception confirmée par le destinataire',rc._status===200,JSON.stringify(rc).slice(0,150));
ok('Plus de photo après la livraison',(await fetch(URL+'api/suivi/'+trk+'/photo')).status===404);
const rq=await call('/recu/'+trk);
ok('Reçu de livraison : commerce, preuve de remise, sans données de vente',rq._status===200&&rq.sender==='Resto Awa'&&rq.deliveredWith==='recipient'&&rq.recipient==='Paul'&&!('price' in rq),JSON.stringify(rq).slice(0,200));

/* ---------- 5. statistiques ---------- */
me=await call('/merchant','GET',null,shop);
ok('Statistiques du mois : 1 envoi livré, 100 % de réussite',me.stats.month.sent===1&&me.stats.month.delivered===1&&me.stats.successRate===100&&me.stats.month.spent>0,JSON.stringify(me.stats).slice(0,200));
ok('Liens en attente comptés',me.stats.waitingLinks===1);
ok('Clients fréquents',me.stats.frequent.length===1&&me.stats.frequent[0].name==='Paul'&&me.stats.frequent[0].count===1);
const am=await call('/admin/merchants','GET',null,adm);
ok('Backoffice : liste des commerçants avec réussite',am.merchants.length===1&&am.merchants[0].name==='Resto Awa'&&am.merchants[0].successRate===100);
ok('Backoffice réservé à l\'équipe',(await call('/admin/merchants','GET',null,shop))._status===403);

/* ---------- 6. app : espace commerçant, envoi groupé, reçu ---------- */
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'fr-FR',serviceWorkers:'block'});
await fixClock(ctx);
await ctx.addInitScript(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {}};});
await ctx.route('https://*.tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
const P=await ctx.newPage(); P.errors=[]; P.on('pageerror',e=>P.errors.push(e.message));
const CAP=process.env.CAPTURE?'tests/captures/commercants/':null; if(CAP){(await import('node:fs')).mkdirSync(CAP,{recursive:true});}
const shot=async n=>{ if(CAP){ await P.waitForTimeout(350); await P.screenshot({path:CAP+n+'.png'}); } };
await P.goto(URL);
await P.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
await P.fill('[data-bind="phone"]','691234567'); await P.click('[data-action="requestOtp"]');
await P.waitForSelector('[data-action="otpKey"]');
const otp=(await P.locator('b').first().textContent()).trim();
for(const ch of otp) await P.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await P.waitForSelector('button[data-action="openMerchant"]',{timeout:15000});
ok('Accueil : carte du commerce avec ses chiffres',await P.isVisible('button[data-action="openMerchant"]:has-text("Resto Awa")'));
await shot('01-accueil');
await P.click('button[data-action="openMerchant"]');
await P.waitForSelector('text=Clients fréquents');
ok('Tableau du commerce : réussite et client fréquent',await P.isVisible('text=100 %')&&await P.isVisible('button[data-action="mSendTo"]'));
ok('Conseil restaurant (repas chaud)',await P.isVisible('text=Repas chaud'));
await shot('02-espace');
await P.click('button[data-action="openBatch"]');
await P.waitForSelector('[data-bind="m.paste"]');
ok('Restaurant : « Repas chaud » coché par défaut',await P.isChecked('input[data-action="batchMeal"]'));
await P.fill('[data-bind="m.paste"]','677 11 22 44 Mireille\n+237 655 66 77 88 ; Jules');
await P.click('button[data-action="batchPaste"]');
ok('Liste collée : 2 destinataires ajoutés',await P.inputValue('[data-bind="m.batch.0.phone"]')==='677112244'&&await P.inputValue('[data-bind="m.batch.1.name"]')==='Jules');
await P.fill('[data-bind="m.batch.0.note"]','Poulet DG');
await shot('03-envoi-groupe');
await P.click('button[data-action="batchCreate"]:has-text("(2)")');
await P.waitForSelector('text=Liens créés');
ok('Résultat : un bouton WhatsApp par client',await P.locator('button[data-action="batchWa"]').count()===2);
await P.click('button[data-action="batchWa"] >> nth=0');
ok('WhatsApp ouvert vers le bon numéro avec le lien',(await P.evaluate(()=>window.__opened[0]||'')).includes('wa.me/237677112244'));
await shot('04-liens');
const links=(await call('/links','GET',null,shop)).links;
ok('Consigne repas ajoutée au lien',links.some(l=>l.contactPhone==='677112244'&&/Repas chaud/.test(l.note)&&/Poulet DG/.test(l.note)));
await P.click('button[data-action="batchDone"]');
await P.waitForSelector('text=Clients fréquents');
/* reçu depuis la commande livrée */
await P.goto(URL+'recu.html?t='+trk);
await P.waitForSelector('text=Colis livré');
ok('Page reçu : remis à Paul, code tapé par le destinataire',await P.isVisible('text=Remis à Paul')&&await P.isVisible('text=Code tapé par le destinataire'));
await shot('05-recu');
await P.goto(URL+'code.html?c='+place.place.code+'&shop=1');
await P.waitForSelector('.who');
ok('Autocollant au nom du commerce',await P.isVisible('.who:has-text("Resto Awa")'));
await shot('06-autocollant');
/* suivi : boutons de disponibilité pour un 2e lien */
const l2=B.results[1].link;
await call('/lien/'+l2.token+'/place','POST',{mode:'gps',lat:4.07,lng:9.74});
const p2=await call('/lien/'+l2.token+'/confirm','POST',{});
await P.goto(URL+'suivi.html?c='+p2.order.trackToken);
await P.waitForSelector('#ready-now');
await P.click('#ready-now');
await P.waitForSelector('text=Vous êtes indiqué(e) disponible');
ok('Suivi : « Je suis là » enregistré',true);
await shot('07-suivi-disponible');
ok('Aucune erreur JavaScript',P.errors.length===0,P.errors.join(' | '));
await browser.close();
const fails=results.filter(r=>r.startsWith('FAIL'));
console.log(`${results.length-fails.length}/${results.length} réussis`);
srv.kill('SIGTERM'); process.exit(fails.length?1:0);
