// Livreurs sans smartphone ni données : code livreur (badge), remise confirmée par l'expéditeur, réception par le destinataire,
// page ultra-légère /api/lite (HTML sans JavaScript).
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=8777;
const srv=spawn('node',['tests/dev-server.mjs',String(PORT)],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL=`http://localhost:${PORT}/`;
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){}j._status=r.status;return j};
async function tokenFor(phone,name){let r=await call('/auth/request','POST',{phone});r=await call('/auth/verify','POST',{phone,code:r.demoCode});if(name)await call('/me','PATCH',{name},r.token);return r.token}
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
async function phone(js=true){
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'fr-FR',serviceWorkers:'block',javaScriptEnabled:js}); if(js) await fixClock(ctx);
  const page=await ctx.newPage(); page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message)); return page;
}
const adm=await tokenFor('690000001','Agent');
const order=(tok,extra)=>call('/orders','POST',{service:'parcel',pickup:'Akwa, Douala',pickupGeo:{lat:4.0489,lng:9.6996},dropoff:'Bonamoussadi, Douala',dropoffGeo:{lat:4.096,lng:9.738},
  vehicle:'bike',weightKg:2,paymentMethod:'cash',recipient:{self:false,name:'Paul',phone:'677112233'},...(extra||{})},tok);

/* 1. livreur avec téléphone simple */
const c1=await call('/admin/couriers','POST',{phone:'677000020',name:'Bello Simple',vehicle:'bike',basic:true},adm);
const list=(await call('/admin/couriers','GET',null,adm)).couriers;
const bello=list.find(c=>c.phone==='677000020');
ok('Livreur « téléphone simple » créé avec un code badge',c1._status===201&&bello.basic&&/^\d{4}$/.test(bello.pin));
const cli=await tokenFor('691000111','Mado Shop');
const o=(await order(cli)).order;
await call('/admin/orders/'+o.id+'/assign','POST',{courierId:bello.id},adm);
/* l'expéditeur confirme la remise dans son app */
const S=await phone();
await S.goto(URL); await S.waitForFunction(()=>window.WAPI&&WAPI.status.checked);
await S.fill('[data-bind="phone"]','691000111'); await S.click('[data-action="requestOtp"]'); await S.waitForSelector('[data-action="otpKey"]');
for(const ch of (await S.locator('b').first().textContent()).trim()) await S.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await S.waitForSelector('[data-action="switchTab"][data-arg="orders"]'); await S.click('[data-action="switchTab"][data-arg="orders"]');
await S.waitForSelector(`[data-action="openOrder"][data-arg="${o.id}"]`); await S.click(`[data-action="openOrder"][data-arg="${o.id}"]`);
await S.waitForSelector('[data-action="handedOver"]');
ok('Expéditeur : « Bello vient récupérer le colis » + bouton de remise',await S.isVisible('text=vient récupérer le colis'));
await S.screenshot({path:'tests/captures/sans-data-1-remise.png'});
await S.click('[data-action="handedOver"]');
await S.waitForSelector('text=le colis est en route');
let o2=(await call('/orders/'+o.id,'GET',null,cli)).order;
ok('Remis à un livreur sans application : directement « en route »',o2.status==='en_route'&&o2.stage===2);
/* le destinataire tape le code du badge */
const R=await phone();
await R.goto(URL+'suivi.html?c='+o2.trackToken); await R.waitForSelector('#rcv');
ok('Destinataire : saisie du code affichée (livreur sans téléphone)',await R.isVisible('text=Confirmer la réception'));
await R.fill('#rcv',bello.pin); await R.click('#rcv-go');
await R.waitForSelector('h1:has-text("Réception confirmée")');
o2=(await call('/orders/'+o.id,'GET',null,cli)).order;
ok('Livré avec le code du badge, sans le téléphone du livreur',o2.status==='delivered'&&o2.deliveredWith==='recipient');

/* 2. « Recevoir de… » : la personne au départ confirme la remise depuis le suivi */
const pl=await call('/places','POST',{lat:4.07,lng:9.74,label:'Maison',hint:'Immeuble jaune'},cli);
const L=await call('/links','POST',{direction:'receive',phone:'677889900',name:'Maman',mineCode:pl.place.code,payer:'them'},cli);
await call('/lien/'+L.link.token+'/place','POST',{mode:'gps',lat:4.06,lng:9.71});
const v=await call('/lien/'+L.link.token+'/confirm','POST',{});
const o3=(await call('/orders','GET',null,cli)).orders.find(x=>x.code===v.order.code);
await call('/admin/orders/'+o3.id+'/assign','POST',{courierId:bello.id},adm);
const tr=await call('/suivi/'+v.order.trackToken);
ok('Suivi de la personne au départ : bouton « J\'ai remis le colis »',tr.canHandOver===true);
ok('L\'expéditeur ne peut pas confirmer à la place de la personne au départ',(await call('/orders/'+o3.id+'/handed','POST',{},cli))._status===403);
const Q=await phone(); await Q.goto(URL+'suivi.html?c='+v.order.trackToken); await Q.waitForSelector('#handed'); await Q.click('#handed');
await Q.waitForFunction(()=>!document.getElementById('handed'));
ok('Remise confirmée depuis le lien de suivi',(await call('/orders/'+o3.id,'GET',null,cli)).order.stage===2);

/* 3. page ultra-légère (sans JavaScript) */
await call('/admin/couriers','POST',{phone:'677000030',name:'Eric Lite',vehicle:'bike'},adm);
const o4=(await order(cli)).order;
const W=await phone(false);
let res=await W.goto(URL+'api/lite');
ok('Page légère : connexion par numéro, sans JavaScript',await W.isVisible('text=version légère')&&(await W.content()).indexOf('<script')<0);
await W.fill('input[name="phone"]','677000030'); await W.click('button');
await W.waitForSelector('input[name="code"]');
const code=(await W.locator('b').first().textContent()).trim();
await W.fill('input[name="code"]',code); await W.click('button');
await W.waitForSelector('text=Passer en ligne');
ok('Connecté : statut, bilan du jour, code badge',await W.isVisible('text=Aujourd\'hui')&&await W.isVisible('text=Code livreur (badge)'));
await W.click('button:has-text("Passer en ligne")');
await W.waitForSelector('text=Vous êtes en ligne.');
await call('/courier/position','POST',{lat:4.05,lng:9.70},await tokenFor('677000030'));
await W.goto(URL+'api/lite');
await W.waitForSelector('button:has-text("Accepter")',{timeout:10000});
const html=await W.content();
ok('Page très légère (moins de 12 Ko)',Buffer.byteLength(html)<12000,Buffer.byteLength(html)+' octets');
await W.screenshot({path:'tests/captures/sans-data-2-lite.png',fullPage:true});
await W.click('button:has-text("Accepter")');
await W.waitForSelector('text=Course acceptée.');
for(const s of ['Colis récupéré','En route']){ await W.click(`button:has-text("${s}")`); await W.waitForSelector('text=C\'est noté.'); }
await W.waitForSelector('.code');
const hc=(await W.textContent('.code')).trim();
ok('En route : code à montrer au destinataire, appel en un geste',/^\d{4}$/.test(hc)&&await W.isVisible('a[href^="tel:+237"]'));
await W.screenshot({path:'tests/captures/sans-data-3-code.png',fullPage:true});
const o4d=(await call('/orders/'+o4.id,'GET',null,cli)).order;
await W.fill('input[name="code"]',o4d.deliveryCode); await W.click('button:has-text("Livrer avec son code")');
await W.waitForSelector('text=Course livrée ✓');
ok('Livré avec le code de secours depuis la page légère',(await call('/orders/'+o4.id,'GET',null,cli)).order.status==='delivered');
await W.goto(URL+'api/lite/logout'); await W.waitForSelector('input[name="phone"]');
ok('Déconnexion',true);
const N=await phone(false); await N.goto(URL+'api/lite');
await N.fill('input[name="phone"]','699123123'); await N.click('button'); await N.waitForSelector('input[name="code"]');
await N.fill('input[name="code"]',(await N.locator('b').first().textContent()).trim()); await N.click('button');
await N.waitForSelector('text=réservé aux livreurs');
ok('Un client ne voit pas l\'espace livreur léger',true);

ok('Aucune erreur JavaScript',[S,R,Q].every(p=>!p.errors.length),[S,R,Q].flatMap(p=>p.errors).join(' | '));
console.log(results.join('\n'));
await browser.close(); srv.kill('SIGTERM');
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
