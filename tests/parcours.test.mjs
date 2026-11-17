import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/captures',{recursive:true});
const server=spawn('python3',['-m','http.server','8765','--directory','web'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const URL='http://localhost:8765/';
const results=[]; const ok=(n,c,info='')=>{results.push(`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`)};
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR'});
const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
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
ok('Choix du quartier',await page.inputValue('[data-bind="draft.dropoff"]')==='Bonapriso, Douala');
await page.click('[data-action="orderNext"]');
await shot('05-commande-details');
for(let i=0;i<5;i++) await page.click('[data-action="incWeight"]'); // 2.5 -> 5
await page.click('[data-action="orderNext"]');
const total=await page.locator('text=Total').locator('xpath=..').textContent();
ok('Tarif 5 kg colis = 4 000 FCFA (1 kg offert)',/4\s000 FCFA/.test(total),total.trim());
await shot('06-commande-estimation');
await page.click('[data-action="orderNext"]');
await shot('07-paiement');
await page.click('[data-action="confirmPay"]');
await page.waitForSelector('text=Marcel K.',{timeout:5000});
ok('Paiement Orange Money puis suivi',true);
await shot('08-suivi');
// back button test from track
for(let i=0;i<4;i++) await page.click('[data-action="advanceOrder"]');
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
