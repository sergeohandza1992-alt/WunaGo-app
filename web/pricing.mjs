/* WunaGo — grille tarifaire (source unique, utilisée par l'app ET par le serveur).
   Tous les montants sont en FCFA. Pour changer un prix, modifier TARIFS ci-dessous :
   l'app et le serveur appliquent automatiquement la nouvelle grille.

   Principes : prix accessibles (prise en charge basse, kilomètre bon marché, arrondi à 50 F),
   rentabilité assurée par un minimum de course, un supplément de zone pour la périphérie
   et une majoration modérée aux heures de pointe et en soirée. */

export const TARIFS = {
  arrondi: 50,                       // prix arrondis au 50 F supérieur (monnaie facile)
  partLivreur: 0.8,                  // part reversée au livreur sur le transport (livraison, trajet, zone, collecte) — hors articles et prestations pressing
  lignesTransport: ["delivery", "ride", "zone", "collect", "collectFree"],
  distanceMaxKm: 40,
  facteurRoute: 1.35,                // distance à vol d'oiseau × 1,35 ≈ distance par la route en ville

  /* Véhicules de livraison (colis, courses, collecte pressing) */
  vehicules: {
    bike:     { base: 500,  parKm: 100, kgInclus: 5,   parKg: 50, kgMax: 25 },
    tricycle: { base: 1000, parKm: 180, kgInclus: 60,  parKg: 15, kgMax: 300 },
    van:      { base: 3500, parKm: 300, kgInclus: 300, parKg: 5,  kgMax: 1200 }
  },
  /* Transport de personnes */
  deplacement: {
    bike: { base: 200, parKm: 70, passagersMax: 1, minimum: 300 },     // moto-taxi
    car:  { base: 800, parKm: 220, passagersMax: 4, minimum: 1000 }   // voiture
  },
  minimumLivraison: 500,

  /* Zones : supplément selon la zone la plus éloignée du trajet */
  zones: { 1: { nom: "Centre", supplement: 0 }, 2: { nom: "Intermédiaire", supplement: 100 }, 3: { nom: "Périphérie", supplement: 300 } },

  /* Heures (heure de Douala). Service de 6 h à 22 h. */
  heures: {
    ouverture: 6, fermeture: 22,
    pointe: { coef: 1.15, plages: [[7, 9.5], [16.5, 19.5]], joursOuvres: true },
    soiree: { coef: 1.2, plages: [[20.5, 22]] }
  },

  /* Pressing — prix par article (lavage + repassage), linge au kilo lavé-séché-plié */
  pressing: {
    articles: {
      shirt: 400, tshirt: 300, trousers: 500, skirt: 500, dress: 900, jacket: 1000,
      suit: 2200, boubou: 1000, sheet: 700, duvet: 2500, curtain: 1000
    },
    parKg: 1300,                      // linge au kilo
    kgOffertDes: 5,                   // 1 kg offert dès 5 kg
    collecteOfferteDesKg: 10,         // collecte + retour offerts dès 10 kg…
    collecteOfferteDesMontant: 15000, // … ou dès 15 000 F d'articles
    modes: { wash_iron: 1, iron: 0.6, dry: 1.5 },   // lavage+repassage, repassage seul, nettoyage à sec
    delais: { standard: 1, express: 1.4 },          // 48 h, 24 h
    coefTrajet: 0.5,                                // collecte et retour à moto : chaque trajet à 50 % d'une course
    collecteMax: 1500,                              // plafond des frais de collecte + retour
    atelier: { nom: "Atelier pressing WunaGo", lat: 4.0489, lng: 9.6996 }   // à remplacer par l'adresse réelle de l'atelier
  },

  /* Courses — frais de service + livraison ; articles avancés par le livreur jusqu'au plafond */
  courses: {
    fraisFixe: 300, pourcentage: 0.05, fraisMin: 500, fraisMax: 2500,
    avanceMax: 50000,
    charges: { light: { kg: 5, vehicule: "bike" }, medium: { kg: 15, vehicule: "bike" }, heavy: { kg: 40, vehicule: "tricycle" } }
  }
};

/* Quartiers de Douala : centres approximatifs et zone tarifaire */
export const QUARTIERS = [
  ["Akwa", 4.0489, 9.6996, 1], ["Akwa Nord", 4.0605, 9.7160, 1], ["Bonanjo", 4.0425, 9.6890, 1],
  ["Bonapriso", 4.0300, 9.6950, 1], ["Bali", 4.0430, 9.7040, 1], ["Deïdo", 4.0640, 9.7080, 1],
  ["New Bell", 4.0370, 9.7150, 1], ["Bonadibong", 4.0420, 9.7120, 1],
  ["Bonamoussadi", 4.0950, 9.7400, 2], ["Makepe", 4.0820, 9.7520, 2], ["Kotto", 4.0790, 9.7680, 2],
  ["Logpom", 4.0960, 9.7660, 2], ["Bepanda", 4.0630, 9.7330, 2], ["Ndokoti", 4.0460, 9.7390, 2],
  ["Cité-Cicam", 4.0480, 9.7300, 2], ["Ndogbong", 4.0560, 9.7520, 2], ["Village", 4.0260, 9.7560, 2],
  ["Logbaba", 4.0350, 9.7750, 2], ["PK 8", 4.0450, 9.7900, 2], ["Nyalla", 4.0230, 9.7800, 2], ["Bassa", 4.0350, 9.7300, 2],
  ["Bonabéri", 4.0720, 9.6640, 3], ["Yassa", 4.0050, 9.8050, 3], ["Japoma", 3.9950, 9.8150, 3]
].map(function (q) { return { name: q[0], label: q[0] + ", Douala", lat: q[1], lng: q[2], zone: q[3], kind: "quartier" }; });

export function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function findQuartier(text) {
  var n = norm(text);
  for (var i = 0; i < QUARTIERS.length; i++) if (n.indexOf(norm(QUARTIERS[i].name)) !== -1) return QUARTIERS[i];
  return null;
}
export function distanceKm(a, b) {
  if (!a || !b) return null;
  var R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function roadKm(a, b) { var d = distanceKm(a, b); return d == null ? null : d * TARIFS.facteurRoute; }

/* zone d'un point : celle du quartier le plus proche ; au-delà de 6 km de tout quartier connu → périphérie */
export function zoneOf(p) {
  if (!p) return 2;
  var best = null, bd = 1e9;
  QUARTIERS.forEach(function (q) { var d = distanceKm(p, q); if (d < bd) { bd = d; best = q; } });
  return bd > 6 ? 3 : best.zone;
}

/* heure locale de Douala (UTC+1, pas d'heure d'été) */
export function doualaTime(ms) {
  var d = new Date(ms + 3600000);
  return { hour: d.getUTCHours() + d.getUTCMinutes() / 60, day: d.getUTCDay() };
}
export function hourFactor(ms) {
  var h = TARIFS.heures, t = doualaTime(ms), within = function (pl) { return pl.some(function (r) { return t.hour >= r[0] && t.hour < r[1]; }); };
  if (t.hour < h.ouverture || t.hour >= h.fermeture) return { coef: 1, key: "closed" };
  if (within(h.soiree.plages)) return { coef: h.soiree.coef, key: "evening" };
  if ((!h.pointe.joursOuvres || (t.day >= 1 && t.day <= 5)) && within(h.pointe.plages)) return { coef: h.pointe.coef, key: "peak" };
  return { coef: 1, key: "normal" };
}

function up(n) { var a = TARIFS.arrondi; return Math.ceil(n / a) * a; }
function vehicleFare(vehicle, km, kg) {
  var v = TARIFS.vehicules[vehicle] || TARIFS.vehicules.bike;
  return v.base + v.parKm * km + Math.max(0, kg - v.kgInclus) * v.parKg;
}
export function vehicleFor(kg) {
  var vs = TARIFS.vehicules;
  return kg <= vs.bike.kgMax ? "bike" : kg <= vs.tricycle.kgMax ? "tricycle" : "van";
}
export function vehicleAllows(vehicle, kg) { var v = TARIFS.vehicules[vehicle]; return !!v && kg <= v.kgMax; }

function pickGeo(geo, text) { if (geo && isFinite(geo.lat) && isFinite(geo.lng)) return geo; var q = findQuartier(text); return q ? { lat: q.lat, lng: q.lng } : null; }

/* Devis.
   o = { service, pickup, dropoff, pickupGeo, dropoffGeo, vehicle, weightKg, scheduledAt,
         laundry: { items: {shirt: 2, …}, kg, mode, speed, sameReturn },
         errand:  { list: [{ name, qty, price }], load, advance },
         ride:    { passengers } }
   Renvoie { lines: [{ key, amount, info }], articles, fees, discount, net, distanceKm, zone, hour, vehicle, closed, errors } */
export function quote(o, nowMs) {
  var T = TARIFS, lines = [], errors = [], at = o.scheduledAt || nowMs || Date.now();
  var a = pickGeo(o.pickupGeo, o.pickup), b = pickGeo(o.dropoffGeo, o.dropoff);
  var km = a && b ? roadKm(a, b) : 5;
  km = Math.round(km * 10) / 10;
  if (km > T.distanceMaxKm) errors.push("distance");
  var zone = Math.max(zoneOf(a), zoneOf(b)), zoneFee = T.zones[zone].supplement;
  var hf = hourFactor(at), closed = hf.key === "closed";
  var vehicle = o.vehicle, articles = 0, fees = 0, discount = 0;

  if (o.service === "parcel") {
    var kg = Math.max(0.5, Number(o.weightKg) || 1);
    if (!vehicleAllows(vehicle, kg)) vehicle = vehicleFor(kg);
    var fare = Math.max(T.minimumLivraison, vehicleFare(vehicle, km, kg));
    lines.push({ key: "delivery", amount: up(fare * hf.coef), info: { km: km, kg: kg, vehicle: vehicle } });
    if (zoneFee) lines.push({ key: "zone", amount: zoneFee, info: { zone: zone } });
  }

  else if (o.service === "laundry") {
    var L = o.laundry || {}, P = T.pressing, items = L.items || {}, count = 0, sub = 0;
    var coef = (P.modes[L.mode] || 1) * (P.delais[L.speed] || 1);
    Object.keys(items).forEach(function (k) { var n = Math.max(0, Math.floor(items[k] || 0)); if (P.articles[k] && n) { sub += P.articles[k] * n; count += n; } });
    var lkg = Math.max(0, Math.round((Number(L.kg) || 0) * 2) / 2);
    var kgCost = P.parKg * lkg;
    if (count) lines.push({ key: "items", amount: up(sub * coef), info: { count: count } });
    if (lkg) lines.push({ key: "kilo", amount: up(kgCost * coef), info: { kg: lkg } });
    if (lkg >= P.kgOffertDes) { discount += up(P.parKg * coef); lines.push({ key: "kgFree", amount: -up(P.parKg * coef) }); }
    if (!count && !lkg) errors.push("empty");
    articles = up(sub * coef) + up(kgCost * coef);
    var shop = P.atelier, ret = L.sameReturn === false ? b : a;
    var km1 = a ? roadKm(a, shop) : 5, km2 = ret ? roadKm(shop, ret) : km1;
    km = Math.round((km1 + km2) * 10) / 10;
    var pick = Math.min(P.collecteMax, Math.max(T.minimumLivraison, (vehicleFare("bike", km1, 3) + vehicleFare("bike", km2, 3)) * P.coefTrajet)) * hf.coef;
    var freeCollect = lkg >= P.collecteOfferteDesKg || articles >= P.collecteOfferteDesMontant;
    lines.push({ key: "collect", amount: up(pick), info: { km: km } });
    if (freeCollect) { discount += up(pick); lines.push({ key: "collectFree", amount: -up(pick) }); }
    zone = Math.max(zoneOf(a), zoneOf(ret)); zoneFee = T.zones[zone].supplement;
    if (zoneFee) lines.push({ key: "zone", amount: zoneFee, info: { zone: zone } });
    vehicle = "bike";
  }

  else if (o.service === "errand") {
    var E = o.errand || {}, C = T.courses, list = (E.list || []).filter(function (x) { return x && String(x.name || "").trim(); });
    if (!list.length) errors.push("empty");
    list.forEach(function (x) { articles += Math.max(0, Math.round(Number(x.price) || 0)) * Math.max(1, Math.round(Number(x.qty) || 1)); });
    var load = C.charges[E.load] || C.charges.light;
    vehicle = load.vehicule;
    fees = Math.min(C.fraisMax, Math.max(C.fraisMin, C.fraisFixe + C.pourcentage * articles));
    if (E.advance !== false && articles > C.avanceMax) errors.push("advance");
    lines.push({ key: "articles", amount: articles, info: { count: list.length } });
    lines.push({ key: "service", amount: up(fees) });
    lines.push({ key: "delivery", amount: up(Math.max(T.minimumLivraison, vehicleFare(vehicle, km, load.kg)) * hf.coef), info: { km: km, vehicle: vehicle } });
    if (zoneFee) lines.push({ key: "zone", amount: zoneFee, info: { zone: zone } });
  }

  else if (o.service === "ride") {
    var R = o.ride || {}, pax = Math.max(1, Math.min(4, Math.round(Number(R.passengers) || 1)));
    if (vehicle !== "car" && vehicle !== "bike") vehicle = "bike";
    if (vehicle === "bike" && pax > T.deplacement.bike.passagersMax) vehicle = "car";
    var D = T.deplacement[vehicle];
    lines.push({ key: "ride", amount: up(Math.max(D.minimum, D.base + D.parKm * km) * hf.coef), info: { km: km, passengers: pax, vehicle: vehicle } });
    if (zoneFee) lines.push({ key: "zone", amount: zoneFee, info: { zone: zone } });
  }

  else errors.push("service");

  if (hf.coef !== 1) lines.push({ key: "hour", amount: 0, info: { coef: hf.coef, kind: hf.key } });
  var net = lines.reduce(function (s, l) { return s + l.amount; }, 0);
  if (closed) errors.push("closed");
  return { lines: lines, articles: articles, discount: discount, net: Math.max(0, net), gross: net + discount, distanceKm: km, zone: zone,
    hour: hf.key, coef: hf.coef, vehicle: vehicle, closed: closed, errors: errors, at: at };
}

/* prix d'appel pour l'accueil */
export function fromPrices() {
  var T = TARIFS;
  return { parcel: T.minimumLivraison, laundry: Math.min.apply(null, Object.keys(T.pressing.articles).map(function (k) { return T.pressing.articles[k]; })),
    errand: T.courses.fraisMin, ride: T.deplacement.bike.minimum };
}

/** Gain du livreur : part du transport uniquement (arrondi au 50 F). */
export function courierShare(lines) {
  const base = (lines || []).filter((l) => TARIFS.lignesTransport.includes(l.key)).reduce((s, l) => s + (l.amount || 0), 0);
  return Math.round(Math.max(0, base) * TARIFS.partLivreur / TARIFS.arrondi) * TARIFS.arrondi;
}

if (typeof window !== "undefined") {
  window.WPricing = { TARIFS: TARIFS, QUARTIERS: QUARTIERS, quote: quote, zoneOf: zoneOf, hourFactor: hourFactor, roadKm: roadKm,
    distanceKm: distanceKm, findQuartier: findQuartier, vehicleFor: vehicleFor, vehicleAllows: vehicleAllows, fromPrices: fromPrices, doualaTime: doualaTime, courierShare: courierShare };
}
