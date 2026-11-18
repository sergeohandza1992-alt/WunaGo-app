// Inscription des livreurs : dossier, photos des pièces, lecture automatique, contrat, validation au backoffice, inscription en agence.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PORT=8776;
const srv=spawn('node',['tests/dev-server.mjs',String(PORT)],{stdio:['ignore','pipe','inherit'],env:{...process.env,ADMIN_PHONES:'690000001',WG_PUSH_DRY:'1'}});
process.on('exit',()=>srv.kill('SIGTERM'));
process.on('uncaughtException',e=>{console.error(e);srv.kill('SIGTERM');process.exit(1)});
await new Promise(r=>srv.stdout.on('data',d=>String(d).includes('ready')&&r()));
const URL=`http://localhost:${PORT}/`;
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);console.error(l)};
const call=async(p,m,b,tok)=>{const r=await fetch(URL+'api'+p,{method:m||'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){}j._status=r.status;return j};
async function tokenFor(phone,name){let r=await call('/auth/request','POST',{phone});r=await call('/auth/verify','POST',{phone,code:r.demoCode});if(name)await call('/me','PATCH',{name},r.token);return r.token}
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
async function phone(geo){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block',
    ...(geo?{permissions:['geolocation'],geolocation:geo}:{})}); await fixClock(ctx);
  const page=await ctx.newPage(); page.errors=[]; page.on('pageerror',e=>page.errors.push(e.message)); return page;
}
const adm=await tokenFor('690000001','Agent WunaGo');
await call('/push/subscribe','POST',{subscription:{endpoint:'https://push.example/adm',keys:{p256dh:'x',auth:'y'}}},adm);

/* fausses pièces dessinées (texte net) : recto avec libellés, verso avec la zone MRZ */
const dir=mkdtempSync(join(tmpdir(),'wg-pieces-'));
const P=await phone({latitude:4.0921,longitude:9.7412});
await P.goto(URL+'livreur.html');
async function drawDoc(lines,file,w=1500,h=950,size=46){
  const data=await P.evaluate(([lines,w,h,size])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#000';
    lines.forEach((l,i)=>{x.font=(l.mono?'bold ':'bold ')+size+'px '+(l.mono?'monospace':'Arial');x.fillText(l.t,50,90+i*(size*1.55));});return c.toDataURL('image/png');},[lines,w,h,size]);
  const f=join(dir,file); writeFileSync(f,Buffer.from(data.split(',')[1],'base64')); return f;
}
const recto=await drawDoc([{t:'REPUBLIQUE DU CAMEROUN'},{t:'CARTE NATIONALE D IDENTITE'},{t:'NOM : MBARGA'},{t:'PRENOMS : JEAN PAUL'},{t:'DATE DE NAISSANCE : 12/03/1995'},{t:'LIEU DE NAISSANCE : YAOUNDE'},{t:'SEXE : M'}],'recto.png');
const verso=await drawDoc([{t:'DATE DE DELIVRANCE : 05/01/2021'},{t:'DATE D EXPIRATION : 05/01/2031'},{t:'IDCMR123456789<<<<<<<<<<<<<<<',mono:true},{t:'9503125M3101054CMR<<<<<<<<<<<6',mono:true},{t:'MBARGA<<JEAN<PAUL<<<<<<<<<<<<<',mono:true}],'verso.png');
const permis=await drawDoc([{t:'PERMIS DE CONDUIRE'},{t:'5. CE0458921'},{t:'4b. 20/07/2030'},{t:'9. A, B'}],'permis.png');
const photo=await drawDoc([{t:'PHOTO'}],'photo.png',400,500,40);

/* 1. connexion et dossier */
await P.waitForSelector('#ph');
ok('Page « Devenir livreur » : liste des pièces à préparer',await P.isVisible('text=Ce qu\'il vous faut'));
await P.fill('#ph','677123456'); await P.click('#send');
await P.waitForSelector('#otp'); const code=(await P.locator('p.muted b').textContent()).trim();
await P.fill('#otp',code); await P.click('#verify');
await P.waitForSelector('text=Vos pièces en photo');
ok('Connexion par code : dossier ouvert (pièces → contrat)',!!(await P.waitForSelector('#accept',{state:'attached',timeout:8000}).catch(()=>null)));
ok('Bouton de lecture bloqué tant que la CNI n\'est pas photographiée',await P.isDisabled('#ocr'));
for(const [k,f] of [['cni_recto',recto],['cni_verso',verso],['permis',permis],['photo',photo]]){
  await P.setInputFiles(`input[data-doc="${k}"]`,f);
  await P.waitForFunction(k=>{const l=document.querySelector(`input[data-doc="${k}"]`);return l&&l.closest('.doc').classList.contains('ok');},k,{timeout:15000});
}
ok('Quatre pièces envoyées (compressées)',await P.locator('.doc.ok').count()===4);
await P.screenshot({path:'tests/captures/inscription-1-pieces.png'});
await P.click('#ocr');
await P.waitForSelector('text=information(s) remplie(s)',{timeout:120000});
const v=k=>P.inputValue(`[data-k="${k}"]`);
const ln=await v('lastName'), bd=await v('birthDate'), fn=await v('firstNames');
ok('Lecture automatique : nom et prénoms',ln.includes('MBARGA')&&/JEAN/i.test(fn),ln+' / '+fn);
ok('Lecture automatique : date de naissance',bd==='1995-03-12',bd);
const cni=await v('cniNumber'), lic=await v('licenseNumber'), exp=await v('cniExpiry');
ok('Lecture automatique : CNI (numéro ou expiration) et permis',(/123456789/.test(cni)||exp==='2031-01-05')&&/CE0458921/.test(lic),cni+' '+exp+' '+lic);
ok('Champs lus surlignés « à vérifier »',await P.locator('input.pre').count()>=3);
await P.screenshot({path:'tests/captures/inscription-2-lecture.png',fullPage:true});
/* compléter ce qui manque */
if(!/123456789/.test(cni)) await P.fill('[data-k="cniNumber"]','123456789');
await P.selectOption('[data-k="vehicle"]','bike');
await P.selectOption('[data-k="homeArea"]','Bonamoussadi');
await P.click('#gps'); await P.waitForSelector('text=Position du domicile enregistrée');
await P.fill('[data-k="homeAddress"]','Après la pharmacie du Carrefour, portail vert');
await P.fill('[data-g="name"]','NGONO Marie'); await P.fill('[data-g="phone"]','699887766'); await P.fill('[data-g="relation"]','Tante');
await P.waitForTimeout(900);
ok('Envoi bloqué tant que le contrat n\'est pas coché',await P.isDisabled('#submit'));
await P.check('#accept');
await P.waitForSelector('#submit:not([disabled])',{timeout:8000});
await P.screenshot({path:'tests/captures/inscription-3-contrat.png',fullPage:true});
await P.click('#submit');
await P.waitForSelector('text=Vérification en cours');
ok('Dossier envoyé : « Vérification en cours », contrat daté',await P.isVisible('text=Contrat accepté le'));
const pushLog=(await call('/push/_log','GET',null,adm)).log||[];
ok('L\'équipe est prévenue (notification)',pushLog.some(x=>/Nouveau dossier livreur/.test(x.title)));

/* 2. contrôles côté serveur */
const cand=await tokenFor('677123456');
let me=(await call('/courier-app','GET',null,cand)).application;
ok('Dossier complet côté serveur (identité, domicile GPS, garant, 4 pièces)',me.status==='submitted'&&me.data.homeGeo&&me.data.guarantor.phone==='699887766'&&me.docs.length===4&&me.acceptedVia==='self'&&me.contractVersion);
ok('Dossier figé une fois envoyé',(await call('/courier-app','PATCH',{lastName:'X'},cand))._status===409);
ok('Un client ne peut pas lire le dossier d\'un autre',(await call('/courier-app?app='+me.id,'GET',null,await tokenFor('699000123')))._status===403);
const list=(await call('/admin/applications?status=submitted','GET',null,adm)).applications;
ok('Backoffice : dossier dans « À valider »',list.some(a=>a.id===me.id&&a.docs===4));
const img=await fetch(URL+'api/admin/applications/'+me.id+'/docs/cni_recto',{headers:{authorization:'Bearer '+adm}});
ok('Backoffice : pièce lisible (image)',img.status===200&&img.headers.get('content-type')==='image/jpeg');
ok('Pièce refusée à un client',(await fetch(URL+'api/admin/applications/'+me.id+'/docs/cni_recto',{headers:{authorization:'Bearer '+cand}})).status===403);

/* 3. validation au backoffice (interface) */
const A=await browser.newPage({viewport:{width:1280,height:900}}); A.errors=[]; A.on('pageerror',e=>A.errors.push(e.message));
await A.addInitScript(t=>localStorage.setItem('wunago.token',t),adm);
await A.goto(URL+'admin.html#candidatures');
await A.waitForSelector(`[data-a="openApp"][data-v="${me.id}"]`,{timeout:15000});
ok('Backoffice : menu « Candidatures » avec le nombre à valider',await A.isVisible('button[data-v="apps"] .count'));
await A.click(`[data-a="openApp"][data-v="${me.id}"]`);
await A.waitForFunction(()=>document.querySelectorAll('figure img').length>=4,null,{timeout:15000});
ok('Fiche complète : pièces, identité, garant, contrat accepté',await A.isVisible('text=NGONO Marie')&&await A.isVisible('text=acceptée le')&&(await A.locator('figure img').count())>=4);
await A.screenshot({path:'tests/captures/inscription-4-backoffice.png'});
await A.click(`[data-a="approveApp"][data-v="${me.id}"]`);
await A.waitForSelector('text=Dossier validé : le livreur peut commencer');
const u=(await call('/me','GET',null,cand)).user;
ok('Validé : le compte devient livreur, avec son nom et son véhicule',u.role==='courier'&&/MBARGA/.test(u.name),JSON.stringify(u).slice(0,120));
await P.reload(); await P.waitForSelector('text=Ok ! Go');
ok('Page du livreur : « Ok ! Go » et accès à l\'app',await P.isVisible('a[href="/#courses"]'));
await P.screenshot({path:'tests/captures/inscription-5-go.png'});

/* 4. inscription en agence, puis correction demandée */
const na=await call('/admin/applications','POST',{phone:'655443322',name:'Ali Moto'},adm);
ok('Agent : dossier ouvert pour un livreur présent',na._status===201&&na.application.status==='draft');
const appId=na.application.id;
const G=await browser.newPage({viewport:{width:390,height:844}}); G.errors=[]; G.on('pageerror',e=>G.errors.push(e.message));
await G.addInitScript(t=>localStorage.setItem('wunago.token',t),adm);
await G.goto(URL+'livreur.html?app='+appId);
await G.waitForSelector('text=Mode agent');
ok('Page en mode agent (dossier du livreur, pas celui de l\'agent)',await G.isVisible('text=655443322'));
const jpg='data:image/jpeg;base64,'+(await P.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;return c.toDataURL('image/jpeg',.5).split(',')[1];}));
for(const k of ['cni_recto','cni_verso','permis','photo']) await call('/courier-app/docs/'+k+'?app='+appId,'PUT',{image:jpg},adm);
await call('/courier-app?app='+appId,'PATCH',{lastName:'ALI',firstNames:'Moussa',birthDate:'1990-01-01',cniNumber:'987654321',licenseNumber:'LT555',vehicle:'tricycle',homeArea:'Bepanda',homeAddress:'Derrière le marché',guarantor:{name:'Oumarou',phone:'677000999'}},adm);
ok('Envoi refusé sans la case du contrat',(await call('/courier-app/submit?app='+appId,'POST',{accept:false},adm))._status===400);
const sub=await call('/courier-app/submit?app='+appId,'POST',{accept:true,version:me.contractVersion},adm);
ok('Contrat accepté en agence, agent enregistré',sub.application.status==='submitted'&&sub.application.acceptedVia==='agent');
const big='data:image/jpeg;base64,'+'A'.repeat(1700000);
ok('Photo trop lourde refusée',(await call('/courier-app/docs/photo','PUT',{image:big},await tokenFor('677999111')))._status===413);
const rj=await call('/admin/applications/'+appId+'/reject','POST',{note:'Photo du permis floue'},adm);
ok('Correction demandée : dossier rouvert avec le motif',rj.application.status==='rejected'&&rj.application.reviewNote==='Photo du permis floue');
const ali=await tokenFor('655443322');
ok('Le livreur peut corriger son dossier',(await call('/courier-app','PATCH',{licenseNumber:'LT556'},ali))._status===200);
const miss=await call('/courier-app/submit','POST',{accept:true,version:me.contractVersion},await tokenFor('677999111'));
ok('Dossier incomplet : la liste de ce qui manque est donnée',miss._status===400&&/garant/.test(miss.error)&&/photo CNI recto/.test(miss.error),miss.error);

/* 5. lien depuis l'écran de connexion de l'app */
const C=await phone(null); await C.goto(URL); await C.waitForSelector('a[href="livreur.html"]');
ok('App : « Vous êtes livreur ? Rejoignez WunaGo »',true);

ok('Aucune erreur JavaScript',[P,A,G,C].every(p=>!p.errors.length),[P,A,G,C].flatMap(p=>p.errors).join(' | '));
console.log(results.join('\n'));
await browser.close(); srv.kill('SIGTERM');
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
