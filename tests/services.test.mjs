// Parcours dédiés (pressing, courses, déplacement), solde insuffisant, filtres, Mon profil.
import { fixClock, fixNode } from './horloge.mjs'; fixNode();
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/captures',{recursive:true});
const server=spawn('python3',['-m','http.server','8768','--directory','web'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
await new Promise(r=>setTimeout(r,800));
const results=[]; const ok=(n,c,info='')=>{const l=`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`;results.push(l);if(process.env.WG_VERBOSE)console.error(l)};
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block'}); await fixClock(ctx);
await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":false}'}));
await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const shot=async n=>{await page.waitForTimeout(300);await page.screenshot({path:`tests/captures/${n}.png`})};
const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wunago.client.v1')));
const total=async()=>Number((await page.locator('text=Total').locator('xpath=..').textContent()).replace(/\D/g,''));
const home=async()=>{await page.click('[data-action="switchTab"][data-arg="home"]');await page.click('[data-action="switchTab"][data-arg="home"]');};
await page.goto('http://localhost:8768/');
await page.fill('[data-bind="phone"]','6 99 12 34 56'); await page.click('[data-action="requestOtp"]');
const code=(await page.locator('b').first().textContent()).trim(); for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await page.waitForSelector('text=Que faisons-nous');
ok('Accueil : prix d\'appel issus de la grille',await page.isVisible('text=dès 300 F/pièce'));

// ---- Pressing
await page.click('[data-action="pickService"][data-arg="laundry"]');
ok('Pressing : retour à la même adresse par défaut (une seule adresse)',await page.locator('[data-bind="draft.dropoff"]').count()===0);
await page.click('[data-action="orderNext"]');
await page.click('[data-action="orderNext"]');
ok('Pressing : panier vide refusé',await page.isVisible('text=Ajoutez au moins un article'));
for(let i=0;i<3;i++) await page.click('[data-action="laundryItem"][data-arg="shirt|1"]');
await page.click('[data-action="laundryItem"][data-arg="suit|1"]');
await page.click('[data-action="setLaundrySpeed"][data-arg="express"]');
await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
await shot('30-pressing-articles');
await page.click('[data-action="orderNext"]');
const lp=await total();
ok('Pressing : devis articles express + collecte',await page.isVisible('text=Articles pressing · 4') && await page.isVisible('text=Collecte + retour') && lp>0,lp+' F');
await page.click('[data-action="orderNext"]'); await page.click('[data-action="pickPay"][data-arg="cash"]'); await page.click('[data-action="confirmPay"]');
await page.waitForSelector('text=Linge collecté');
ok('Pressing : suivi avec étapes propres au pressing',await page.isVisible('text=Retour en cours'));
let st=await store();
ok('Pressing : détail des articles enregistré',st.orders[0].details.laundry.items.shirt===3&&st.orders[0].price.net===lp);

// ---- Courses
await home();
await page.click('[data-action="pickService"][data-arg="errand"]');
await page.click('[data-action="pickMarket"][data-arg="1"]');
ok('Courses : marché choisi en un geste',(await page.inputValue('[data-bind="draft.pickup"]'))==='Marché Sandaga, Douala');
await page.click('[data-action="orderNext"]');
await page.fill('[data-bind="errand.name.0"]','Riz 5 kg'); await page.fill('[data-bind="errand.price.0"]','4500');
await page.click('[data-action="errandQty"][data-arg="0|1"]');
await page.click('[data-action="quickErrandItem"][data-arg="Huile 1 L"]'); await page.fill('[data-bind="errand.price.1"]','1500');
ok('Courses : total des articles calculé',await page.isVisible('text=10 500 FCFA'));
await page.click('[data-action="setErrandLoad"][data-arg="medium"]');
await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
await shot('31-courses-liste');
await page.click('[data-action="orderNext"]');
const le=await total();
ok('Courses : articles + frais de service + livraison',await page.isVisible('text=Articles (estimation) · 2') && await page.isVisible('text=Frais de service') && le>10500,le+' F');
await shot('32-courses-estimation');
await page.click('[data-action="orderNext"]'); await page.click('[data-action="pickPay"][data-arg="cash"]'); await page.click('[data-action="confirmPay"]');
await page.waitForSelector('text=Achats en cours');
ok('Courses : liste enregistrée avec la commande',(await store()).orders[0].details.errand.list.length===2);

// ---- Déplacement
await home();
await page.click('[data-action="pickService"][data-arg="ride"]');
await page.click('[data-action="orderNext"]');
await page.click('[data-action="ridePassengers"][data-arg="p|1"]');
ok('Déplacement : 2 passagers → voiture, moto-taxi indisponible',await page.isDisabled('[data-action="pickVehicle"][data-arg="bike"]'));
await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
await shot('33-deplacement');
await page.click('[data-action="orderNext"]');
ok('Déplacement : course en voiture au devis',await page.isVisible('text=Voiture'));

// ---- Solde insuffisant : signalé avant paiement
await page.evaluate(()=>{}); // (le portefeuille de démo contient 12 400 F)
await page.click('[data-action="orderBack"]'); await page.click('[data-action="orderBack"]'); await page.click('[data-action="orderBack"]');
await home();
await page.click('[data-action="pickService"][data-arg="errand"]');
await page.click('[data-action="orderNext"]');
await page.fill('[data-bind="errand.name.0"]','Congélateur'); await page.fill('[data-bind="errand.price.0"]','45000');
await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
await page.click('[data-action="orderNext"]'); await page.click('[data-action="orderNext"]');
ok('Paiement : portefeuille insuffisant grisé avec bouton Recharger',await page.isVisible('[data-action="goTopUp"]') && await page.locator('[data-action="pickPay"][data-arg="wallet"]').count()===0);
await shot('34-solde-insuffisant');
await page.click('[data-action="goTopUp"]');
ok('Recharger mène au portefeuille, panneau ouvert',await page.isVisible('[data-bind="topUpAmount"]'));

// ---- Filtres de l'historique
await page.click('[data-action="switchTab"][data-arg="orders"]');
await page.click('[data-action="setHistoryFilter"][data-arg="3"]');
ok('Historique : filtre Courses',await page.locator('[data-action="openOrder"]').count()===1);
await page.click('[data-action="setHistoryFilter"][data-arg="2"]');
ok('Historique : filtre Pressing',await page.locator('[data-action="openOrder"]').count()===1);

// ---- Mon profil
await page.click('[data-action="switchTab"][data-arg="wallet"]');
await page.click('[data-action="openProfile"]');
await page.fill('[data-bind="profileName"]','Serge O.');
await page.click('[data-action="saveProfile"]');
await page.waitForTimeout(200);
ok('Profil : nom modifié',(await store()).user.name==='Serge O.');
await shot('35-profil');
await page.click('[data-action="askDeleteAccount"]');
await page.click('[data-action="confirmDeleteAccount"]');
await page.waitForSelector('[data-action="requestOtp"]');
ok('Suppression du compte : données effacées et déconnexion',(await store()).addresses.length===0 && (await store()).loggedIn===false);
ok('Aucune erreur JavaScript',errors.length===0,errors.join(' | '));
console.log(results.join('\n'));
await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);
process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
