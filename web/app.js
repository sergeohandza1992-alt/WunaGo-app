
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
    addrForm: null,
    payAccounts: [{ op: "orange_money", number: "6 90 12 34 56" }, { op: "mtn_momo", number: "6 77 88 88 91" }],
    defaultPay: "orange_money",
    notifPrefs: { orders: true, sms: true, push: false, promos: true },
    disputes: [],
    disputeForm: null,
    cancelFor: null,
    addrTarget: "dropoff",
    suggest: null,
    payPending: false,
    toast: null
  };

  function t() { return STR[state.lang]; }
  var STR3 = {
    fr: {
      addrTitle: "Mes adresses", addrEmpty: "Aucune adresse enregistrée. Ajoutez votre domicile ou votre bureau pour commander plus vite.",
      addrAdd: "Ajouter une adresse", addrLabel: "Nom", addrLabels: ["Maison", "Bureau", "Autre"], addrField: "Adresse", addrSave: "Enregistrer l'adresse",
      addrDelete: "Supprimer", addrDeleted: "Adresse supprimée.", addrNeedGeo: "Choisissez l'adresse dans les suggestions ou utilisez Ma position.", addrOther: "Nom de l'adresse",
      payTitle: "Moyens de paiement", payDefault: "Par défaut", payMakeDefault: "Choisir par défaut", payAddNumber: "Ajouter un numéro Mobile Money",
      payOperator: "Opérateur", payNumber: "Numéro", payAdded: "Numéro ajouté.", payRemoved: "Numéro retiré.", payInvalid: "Numéro à 9 chiffres commençant par 6.",
      payNote: "Les paiements réels Orange Money et MTN MoMo seront branchés à la dernière étape. Aucun débit n'est fait aujourd'hui.",
      notifTitle: "Notifications", notifOrders: "Suivi de mes commandes", notifOrdersSub: "Récupération, livraison, retard",
      notifSms: "SMS", notifSmsSub: "Message texte à chaque étape clé", notifPush: "Notifications sur ce téléphone", notifPushSub: "Même quand l'app est fermée",
      notifPromos: "Offres et promotions", notifPromosSub: "Au maximum une par semaine", notifDenied: "Notifications bloquées dans le navigateur : autorisez-les dans les réglages du téléphone.",
      notifOn: "Notifications activées.", notifTest: "WunaGo — les notifications sont activées.",
      cancel: "Annuler la commande", cancelTitle: "Annuler cette commande ?", cancelSub: "Possible tant que le colis n'a pas été récupéré.",
      cancelReasons: ["Je n'en ai plus besoin", "Délai trop long", "Erreur d'adresse", "J'ai commandé par erreur", "Autre raison"],
      cancelConfirm: "Confirmer l'annulation", cancelKeep: "Garder la commande", cancelled: "Commande annulée",
      refundWallet: "Remboursé sur votre portefeuille.", refundMomo: "Remboursement sur votre compte Mobile Money sous 48 h.", refundNone: "Aucun montant n'a été débité.",
      cancelledOn: "Annulée", reason: "Motif",
      helpTitle: "Aide et litiges", helpChat: "Écrire à l'assistance", helpChatSub: "Réponse en moins de 2 min",
      helpReport: "Signaler un problème", helpReportSub: "Colis abîmé, manquant, retard…", helpClaims: "Mes réclamations",
      helpCall: "Appeler WunaGo", claimsEmpty: "Aucune réclamation en cours.",
      disputeTitle: "Signaler un problème", disputeOrder: "Commande concernée", disputeNoOrder: "Aucune commande à signaler pour l'instant.",
      disputeReason: "Problème", disputeReasons: ["Colis endommagé", "Article manquant", "Retard important", "Comportement du livreur", "Problème de paiement", "Autre"],
      disputeDesc: "Décrivez ce qui s'est passé", disputeDescPh: "Ce qui est arrivé, quand, ce que vous attendez…", disputePhoto: "Ajouter une photo", disputePhotoOk: "Photo ajoutée",
      disputeSend: "Envoyer la réclamation", disputeSent: "Réclamation envoyée. Un agent vous répond sous 24 h.", disputeNeed: "Choisissez le problème et décrivez-le en quelques mots.",
      disputeStatus: { open: "OUVERTE", review: "EN COURS", closed: "RÉSOLUE" }, reportProblem: "Signaler un problème",
      disputeChat: "Réclamation {code} enregistrée pour la commande {order} : {reason}."
    },
    en: {
      addrTitle: "My addresses", addrEmpty: "No saved address yet. Add your home or office to order faster.",
      addrAdd: "Add an address", addrLabel: "Name", addrLabels: ["Home", "Office", "Other"], addrField: "Address", addrSave: "Save address",
      addrDelete: "Delete", addrDeleted: "Address deleted.", addrNeedGeo: "Pick the address from the suggestions or use My location.", addrOther: "Address name",
      payTitle: "Payment methods", payDefault: "Default", payMakeDefault: "Set as default", payAddNumber: "Add a Mobile Money number",
      payOperator: "Operator", payNumber: "Number", payAdded: "Number added.", payRemoved: "Number removed.", payInvalid: "9-digit number starting with 6.",
      payNote: "Real Orange Money and MTN MoMo payments come in the last step. Nothing is charged today.",
      notifTitle: "Notifications", notifOrders: "Order tracking", notifOrdersSub: "Pickup, delivery, delays",
      notifSms: "SMS", notifSmsSub: "Text message at each key step", notifPush: "Notifications on this phone", notifPushSub: "Even when the app is closed",
      notifPromos: "Offers and promotions", notifPromosSub: "At most one a week", notifDenied: "Notifications are blocked in the browser: allow them in your phone settings.",
      notifOn: "Notifications enabled.", notifTest: "WunaGo — notifications are on.",
      cancel: "Cancel order", cancelTitle: "Cancel this order?", cancelSub: "Possible until the parcel is picked up.",
      cancelReasons: ["I no longer need it", "Takes too long", "Wrong address", "Ordered by mistake", "Other reason"],
      cancelConfirm: "Confirm cancellation", cancelKeep: "Keep the order", cancelled: "Order cancelled",
      refundWallet: "Refunded to your wallet.", refundMomo: "Refund to your Mobile Money account within 48 h.", refundNone: "Nothing was charged.",
      cancelledOn: "Cancelled", reason: "Reason",
      helpTitle: "Help and disputes", helpChat: "Chat with support", helpChatSub: "Replies in under 2 min",
      helpReport: "Report a problem", helpReportSub: "Damaged, missing, late…", helpClaims: "My claims",
      helpCall: "Call WunaGo", claimsEmpty: "No open claim.",
      disputeTitle: "Report a problem", disputeOrder: "Order", disputeNoOrder: "No order to report yet.",
      disputeReason: "Problem", disputeReasons: ["Damaged parcel", "Missing item", "Major delay", "Courier behaviour", "Payment issue", "Other"],
      disputeDesc: "Describe what happened", disputeDescPh: "What happened, when, what you expect…", disputePhoto: "Add a photo", disputePhotoOk: "Photo added",
      disputeSend: "Send claim", disputeSent: "Claim sent. An agent replies within 24 h.", disputeNeed: "Pick the problem and describe it briefly.",
      disputeStatus: { open: "OPEN", review: "IN REVIEW", closed: "RESOLVED" }, reportProblem: "Report a problem",
      disputeChat: "Claim {code} recorded for order {order}: {reason}."
    }
  };
  function t3() { return STR3[state.lang] || STR3.fr; }
  function stack() { return state.tabStacks[state.activeTab]; }
  function cur() { var s = stack(); return s[s.length - 1]; }
  function push(screen, extra) { stack().push(Object.assign({ screen: screen }, extra || {})); try { history.pushState({ wg: stack().length }, ""); } catch (e) {} render(); }
  function replaceTop(screen, extra) { var s = stack(); s[s.length - 1] = Object.assign({ screen: screen }, extra || {}); render(); }
  function popScreen() { var s = stack(); if (s.length > 1) s.pop(); render(); }
  function switchTab(tab) {
    /* toucher l'onglet déjà ouvert ramène à son premier écran */
    if (state.activeTab === tab) { var s = state.tabStacks[tab]; state.tabStacks[tab] = [s[0]]; }
    state.activeTab = tab; state.cancelFor = null; render();
  }
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
  function fobj(field) { return field === "addr" ? state.addrForm : state.draft; }
  function applyPlace(field, place) {
    fobj(field)[field] = place.label;
    fobj(field)[field + "Geo"] = { lat: place.lat, lng: place.lng };
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
        (DEMO && state.generatedOtp ? '<div style="background:rgba(16,16,16,.08);border-radius:11px;padding:9px 12px;font-family:var(--mono);font-size:11px;line-height:1.5;color:rgba(16,16,16,.75)">' + esc(d.demoCode) + ' <b style="letter-spacing:.1em">' + state.generatedOtp + '</b></div>' : '') +
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
      var acc = accountFor(p.key);
      var detail = p.key === "wallet" ? fmtFcfa(state.wallet.balance) : p.key === "cash" ? d.cashNote : acc ? "•••• " + last4(acc.number) : p.detail;
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
    if (o.status === "cancelled") return screenCancelled(o);
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
        (o.stage === 0 ? '<button class="btn btn-outline" data-action="askCancel" data-arg="' + orderId + '" style="width:100%;color:#101010">' + esc(t3().cancel) + '</button>' : '') +
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
      '<div style="padding:16px 20px 20px;display:flex;flex-direction:column;gap:8px"><button class="btn btn-ink" data-action="finishProof" style="width:100%">' + esc(d.backHome) + '</button>' +
      '<button class="btn" data-action="openDispute" data-arg="' + orderId + '" style="height:44px;background:transparent;font-weight:700;font-size:12.5px;text-decoration:underline">' + esc(t3().reportProblem) + '</button></div>'
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
      [d.addresses, String((state.addresses || []).length), "openScreen", "addresses"],
      [d.methods, String(2 + (state.payAccounts || []).length), "openScreen", "paymethods"],
      [d.notifs, notifSummary(), "openScreen", "notifs"],
      [d.language, state.lang === "en" ? "English" : "Français", "openSettings"],
      [d.help, (state.disputes || []).filter(function (x) { return x.status !== "closed"; }).length ? String((state.disputes || []).filter(function (x) { return x.status !== "closed"; }).length) : "", "openScreen", "help"]
    ];
    var rowsHtml = rows.map(function (r, i) {
      return '<button class="fx ac" data-action="' + (r[2] || "noop") + '"' + (r[3] ? ' data-arg="' + r[3] + '"' : '') + ' style="gap:11px;min-height:48px;text-align:left;border:0;background:transparent;padding:13px 12px;cursor:pointer;' + (i < rows.length - 1 ? "border-bottom:1px solid var(--hair)" : "") + '">' +
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

  /* ============================== étape 3 : compte, annulation, litiges ============================== */

  function accountFor(op) { return (state.payAccounts || []).filter(function (a) { return a.op === op; })[0] || null; }
  function last4(num) { var s = String(num || "").replace(/\D/g, ""); return s.slice(-4); }
  function notifSummary() {
    var n = state.notifPrefs || {}, parts = [];
    if (n.sms) parts.push("SMS"); if (n.push) parts.push("push");
    return parts.length ? parts.join(" + ") : (state.lang === "en" ? "Off" : "Désactivées");
  }
  function hdr(title, action) {
    return '<div class="fx ac" style="gap:11px"><button class="backbtn" aria-label="Retour" data-action="' + (action || "popScreen") + '">←</button>' +
      '<h1 style="margin:0;font-weight:800;font-size:18px;letter-spacing:-.4px">' + esc(title) + '</h1></div>';
  }
  function page3(inner, footer) {
    return '<div class="scroll"><div class="col" style="padding:calc(18px + var(--sat)) 20px 20px;gap:16px">' + inner + '</div></div>' + (footer || "");
  }
  var cardStyle = 'background:#fff;border:1px solid var(--hair);border-radius:16px';
  function toggleRow(label, sub, on, action, arg) {
    return '<div class="fx ac" style="gap:12px;padding:12px 14px;min-height:56px">' +
      '<div class="col" style="gap:2px;flex:1"><span style="font-weight:700;font-size:13.5px">' + esc(label) + '</span><span style="font-size:11.5px;color:rgba(16,16,16,.6)">' + esc(sub) + '</span></div>' +
      '<button role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-action="' + action + '" data-arg="' + arg + '" style="border:0;width:44px;height:26px;flex:none;border-radius:99px;background:' + (on ? "#101010" : "rgba(16,16,16,.15)") + ';position:relative;cursor:pointer">' +
      '<span style="position:absolute;top:3px;left:' + (on ? "21px" : "3px") + ';width:20px;height:20px;border-radius:99px;background:#FFD700"></span></button></div>';
  }
  function chip(label, on, action, arg) {
    return '<button class="btn" data-action="' + action + '" data-arg="' + esc(arg) + '" aria-pressed="' + on + '" style="height:auto;min-height:36px;border-radius:99px;padding:8px 13px;font-weight:700;font-size:11.5px;border:1px solid ' + (on ? "#101010" : "rgba(16,16,16,.12)") + ';background:' + (on ? "#101010" : "#fff") + ';color:' + (on ? "#fff" : "#101010") + '">' + esc(label) + '</button>';
  }

  /* ---------- Mes adresses ---------- */
  function screenAddresses() {
    var e = t3(), list = state.addresses || [];
    var rows = list.length ? list.map(function (a, i) {
      return '<div class="fx ac" style="gap:12px;padding:12px 14px;' + (i < list.length - 1 ? "border-bottom:1px solid var(--hair)" : "") + '">' +
        '<span class="sg-ic" style="background:#FFD700">' + ICON.star + '</span>' +
        '<div class="col" style="gap:2px;flex:1;min-width:0"><span style="font-weight:700;font-size:13.5px">' + esc(a.label) + '</span><span style="font-size:11.5px;color:rgba(16,16,16,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.text) + '</span></div>' +
        '<button class="btn" data-action="deleteAddress" data-arg="' + i + '" aria-label="' + esc(e.addrDelete + " " + a.label) + '" style="height:34px;border-radius:99px;padding:0 11px;background:rgba(16,16,16,.06);font-weight:700;font-size:11px">' + esc(e.addrDelete) + '</button></div>';
    }).join("") : '<div style="padding:16px 14px;font-size:12.5px;line-height:1.5;color:rgba(16,16,16,.65)">' + esc(e.addrEmpty) + '</div>';
    return page3(hdr(e.addrTitle) + '<div style="' + cardStyle + '">' + rows + '</div>',
      '<div style="padding:16px 20px 20px"><button class="btn btn-yellow" data-action="newAddress" style="width:100%">' + esc(e.addrAdd) + '</button></div>');
  }
  function screenAddrForm() {
    var e = t3(), d = t(), f = state.addrForm;
    var labels = e.addrLabels;
    var isOther = labels.slice(0, 2).indexOf(f.label) === -1;
    return page3(hdr(e.addrAdd) +
      '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.addrLabel) + '</div>' +
      '<div class="fx wrap" style="gap:7px">' + labels.map(function (l, i) { var on = i < 2 ? f.label === l : isOther; return chip(l, on, "setAddrLabel", i < 2 ? l : ""); }).join("") + '</div>' +
      (isOther ? '<input data-bind="addrForm.label" aria-label="' + esc(e.addrOther) + '" placeholder="' + esc(e.addrOther) + '" value="' + esc(f.label) + '" style="' + cardStyle + ';height:48px;padding:0 14px;font-weight:600;font-size:13.5px" />' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.addrField) + '</div>' +
      '<div style="' + cardStyle + ';padding:0 15px"><div class="fx ac addr-row" style="gap:11px;min-height:52px"><span style="width:8px;height:8px;flex:none;background:#101010"></span>' +
      '<input data-bind="addrForm.addr" data-field="addr" autocomplete="off" aria-autocomplete="list" aria-label="' + esc(e.addrField) + '" placeholder="' + esc(d.dropPh) + '" value="' + esc(f.addr) + '" style="flex:1;min-width:0;height:52px;font-weight:600;font-size:13.5px" />' +
      (f.addrGeo ? '<span style="color:#101010">' + ICON.check + '</span>' : '') + '</div>' + suggestList("addr") + '</div>' +
      '<div class="fx"><button class="btn" data-action="useMyLocation" data-arg="addr" style="height:auto;min-height:34px;border-radius:99px;padding:7px 12px;background:#101010;color:#FFD700;font-weight:600;font-size:11.5px;gap:5px">' + ICON.gps + esc(d.myPosition) + '</button></div></div>',
      '<div style="padding:16px 20px 20px"><button class="btn btn-yellow" data-action="saveAddrForm" style="width:100%">' + esc(e.addrSave) + '</button></div>');
  }

  /* ---------- Moyens de paiement ---------- */
  function screenPayMethods() {
    var e = t3(), d = t();
    var rows = PAYMENTS.map(function (p, i) {
      var acc = accountFor(p.key), isDef = state.defaultPay === p.key;
      var detail = p.key === "wallet" ? fmtFcfa(state.wallet.balance) : p.key === "cash" ? d.cashNote : acc ? "+237 " + acc.number : p.detail;
      var canHave = (p.key !== "orange_money" && p.key !== "mtn_momo") || acc;
      return '<div class="fx ac" style="gap:12px;padding:12px 14px;' + (i < PAYMENTS.length - 1 ? "border-bottom:1px solid var(--hair)" : "") + '">' +
        '<span class="fx ac jc" style="width:38px;height:27px;flex:none;border-radius:7px;background:' + p.bg + ';color:' + p.fg + ';font-family:var(--mono);font-weight:700;font-size:9px">' + p.chip + '</span>' +
        '<div class="col" style="gap:2px;flex:1;min-width:0"><span style="font-weight:700;font-size:13.5px">' + esc(d.paymentNames[p.key]) + '</span><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.55);white-space:nowrap">' + esc(detail || "") + '</span></div>' +
        (isDef ? '<span class="mono" style="border-radius:99px;padding:5px 9px;background:#FFD700;font-weight:700;font-size:9.5px">' + esc(e.payDefault.toUpperCase()) + '</span>'
          : canHave ? '<button class="btn" data-action="setDefaultPay" data-arg="' + p.key + '" style="height:32px;border-radius:99px;padding:0 10px;background:rgba(16,16,16,.06);font-weight:700;font-size:10.5px">' + esc(e.payMakeDefault) + '</button>' : '') +
        (acc ? '<button class="btn" data-action="removeAccount" data-arg="' + p.key + '" aria-label="' + esc(e.addrDelete + " " + d.paymentNames[p.key]) + '" style="width:36px;height:36px;flex:none;border-radius:99px;background:rgba(16,16,16,.06);font-weight:700;font-size:15px;padding:0">×</button>' : '') +
        '</div>';
    }).join("");
    var f = state.payForm;
    var form = f ? '<div class="col" style="' + cardStyle + ';padding:14px;gap:11px">' +
        '<div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.payOperator) + '</div>' +
        '<div class="fx" style="gap:7px">' + chip("Orange Money", f.op === "orange_money", "setPayFormOp", "orange_money") + chip("MTN MoMo", f.op === "mtn_momo", "setPayFormOp", "mtn_momo") + '</div>' +
        '<label class="fx ac" style="gap:10px;background:rgba(16,16,16,.04);border-radius:12px;padding:0 13px;height:48px"><span class="mono" style="font-weight:600;font-size:13px;color:rgba(16,16,16,.6)">+237</span>' +
        '<input data-bind="payForm.number" inputmode="numeric" aria-label="' + esc(e.payNumber) + '" placeholder="6 90 00 00 00" value="' + esc(f.number) + '" style="flex:1;height:100%;font-weight:600;font-size:14px" /></label>' +
        '<button class="btn btn-ink" data-action="savePayAccount">' + esc(d.confirm) + '</button></div>'
      : '<button class="btn btn-outline" data-action="openPayForm" style="width:100%;color:#101010">' + esc(e.payAddNumber) + '</button>';
    return page3(hdr(e.payTitle) + '<div style="' + cardStyle + '">' + rows + '</div>' + form +
      '<p style="margin:0;font-size:11px;line-height:1.5;color:rgba(16,16,16,.6)">' + esc(e.payNote) + '</p>');
  }

  /* ---------- Notifications ---------- */
  function screenNotifs() {
    var e = t3(), n = state.notifPrefs;
    var denied = window.Notification && Notification.permission === "denied";
    return page3(hdr(e.notifTitle) +
      '<div style="' + cardStyle + '">' +
        toggleRow(e.notifOrders, e.notifOrdersSub, n.orders, "toggleNotif", "orders") + '<div style="height:1px;background:var(--hair)"></div>' +
        toggleRow(e.notifSms, e.notifSmsSub, n.sms, "toggleNotif", "sms") + '<div style="height:1px;background:var(--hair)"></div>' +
        toggleRow(e.notifPush, e.notifPushSub, n.push, "toggleNotif", "push") + '<div style="height:1px;background:var(--hair)"></div>' +
        toggleRow(e.notifPromos, e.notifPromosSub, n.promos, "toggleNotif", "promos") +
      '</div>' + (denied ? '<p style="margin:0;font-size:11.5px;line-height:1.5;color:rgba(16,16,16,.7)">' + esc(e.notifDenied) + '</p>' : ''));
  }

  /* ---------- Annulation ---------- */
  function cancelSheet() {
    var e = t3(), c = state.cancelFor;
    return '<div class="sheet-backdrop" data-action="closeCancel"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(e.cancelTitle) + '">' +
      '<div style="width:34px;height:4px;border-radius:9px;background:rgba(16,16,16,.15);margin:0 auto 6px"></div>' +
      '<h2 style="margin:0;font-weight:800;font-size:19px;letter-spacing:-.4px">' + esc(e.cancelTitle) + '</h2>' +
      '<p style="margin:0;font-size:12.5px;color:rgba(16,16,16,.65)">' + esc(e.cancelSub) + '</p>' +
      '<div class="col" style="gap:7px">' + e.cancelReasons.map(function (r, i) {
        var on = c.reason === i;
        return '<button class="fx ac" data-action="pickCancelReason" data-arg="' + i + '" role="radio" aria-checked="' + on + '" style="gap:11px;text-align:left;border:1.5px solid ' + (on ? "#101010" : "var(--hair)") + ';background:#fff;border-radius:13px;padding:12px 13px;cursor:pointer;color:#101010;min-height:46px">' +
          '<span style="width:16px;height:16px;flex:none;box-sizing:border-box;border-radius:99px;border:2px solid ' + (on ? "#101010" : "rgba(16,16,16,.2)") + ';background:' + (on ? "#101010" : "transparent") + '"></span><span style="font-weight:600;font-size:13px">' + esc(r) + '</span></button>';
      }).join("") + '</div>' +
      '<button class="btn btn-ink" data-action="confirmCancel" ' + (c.reason == null ? "disabled" : "") + '>' + esc(e.cancelConfirm) + '</button>' +
      '<button class="btn" data-action="closeCancel" style="height:44px;background:transparent;font-weight:700;font-size:13px">' + esc(e.cancelKeep) + '</button></div>';
  }
  function screenCancelled(o) {
    var e = t3(), d = t(), price = computePrice(o.service, o.weightKg);
    return page3(hdr(e.cancelled) +
      '<div style="background:#101010;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:8px">' +
        '<span class="mono" style="font-size:10.5px;color:#FFD700">' + o.code + ' · ' + esc(e.cancelledOn.toUpperCase()) + '</span>' +
        '<span style="font-weight:700;font-size:15px;color:#fff">' + esc(svcName(o.service)) + ' · ' + esc(o.pickup) + ' → ' + esc(o.dropoff) + '</span>' +
        '<span class="mono" style="font-size:11px;color:rgba(255,255,255,.65)">' + fmtFcfa(price.net) + '</span></div>' +
      '<div style="' + cardStyle + ';padding:14px;display:flex;flex-direction:column;gap:8px">' +
        '<div class="fx jb" style="gap:10px"><span class="mono" style="font-size:10.5px;color:rgba(16,16,16,.55)">' + esc(e.reason.toUpperCase()) + '</span><span style="font-weight:600;font-size:12.5px;text-align:right">' + esc(o.cancelReason || "—") + '</span></div>' +
        '<div style="font-size:12.5px;line-height:1.5;color:rgba(16,16,16,.75)">' + esc(o.refundNote || "") + '</div></div>');
  }

  /* ---------- Aide et litiges ---------- */
  function helpRow(label, sub, action, arg, href) {
    var inner = '<span class="col" style="gap:2px;flex:1"><span style="font-weight:700;font-size:13.5px">' + esc(label) + '</span>' + (sub ? '<span style="font-size:11.5px;color:rgba(16,16,16,.6)">' + esc(sub) + '</span>' : '') + '</span><span aria-hidden="true" style="color:rgba(16,16,16,.3);font-weight:600">→</span>';
    var st = 'gap:11px;text-align:left;border:0;background:transparent;padding:13px 14px;min-height:56px;cursor:pointer;color:#101010;text-decoration:none;width:100%;box-sizing:border-box';
    return href ? '<a class="fx ac" href="' + href + '" style="' + st + '">' + inner + '</a>'
      : '<button class="fx ac" data-action="' + action + '"' + (arg ? ' data-arg="' + arg + '"' : '') + ' style="' + st + '">' + inner + '</button>';
  }
  function screenHelp() {
    var e = t3(), list = state.disputes || [];
    var colors = { open: ["#FFD700", "#101010"], review: ["#101010", "#FFD700"], closed: ["rgba(16,16,16,.07)", "rgba(16,16,16,.55)"] };
    var claims = list.length ? list.map(function (x, i) {
      var c = colors[x.status] || colors.open;
      return '<div class="col" style="gap:6px;padding:12px 14px;' + (i < list.length - 1 ? "border-bottom:1px solid var(--hair)" : "") + '">' +
        '<div class="fx ac" style="gap:8px"><span class="mono" style="font-size:10px;color:rgba(16,16,16,.55)">' + x.code + ' · ' + x.orderCode + '</span>' +
        '<span class="mono" style="margin-left:auto;border-radius:99px;padding:4px 9px;background:' + c[0] + ';color:' + c[1] + ';font-weight:700;font-size:9.5px">' + esc(e.disputeStatus[x.status]) + '</span></div>' +
        '<span style="font-weight:700;font-size:13px">' + esc(x.reason) + '</span>' +
        '<span style="font-size:12px;line-height:1.45;color:rgba(16,16,16,.7)">' + esc(x.desc) + '</span></div>';
    }).join("") : '<div style="padding:14px;font-size:12.5px;color:rgba(16,16,16,.6)">' + esc(e.claimsEmpty) + '</div>';
    return page3(hdr(e.helpTitle) +
      '<div style="' + cardStyle + '">' + helpRow(e.helpChat, e.helpChatSub, "openChatGeneral") + '<div style="height:1px;background:var(--hair)"></div>' +
        helpRow(e.helpReport, e.helpReportSub, "openDispute") + '<div style="height:1px;background:var(--hair)"></div>' +
        helpRow(e.helpCall, "+237 6 00 00 00 00", null, null, "tel:+237600000000") + '</div>' +
      '<div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.helpClaims) + '</div>' +
      '<div style="' + cardStyle + '">' + claims + '</div>');
  }
  function screenDispute() {
    var e = t3(), f = state.disputeForm;
    var orders = state.orders.filter(function (o) { return o.status !== "cancelled"; }).slice(0, 6);
    if (!orders.length) return page3(hdr(e.disputeTitle) + '<div style="' + cardStyle + ';padding:14px;font-size:12.5px;color:rgba(16,16,16,.65)">' + esc(e.disputeNoOrder) + '</div>');
    return page3(hdr(e.disputeTitle) +
      '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.disputeOrder) + '</div>' +
        '<div class="fx wrap" style="gap:7px">' + orders.map(function (o) { return chip(o.code + " · " + svcName(o.service), f.orderId === o.id, "setDisputeOrder", o.id); }).join("") + '</div></div>' +
      '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.disputeReason) + '</div>' +
        '<div class="fx wrap" style="gap:7px">' + e.disputeReasons.map(function (r, i) { return chip(r, f.reason === i, "setDisputeReason", String(i)); }).join("") + '</div></div>' +
      '<div class="col" style="gap:8px"><div style="font-weight:700;font-size:12px;color:rgba(16,16,16,.55)">' + esc(e.disputeDesc) + '</div>' +
        '<textarea data-bind="disputeForm.desc" aria-label="' + esc(e.disputeDesc) + '" placeholder="' + esc(e.disputeDescPh) + '" style="' + cardStyle + ';min-height:96px;padding:12px 14px;font-weight:500;font-size:13px;resize:none">' + esc(f.desc) + '</textarea></div>' +
      '<label class="fx ac" style="gap:11px;' + cardStyle + ';padding:10px 14px;min-height:56px;cursor:pointer">' +
        (f.photo ? '<img src="' + f.photo + '" alt="" width="44" height="44" style="border-radius:9px;object-fit:cover">' : '<span class="sg-ic">' + ICON.pin.replace('M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z', 'M4 7h3l2-2.5h6L17 7h3v12H4z').replace('cy="9.5" r="2.5"', 'cy="12.5" r="3.5"') + '</span>') +
        '<span style="font-weight:700;font-size:13px;flex:1">' + esc(f.photo ? e.disputePhotoOk : e.disputePhoto) + '</span>' +
        '<input type="file" accept="image/*" capture="environment" data-file="dispute" aria-label="' + esc(e.disputePhoto) + '" style="position:absolute;width:1px;height:1px;opacity:0"></label>',
      '<div style="padding:16px 20px 20px"><button class="btn btn-yellow" data-action="sendDispute" style="width:100%">' + esc(e.disputeSend) + '</button></div>');
  }

  /* photo de réclamation : réduite à 640 px pour rester légère */
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || el.getAttribute("data-file") !== "dispute" || !el.files || !el.files[0] || !state.disputeForm) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        state.disputeForm.photo = c.toDataURL("image/jpeg", 0.75); render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(el.files[0]);
  });

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
      html = offlineBar() + '<div class="screen-body">' + (state.authScreen === "otp" ? screenOtp() : state.authScreen === "name" ? screenName() : screenLogin()) + '</div>';
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
        case "addresses": body = screenAddresses(); break;
        case "addrForm": body = screenAddrForm(); break;
        case "paymethods": body = screenPayMethods(); break;
        case "notifs": body = screenNotifs(); break;
        case "help": body = screenHelp(); break;
        case "dispute": body = screenDispute(); break;
        default: body = screenHome();
      }
      var key = state.activeTab + ":" + stack().length + ":" + c.screen + ":" + (state.draft ? state.draft.step : "") + ":" + (c.orderId || "");
      var anim = key !== lastScreenKey ? " fade-in" : ""; lastScreenKey = key;
      html = offlineBar() + '<div class="screen-body' + anim + '">' + body + '</div>' + tabbar();
    }
    if (state.loggedIn && state.cancelFor) html += cancelSheet();
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
        weightKg: 2.5, note: "", vehicle: "bike", payMethod: state.defaultPay || "orange_money"
      };
      push("order");
    },
    pickQuartier: function (el, arg) { var f = state.addrTarget || "dropoff"; state.draft[f] = arg + ", Douala"; state.draft[f + "Geo"] = geoOf(arg); state.suggest = null; render(); },
    pickSaved: function (el, arg) { var a = state.addresses[Number(arg)]; if (!a) return; applyPlace(state.addrTarget || "dropoff", { label: a.text, lat: a.geo.lat, lng: a.geo.lng }); render(); },
    setAddrTarget: function (el, arg) { state.addrTarget = arg; render(); },
    pickSuggest: function (el, arg) {
      var s = state.suggest; if (!s) return; var it = s.items[Number(arg)]; if (!it) return;
      var field = s.field, ob = fobj(field); if (field !== "addr") state.addrTarget = "dropoff";
      if (it.resolve) {
        ob[field] = it.label; ob[field + "Geo"] = null; state.suggest = null; render();
        it.resolve().then(function (geo) { if (ob[field] === it.label) { ob[field + "Geo"] = geo; render(); } }).catch(function () {});
        return;
      }
      applyPlace(field, it); render();
    },
    saveAddress: function (el, arg) {
      var dr = state.draft, geo = dr[arg + "Geo"]; if (!geo || !dr[arg] || isSavedAddr(dr[arg])) return;
      state.addresses.push({ id: "a" + Date.now(), label: dr[arg].split(",")[0], text: dr[arg], geo: geo });
      toast(t().saved);
    },
    useMyLocation: function (el, arg) {
      var d = t(), field = arg === "addr" ? "addr" : "pickup", ob = fobj(field);
      if (!navigator.geolocation) { toast(d.locError); return; }
      ob[field] = d.locating; ob[field + "Geo"] = null; state.suggest = null; render();
      navigator.geolocation.getCurrentPosition(function (pos) {
        var g = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        ob[field + "Geo"] = g; ob[field] = d.myPosition; render();
        WGeo.reverse(g.lat, g.lng).then(function (label) { if (label && ob[field + "Geo"] === g) { ob[field] = label; render(); } }).catch(function () {});
      }, function () { ob[field] = ""; render(); toast(d.locError); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
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
        var st0 = stack(); state.tabStacks[state.activeTab] = [st0[0], { screen: "track", orderId: id }]; try { history.pushState({ wg: 2 }, ""); } catch (e) {} render();
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
    openScreen: function (el, arg) { push(arg); },
    newAddress: function () { state.addrForm = { label: t3().addrLabels[0], addr: "", addrGeo: null }; state.suggest = null; push("addrForm"); },
    setAddrLabel: function (el, arg) { state.addrForm.label = arg; render(); },
    saveAddrForm: function () {
      var e = t3(), f = state.addrForm;
      if (!f.addrGeo || !f.addr) { toast(e.addrNeedGeo); return; }
      state.addresses.push({ id: "a" + Date.now(), label: (f.label || f.addr.split(",")[0]).trim(), text: f.addr, geo: f.addrGeo });
      state.addrForm = null; state.suggest = null; popScreen(); toast(t().saved);
    },
    deleteAddress: function (el, arg) { state.addresses.splice(Number(arg), 1); toast(t3().addrDeleted); },
    setDefaultPay: function (el, arg) { state.defaultPay = arg; render(); },
    openPayForm: function () { state.payForm = { op: "orange_money", number: "" }; render(); },
    setPayFormOp: function (el, arg) { state.payForm.op = arg; render(); },
    savePayAccount: function () {
      var f = state.payForm, digits = (f.number || "").replace(/\D/g, "");
      if (!/^6\d{8}$/.test(digits)) { toast(t3().payInvalid); return; }
      var pretty = digits.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
      state.payAccounts = (state.payAccounts || []).filter(function (a) { return a.op !== f.op; });
      state.payAccounts.push({ op: f.op, number: pretty });
      state.payForm = null; toast(t3().payAdded);
    },
    removeAccount: function (el, arg) {
      state.payAccounts = (state.payAccounts || []).filter(function (a) { return a.op !== arg; });
      if (state.defaultPay === arg) state.defaultPay = "wallet";
      toast(t3().payRemoved);
    },
    toggleNotif: function (el, arg) {
      var n = state.notifPrefs, e = t3();
      if (arg !== "push") { n[arg] = !n[arg]; render(); return; }
      if (n.push) { n.push = false; render(); return; }
      if (!window.Notification) { toast(e.notifDenied); return; }
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") { n.push = false; render(); toast(e.notifDenied); return; }
        n.push = true; render(); toast(e.notifOn);
        if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("WunaGo", { body: e.notifTest, icon: "icons/icon-192.png", badge: "icons/icon-192.png" }); }).catch(function () {});
      });
    },
    askCancel: function (el, arg) { state.cancelFor = { orderId: arg, reason: null }; render(); },
    closeCancel: function () { state.cancelFor = null; render(); },
    pickCancelReason: function (el, arg) { state.cancelFor.reason = Number(arg); render(); },
    confirmCancel: function () {
      var e = t3(), c = state.cancelFor; if (!c || c.reason == null) return;
      var o = findOrder(c.orderId); if (!o || o.stage > 0) { state.cancelFor = null; render(); return; }
      var price = computePrice(o.service, o.weightKg);
      o.status = "cancelled"; o.cancelledAt = Date.now(); o.cancelReason = e.cancelReasons[c.reason];
      if (o.paymentMethod === "wallet") { state.wallet.balance += price.net; o.refundNote = e.refundWallet; }
      else if (o.paymentMethod === "orange_money" || o.paymentMethod === "mtn_momo" || o.paymentMethod === "card") o.refundNote = e.refundMomo;
      else o.refundNote = e.refundNone;
      state.cancelFor = null; toast(e.cancelled + " · " + o.refundNote);
    },
    openDispute: function (el, arg) {
      var first = state.orders.filter(function (o) { return o.status !== "cancelled"; })[0];
      state.disputeForm = { orderId: arg || (first && first.id) || null, reason: null, desc: "", photo: null };
      if (state.activeTab !== "wallet" && !arg) { state.activeTab = "wallet"; }
      push("dispute");
    },
    setDisputeOrder: function (el, arg) { state.disputeForm.orderId = arg; render(); },
    setDisputeReason: function (el, arg) { state.disputeForm.reason = Number(arg); render(); },
    sendDispute: function () {
      var e = t3(), f = state.disputeForm, o = findOrder(f.orderId);
      if (!o || f.reason == null || (f.desc || "").trim().length < 5) { toast(e.disputeNeed); return; }
      var n = (state.disputes || []).length + 1;
      var x = { id: "l" + Date.now(), code: "LIT-" + new Date().getFullYear() + "-" + String(n).padStart(3, "0"), orderId: o.id, orderCode: o.code,
        reason: e.disputeReasons[f.reason], desc: f.desc.trim(), photo: f.photo, status: "open", createdAt: Date.now() };
      state.disputes.unshift(x);
      var msgs = state.chatByOrder.general || (state.chatByOrder.general = [{ from: "bot", text: t().botGreet }]);
      msgs.push({ from: "bot", text: e.disputeChat.replace("{code}", x.code).replace("{order}", o.code).replace("{reason}", x.reason) });
      state.disputeForm = null;
      var s = stack(); s.pop();
      if (!s.length || s[s.length - 1].screen !== "help") { state.activeTab = "wallet"; state.tabStacks.wallet = [{ screen: "wallet" }, { screen: "help" }]; }
      toast(e.disputeSent);
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
    else if (bind === "nameInput") state.nameInput = el.value;
    else if (bind === "addrForm.addr") { state.addrForm.addr = el.value; state.addrForm.addrGeo = null; suggest("addr", el.value); }
    else if (bind === "addrForm.label") state.addrForm.label = el.value;
    else if (bind === "payForm.number") state.payForm.number = el.value.replace(/[^\d ]/g, "");
    else if (bind === "disputeForm.desc") state.disputeForm.desc = el.value;
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

  /* ============================== mode serveur (API WunaGo) ============================== */
  /* Si l'API répond, comptes, commandes, portefeuille et réclamations sont enregistrés sur le serveur.
     Sinon, l'app garde le mode local (démo) d'origine. */
  var NAME_STR = { fr: { title: "Comment vous appelle-t-on ?", sub: "Votre prénom et votre nom, pour le livreur et le service client.", ph: "Ex. Ariane Ngono", go: "Continuer", need: "Indiquez au moins 2 lettres." },
                   en: { title: "What's your name?", sub: "First and last name, for the courier and support.", ph: "e.g. Ariane Ngono", go: "Continue", need: "Enter at least 2 letters." } };
  function srv() { return !!(window.WAPI && WAPI.status.on); }
  function errToast(e) { toast((e && e.message) || "Erreur."); }
  function prettyPhone(p) { return String(p || "").replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5"); }
  var PREF_FIELDS = ["addresses", "payAccounts", "defaultPay", "notifPrefs"];
  var lastPrefs = null, prefsTimer = null;
  function prefsSnapshot() { var o = {}; PREF_FIELDS.forEach(function (k) { o[k] = state[k]; }); o.lang = state.lang; o.settings = state.settings; return JSON.stringify(o); }
  function applyUser(u) {
    var name = u.name || "";
    state.user = { id: u.id, name: name || (state.lang === "en" ? "WunaGo customer" : "Client WunaGo"), initials: initials(name || "W G") };
    state.phone = prettyPhone(u.phone);
    state.wallet = { balance: u.wallet.balance };
    var p = u.prefs || {};
    PREF_FIELDS.forEach(function (k) { if (p[k] !== undefined) state[k] = p[k]; });
    if (p.settings) state.settings = Object.assign({}, state.settings, p.settings);
    if (p.lang) { state.lang = p.lang; document.documentElement.lang = p.lang; }
    lastPrefs = prefsSnapshot();
  }
  function replaceOrder(o) {
    for (var i = 0; i < state.orders.length; i++) if (state.orders[i].id === o.id) { state.orders[i] = o; return; }
    state.orders.unshift(o);
  }
  function syncAll() {
    return Promise.all([WAPI.get("/me"), WAPI.get("/orders"), WAPI.get("/disputes")]).then(function (r) {
      applyUser(r[0].user); state.orders = r[1].orders; state.disputes = r[2].disputes; render();
    }).catch(function (e) { if (e.status === 401) forceLogin(); });
  }
  function resetAccountState() {
    state.orders = []; state.disputes = []; state.addresses = []; state.chatByOrder = {}; state.draft = null;
    state.payAccounts = []; state.defaultPay = "orange_money"; state.notifPrefs = { orders: true, sms: true, push: false, promos: true };
    state.tabStacks = { home: [{ screen: "home" }], orders: [{ screen: "history" }], wallet: [{ screen: "wallet" }], support: [{ screen: "chat" }] };
    state.activeTab = "home";
  }
  function forceLogin() {
    WAPI.setToken(null); state.loggedIn = false; state.authScreen = "login"; state.otpInput = ""; state.generatedOtp = null;
    resetAccountState(); render();
  }
  function enterApp() {
    state.loggedIn = true; state.authScreen = "login"; state.otpInput = ""; state.generatedOtp = null;
    resetAccountState(); render(); syncAll();
  }

  function screenName() {
    var s = NAME_STR[state.lang] || NAME_STR.fr;
    return '<div class="col fill" style="background:#FFD700;padding:calc(30px + var(--sat)) 26px 40px;justify-content:space-between">' +
      '<div class="col" style="gap:14px"><div class="brand-row"><svg width="26" height="33" viewBox="0 0 60 76" aria-hidden="true"><path d="M30 4C14.5 4 4 15.4 4 29.5C4 47 30 72 30 72C30 72 56 47 56 29.5C56 15.4 45.5 4 30 4Z" fill="#101010"/><rect x="20" y="20" width="20" height="20" rx="3" fill="#FFD700"/></svg><span class="brand-name">WunaGo</span></div>' +
      '<h1 style="margin:10px 0 0;font-weight:800;font-size:28px;line-height:1.1;letter-spacing:-1px">' + esc(s.title) + '</h1>' +
      '<p style="margin:0;font-weight:500;font-size:14px;line-height:1.5;color:rgba(16,16,16,.75)">' + esc(s.sub) + '</p></div>' +
      '<div class="col" style="gap:11px"><input data-bind="nameInput" autocomplete="name" aria-label="' + esc(s.ph) + '" placeholder="' + esc(s.ph) + '" value="' + esc(state.nameInput || "") + '" style="background:#fff;border-radius:16px;padding:0 15px;height:54px;font-weight:600;font-size:15px" />' +
      '<button class="btn btn-ink" data-action="saveName">' + esc(s.go) + '</button></div></div>';
  }

  var base = {};
  ["requestOtp", "resendOtp", "otpKey", "confirmPay", "advanceOrder", "rate", "doTopUp", "doSend", "logOut", "confirmCancel", "sendDispute"].forEach(function (k) { base[k] = actions[k]; });

  actions.requestOtp = function () {
    if (!srv()) return base.requestOtp();
    WAPI.post("/auth/request", { phone: state.phone }).then(function (r) {
      state.generatedOtp = r.demoCode || null; state.otpInput = ""; state.authScreen = "otp"; render();
    }).catch(errToast);
  };
  actions.resendOtp = function () {
    if (!srv()) return base.resendOtp();
    WAPI.post("/auth/request", { phone: state.phone }).then(function (r) {
      state.generatedOtp = r.demoCode || null; state.otpInput = ""; toast(state.lang === "en" ? "New code sent" : "Nouveau code envoyé"); render();
    }).catch(errToast);
  };
  actions.otpKey = function (el, arg) {
    if (!srv()) return base.otpKey(el, arg);
    if (arg === "back") { state.otpInput = state.otpInput.slice(0, -1); render(); return; }
    if (state.otpInput.length >= 4 || state.verifying) return;
    state.otpInput += arg; render();
    if (state.otpInput.length < 4) return;
    state.verifying = true;
    WAPI.post("/auth/verify", { phone: state.phone, code: state.otpInput }).then(function (r) {
      state.verifying = false; WAPI.setToken(r.token);
      if (!r.user.name) { state.authScreen = "name"; state.nameInput = ""; render(); return; }
      enterApp();
    }).catch(function (e) { state.verifying = false; state.otpInput = ""; render(); errToast(e); });
  };
  actions.saveName = function () {
    var s = NAME_STR[state.lang] || NAME_STR.fr, name = (state.nameInput || "").trim();
    if (name.length < 2) { toast(s.need); return; }
    WAPI.patch("/me", { name: name }).then(function () { enterApp(); }).catch(errToast);
  };
  actions.confirmPay = function () {
    if (!srv()) return base.confirmPay();
    var draft = state.draft; if (state.payPending) return;
    state.payPending = true; render();
    WAPI.post("/orders", { service: draft.service, pickup: draft.pickup, dropoff: draft.dropoff, pickupGeo: draft.pickupGeo || geoOf(draft.pickup),
      dropoffGeo: draft.dropoffGeo || geoOf(draft.dropoff), weightKg: draft.weightKg, vehicle: draft.vehicle, note: draft.note, paymentMethod: draft.payMethod })
      .then(function (r) {
        state.payPending = false; state.wallet.balance = r.wallet.balance; replaceOrder(r.order);
        var st0 = stack(); state.tabStacks[state.activeTab] = [st0[0], { screen: "track", orderId: r.order.id }];
        try { history.pushState({ wg: 2 }, ""); } catch (e) {} render();
      }).catch(function (e) { state.payPending = false; render(); errToast(e); });
  };
  actions.advanceOrder = function (el, arg) {
    if (!srv()) return base.advanceOrder(el, arg);
    if (state.busy) return; state.busy = true;
    WAPI.post("/orders/" + arg + "/advance").then(function (r) {
      state.busy = false; replaceOrder(r.order);
      if (r.order.proofAt) replaceTop("proof", { orderId: r.order.id }); else render();
    }).catch(function (e) { state.busy = false; errToast(e); });
  };
  actions.rate = function (el, arg) {
    if (!srv()) return base.rate(el, arg);
    var parts = arg.split("|"), o = findOrder(parts[0]); o.rating = Number(parts[1]); render();
    WAPI.post("/orders/" + parts[0] + "/rate", { rating: Number(parts[1]) }).catch(errToast);
  };
  actions.doTopUp = function () {
    if (!srv()) return base.doTopUp();
    WAPI.post("/wallet/topup", { amount: Number(state.topUpAmount), method: state.topUpMethod }).then(function (r) {
      state.wallet.balance = r.wallet.balance; state.walletPanel = null; toast(t().toastTopUp);
    }).catch(errToast);
  };
  actions.doSend = function () {
    if (!srv()) return base.doSend();
    WAPI.post("/wallet/send", { amount: Number(state.topUpAmount), phone: state.sendPhone }).then(function (r) {
      state.wallet.balance = r.wallet.balance; state.walletPanel = null; toast(t().toastSent);
    }).catch(errToast);
  };
  actions.confirmCancel = function () {
    if (!srv()) return base.confirmCancel();
    var e = t3(), c = state.cancelFor; if (!c || c.reason == null) return;
    WAPI.post("/orders/" + c.orderId + "/cancel", { reason: e.cancelReasons[c.reason] }).then(function (r) {
      replaceOrder(r.order); state.wallet.balance = r.wallet.balance; state.cancelFor = null;
      toast(e.cancelled + " · " + r.order.refundNote);
    }).catch(function (err) { state.cancelFor = null; render(); errToast(err); });
  };
  actions.sendDispute = function () {
    if (!srv()) return base.sendDispute();
    var e = t3(), f = state.disputeForm;
    if (!f.orderId || f.reason == null || (f.desc || "").trim().length < 5) { toast(e.disputeNeed); return; }
    WAPI.post("/disputes", { orderId: f.orderId, reason: e.disputeReasons[f.reason], desc: f.desc, photo: f.photo }).then(function (r) {
      var x = r.dispute; state.disputes.unshift(x);
      var msgs = state.chatByOrder.general || (state.chatByOrder.general = [{ from: "bot", text: t().botGreet }]);
      msgs.push({ from: "bot", text: e.disputeChat.replace("{code}", x.code).replace("{order}", x.orderCode).replace("{reason}", x.reason) });
      state.disputeForm = null;
      var s = stack(); s.pop();
      if (!s.length || s[s.length - 1].screen !== "help") { state.activeTab = "wallet"; state.tabStacks.wallet = [{ screen: "wallet" }, { screen: "help" }]; }
      toast(e.disputeSent);
    }).catch(errToast);
  };
  actions.logOut = function () {
    if (!srv()) return base.logOut();
    WAPI.post("/auth/logout").catch(function () {});
    WAPI.setToken(null); resetAccountState(); base.logOut();
  };

  /* préférences (adresses, numéros, notifications, langue) enregistrées sur le serveur */
  function syncPrefs() {
    if (!srv() || !state.loggedIn || !WAPI.token() || lastPrefs === null) return;
    var snap = prefsSnapshot(); if (snap === lastPrefs) return;
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(function () {
      var o = JSON.parse(snap); lastPrefs = snap;
      WAPI.patch("/me", { prefs: o }).catch(function (e) { if (e.status === 401) forceLogin(); else lastPrefs = null; });
    }, 800);
  }

  /* suivi : la commande affichée est relue toutes les 5 secondes */
  setInterval(function () {
    if (!srv() || !state.loggedIn || document.hidden) return;
    var c = cur(); if (c.screen !== "track" || !c.orderId) return;
    WAPI.get("/orders/" + c.orderId).then(function (r) {
      var old = findOrder(r.order.id);
      if (!old || old.status !== r.order.status || old.stage !== r.order.stage) { replaceOrder(r.order); render(); }
    }).catch(function () {});
  }, 5000);

  /* Persistance locale (cache de l'app ; en mode serveur, le serveur fait foi) */
  var KEEP = ["lang", "loggedIn", "phone", "user", "wallet", "settings", "orders", "seq", "chatByOrder", "addresses", "payAccounts", "defaultPay", "notifPrefs", "disputes"];
  function save() {
    try { var o = {}; KEEP.forEach(function (k) { o[k] = state[k]; }); localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {}
    syncPrefs();
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

  if (window.WAPI && location.protocol !== "file:") WAPI.check().then(function (on) {
    if (!on) return;
    if (WAPI.token()) { if (state.loggedIn) syncAll(); else forceLogin(); }
    else if (state.loggedIn) forceLogin(); /* données de démo locales : on passe au vrai compte */
  });

})();

