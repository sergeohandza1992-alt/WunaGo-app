// Mode Google Maps : vérifié avec une version simulée de l'API Google (pas de clé ni de réseau requis).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server=spawn('python3',['-m','http.server','8766','--directory','web'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const results=[]; const ok=(n,c,info='')=>results.push(`${c?'PASS':'FAIL'}  ${n}${info?' — '+info:''}`);
const STUB=`(function(){
  var log=window.__gm={markers:[],polylines:[],directions:0,autocomplete:0,geocode:0,fetchFields:0};
  function LL(lat,lng){return{lat:function(){return lat},lng:function(){return lng}}}
  function Map(el,o){this.el=el;el.setAttribute('data-gmap','1');el.innerHTML='<div class="gm-stub">Google Maps</div>';}
  Map.prototype.fitBounds=function(){};
  function Marker(o){this.o=o;log.markers.push(this);} Marker.prototype.setMap=function(m){this.removed=!m}; Marker.prototype.setPosition=function(p){this.o.position=p};
  function Polyline(o){this.o=o;log.polylines.push(this);} Polyline.prototype.setPath=function(p){this.o.path=p}; Polyline.prototype.setOptions=function(){}; Polyline.prototype.setMap=function(){};
  function LatLngBounds(){} LatLngBounds.prototype.extend=function(){};
  function DirectionsService(){} DirectionsService.prototype.route=function(req,cb){log.directions++;var a=req.origin,b=req.destination;
    setTimeout(function(){cb({routes:[{overview_path:[LL(a.lat,a.lng),LL((a.lat+b.lat)/2+0.004,(a.lng+b.lng)/2),LL(b.lat,b.lng)],legs:[{distance:{value:8300},duration:{value:1260}}]}]},'OK')},50)};
  function Geocoder(){} Geocoder.prototype.geocode=function(req,cb){log.geocode++;setTimeout(function(){cb([{formatted_address:'Rue Njo-Njo, Bonapriso, Douala, Cameroun'}],'OK')},30)};
  var places={AutocompleteSessionToken:function(){},AutocompleteSuggestion:{fetchAutocompleteSuggestions:function(r){log.autocomplete++;return Promise.resolve({suggestions:[
    {placePrediction:{text:{toString:function(){return 'Marché Sandaga, Douala'}},toPlace:function(){var p={location:LL(4.0503,9.7041),fetchFields:function(){log.fetchFields++;return Promise.resolve()}};return p}}}]})}}};
  window.google={maps:{Map:Map,Marker:Marker,Polyline:Polyline,LatLngBounds:LatLngBounds,DirectionsService:DirectionsService,Geocoder:Geocoder,
    SymbolPath:{CIRCLE:0},importLibrary:function(n){return Promise.resolve(n==='places'?places:{})}}};
  setTimeout(function(){window.__wgGmapsReady()},10);
})();`;
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR',geolocation:{latitude:4.03,longitude:9.69},permissions:['geolocation']});
await ctx.addInitScript(()=>{window.WG_CONFIG={googleMapsKey:'CLE-DE-TEST'}});
let loadedKey=null;
await ctx.route('https://maps.googleapis.com/**',r=>{loadedKey=new URL(r.request().url()).searchParams.get('key');return r.fulfill({status:200,contentType:'text/javascript',body:STUB})});
await ctx.route('https://tile.openstreetmap.org/**',r=>r.abort());
await ctx.route('https://photon.komoot.io/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8766/');
await page.waitForFunction(()=>window.WGMaps&&window.WGMaps.ready,null,{timeout:5000});
ok('Google Maps chargé avec la clé configurée',loadedKey==='CLE-DE-TEST');
await page.fill('[data-bind="phone"]','6 99 12 34 56'); await page.click('[data-action="requestOtp"]');
const code=await page.locator('b').first().textContent(); for(const ch of code) await page.click(`[data-action="otpKey"][data-arg="${ch}"]`);
await page.click('[data-action="pickService"][data-arg="parcel"]');
await page.fill('[data-bind="draft.dropoff"]','Sanda');
await page.waitForSelector('.sg-item:has-text("Marché Sandaga")',{timeout:3000});
ok('Recherche d\'adresses Google proposée',await page.isVisible('.sg-item:has-text("Google Maps")'));
await page.click('.sg-item:has-text("Marché Sandaga")');
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wunago.client.v1'))!==null,null);
await page.waitForSelector('.gmaps-link',{timeout:3000});
ok('Coordonnées Google récupérées pour l\'adresse choisie',await page.evaluate(()=>window.__gm.fetchFields===1));
const href=await page.getAttribute('.gmaps-link','href');
ok('Lien « Ouvrir dans Google Maps » vers l\'itinéraire',/google\.com\/maps\/dir\/\?api=1&origin=.*&destination=4\.050300,9\.704100/.test(href),href);
await page.click('[data-action="useMyLocation"]');
await page.waitForFunction(()=>document.querySelector('[data-bind="draft.pickup"]').value.includes('Njo-Njo'),null,{timeout:3000});
ok('Ma position : adresse donnée par Google',true);
await page.click('[data-action="orderNext"]'); await page.click('[data-action="setWhen"][data-arg="tomorrow"]');
for(let i=0;i<2;i++) await page.click('[data-action="orderNext"]');
await page.click('[data-action="confirmPay"]');
await page.waitForSelector('#track-map [data-gmap]',{timeout:5000});
ok('Carte Google Maps affichée au suivi',true);
await page.waitForFunction(()=>window.__gm.directions>=1,null,{timeout:3000});
ok('Itinéraire routier demandé à Google',true);
ok('Repères récupération, livraison et livreur placés',await page.evaluate(()=>window.__gm.markers.filter(m=>!m.removed).length>=3));
ok('Bouton Ouvrir dans Google Maps au suivi',await page.isVisible('.gmaps-link'));
ok('Aucune erreur JavaScript',errors.length===0,errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.kill();
if(results.some(r=>r.startsWith('FAIL'))) process.exit(1);
