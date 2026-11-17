
(function () {
  "use strict";
  /* ===== WunaGo Web App — configuration =====
     DEMO = true : OTP affiché à l'écran et bouton « Avancer la livraison »,
     tant que le backend (SMS, paiement, suivi GPS) n'est pas branché. */
  var DEMO = true;
  var STORE_KEY = "wunago.client.v1";
  var deferredInstall = null;
  var lastScreenKey = "";
  var installDismissed = false;
  var isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);


  /* ============================== data ============================== */

  var SERVICES = [
    { key: "parcel", mark: "KG", fr: "Livraison colis", en: "Parcel delivery", pricing: "weight", baseRate: 1000 },
    { key: "laundry", mark: "PR", fr: "Pressing", en: "Laundry", pricing: "weight", baseRate: 1300 },
    { key: "errand", mark: "CS", fr: "Courses", en: "Errands", pricing: "flat", flatPrice: 1000 },
    { key: "ride", mark: "TR", fr: "Déplacement", en: "Ride", pricing: "flat", flatPrice: 700 }
  ];

  var VEHICLES = [
    { key: "bike", eta: 12 },
    { key: "tricycle", eta: 20 },
    { key: "van", eta: 35 }
  ];

  var QUARTIERS = ["Akwa", "Bonapriso", "Bonamoussadi", "Deïdo", "Makepe"];

  var PAYMENTS = [
    { key: "orange_money", chip: "OM", bg: "#ff7a00", fg: "#fff", detail: "•••• 3456" },
    { key: "mtn_momo", chip: "MTN", bg: "#FFD700", fg: "#101010", detail: "•••• 8891" },
    { key: "wallet", chip: "WG", bg: "#101010", fg: "#FFD700", detail: null },
    { key: "cash", chip: "CASH", bg: "rgba(16,16,16,.08)", fg: "#101010", detail: null },
    { key: "card", chip: "CB", bg: "#101010", fg: "#fff", detail: "Visa · Mastercard" }
  ];

  var STR = {
    fr: {
      authTitle: "Douala, livré\nsans détour.",
      authSub: "Colis, pressing, courses et déplacements. Un numéro, un prix, un suivi.",
      continue: "Continuer", terms: "En continuant, vous acceptez les conditions d'utilisation.",
      phonePh: "6 99 12 34 56", otpSentPrefix: "Code envoyé par SMS au", verify: "Vérifier", resend: "Renvoyer le code",
      demoCode: "Démo — code affiché car il n'y a pas de vrai SMS ici :",
      greeting: "Bonjour", wallet: "PORTEFEUILLE", topUp: "Recharger", send: "Envoyer",
      services: "Que faisons-nous pour vous ?", inProgress: "En cours",
      promo: "1 kg offert dès 5 kg. Livraison offerte dès 10 kg.",
      route: "Trajet", pickupPh: "Adresse de récupération", dropPh: "Adresse de livraison",
      details: "Détails", weight: "Poids", notePh: "Contenu du colis, étage, repère…",
      estimate: "Estimation", total: "Total", loyalty: "Remise fidélité",
      payment: "Paiement", toPay: "MONTANT À PAYER", confirmPay: "Payer et commander",
      paySafe: "Paiement sécurisé. Débité à l'enlèvement du colis.",
      arriving: "Arrivée", simulate: "Avancer la livraison (démo)",
      delivered: "Colis livré", rate: "Notez la livraison", backHome: "Terminer",
      orders: "Mes commandes", support: "Assistance WunaGo", replyTime: "Réponse en moins de 2 min",
      messagePh: "Votre message…", stepOf: "Étape",
      tabs: ["Accueil", "Commandes", "Portefeuille", "Aide"],
      filters: ["Toutes", "Colis", "Pressing"],
      gps: "GPS", timestamp: "HORODATAGE", receivedBy: "REÇU PAR",
      processing: "Paiement en cours…", insufficient: "Solde insuffisant.",
      addresses: "Mes adresses", methods: "Moyens de paiement", notifs: "Notifications",
      language: "Langue", help: "Aide et litiges", settings: "Réglages",
      homeLayout: "Disposition de l'accueil", orderFlowLabel: "Parcours de commande",
      showActive: "Afficher la commande en cours", tiles: "Tuiles", list: "Liste",
      stepped: "Étapes", singlePage: "Page unique", logOut: "Se déconnecter",
      timeline: ["Commande reçue", "Colis récupéré", "En route", "Livré"],
      myPosition: "Ma position", locating: "Localisation…", locError: "Position indisponible. Autorisez la localisation ou saisissez l'adresse.", saveAddr: "Enregistrer", saved: "Adresse enregistrée.", searching: "Recherche…", noResult: "Aucun résultat — vous pouvez garder l'adresse saisie.", kindSaved: "Adresse enregistrée", kindQuartier: "Quartier", kindPlace: "OpenStreetMap", kindGoogle: "Google Maps", openGmaps: "Ouvrir dans Google Maps", distance: "Distance", approx: "≈", fillTarget: "Les raccourcis remplissent :", pickupShort: "Récupération", dropShort: "Livraison", minBy: "min en", mapOffline: "Carte indisponible hors connexion",
      cashNote: "Prévoir l'appoint", paymentNames: { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wallet: "Portefeuille WunaGo", cash: "Espèces à la livraison", card: "Carte bancaire" },
      vehNames: { bike: "Moto", tricycle: "Tricycle", van: "Camionnette" }, min: "min",
      botGreet: "Bonjour, comment pouvons-nous vous aider ?",
      botReply: "Merci pour votre message — un agent WunaGo vous répond sous peu.",
      topUpAmount: "Montant", sendTo: "Numéro du destinataire", confirm: "Confirmer",
      toastTopUp: "Portefeuille rechargé.", toastSent: "Envoyé."
    },
    en: {
      authTitle: "Douala,\ndelivered.",
      authSub: "Parcels, laundry, errands and rides. One number, one price, one live map.",
      continue: "Continue", terms: "By continuing you accept the terms of use.",
      phonePh: "699 12 34 56", otpSentPrefix: "Code sent by SMS to", verify: "Verify", resend: "Resend code",
      demoCode: "Demo — shown here since there's no real SMS:",
      greeting: "Hello", wallet: "WALLET", topUp: "Top up", send: "Send",
      services: "What can we do for you?", inProgress: "In progress",
      promo: "1 kg free from 5 kg. Free delivery from 10 kg.",
      route: "Route", pickupPh: "Pickup address", dropPh: "Delivery address",
      details: "Details", weight: "Weight", notePh: "What's inside, floor, landmark…",
      estimate: "Estimate", total: "Total", loyalty: "Loyalty discount",
      payment: "Payment", toPay: "AMOUNT DUE", confirmPay: "Pay and order",
      paySafe: "Secure payment. Charged at pickup.",
      arriving: "Arriving", simulate: "Advance delivery (demo)",
      delivered: "Parcel delivered", rate: "Rate this delivery", backHome: "Done",
      orders: "My orders", support: "WunaGo support", replyTime: "Replies in under 2 min",
      messagePh: "Your message…", stepOf: "Step",
      tabs: ["Home", "Orders", "Wallet", "Help"],
      filters: ["All", "Parcels", "Laundry"],
      gps: "GPS", timestamp: "TIMESTAMP", receivedBy: "RECEIVED BY",
      processing: "Processing payment…", insufficient: "Insufficient balance.",
      addresses: "My addresses", methods: "Payment methods", notifs: "Notifications",
      language: "Language", help: "Help and disputes", settings: "Settings",
      homeLayout: "Home layout", orderFlowLabel: "Order flow",
      showActive: "Show active order", tiles: "Tiles", list: "List",
      stepped: "Steps", singlePage: "Single page", logOut: "Log out",
      timeline: ["Order received", "Parcel picked up", "On the way", "Delivered"],
      myPosition: "My location", locating: "Locating…", locError: "Location unavailable. Allow location or type the address.", saveAddr: "Save", saved: "Address saved.", searching: "Searching…", noResult: "No result — you can keep the typed address.", kindSaved: "Saved address", kindQuartier: "Neighbourhood", kindPlace: "OpenStreetMap", kindGoogle: "Google Maps", openGmaps: "Open in Google Maps", distance: "Distance", approx: "≈", fillTarget: "Shortcuts fill:", pickupShort: "Pickup", dropShort: "Delivery", minBy: "min by", mapOffline: "Map unavailable offline",
      cashNote: "Bring exact change", paymentNames: { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wallet: "WunaGo wallet", cash: "Cash on delivery", card: "Bank card" },
      vehNames: { bike: "Bike", tricycle: "Tricycle", van: "Van" }, min: "min",
      botGreet: "Hi, how can we help?",
      botReply: "Thanks for reaching out — a WunaGo agent will reply shortly.",
      topUpAmount: "Amount", sendTo: "Recipient's number", confirm: "Confirm",
      toastTopUp: "Wallet topped up.", toastSent: "Sent."
    }
  };

  /* ============================== state ============================== */

  var state = {
    lang: "fr",
    loggedIn: false,
    phone: "",
    otpInput: "",
    generatedOtp: null,
    user: { name: "Ariane Ngono", initials: "AN" },
    wallet: { balance: 12400 },
    settings: { homeLayout: "tiles", orderFlow: "stepped", showActiveOrder: true },
    orders: [],
    seq: 1,
    draft: null,
    activeTab: "home",
    tabStacks: {
      home: [{ screen: "home" }],
      orders: [{ screen: "history" }],
      wallet: [{ screen: "wallet" }],
      support: [{ screen: "chat" }]
    },
    chatByOrder: {},
    addresses: [],
    addrTarget: "dropoff",
    suggest: null,
    payPending: false,
    toast: null
  };

  function t() { return STR[state.lang]; }
  function stack() { return state.tabStacks[state.activeTab]; }
  function cur() { var s = stack(); return s[s.length - 1]; }
  function push(screen, extra) { stack().push(Object.assign({ screen: screen }, extra || {})); try { history.pushState({ wg: stack().length }, ""); } catch (e) {} render(); }
  function replaceTop(screen, extra) { var s = stack(); s[s.length - 1] = Object.assign({ screen: screen }, extra || {}); render(); }
  function popScreen() { var s = stack(); if (s.length > 1) s.pop(); render(); }
  function switchTab(tab) { state.activeTab = tab; render(); }
  function toast(msg) { state.toast = msg; render(); setTimeout(function () { state.toast = null; render(); }, 1800); }

  /* ============================== helpers ============================== */

  function fmtFcfa(n) {
    var grouped = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return grouped + " FCFA";
  }
  function fmtW(w) { return (state.lang === "en" ? String(w) : String(w).replace(".", ",")) + " kg"; }
  function svc(key) { return SERVICES.filter(function (s) { return s.key === key; })[0]; }
  function svcName(key) { return svc(key)[state.lang]; }
  function priceLabel(s) {
    var pre = state.lang === "en" ? "from " : "dès ";
    if (s.pricing === "weight") return pre + s.baseRate.toLocaleString() + " F/kg";
    return pre + s.flatPrice.toLocaleString() + " F";
  }
  function computePrice(key, weightKg) {
    var s = svc(key);
    if (s.pricing === "flat") return { gross: s.flatPrice, discount: 0, net: s.flatPrice };
    var gross = Math.round(weightKg * s.baseRate);
    if (weightKg >= 10) return { gross: gross, discount: gross, net: 0 };
    if (weightKg >= 5) return { gross: gross, discount: s.baseRate, net: gross - s.baseRate };
    return { gross: gross, discount: 0, net: gross };
  }
  function initials(name) {
    return name.split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }
  function randCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
  function nowLabel() {
    var d = new Date();
    return d.toLocaleDateString(state.lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString(state.lang === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function statusLabel(s) {
    var L = { fr: { received: "REÇUE", picked_up: "RÉCUPÉRÉE", en_route: "EN ROUTE", delivered: "LIVRÉ", cancelled: "ANNULÉE" },
              en: { received: "RECEIVED", picked_up: "PICKED UP", en_route: "ON THE WAY", delivered: "DELIVERED", cancelled: "CANCELLED" } };
    return (L[state.lang] || L.fr)[s] || String(s).toUpperCase();
  }
  function geoOf(text) { var q = window.WGeo && WGeo.findQuartier(text); return q ? { lat: q.lat, lng: q.lng } : null; }
  function fmtKm(km) { var s = km < 10 ? km.toFixed(1) : String(Math.round(km)); return (state.lang === "en" ? s : s.replace(".", ",")) + " km"; }
  function draftRoute(dr) {
    if (!window.WGeo || !dr.pickupGeo || !dr.dropoffGeo) return null;
    var km = WGeo.roadKm(dr.pickupGeo, dr.dropoffGeo);
    return { km: km, min: WGeo.etaMin(km, dr.vehicle) };
  }
  var ICON = {
    star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
    starO: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
    pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    area: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z"/><path d="M9 4v13M15 7v13"/></svg>',
    gps: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- suggestions d'adresses ---------- */
  var suggestTimer = null, suggestAbort = null;
  function isSavedAddr(text) { return (state.addresses || []).some(function (a) { return a.text === text; }); }
  function suggest(field, q) {
    var n = window.WGeo ? WGeo.norm(q) : "";
    if (!n) { state.suggest = null; return; }
    var saved = (state.addresses || []).filter(function (a) { return WGeo.norm(a.text).indexOf(n) !== -1 || WGeo.norm(a.label).indexOf(n) !== -1; })
      .slice(0, 3).map(function (a) { return { label: a.text, lat: a.geo.lat, lng: a.geo.lng, kind: "saved" }; });
    var quart = WGeo.matchQuartiers(q, 4);
    state.suggest = { field: field, q: q, items: saved.concat(quart), loading: false, remoteDone: false };
    clearTimeout(suggestTimer);
    if (suggestAbort) { suggestAbort.abort(); suggestAbort = null; }
    if (n.length < 3 || navigator.onLine === false) return;
    state.suggest.loading = true;
    suggestTimer = setTimeout(function () {
      var ctl = window.AbortController ? new AbortController() : null; suggestAbort = ctl;
      WGeo.searchPlaces(q, ctl && ctl.signal).then(function (items) {
        var s = state.suggest; if (!s || s.field !== field || s.q !== q) return;
        var known = {}; s.items.forEach(function (i) { known[WGeo.norm(i.label)] = 1; });
        s.items = s.items.concat(items.filter(function (i) { return !known[WGeo.norm(i.label)]; })).slice(0, 8);
        s.loading = false; s.remoteDone = true; render();
      }).catch(function (err) {
        var s = state.suggest; if (!s || s.q !== q || (err && err.name === "AbortError")) return;
        s.loading = false; s.remoteDone = true; render();
      });
    }, 350);
  }
  function suggestList(field) {
    var s = state.suggest, d = t();
    if (!s || s.field !== field) return "";
    var kinds = { saved: [ICON.star, d.kindSaved], quartier: [ICON.area, d.kindQuartier], place: [ICON.pin, d.kindPlace], google: [ICON.pin, d.kindGoogle] };
    var rows = s.items.map(function (it, i) {
      var k = kinds[it.kind] || kinds.place;
      return '<button class="sg-item" role="option" data-action="pickSuggest" data-arg="' + i + '">' +
        '<span class="sg-ic">' + k[0] + '</span><span class="col" style="gap:1px;flex:1;min-width:0"><span class="sg-label">' + esc(it.label) + '</span><span class="sg-kind mono">' + esc(k[1]) + '</span></span></button>';
    }).join("");
    var foot = s.loading ? '<div class="sg-note mono">' + esc(d.searching) + '</div>' : (s.remoteDone && !s.items.length ? '<div class="sg-note">' + esc(d.noResult) + '</div>' : "");
    if (!rows && !foot) return "";
    return '<div class="sg" role="listbox" aria-label="Suggestions">' + rows + foot + '</div>';
  }
  function applyPlace(field, place) {
    state.draft[field] = place.label;
    state.draft[field + "Geo"] = { lat: place.lat, lng: place.lng };
    state.suggest = null;
  }

  /* ---------- livreur : position (simulée en démo, GPS réel avec le backend) ---------- */
  var DEMO_RIDE_MS = 45000;
  function orderGeo(o) {
    return { pickup: o.pickupGeo || geoOf(o.pickup) || geoOf("Bonamoussadi"), dropoff: o.dropoffGeo || geoOf(o.dropoff) || geoOf("Akwa") };
  }
  function courierInfo(o) {
    var g = orderGeo(o), p = g.pickup, q = g.dropoff, f = 0, pos;
    if (o.status === "delivered" || o.stage >= 3) { pos = q; f = 1; }
    else if (o.stage === 2) {
      f = Math.min(0.97, (Date.now() - (o.enRouteAt || Date.now())) / DEMO_RIDE_MS);
      pos = { lat: p.lat + (q.lat - p.lat) * f, lng: p.lng + (q.lng - p.lng) * f };
    }
    else if (o.stage === 1) pos = p;
    else pos = { lat: p.lat + 0.006, lng: p.lng + 0.004 };
    var remainingKm = WGeo.roadKm(pos, q) + (o.stage === 0 ? WGeo.roadKm(pos, p) : 0);
    var frac = o.status === "delivered" || o.stage >= 3 ? 1 : o.stage === 2 ? f : o.stage === 1 ? 0 : undefined;
    return { pos: pos, fraction: frac, min: o.status === "delivered" ? 0 : WGeo.etaMin(remainingKm, o.vehicle) };
  }
  var trackTimer = null;
  function afterRender() {
    clearInterval(trackTimer); trackTimer = null;
    if (!state.loggedIn || cur().screen !== "track" || !window.WMap) return;
    var o = findOrder(cur().orderId); if (!o) return;
    var g = orderGeo(o);
    if (navigator.onLine === false || !WMap.available()) return;
    var ci0 = courierInfo(o);
    WMap.mount("track-map", { key: o.id, pickup: g.pickup, dropoff: g.dropoff, courier: ci0.pos, fraction: ci0.fraction });
    if (o.stage === 2) trackTimer = setInterval(function () {
      var ci = courierInfo(o); WMap.setCourier(ci.pos, ci.fraction);
      var el = document.getElementById("track-eta"); if (el) el.textContent = t().arriving + " · " + ci.min + " " + t().min;
    }, 1000);
  }

  function gmapsLink(a, b) {
    return "https://www.google.com/maps/dir/?api=1&origin=" + a.lat.toFixed(6) + "," + a.lng.toFixed(6) +
      "&destination=" + b.lat.toFixed(6) + "," + b.lng.toFixed(6) + "&travelmode=driving";
  }
  function gmapsButton(a, b, compact) {
    var d = t();
    return '<a class="btn' + (compact ? '' : ' btn-outline') + ' gmaps-link" href="' + gmapsLink(a, b) + '" target="_blank" rel="noopener" style="' +
      (compact ? 'height:30px;border-radius:99px;padding:0 10px;background:rgba(16,16,16,.06);font-weight:700;font-size:10.5px;gap:5px;color:#101010;text-decoration:none' : 'width:100%;gap:7px;color:#101010;text-decoration:none') + '">' +
      ICON.pin + esc(d.openGmaps) + '</a>';
  }

  function findOrder(id) { return state.orders.filter(function (o) { return o.id === id; })[0]; }

  /* ============================== screen: login ============================== */

  function screenLogin() {
    var d = t();
    var canGo = state.phone.replace(/\D/g, "").length >= 6;
    return (
      '<div class="col fill" style="background:#FFD700;padding:calc(30px + var(--sat)) 26px 40px;justify-content:space-between">' +
        '<div class="col" style="gap:24px">' +
          '<div class="brand-row"><svg width="33" height="42" viewBox="0 0 60 76"><path d="M30 4C14.5 4 4 15.4 4 29.5C4 47 30 72 30 72C30 72 56 47 56 29.5C56 15.4 45.5 4 30 4Z" fill="#101010"/><rect x="20" y="20" width="20" height="20" rx="3" fill="#FFD700"/></svg><span class="brand-name" style="font-size:32px">WunaGo</span></div>' +
          '<div class="slogan" style="margin-top:-14px">WE MAKE IT POSSIBLE</div>' +
          '<div style="font-weight:800;font-size:34px;line-height:1.06;letter-spacing:-1.3px;white-space:pre-line">' + esc(d.authTitle) + '</div>' +
          '<div style="font-weight:500;font-size:14px;line-height:1.5;color:rgba(16,16,16,.7);max-width:270px">' + esc(d.authSub) + '</div>' +
        '</div>' +
        '<div class="col" style="gap:11px">' +
          '<div class="fx ac" style="gap:10px;background:#fff;border-radius:16px;padding:0 15px;height:54px">' +
            '<span class="mono" style="font-weight:600;font-size:14px;color:rgba(16,16,16,.55)">+237</span>' +
            '<div style="width:1px;height:20px;background:rgba(16,16,16,.12)"></div>' +
            '<input data-bind="phone" aria-label="Numéro de téléphone" autocomplete="tel-national" value="' + esc(state.phone) + '" placeholder="' + d.phonePh + '" inputmode="numeric" style="flex:1;font-weight:600;font-size:15px;height:100%" />' +
          '</div>' +
          '<button class="btn btn-ink" data-action="requestOtp" ' + (canGo ? "" : "disabled") + '>' + esc(d.continue) + '</button>' +
          '<div style="font-size:11px;line-height:1.5;color:rgba(16,16,16,.6);text-align:center">' + esc(d.terms) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ============================== screen: otp ============================== */

  function screenOtp() {
    var d = t();
    var cells = [0, 1, 2, 3].map(function (i) {
      return '<div class="fx ac jc" style="flex:1;height:56px;background:#fff;border-radius:13px;font-family:var(--mono);font-weight:600;font-size:22px">' + (state.otpInput[i] || "") + '</div>';
    }).join("");
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
    var pad = keys.map(function (k) {
      if (!k) return '<div></div>';
      var label = k === "back" ? "←" : k;
      return '<button class="btn" data-action="otpKey" data-arg="' + k + '" style="height:44px;border-radius:11px;background:rgba(16,16,16,.08);font-family:var(--mono);font-weight:700;font-size:16px;color:#101010">' + label + '</button>';
    }).join("");
    return (
      '<div class="col fill" style="background:#FFD700;padding:calc(30px + var(--sat)) 24px 30px;gap:16px">' +
        '<div class="brand-row"><svg width="26" height="33" viewBox="0 0 60 76"><path d="M30 4C14.5 4 4 15.4 4 29.5C4 47 30 72 30 72C30 72 56 47 56 29.5C56 15.4 45.5 4 30 4Z" fill="#101010"/><rect x="20" y="20" width="20" height="20" rx="3" fill="#FFD700"/></svg><span class="brand-name" style="font-size:21px">WunaGo</span></div>' +
        '<div style="font-weight:600;font-size:12.5px;line-height:1.4;color:rgba(16,16,16,.7)">' + esc(d.otpSentPrefix) + " +237 " + esc(state.phone) + '</div>' +
        (DEMO ? '<div style="background:rgba(16,16,16,.08);border-radius:11px;padding:9px 12px;font-family:var(--mono);font-size:11px;line-height:1.5;color:rgba(16,16,16,.75)">' + esc(d.demoCode) + ' <b style="letter-spacing:.1em">' + state.generatedOtp + '</b></div>' : '') +
        '<div class="fx" style="gap:8px">' + cells + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">' + pad + '</div>' +
        '<div style="text-align:center"><button data-action="resendOtp" style="background:none;border:0;font-weight:600;font-size:12px;text-decoration:underline;color:#101010;cursor:pointer">' + esc(d.resend) + '</button></div>' +
      '</div>'
    );
  }

  /* ============================== screen: home ============================== */

  function screenHome() {
    var d = t();
    var active = state.orders.filter(function (o) { return ["received", "picked_up", "en_route"].indexOf(o.status) !== -1; })[0];
    var tiles = SERVICES.map(function (s) {
      return '<button class="fx col" data-action="pickService" data-arg="' + s.key + '" style="text-align:left;border:1px solid var(--hair);background:#fff;border-radius:17px;padding:14px;cursor:pointer;flex-direction:column;gap:24px;min-height:112px">' +
        '<span class="fx ac jc" style="width:32px;height:32px;border-radius:9px;background:#FFD700;font-family:var(--mono);font-weight:700;font-size:11px">' + s.mark + '</span>' +
        '<span class="col" style="gap:2px"><span style="font-weight:700;font-size:14px">' + esc(s[state.lang]) + '</span><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + priceLabel(s) + '</span></span>' +
        '</button>';
    }).join("");
    var listRows = SERVICES.map(function (s) {
      return '<button class="fx ac" data-action="pickService" data-arg="' + s.key + '" style="gap:12px;text-align:left;border:1px solid var(--hair);background:#fff;border-radius:15px;padding:13px 14px;cursor:pointer">' +
        '<span class="fx ac jc" style="width:36px;height:36px;flex:none;border-radius:10px;background:#FFD700;font-family:var(--mono);font-weight:700;font-size:11px">' + s.mark + '</span>' +
        '<span class="col" style="gap:2px;flex:1"><span style="font-weight:700;font-size:14px">' + esc(s[state.lang]) + '</span><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + priceLabel(s) + '</span></span>' +
        '<span style="color:rgba(16,16,16,.3);font-weight:600">→</span></button>';
    }).join("");

    var activeCard = "";
    if (active && state.settings.showActiveOrder) {
      var pr = Math.min(1, active.stage / 3) * 100;
      activeCard = '<div style="padding:20px 20px 0"><div style="font-weight:700;font-size:12.5px;color:rgba(16,16,16,.45);padding-bottom:9px">' + esc(d.inProgress) + '</div>' +
        '<button class="col" data-action="openOrder" data-arg="' + active.id + '" style="width:100%;text-align:left;border:0;background:#101010;border-radius:18px;padding:15px 16px;cursor:pointer;gap:12px">' +
        '<span class="fx ac" style="gap:8px"><span style="position:relative;width:7px;height:7px"><span style="position:absolute;inset:0;border-radius:99px;background:#FFD700"></span></span>' +
        '<span class="mono" style="font-size:10.5px;letter-spacing:.06em;color:#FFD700">' + active.code + '</span></span>' +
        '<span style="font-weight:700;font-size:15px;color:#fff">' + esc(svcName(active.service)) + " · " + esc(active.pickup) + ' → ' + esc(active.dropoff) + '</span>' +
        '<span class="fx" style="gap:4px"><span style="flex:1;height:4px;border-radius:9px;background:#FFD700;opacity:' + (pr >= 0 ? 1 : .2) + '"></span><span style="flex:1;height:4px;border-radius:9px;background:' + (pr >= 33 ? "#FFD700" : "rgba(255,255,255,.2)") + '"></span><span style="flex:1;height:4px;border-radius:9px;background:' + (pr >= 66 ? "#FFD700" : "rgba(255,255,255,.2)") + '"></span><span style="flex:1;height:4px;border-radius:9px;background:' + (pr >= 100 ? "#FFD700" : "rgba(255,255,255,.2)") + '"></span></span>' +
        '</button></div>';
    }

    return (
      '<div class="col" style="background:#FFD700;padding:calc(18px + var(--sat)) 20px 20px;border-radius:0 0 24px 24px;flex:none">' +
        '<div class="fx ac jb">' +
          '<div class="col" style="gap:1px"><span style="font-weight:500;font-size:12px;color:rgba(16,16,16,.6)">' + esc(d.greeting) + '</span><span style="font-weight:800;font-size:20px;letter-spacing:-.5px">' + esc(state.user.name) + '</span></div>' +
          '<button data-action="toggleLang" style="border:0;background:rgba(16,16,16,.1);border-radius:99px;padding:7px 11px;font-family:var(--mono);font-weight:700;font-size:10.5px;cursor:pointer">' + (state.lang === "en" ? "EN" : "FR") + '</button>' +
        '</div>' +
        '<button data-action="go" data-arg="wallet" style="margin-top:16px;background:#101010;border:0;border-radius:16px;padding:14px 15px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-align:left">' +
          '<span class="col" style="gap:2px"><span class="mono" style="font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.5)">' + esc(d.wallet) + '</span><span style="font-weight:800;font-size:19px;color:#FFD700">' + fmtFcfa(state.wallet.balance) + '</span></span>' +
          '<span style="background:#FFD700;color:#101010;border-radius:99px;padding:9px 13px;font-weight:700;font-size:11.5px">' + esc(d.topUp) + '</span>' +
        '</button>' +
      '</div>' +
      '<div class="scroll">' + installBanner() + '<div style="padding:18px 20px 6px;font-weight:700;font-size:12.5px;color:rgba(16,16,16,.5)">' + esc(d.services) + '</div>' +
      '<div style="padding:2px 20px 0">' + (state.settings.homeLayout === "tiles" ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + tiles + '</div>' : '<div class="col" style="gap:8px">' + listRows + '</div>') + '</div>' +
      activeCard +
      '<div style="padding:20px 20px 24px"><div style="border:1px dashed rgba(16,16,16,.2);border-radius:16px;padding:14px;background:repeating-linear-gradient(135deg,rgba(255,215,0,.16) 0 8px,transparent 8px 16px)">' +
        '<div class="mono" style="font-size:9.5px;letter-spacing:.08em;color:rgba(16,16,16,.5)">PROMO</div><div style="font-weight:700;font-size:14px;margin-top:5px">' + esc(d.promo) + '</div></div></div>' +
      '</div>'
    );
  }

  /* ============================== screen: order ============================== */

  function screenOrder(paramsService) {
    var d = t();
    var draft = state.draft;
    var s = svc(draft.service);
    var stepped = state.settings.orderFlow === "stepped";
    var price = computePrice(draft.service, draft.weightKg);
    var step = draft.step;
    var showAddr = !stepped || step === 1, showDet = !stepped || step === 2, showRecap = !stepped || step === 3;
    var isLast = !stepped || step === 3;

    var progressBar = stepped ? '<div class="fx" style="gap:5px">' + [1, 2, 3].map(function (n) {
      return '<span style="flex:1;height:3px;border-radius:9px;background:' + (n <= step ? "#101010" : "rgba(16,16,16,.13)") + '"></span>';
    }).join("") + '</div>' : "";

    var route = draftRoute(draft);
    function addrRow(field, ph, dot) {
      var on = state.addrTarget === field, geo = draft[field + "Geo"], v = draft[field];
      var right = geo ? (isSavedAddr(v) ? '<span style="color:#101010" title="' + esc(d.kindSaved) + '">' + ICON.star + '</span>'
        : '<button class="btn" data-action="saveAddress" data-arg="' + field + '" aria-label="' + esc(d.saveAddr) + '" style="height:30px;border-radius:99px;padding:0 9px;background:rgba(16,16,16,.06);font-weight:700;font-size:10.5px;gap:4px">' + ICON.starO + esc(d.saveAddr) + '</button>') : "";
      return '<div class="fx ac addr-row" style="gap:11px;min-height:52px">' + dot +
        '<input data-bind="draft.' + field + '" data-field="' + field + '" autocomplete="off" aria-autocomplete="list" aria-label="' + esc(ph) + '" value="' + esc(v) + '" placeholder="' + esc(ph) + '" style="flex:1;min-width:0;font-weight:600;font-size:13.5px;height:52px' + (on ? "" : "") + '" />' +
        right + '</div>' + suggestList(field);
    }
    var chipStyle = 'border:1px solid rgba(16,16,16,.12);background:#fff;border-radius:99px;padding:7px 12px;height:auto;min-height:34px;font-weight:600;font-size:11.5px;color:#101010;gap:5px';
    var addrSection = !showAddr ? "" : (
      '<div class="col" style="gap:10px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.5)">' + esc(d.route) + '</div>' +
      '<div style="background:#fff;border:1px solid var(--hair);border-radius:16px;padding:0 15px">' +
        addrRow("pickup", d.pickupPh, '<span style="width:8px;height:8px;flex:none;border-radius:99px;background:#FFD700;border:2.5px solid #101010"></span>') +
        '<div style="height:1px;background:var(--hair);margin-left:19px"></div>' +
        addrRow("dropoff", d.dropPh, '<span style="width:8px;height:8px;flex:none;background:#101010"></span>') +
      '</div>' +
      (route ? '<div class="fx ac jb wrap" style="gap:8px"><div class="fx ac mono" style="gap:6px;font-size:11px;color:rgba(16,16,16,.6)">' + ICON.pin + d.approx + ' ' + fmtKm(route.km) + ' · ' + route.min + ' ' + d.minBy + ' ' + esc(d.vehNames[draft.vehicle]).toLowerCase() + '</div>' + gmapsButton(draft.pickupGeo, draft.dropoffGeo, true) + '</div>' : '') +
      '<div class="fx wrap ac" style="gap:7px">' +
        '<button class="btn" data-action="useMyLocation" style="' + chipStyle + ';background:#101010;color:#FFD700;border-color:#101010">' + ICON.gps + esc(d.myPosition) + '</button>' +
      '</div>' +
      '<div class="col" style="gap:7px"><div class="fx ac" style="gap:6px;font-size:11px;font-weight:600;color:rgba(16,16,16,.55)">' + esc(d.fillTarget) +
        ['pickup', 'dropoff'].map(function (f) { var on = state.addrTarget === f; return '<button class="btn" data-action="setAddrTarget" data-arg="' + f + '" aria-pressed="' + on + '" style="height:26px;border-radius:99px;padding:0 9px;font-weight:700;font-size:10.5px;background:' + (on ? "#101010" : "rgba(16,16,16,.06)") + ';color:' + (on ? "#fff" : "rgba(16,16,16,.65)") + '">' + esc(f === "pickup" ? d.pickupShort : d.dropShort) + '</button>'; }).join("") + '</div>' +
      '<div class="fx wrap" style="gap:7px">' +
        (state.addresses || []).map(function (a, i) { return '<button class="btn" data-action="pickSaved" data-arg="' + i + '" style="' + chipStyle + '">' + ICON.star + esc(a.label) + '</button>'; }).join("") +
        QUARTIERS.map(function (q) { return '<button class="btn" data-action="pickQuartier" data-arg="' + q + '" style="' + chipStyle + '">' + q + '</button>'; }).join("") +
      '</div></div></div>'
    );

    var detSection = !showDet ? "" : (
      '<div class="col" style="gap:10px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.45)">' + esc(d.details) + '</div>' +
      '<div style="background:#fff;border:1px solid var(--hair);border-radius:16px;padding:15px;display:flex;flex-direction:column;gap:13px">' +
        (s.pricing === "weight" ?
          '<div class="fx ac jb"><div><div style="font-weight:700;font-size:13.5px">' + esc(d.weight) + '</div><div class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5);margin-top:2px">' + s.baseRate.toLocaleString() + ' FCFA/kg</div></div>' +
          '<div class="fx ac" style="gap:11px;background:rgba(16,16,16,.05);border-radius:99px;padding:4px"><button class="btn" data-action="decWeight" style="width:32px;height:32px;border-radius:99px;background:#fff;font-size:16px">–</button><span class="mono" style="min-width:40px;text-align:center;font-weight:600;font-size:14px">' + fmtW(draft.weightKg) + '</span><button class="btn btn-ink" data-action="incWeight" style="width:32px;height:32px;border-radius:99px;font-size:16px">+</button></div></div>' :
          '<div style="font-weight:700;font-size:13.5px">' + priceLabel(s) + '</div>') +
        '<div style="height:1px;background:var(--hair)"></div>' +
        '<textarea data-bind="draft.note" aria-label="Note pour le livreur" placeholder="' + d.notePh + '" style="min-height:48px;font-weight:500;font-size:13px;resize:none">' + esc(draft.note) + '</textarea>' +
      '</div>' +
      '<div class="fx" style="gap:8px">' + VEHICLES.map(function (v) {
        var on = draft.vehicle === v.key;
        return '<button class="col" data-action="pickVehicle" data-arg="' + v.key + '" style="flex:1;border:1.5px solid ' + (on ? "#101010" : "var(--hair)") + ';background:' + (on ? "#FFD700" : "#fff") + ';border-radius:14px;padding:11px 9px;gap:3px;align-items:flex-start;text-align:left">' +
          '<span style="font-weight:700;font-size:12px">' + esc(t().vehNames[v.key]) + '</span><span class="mono" style="font-size:9.5px;color:rgba(16,16,16,.55)">' + v.eta + ' ' + t().min + '</span></button>';
      }).join("") + '</div></div>'
    );

    var recapSection = !showRecap ? "" : (
      '<div class="col" style="gap:10px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.45)">' + esc(d.estimate) + '</div>' +
      '<div style="background:#101010;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px">' +
        '<div class="fx jb" style="align-items:baseline"><span style="font-weight:500;font-size:12.5px;color:rgba(255,255,255,.6)">' + esc(svcName(draft.service)) + (s.pricing === "weight" ? " · " + fmtW(draft.weightKg) : "") + '</span><span class="mono" style="font-weight:600;font-size:12.5px;color:#fff">' + fmtFcfa(price.gross) + '</span></div>' +
        '<div class="fx jb" style="align-items:baseline"><span style="font-weight:500;font-size:12.5px;color:rgba(255,255,255,.6)">' + esc(t().vehNames[draft.vehicle]) + (route ? ' · ' + d.approx + ' ' + fmtKm(route.km) : '') + '</span><span style="font-size:12.5px;color:rgba(255,255,255,.6)">incl.</span></div>' +
        '<div class="fx jb" style="align-items:baseline"><span style="font-weight:500;font-size:12.5px;color:rgba(255,255,255,.6)">' + esc(d.loyalty) + '</span><span class="mono" style="font-weight:600;font-size:12.5px;color:' + (price.discount ? "#FFD700" : "rgba(255,255,255,.6)") + '">' + (price.discount ? "– " + fmtFcfa(price.discount) : "—") + '</span></div>' +
        '<div style="height:1px;background:rgba(255,255,255,.14)"></div>' +
        '<div class="fx jb" style="align-items:baseline"><span style="font-weight:700;font-size:14px;color:#fff">' + esc(d.total) + '</span><span style="font-weight:800;font-size:22px;color:#FFD700;letter-spacing:-.5px">' + fmtFcfa(price.net) + '</span></div>' +
      '</div></div>'
    );

    return (
      '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:16px">' +
        '<div class="fx ac" style="gap:11px"><button class="backbtn" aria-label="Retour" data-action="orderBack">←</button><div style="font-weight:800;font-size:18px;letter-spacing:-.4px;flex:1">' + esc(svcName(draft.service)) + '</div>' + (stepped ? '<span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.45)">' + d.stepOf + " " + step + '/3</span>' : "") + '</div>' +
        progressBar + addrSection + detSection + recapSection +
      '</div></div>' +
      '<div style="padding:16px 20px 20px"><button class="btn btn-yellow" data-action="orderNext" style="width:100%">' +
        (isLast ? esc(d.confirmPay) + ' · ' + fmtFcfa(price.net) : esc(d.continue)) +
      '</button></div>'
    );
  }

  /* ============================== screen: payment ============================== */

  function screenPayment() {
    var d = t();
    var draft = state.draft;
    var price = computePrice(draft.service, draft.weightKg);
    var rows = PAYMENTS.map(function (p) {
      var on = draft.payMethod === p.key;
      var detail = p.key === "wallet" ? fmtFcfa(state.wallet.balance) : p.key === "cash" ? d.cashNote : p.detail;
      return '<button class="fx ac" data-action="pickPay" data-arg="' + p.key + '" style="gap:12px;text-align:left;border:1.5px solid ' + (on ? "#101010" : "var(--hair)") + ';background:#fff;border-radius:15px;padding:13px 14px;cursor:pointer">' +
        '<span class="fx ac jc" style="width:38px;height:27px;flex:none;border-radius:7px;background:' + p.bg + ';color:' + p.fg + ';font-family:var(--mono);font-weight:700;font-size:9px">' + p.chip + '</span>' +
        '<span class="col" style="gap:2px;flex:1"><span style="font-weight:700;font-size:13.5px">' + esc(d.paymentNames[p.key]) + '</span><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + esc(detail || "") + '</span></span>' +
        '<span style="width:18px;height:18px;flex:none;border-radius:99px;border:2px solid ' + (on ? "#101010" : "rgba(16,16,16,.15)") + ';background:' + (on ? "#101010" : "transparent") + '"></span>' +
      '</button>';
    }).join("");

    var ctaInner = state.payPending
      ? '<div class="fx ac jc" style="gap:9px;height:54px;background:#101010;border-radius:16px"><span class="spinner"></span><span style="font-weight:700;font-size:13.5px;color:#FFD700">' + esc(d.processing) + '</span></div>'
      : '<button class="btn btn-ink" data-action="confirmPay" style="width:100%">' + esc(d.confirmPay) + '</button>';

    return (
      '<div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:16px">' +
        '<div class="fx ac" style="gap:11px"><button class="backbtn" aria-label="Retour" data-action="popScreen">←</button><div style="font-weight:800;font-size:18px;letter-spacing:-.4px">' + esc(d.payment) + '</div></div>' +
        '<div style="background:#FFD700;border-radius:18px;padding:16px"><div class="mono" style="font-size:10px;letter-spacing:.07em;color:rgba(16,16,16,.6)">' + esc(d.toPay) + '</div><div style="font-weight:800;font-size:28px;letter-spacing:-.9px;margin-top:2px">' + fmtFcfa(price.net) + '</div></div>' +
        '<div class="col" style="gap:8px">' + rows + '</div>' +
      '</div>' +
      '<div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:9px">' + ctaInner + '<div style="font-size:10.5px;line-height:1.5;color:rgba(16,16,16,.55);text-align:center">' + esc(d.paySafe) + '</div></div>'
    );
  }

  /* ============================== screen: track ============================== */

  function screenTrack(orderId) {
    var d = t();
    var o = findOrder(orderId);
    var progress = Math.min(1, o.stage / 3);
    var left = (8 + progress * 84).toFixed(1) + "%";
    var timeline = d.timeline.map(function (label, i) {
      var done = i < o.stage || o.status === "delivered";
      var active = i === o.stage && o.status !== "delivered";
      return '<div class="fx" style="gap:13px;align-items:flex-start"><div class="col" style="align-items:center;width:16px">' +
        '<span style="width:13px;height:13px;border-radius:99px;background:' + (done ? "#101010" : active ? "#FFD700" : "#fff") + ';border:2.5px solid ' + (done || active ? "#101010" : "rgba(16,16,16,.18)") + '"></span>' +
        (i < d.timeline.length - 1 ? '<span style="width:2px;height:18px;background:' + (done ? "#101010" : "rgba(16,16,16,.13)") + '"></span>' : '') +
        '</div><span style="font-weight:700;font-size:13px;padding-bottom:13px;color:' + (done || active ? "#101010" : "rgba(16,16,16,.4)") + '">' + esc(label) + '</span></div>';
    }).join("");

    return (
      '<div style="height:300px;position:relative;background:#eceae4;overflow:hidden;flex:none">' +
        '<div id="track-map" style="position:absolute;inset:0 0 18px 0"></div>' +
        (navigator.onLine === false || !(window.WMap && WMap.available()) ? '<div class="fx ac jc mono" style="position:absolute;inset:0;font-size:10.5px;color:rgba(16,16,16,.55)">' + esc(d.mapOffline) + '</div>' : '') +
        '<div style="position:absolute;z-index:600;top:calc(14px + var(--sat));left:12px;right:12px;display:flex;align-items:center;gap:9px;background:#101010;border-radius:14px;padding:9px 12px">' +
          '<button class="backbtn" aria-label="Retour" data-action="popScreen" style="background:rgba(255,255,255,.12);color:#fff;width:26px;height:26px">←</button>' +
          '<span class="mono" style="font-size:10px;color:#FFD700">' + o.code + '</span>' +
          '<span id="track-eta" style="margin-left:auto;font-weight:700;font-size:11px;color:#fff">' + esc(d.arriving) + (window.WGeo ? ' · ' + courierInfo(o).min + ' ' + d.min : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="scroll" style="background:#fbfaf7;border-radius:22px 22px 0 0;margin-top:-18px;padding:16px 20px 20px;position:relative;z-index:500"><div class="col" style="gap:16px">' +
        '<div style="width:34px;height:4px;border-radius:9px;background:rgba(16,16,16,.15);margin:0 auto"></div>' +
        '<div class="fx ac" style="gap:11px">' +
          '<div class="fx ac jc" style="width:42px;height:42px;flex:none;border-radius:99px;background:#FFD700;font-weight:800;font-size:13px">MK</div>' +
          '<div class="col" style="gap:2px;flex:1"><span style="font-weight:700;font-size:14px">Marcel K.</span><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.55)">4.9 · CE 812 AB</span></div>' +
          '<button class="btn" data-action="go" data-arg="chat|' + orderId + '" aria-label="Écrire au livreur" style="width:44px;height:44px;border-radius:11px;background:rgba(16,16,16,.07);font-weight:700;font-size:11px;padding:0">SMS</button>' +
          '<a class="btn btn-ink" href="tel:+237600000000" aria-label="Appeler le livreur" style="width:44px;height:44px;border-radius:11px;font-weight:700;font-size:11px;padding:0;text-decoration:none">TEL</a>' +
        '</div>' +
        '<div style="height:1px;background:var(--hair)"></div>' +
        '<div class="col">' + timeline + '</div>' +
        gmapsButton(orderGeo(o).pickup, orderGeo(o).dropoff, false) +
        (DEMO ? '<button class="btn btn-outline" data-action="advanceOrder" data-arg="' + orderId + '" style="width:100%">' + esc(d.simulate) + '</button>' : '') +
      '</div></div>'
    );
  }

  /* ============================== screen: proof ============================== */

  function screenProof(orderId) {
    var d = t();
    var o = findOrder(orderId);
    var stars = [1, 2, 3, 4, 5].map(function (n) {
      var on = n <= (o.rating || 0);
      return '<button class="btn" data-action="rate" data-arg="' + orderId + '|' + n + '" style="flex:1;height:40px;border-radius:11px;background:' + (on ? "#FFD700" : "rgba(16,16,16,.06)") + ';font-family:var(--mono);font-weight:700;font-size:13px;color:' + (on ? "#101010" : "rgba(16,16,16,.35)") + '">' + n + '</button>';
    }).join("");
    return (
      '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:16px">' +
        '<div><div class="mono" style="font-size:10px;letter-spacing:.06em;color:rgba(16,16,16,.5)">' + o.code + '</div><div style="font-weight:800;font-size:23px;letter-spacing:-.7px;margin-top:4px">' + esc(d.delivered) + '</div></div>' +
        '<div style="border-radius:17px;overflow:hidden;border:1px solid var(--hair)">' +
          '<div style="height:180px;background:repeating-linear-gradient(135deg,#e6e3dc 0 10px,#efece5 10px 20px);display:flex;align-items:center;justify-content:center"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">photo de livraison</span></div>' +
          '<div style="background:#fff;padding:13px 15px;display:flex;flex-direction:column;gap:5px">' +
            '<div class="fx jb"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + esc(d.gps) + '</span><span class="mono" style="font-size:10.5px;font-weight:600">4.0511 N · 9.7679 E</span></div>' +
            '<div class="fx jb"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + esc(d.timestamp) + '</span><span class="mono" style="font-size:10.5px;font-weight:600">' + nowLabel() + '</span></div>' +
            '<div class="fx jb"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + esc(d.receivedBy) + '</span><span class="mono" style="font-size:10.5px;font-weight:600">A. Ngono</span></div>' +
          '</div></div>' +
        '<div style="background:#fff;border:1px solid var(--hair);border-radius:16px;padding:15px;display:flex;flex-direction:column;gap:11px">' +
          '<span style="font-weight:700;font-size:13.5px">' + esc(d.rate) + '</span><div class="fx" style="gap:7px">' + stars + '</div></div>' +
      '</div></div>' +
      '<div style="padding:16px 20px 20px"><button class="btn btn-ink" data-action="finishProof" style="width:100%">' + esc(d.backHome) + '</button></div>'
    );
  }

  /* ============================== screen: history ============================== */

  function screenHistory() {
    var d = t();
    var filter = state.historyFilter || 0;
    var svcFilter = filter === 1 ? "parcel" : filter === 2 ? "laundry" : null;
    var orders = state.orders.filter(function (o) { return !svcFilter || o.service === svcFilter; });
    var chips = d.filters.map(function (f, i) {
      var on = filter === i;
      return '<button class="btn" data-action="setHistoryFilter" data-arg="' + i + '" style="border:0;border-radius:99px;padding:8px 13px;height:auto;background:' + (on ? "#101010" : "rgba(16,16,16,.06)") + ';color:' + (on ? "#fff" : "rgba(16,16,16,.6)") + ';font-weight:700;font-size:11.5px">' + esc(f) + '</button>';
    }).join("");

    var badgeStyle = { received: ["#FFD700", "#101010"], picked_up: ["#FFD700", "#101010"], en_route: ["#FFD700", "#101010"], delivered: ["#101010", "#FFD700"], cancelled: ["rgba(16,16,16,.07)", "rgba(16,16,16,.5)"] };
    var rows = orders.map(function (o) {
      var price = computePrice(o.service, o.weightKg);
      var bs = badgeStyle[o.status] || badgeStyle.cancelled;
      return '<button class="col" data-action="openOrder" data-arg="' + o.id + '" style="width:100%;text-align:left;border:1px solid var(--hair);background:#fff;border-radius:15px;padding:14px;gap:9px;cursor:pointer;margin-bottom:9px">' +
        '<div class="fx ac" style="gap:8px"><span class="mono" style="font-size:10px;color:rgba(16,16,16,.5)">' + o.code + '</span><span style="margin-left:auto;border-radius:99px;padding:4px 9px;background:' + bs[0] + ';color:' + bs[1] + ';font-family:var(--mono);font-weight:700;font-size:9.5px">' + esc(statusLabel(o.status)) + '</span></div>' +
        '<div style="font-weight:700;font-size:13.5px">' + esc(o.pickup) + ' → ' + esc(o.dropoff) + '</div>' +
        '<div class="fx jb" style="align-items:baseline"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.5)">' + esc(svcName(o.service)) + '</span><span style="font-weight:700;font-size:13px">' + fmtFcfa(price.net) + '</span></div>' +
      '</button>';
    }).join("") || '<div style="padding:30px 0;text-align:center;color:rgba(16,16,16,.4);font-size:13px">—</div>';

    return '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:14px">' +
      '<div style="font-weight:800;font-size:23px;letter-spacing:-.7px">' + esc(d.orders) + '</div>' +
      '<div class="fx" style="gap:7px">' + chips + '</div>' +
      '<div>' + rows + '</div>' +
    '</div></div>';
  }

  /* ============================== screen: wallet ============================== */

  function screenWallet() {
    var d = t();
    var panel = state.walletPanel;
    var panelHtml = "";
    if (panel === "topup") {
      panelHtml = '<div class="col" style="gap:9px;padding-top:2px">' +
        '<div class="fx" style="gap:7px">' + ["orange_money", "mtn_momo"].map(function (m) {
          var on = state.topUpMethod === m;
          return '<button class="btn" data-action="setTopUpMethod" data-arg="' + m + '" style="flex:1;height:38px;border-radius:11px;background:' + (on ? "#FFD700" : "rgba(255,255,255,.1)") + ';color:' + (on ? "#101010" : "#fff") + ';font-weight:700;font-size:11.5px">' + esc(d.paymentNames[m]) + '</button>';
        }).join("") + '</div>' +
        '<input data-bind="topUpAmount" value="' + esc(state.topUpAmount || "") + '" placeholder="' + d.topUpAmount + '" inputmode="numeric" style="height:42px;border-radius:11px;background:rgba(255,255,255,.08);padding:0 13px;color:#fff;font-weight:600;font-size:13px" />' +
        '<button class="btn btn-yellow" data-action="doTopUp">' + esc(d.confirm) + '</button></div>';
    } else if (panel === "send") {
      panelHtml = '<div class="col" style="gap:9px;padding-top:2px">' +
        '<input data-bind="sendPhone" value="' + esc(state.sendPhone || "") + '" placeholder="' + d.sendTo + '" style="height:42px;border-radius:11px;background:rgba(255,255,255,.08);padding:0 13px;color:#fff;font-weight:600;font-size:13px" />' +
        '<input data-bind="topUpAmount" value="' + esc(state.topUpAmount || "") + '" placeholder="' + d.topUpAmount + '" inputmode="numeric" style="height:42px;border-radius:11px;background:rgba(255,255,255,.08);padding:0 13px;color:#fff;font-weight:600;font-size:13px" />' +
        '<button class="btn btn-yellow" data-action="doSend">' + esc(d.confirm) + '</button></div>';
    }

    var rows = [
      [d.addresses, String((state.addresses || []).length)], [d.methods, "2"], [d.notifs, "SMS + push"],
      [d.language, state.lang === "en" ? "English" : "Français", "openSettings"],
      [d.help, "", "openChatGeneral"]
    ];
    var rowsHtml = rows.map(function (r, i) {
      return '<button class="fx ac" data-action="' + (r[2] || "noop") + '" style="gap:11px;text-align:left;border:0;background:transparent;padding:13px 12px;cursor:pointer;' + (i < rows.length - 1 ? "border-bottom:1px solid var(--hair)" : "") + '">' +
        '<span style="font-weight:700;font-size:13px;flex:1">' + esc(r[0]) + '</span>' + (r[1] ? '<span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.45)">' + esc(r[1]) + '</span>' : "") + '<span style="color:rgba(16,16,16,.3);font-weight:600">→</span></button>';
    }).join("");

    return '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:15px">' +
      '<div class="fx ac" style="gap:12px"><div class="fx ac jc" style="width:46px;height:46px;border-radius:99px;background:#FFD700;font-weight:800;font-size:14px">' + state.user.initials + '</div><div class="col" style="gap:2px"><span style="font-weight:800;font-size:17px;letter-spacing:-.4px">' + esc(state.user.name) + '</span><span class="mono" style="font-size:11px;color:rgba(16,16,16,.55)">+237 ' + esc(state.phone) + '</span></div></div>' +
      '<div class="col" style="background:#101010;border-radius:19px;padding:17px;gap:14px">' +
        '<div class="col" style="gap:2px"><span class="mono" style="font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.5)">' + esc(d.wallet) + '</span><span style="font-weight:800;font-size:29px;color:#FFD700;letter-spacing:-1px">' + fmtFcfa(state.wallet.balance) + '</span></div>' +
        '<div class="fx" style="gap:8px"><button class="btn" data-action="toggleWalletPanel" data-arg="topup" style="flex:1;height:44px;border-radius:12px;background:#FFD700;font-weight:700;font-size:12px">' + esc(d.topUp) + '</button><button class="btn" data-action="toggleWalletPanel" data-arg="send" style="flex:1;height:44px;border-radius:12px;background:transparent;border:1.5px solid rgba(255,255,255,.25);color:#fff;font-weight:700;font-size:12px">' + esc(d.send) + '</button></div>' +
        panelHtml +
      '</div>' +
      '<div style="background:#fff;border:1px solid var(--hair);border-radius:16px;padding:0 3px">' + rowsHtml + '</div>' +
    '</div></div>';
  }

  /* ============================== screen: chat ============================== */

  function screenChat(orderId) {
    var d = t();
    var key = orderId || "general";
    var msgs = state.chatByOrder[key] || (state.chatByOrder[key] = [{ from: "bot", text: d.botGreet }]);
    var rows = msgs.map(function (m) {
      var me = m.from === "user";
      return '<div class="fx" style="justify-content:' + (me ? "flex-end" : "flex-start") + '"><div style="max-width:76%;background:' + (me ? "#101010" : "#fff") + ';color:' + (me ? "#fff" : "#101010") + ';border:' + (me ? "0" : "1px solid var(--hair)") + ';border-radius:' + (me ? "15px 15px 4px 15px" : "15px 15px 15px 4px") + ';padding:11px 13px;font-weight:500;font-size:13px;line-height:1.4">' + esc(m.text) + '</div></div>';
    }).join("");
    return '<div style="background:#FFD700;padding:calc(18px + var(--sat)) 20px 13px;flex:none"><div style="font-weight:800;font-size:14px">' + esc(d.support) + '</div><div class="mono" style="font-size:9.5px;color:rgba(16,16,16,.6);margin-top:1px">' + esc(d.replyTime) + '</div></div>' +
      '<div class="scroll" id="chat-scroll"><div class="col" style="padding:16px 20px;gap:9px">' + rows + '</div></div>' +
      '<div class="fx" style="gap:8px;padding:11px 20px 18px;border-top:1px solid var(--hair);background:#fbfaf7">' +
        '<input data-bind="chatDraft" aria-label="Votre message" data-arg="' + key + '" value="' + esc(state.chatDraft || "") + '" placeholder="' + d.messagePh + '" style="flex:1;height:42px;border:1px solid var(--hair);border-radius:12px;background:#fff;padding:0 13px;font-weight:500;font-size:13px" />' +
        '<button class="btn btn-ink" aria-label="Envoyer" data-action="sendChat" data-arg="' + key + '" style="width:42px;height:42px;border-radius:12px;padding:0;font-weight:700">→</button>' +
      '</div>';
  }

  /* ============================== screen: settings ============================== */

  function screenSettings() {
    var d = t();
    function seg(label, value, options, action) {
      return '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:13px">' + esc(label) + '</div>' +
        '<div class="fx" style="background:rgba(16,16,16,.05);border-radius:11px;padding:3px;gap:3px">' + options.map(function (o) {
          var on = value === o[0];
          return '<button class="btn" data-action="' + action + '" data-arg="' + o[0] + '" style="flex:1;height:36px;border-radius:8px;background:' + (on ? "#101010" : "transparent") + ';color:' + (on ? "#FFD700" : "#101010") + ';font-weight:700;font-size:11.5px">' + esc(o[1]) + '</button>';
        }).join("") + '</div></div>';
    }
    return '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:20px">' +
      '<div class="fx ac" style="gap:11px"><button class="backbtn" aria-label="Retour" data-action="popScreen">←</button><div style="font-weight:800;font-size:18px">' + esc(d.settings) + '</div></div>' +
      seg(d.homeLayout, state.settings.homeLayout, [["tiles", d.tiles], ["list", d.list]], "setHomeLayout") +
      seg(d.orderFlowLabel, state.settings.orderFlow, [["stepped", d.stepped], ["single_page", d.singlePage]], "setOrderFlow") +
      seg(d.language, state.lang, [["fr", "Français"], ["en", "English"]], "setLang") +
      '<div class="fx ac jb"><div style="font-weight:700;font-size:13px">' + esc(d.showActive) + '</div>' +
        '<button data-action="toggleShowActive" style="border:0;width:44px;height:26px;border-radius:99px;background:' + (state.settings.showActiveOrder ? "#101010" : "rgba(16,16,16,.15)") + ';position:relative;cursor:pointer">' +
        '<span style="position:absolute;top:3px;left:' + (state.settings.showActiveOrder ? "21px" : "3px") + ';width:20px;height:20px;border-radius:99px;background:#FFD700;transition:left .15s"></span></button></div>' +
      '<button class="btn btn-outline" data-action="logOut" style="margin-top:6px">' + esc(d.logOut) + '</button>' +
    '</div></div>';
  }

  /* ============================== layout ============================== */

  function statusbar() {
    var d = new Date();
    var time = d.toLocaleTimeString(state.lang === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
    return '<div class="statusbar"><span>' + time + '</span><span class="icons">' +
      '<svg width="15" height="10" viewBox="0 0 15 10"><rect x="0" y="6" width="2.6" height="4" rx="0.5" fill="#101010"/><rect x="4" y="4" width="2.6" height="6" rx="0.5" fill="#101010"/><rect x="8" y="2" width="2.6" height="8" rx="0.5" fill="#101010"/><rect x="12" y="0" width="2.6" height="10" rx="0.5" fill="#101010"/></svg>' +
      '<svg width="20" height="10" viewBox="0 0 20 10"><rect x="0.5" y="0.5" width="17" height="9" rx="2.5" stroke="#101010" fill="none"/><rect x="2" y="2" width="14" height="6" rx="1.5" fill="#101010"/></svg>' +
      '</span></div>';
  }

  function tabbar() {
    var d = t();
    var tabs = [
      ["home", d.tabs[0], "6px"], ["orders", d.tabs[1], "4px"], ["wallet", d.tabs[2], "5px"], ["support", d.tabs[3], "99px"]
    ];
    return '<div class="tabbar">' + tabs.map(function (tb) {
      var on = state.activeTab === tb[0];
      return '<button class="tab ' + (on ? "on" : "") + '" data-action="switchTab" data-arg="' + tb[0] + '"><span class="tab-icon" style="border-radius:' + tb[2] + '"></span><span class="tab-label">' + esc(tb[1]) + '</span></button>';
    }).join("") + '</div>';
  }

  function render() {
    var root = document.getElementById("app");
    var html = "";
    if (!state.loggedIn) {
      html = offlineBar() + '<div class="screen-body">' + (state.authScreen === "otp" ? screenOtp() : screenLogin()) + '</div>';
    } else {
      var c = cur();
      var body;
      switch (c.screen) {
        case "home": body = screenHome(); break;
        case "order": body = screenOrder(); break;
        case "payment": body = screenPayment(); break;
        case "track": body = screenTrack(c.orderId); break;
        case "proof": body = screenProof(c.orderId); break;
        case "history": body = screenHistory(); break;
        case "wallet": body = screenWallet(); break;
        case "chat": body = screenChat(c.orderId); break;
        case "settings": body = screenSettings(); break;
        default: body = screenHome();
      }
      var key = state.activeTab + ":" + stack().length + ":" + c.screen + ":" + (state.draft ? state.draft.step : "");
      var anim = key !== lastScreenKey ? " fade-in" : ""; lastScreenKey = key;
      html = offlineBar() + '<div class="screen-body' + anim + '">' + body + '</div>' + tabbar();
    }
    if (state.toast) html += '<div class="toast">' + esc(state.toast) + '</div>';
    var ae = document.activeElement, bindKey = ae && ae.getAttribute && ae.getAttribute("data-bind"), s0 = null, s1 = null;
    if (bindKey) { try { s0 = ae.selectionStart; s1 = ae.selectionEnd; } catch (e) {} }
    root.innerHTML = html;
    save();
    if (bindKey) {
      var nx = root.querySelector('[data-bind="' + bindKey + '"]');
      if (nx) { nx.focus(); if (typeof s0 === "number" && nx.setSelectionRange) { try { nx.setSelectionRange(s0, s1); } catch (e) {} } }
    }
    afterRender();

    if (c_isChat()) {
      var sc = document.getElementById("chat-scroll");
      if (sc) sc.scrollTop = sc.scrollHeight;
    }
  }
  function c_isChat() { return state.loggedIn && cur().screen === "chat"; }

  /* ============================== actions ============================== */

  var actions = {
    requestOtp: function () {
      state.generatedOtp = randCode();
      state.otpInput = "";
      state.authScreen = "otp";
      render();
    },
    resendOtp: function () { state.generatedOtp = randCode(); state.otpInput = ""; toast(state.lang === "en" ? "New code sent (demo)" : "Nouveau code envoyé (démo)"); },
    otpKey: function (el, arg) {
      if (arg === "back") { state.otpInput = state.otpInput.slice(0, -1); render(); return; }
      if (state.otpInput.length >= 4) return;
      state.otpInput += arg;
      if (state.otpInput.length === 4) {
        if (state.otpInput === state.generatedOtp) {
          state.loggedIn = true;
          render();
        } else {
          render();
          setTimeout(function () { state.otpInput = ""; toast(state.lang === "en" ? "Wrong code" : "Code incorrect"); }, 250);
        }
      } else {
        render();
      }
    },
    toggleLang: function () { state.lang = state.lang === "en" ? "fr" : "en"; render(); },
    setLang: function (el, arg) { state.lang = arg; document.documentElement.lang = arg; render(); },
    go: function (el, arg) {
      var parts = arg.split("|");
      if (parts[0] === "wallet") { state.activeTab = "wallet"; render(); return; }
      if (parts[0] === "chat") { state.activeTab = "support"; state.tabStacks.support = [{ screen: "chat", orderId: parts[1] || null }]; render(); return; }
    },
    switchTab: function (el, arg) { switchTab(arg); },
    popScreen: function () { popScreen(); },
    pickService: function (el, arg) {
      var s = svc(arg);
      state.draft = {
        service: arg, step: 1,
        pickup: "Bonamoussadi, rue 4.212", dropoff: "Akwa, av. du Général de Gaulle",
        pickupGeo: geoOf("Bonamoussadi"), dropoffGeo: geoOf("Akwa"),
        weightKg: 2.5, note: "", vehicle: "bike", payMethod: "orange_money"
      };
      push("order");
    },
    pickQuartier: function (el, arg) { var f = state.addrTarget || "dropoff"; state.draft[f] = arg + ", Douala"; state.draft[f + "Geo"] = geoOf(arg); state.suggest = null; render(); },
    pickSaved: function (el, arg) { var a = state.addresses[Number(arg)]; if (!a) return; applyPlace(state.addrTarget || "dropoff", { label: a.text, lat: a.geo.lat, lng: a.geo.lng }); render(); },
    setAddrTarget: function (el, arg) { state.addrTarget = arg; render(); },
    pickSuggest: function (el, arg) {
      var s = state.suggest; if (!s) return; var it = s.items[Number(arg)]; if (!it) return;
      var field = s.field; state.addrTarget = "dropoff";
      if (it.resolve) {
        state.draft[field] = it.label; state.draft[field + "Geo"] = null; state.suggest = null; render();
        it.resolve().then(function (geo) { if (state.draft && state.draft[field] === it.label) { state.draft[field + "Geo"] = geo; render(); } }).catch(function () {});
        return;
      }
      applyPlace(field, it); render();
    },
    saveAddress: function (el, arg) {
      var dr = state.draft, geo = dr[arg + "Geo"]; if (!geo || !dr[arg] || isSavedAddr(dr[arg])) return;
      state.addresses.push({ id: "a" + Date.now(), label: dr[arg].split(",")[0], text: dr[arg], geo: geo });
      toast(t().saved);
    },
    useMyLocation: function () {
      var d = t();
      if (!navigator.geolocation) { toast(d.locError); return; }
      state.draft.pickup = d.locating; state.draft.pickupGeo = null; state.suggest = null; render();
      navigator.geolocation.getCurrentPosition(function (pos) {
        var g = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.draft.pickupGeo = g; state.draft.pickup = d.myPosition; render();
        WGeo.reverse(g.lat, g.lng).then(function (label) { if (label && state.draft && state.draft.pickupGeo === g) { state.draft.pickup = label; render(); } }).catch(function () {});
      }, function () { state.draft.pickup = ""; render(); toast(d.locError); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    },
    incWeight: function () { state.draft.weightKg = Math.round((state.draft.weightKg + 0.5) * 10) / 10; render(); },
    decWeight: function () { state.draft.weightKg = Math.max(0.5, Math.round((state.draft.weightKg - 0.5) * 10) / 10); render(); },
    pickVehicle: function (el, arg) { state.draft.vehicle = arg; render(); },
    orderBack: function () { popScreen(); },
    orderNext: function () {
      var stepped = state.settings.orderFlow === "stepped";
      state.suggest = null;
      if (stepped && state.draft.step < 3) { state.draft.step++; render(); return; }
      push("payment");
    },
    pickPay: function (el, arg) { state.draft.payMethod = arg; render(); },
    confirmPay: function () {
      var d = t(); var draft = state.draft;
      var price = computePrice(draft.service, draft.weightKg);
      if (draft.payMethod === "wallet" && state.wallet.balance < price.net) { toast(d.insufficient); return; }
      var finish = function () {
        var id = "o" + (state.seq++);
        var code = "WUN-2026-" + String(state.orders.length + 1).padStart(3, "0");
        var paid = draft.payMethod !== "cash";
        if (draft.payMethod === "wallet") state.wallet.balance -= price.net;
        var order = {
          id: id, code: code, service: draft.service, pickup: draft.pickup, dropoff: draft.dropoff,
          weightKg: draft.weightKg, vehicle: draft.vehicle, note: draft.note,
          pickupGeo: draft.pickupGeo || geoOf(draft.pickup), dropoffGeo: draft.dropoffGeo || geoOf(draft.dropoff), createdAt: Date.now(),
          paymentMethod: draft.payMethod, paymentStatus: paid ? "paid" : "cod",
          status: "received", stage: 0, rating: null
        };
        state.orders.unshift(order);
        state.payPending = false;
        replaceTop("track", { orderId: id });
      };
      if (draft.payMethod === "orange_money" || draft.payMethod === "mtn_momo") {
        state.payPending = true; render();
        setTimeout(finish, 1400);
      } else {
        finish();
      }
    },
    openOrder: function (el, arg) {
      var o = findOrder(arg);
      push(o.status === "delivered" ? "proof" : "track", { orderId: arg });
    },
    advanceOrder: function (el, arg) {
      var o = findOrder(arg);
      if (o.stage >= 3) {
        o.status = "delivered";
        o.proofAt = Date.now();
        replaceTop("proof", { orderId: arg });
        return;
      }
      o.stage++;
      if (o.stage === 2) o.enRouteAt = Date.now();
      var labels = ["received", "picked_up", "en_route", "delivered"];
      o.status = labels[o.stage];
      render();
    },
    rate: function (el, arg) {
      var parts = arg.split("|");
      var o = findOrder(parts[0]);
      o.rating = Number(parts[1]);
      render();
    },
    finishProof: function () {
      state.tabStacks.home = [{ screen: "home" }];
      state.activeTab = "home";
      render();
    },
    setHistoryFilter: function (el, arg) { state.historyFilter = Number(arg); render(); },
    toggleWalletPanel: function (el, arg) { state.walletPanel = state.walletPanel === arg ? null : arg; state.topUpAmount = ""; state.sendPhone = ""; render(); },
    setTopUpMethod: function (el, arg) { state.topUpMethod = arg; render(); },
    doTopUp: function () {
      var amt = Number(state.topUpAmount);
      if (!amt) return;
      state.wallet.balance += amt;
      state.walletPanel = null;
      toast(t().toastTopUp);
    },
    doSend: function () {
      var amt = Number(state.topUpAmount);
      if (!amt || amt > state.wallet.balance) { toast(t().insufficient); return; }
      state.wallet.balance -= amt;
      state.walletPanel = null;
      toast(t().toastSent);
    },
    openSettings: function () { push("settings"); },
    openChatGeneral: function () { state.activeTab = "support"; state.tabStacks.support = [{ screen: "chat", orderId: null }]; render(); },
    sendChat: function (el, arg) {
      var key = arg || "general";
      var text = (state.chatDraft || "").trim();
      if (!text) return;
      var msgs = state.chatByOrder[key] || (state.chatByOrder[key] = []);
      msgs.push({ from: "user", text: text });
      state.chatDraft = "";
      render();
      setTimeout(function () {
        msgs.push({ from: "bot", text: t().botReply });
        render();
      }, 650);
    },
    setHomeLayout: function (el, arg) { state.settings.homeLayout = arg; render(); },
    setOrderFlow: function (el, arg) { state.settings.orderFlow = arg; render(); },
    toggleShowActive: function () { state.settings.showActiveOrder = !state.settings.showActiveOrder; render(); },
    logOut: function () {
      state.loggedIn = false; state.authScreen = "login"; state.phone = ""; state.otpInput = ""; state.generatedOtp = null;
      state.tabStacks = { home: [{ screen: "home" }], orders: [{ screen: "history" }], wallet: [{ screen: "wallet" }], support: [{ screen: "chat" }] };
      state.activeTab = "home";
      render();
    },
    noop: function () {}
  };

  /* ============================== bind ============================== */

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var arg = el.getAttribute("data-arg");
    if (actions[action]) actions[action](el, arg);
  });

  document.addEventListener("input", function (e) {
    var el = e.target;
    var bind = el.getAttribute && el.getAttribute("data-bind");
    if (!bind) return;

    if (bind === "phone") state.phone = el.value.replace(/[^\d ]/g, "");
    else if (bind === "draft.pickup" || bind === "draft.dropoff") {
      var fld = bind.slice(6); state.draft[fld] = el.value; state.draft[fld + "Geo"] = null; state.addrTarget = fld; suggest(fld, el.value);
    }
    else if (bind === "draft.note") state.draft.note = el.value;
    else if (bind === "topUpAmount") state.topUpAmount = el.value.replace(/\D/g, "");
    else if (bind === "sendPhone") state.sendPhone = el.value;
    else if (bind === "chatDraft") state.chatDraft = el.value;
    else return;

    render();
  });

  /* ============================== PWA ============================== */

  var I18N_PWA = {
    fr: { install: "Installer WunaGo", installSub: "Accès en un geste depuis l'écran d'accueil, même hors connexion.", installBtn: "Installer", later: "Plus tard",
          iosHint: "Sur iPhone : touchez Partager, puis « Sur l'écran d'accueil ».", offline: "Hors connexion — vos commandes restent consultables." },
    en: { install: "Install WunaGo", installSub: "One tap from your home screen, even offline.", installBtn: "Install", later: "Later",
          iosHint: "On iPhone: tap Share, then “Add to Home Screen”.", offline: "Offline — your orders are still available." }
  };
  function p() { return I18N_PWA[state.lang]; }

  function installBanner() {
    if (isStandalone || installDismissed) return "";
    if (!deferredInstall && !isIOS) return "";
    var d = p();
    return '<div style="padding:16px 20px 0"><div class="install-card" role="region" aria-label="' + esc(d.install) + '" style="display:flex;gap:12px;align-items:center;background:#101010;border-radius:16px;padding:13px 14px">' +
      '<img src="icons/icon-192.png" alt="" width="38" height="38" style="border-radius:10px;flex:none">' +
      '<div class="col" style="gap:2px;flex:1"><span style="font-weight:800;font-size:13.5px;color:#fff">' + esc(d.install) + '</span>' +
      '<span style="font-size:11.5px;line-height:1.4;color:rgba(255,255,255,.7)">' + esc(isIOS && !deferredInstall ? d.iosHint : d.installSub) + '</span></div>' +
      '<div class="col" style="gap:4px;flex:none">' +
        (deferredInstall ? '<button class="btn btn-yellow" data-action="doInstall" style="height:34px;border-radius:99px;padding:0 13px;font-size:11.5px">' + esc(d.installBtn) + '</button>' : '') +
        '<button data-action="dismissInstall" style="border:0;background:none;color:rgba(255,255,255,.7);font-weight:600;font-size:11px;cursor:pointer;min-height:28px">' + esc(d.later) + '</button>' +
      '</div></div></div>';
  }

  function offlineBar() {
    if (navigator.onLine !== false) return "";
    return '<div class="offline-bar" role="status">' + esc(p().offline) + '</div>';
  }

  actions.doInstall = function () {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function () { deferredInstall = null; render(); });
  };
  actions.dismissInstall = function () { installDismissed = true; try { localStorage.setItem(STORE_KEY + ".noinstall", "1"); } catch (e) {} render(); };

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; render(); });
  window.addEventListener("appinstalled", function () { deferredInstall = null; isStandalone = true; render(); });
  window.addEventListener("online", function () { render(); });
  document.addEventListener("wg:maps-ready", function () { render(); });
  window.addEventListener("offline", function () { render(); });

  /* Bouton retour Android / navigateur : dépile l'écran courant */
  window.addEventListener("popstate", function () {
    if (!state.loggedIn) { if (state.authScreen === "otp") { state.authScreen = "login"; render(); } return; }
    if (cur().screen === "order" && state.draft && state.draft.step > 1 && state.settings.orderFlow === "stepped") { state.draft.step--; try { history.pushState({ wg: 1 }, ""); } catch (e) {} render(); return; }
    var s = stack(); if (s.length > 1) { s.pop(); render(); }
  });

  document.addEventListener("focusin", function (e) {
    var f = e.target && e.target.getAttribute && e.target.getAttribute("data-field");
    if (f && state.draft && state.addrTarget !== f) { state.addrTarget = f; if (state.suggest && state.suggest.field !== f) state.suggest = null; render(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.suggest) { state.suggest = null; render(); } });

  /* Clavier physique pour le code OTP */
  document.addEventListener("keydown", function (e) {
    if (state.loggedIn || state.authScreen !== "otp") return;
    if (/^[0-9]$/.test(e.key)) actions.otpKey(null, e.key);
    else if (e.key === "Backspace") actions.otpKey(null, "back");
  });

  /* Persistance locale (sera remplacée par l'API WunaGo) */
  var KEEP = ["lang", "loggedIn", "phone", "user", "wallet", "settings", "orders", "seq", "chatByOrder", "addresses"];
  function save() {
    try { var o = {}; KEEP.forEach(function (k) { o[k] = state[k]; }); localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {}
  }
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) KEEP.forEach(function (k) { if (saved[k] !== undefined) state[k] = saved[k]; });
    installDismissed = localStorage.getItem(STORE_KEY + ".noinstall") === "1";
  } catch (e) {}
  if (!state.user.initials) state.user.initials = initials(state.user.name);
  document.documentElement.lang = state.lang;
  if (state.loggedIn && location.hash === "#commandes") state.activeTab = "orders";

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").then(function (reg) { reg.update(); }).catch(function () {}); });
    /* Nouvelle version publiée : on recharge une fois pour l'afficher tout de suite */
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }

  render();

})();

