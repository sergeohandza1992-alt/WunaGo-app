/* WunaGo — backoffice (service client, suivi des commandes, livreurs, réclamations).
   Même API que l'app ; accès réservé aux numéros listés dans ADMIN_PHONES (Netlify). */
(function () {
  "use strict";
  var root = document.getElementById("admin");
  var S = {
    me: null, view: "dash", login: { phone: "", code: "", step: "phone", demoCode: null },
    stats: null, orders: [], orderFilter: "", orderQ: "", couriers: [], disputes: [], clients: [], clientQ: "",
    convs: [], convId: null, msgs: {}, draft: "", drawer: null, toast: null
  };
  var SVC = { parcel: "Colis", laundry: "Pressing", errand: "Courses", ride: "Déplacement" };
  var STATUS = { received: "Reçue", picked_up: "Prise en charge", en_route: "En route", delivered: "Livrée", cancelled: "Annulée" };
  var VEH = { bike: "Moto", tricycle: "Tricycle", van: "Camionnette", car: "Voiture" };
  var PAY = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wallet: "Portefeuille", cash: "Espèces", card: "Carte" };
  var DSTATUS = { open: "OUVERTE", review: "EN COURS", closed: "RÉSOLUE" };
  var REASONS = { damaged: "Colis endommagé", missing: "Article manquant", late: "Retard important", courier: "Comportement du livreur", payment: "Problème de paiement", other: "Autre" };

  function geoKm(a, b) { var R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x)) * 1.35; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function F(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F"; }
  function phone(p) { return p ? "+237 " + String(p).replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5") : "—"; }
  function when(ms) {
    if (!ms) return "—";
    var d = new Date(ms), today = new Date().toDateString() === d.toDateString();
    return (today ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " ") + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "à l'instant" : m < 60 ? "il y a " + m + " min" : when(ms); }
  function statusPill(s) { return '<span class="pill ' + (s === "received" ? "y" : s === "delivered" ? "" : s === "cancelled" ? "r" : "k") + '">' + esc((STATUS[s] || s).toUpperCase()) + '</span>'; }
  function toast(t) { S.toast = t; render(); setTimeout(function () { S.toast = null; render(); }, 2200); }
  function err(e) { toast((e && e.message) || "Erreur."); }

  /* ---------- connexion ---------- */
  function viewLogin() {
    var L = S.login;
    return '<div class="login"><div class="card">' +
      '<div class="brand" style="padding:0;color:var(--ink)">WunaGo <small style="color:rgba(16,16,16,.6)">BACKOFFICE</small></div>' +
      '<p style="margin:0;color:rgba(16,16,16,.7);line-height:1.5">Espace réservé à l\'équipe WunaGo : service client, suivi des commandes, livreurs et réclamations.</p>' +
      (L.step === "phone"
        ? '<label class="lbl" for="lp">Numéro de téléphone</label><input class="f mono" id="lp" data-k="login.phone" inputmode="numeric" placeholder="6 99 12 34 56" value="' + esc(L.phone) + '">' +
          '<button class="btn btn-ink" data-a="sendCode">Recevoir le code</button>'
        : '<label class="lbl" for="lc">Code reçu par SMS</label><input class="f mono" id="lc" data-k="login.code" inputmode="numeric" maxlength="6" placeholder="123456" value="' + esc(L.code) + '">' +
          (L.demoCode ? '<div class="pill y" style="align-self:flex-start">MODE DÉMO · CODE ' + esc(L.demoCode) + '</div>' : '') +
          '<button class="btn btn-ink" data-a="verify">Se connecter</button><button class="btn btn-ghost" data-a="restart">Changer de numéro</button>') +
      '</div></div>';
  }
  function viewDenied() {
    return '<div class="login"><div class="card"><div class="brand" style="padding:0">WunaGo</div>' +
      '<p style="margin:0;line-height:1.5">Ce compte (' + esc(phone(S.me.phone)) + ') n\'a pas accès au backoffice. Demandez à être ajouté à la liste des administrateurs.</p>' +
      '<button class="btn btn-ink" data-a="logout">Se déconnecter</button><a class="btn btn-ghost" href="/" style="text-decoration:none">Ouvrir l\'app client</a></div></div>';
  }

  /* ---------- vues ---------- */
  var NAV = [["dash", "Tableau de bord"], ["orders", "Commandes"], ["couriers", "Livreurs"], ["disputes", "Réclamations"], ["messages", "Messages"], ["clients", "Clients"]];
  function counts() {
    var st = S.stats || {};
    return { orders: st.unassigned || 0, disputes: st.open_disputes || 0, couriers: st.couriers_online || 0,
      messages: S.convs.reduce(function (s, c) { return s + (c.unread || 0); }, 0) };
  }
  function lateBanner() {
    var n = (S.stats || {}).late || 0;
    document.title = (n ? "(" + n + ") " : "") + "WunaGo — Backoffice";
    if (!n) return "";
    return '<div class="late" role="alert"><b>⚠ ' + n + ' commande' + (n > 1 ? 's attendent' : ' attend') + ' un livreur depuis plus de 10 minutes.</b>' +
      '<button class="btn btn-sm btn-ink" data-a="orderFilter" data-v="unassigned">Assigner maintenant</button></div>';
  }
  function shell(inner) {
    var c = counts();
    return '<div class="shell"><nav class="side" aria-label="Sections">' +
      '<div class="brand"><svg width="22" height="28" viewBox="0 0 60 76" aria-hidden="true"><path d="M30 4C14.5 4 4 15.4 4 29.5C4 47 30 72 30 72C30 72 56 47 56 29.5C56 15.4 45.5 4 30 4Z" fill="#FFD700"/><rect x="20" y="20" width="20" height="20" rx="3" fill="#101010"/></svg><span>WunaGo<br><small>BACKOFFICE</small></span></div>' +
      NAV.map(function (n) { var k = c[n[0]]; return '<button class="' + (S.view === n[0] || (S.view === "courier" && n[0] === "couriers") ? "on" : "") + '" data-a="nav" data-v="' + n[0] + '">' + n[1] + (k ? '<span class="count">' + k + '</span>' : '') + '</button>'; }).join("") +
      '<div class="foot"><span class="mono" style="font-size:10px;opacity:.6">Version 21 · 18/11/2026</span><span>' + esc(S.me.name || "Administrateur") + '<br><span class="mono">' + esc(phone(S.me.phone)) + '</span></span><button class="btn btn-sm btn-ghost" style="background:rgba(255,255,255,.1);color:#fff" data-a="logout">Se déconnecter</button></div>' +
      '</nav><main>' + lateBanner() + inner + '</main></div>';
  }
  function kpi(label, value, dark) { return '<div class="card kpi' + (dark ? " dark" : "") + '"><span class="lbl">' + label + '</span><b>' + value + '</b></div>'; }
  function dayKey(ms) { return new Date(ms + 3600000).toISOString().slice(0, 10); }
  function dayTitle(k) { var l = new Date(k + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); return l.charAt(0).toUpperCase() + l.slice(1); }
  function ordersTable(list, compact, grouped) {
    if (!list.length) return '<div class="card empty">Aucune commande.</div>';
    var cols = compact ? 7 : 8, last = null, totals = {};
    if (grouped) list.forEach(function (o) { var k = dayKey(o.createdAt), t = totals[k] || (totals[k] = { n: 0, v: 0 }); t.n++; if (o.status !== "cancelled") t.v += o.price.net; });
    return '<div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Code</th><th class="lbl">Service</th><th class="lbl">Client</th><th class="lbl">Trajet</th>' +
      (compact ? '' : '<th class="lbl">Montant</th>') + '<th class="lbl">Livreur</th><th class="lbl">Statut</th><th class="lbl">' + (grouped ? "Heure" : "Créée") + '</th></tr></thead><tbody>' +
      list.map(function (o) {
        var k = dayKey(o.createdAt), sep = "";
        if (grouped && k !== last) { last = k; sep = '<tr class="dayrow"><td colspan="' + cols + '"><b>' + esc(dayTitle(k)) + '</b><span class="mono">' + totals[k].n + ' cmd · ' + F(totals[k].v) + '</span></td></tr>'; }
        return sep + '<tr class="click" data-a="openOrder" data-v="' + o.id + '"><td class="mono">' + esc(o.code) + '</td><td>' + esc(SVC[o.service]) + '</td><td>' + esc(o.client ? o.client.name || phone(o.client.phone) : "") + '</td>' +
          '<td>' + esc(o.pickup) + (o.dropoff !== o.pickup ? ' → ' + esc(o.dropoff) : '') + '</td>' + (compact ? '' : '<td class="mono">' + F(o.price.net) + '<br><span style="font-size:10px;color:rgba(16,16,16,.55)">' + esc(PAY[o.paymentMethod] || "") + '</span></td>') +
          '<td>' + (o.courier ? esc(o.courier.name) : (o.status === "received" ? '<button class="btn btn-sm btn-yellow" data-a="quickAssign" data-v="' + o.id + '">Assigner</button>' : '—')) + '</td><td>' + statusPill(o.status) + '</td><td class="mono">' + (grouped ? new Date(o.createdAt + 3600000).toISOString().slice(11, 16) : when(o.createdAt)) + '</td></tr>';
      }).join("") + '</tbody></table></div>' + (grouped && Object.keys(totals).length ? '<p class="note" style="margin-top:6px">Totaux par jour calculés sur les commandes affichées.</p>' : '');
  }
  /* ---------- tableau de bord : période, rapports ---------- */
  function ymd(d) { return new Date(d.getTime() + 3600000).toISOString().slice(0, 10); } /* date à Douala (UTC+1) */
  function periodOf(preset) {
    var now = new Date(), today = ymd(now), d0 = new Date(today + "T00:00:00Z");
    var back = function (n) { return ymd(new Date(d0.getTime() - n * 86400000 - 3600000)); };
    if (preset === "yesterday") return { from: back(1), to: back(1) };
    if (preset === "7") return { from: back(6), to: today };
    if (preset === "30") return { from: back(29), to: today };
    if (preset === "month") return { from: today.slice(0, 8) + "01", to: today };
    if (preset === "lastmonth") { var f = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - 1, 1)), l = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 0));
      return { from: f.toISOString().slice(0, 10), to: l.toISOString().slice(0, 10) }; }
    if (preset === "year") return { from: today.slice(0, 5) + "01-01", to: today };
    return { from: today, to: today };
  }
  S.period = Object.assign({ preset: "today" }, periodOf("today"));
  S.report = null; S.reportBusy = false;
  var PRESETS = [["today", "Aujourd'hui"], ["yesterday", "Hier"], ["7", "7 jours"], ["30", "30 jours"], ["month", "Ce mois"], ["lastmonth", "Mois dernier"], ["year", "Cette année"]];
  var ZONES = { 0: "Non précisée", 1: "Centre", 2: "Intermédiaire", 3: "Périphérie" };
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function fmtPct(x) { return String(x).replace(".", ",") + " %"; }
  function evol(cur, prev) {
    if (!prev) return cur ? '<span class="pill y">NOUVEAU</span>' : '';
    var p = Math.round((cur - prev) / prev * 100);
    return '<span class="pill ' + (p >= 0 ? "k" : "r") + '">' + (p >= 0 ? "▲ +" : "▼ ") + p + ' % vs période préc.</span>';
  }
  function mins(m) { if (m == null) return "—"; m = Math.round(m); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); }
  function card(title, inner, extra) { return '<section class="card rep"' + (extra || "") + '><h2>' + title + '</h2>' + inner + '</section>'; }
  /* barres horizontales : une seule mesure, une seule couleur, valeur écrite à côté */
  function hbars(rows, label, value, fmt) {
    var max = Math.max.apply(null, rows.map(value).concat([1]));
    if (!rows.length) return '<div class="empty">Aucune donnée sur la période.</div>';
    return '<div class="hbars">' + rows.map(function (r) {
      var v = value(r);
      return '<div class="hb" title="' + esc(label(r) + " : " + fmt(v)) + '"><span class="hb-l">' + esc(label(r)) + '</span><span class="hb-t"><span class="hb-b" style="width:' + Math.max(v > 0 ? 2 : 0, v / max * 100).toFixed(1) + '%"></span></span><span class="hb-v mono">' + fmt(v) + '</span></div>';
    }).join("") + '</div>';
  }
  /* colonnes : évolution dans le temps (une mesure), infobulle au survol */
  function columns(rows, label, value, fmt, tip) {
    if (!rows.length) return '<div class="empty">Aucune donnée.</div>';
    var max = Math.max.apply(null, rows.map(value).concat([1])), every = Math.ceil(rows.length / 12);
    return '<div class="cols" role="img" aria-label="Graphique en colonnes">' + rows.map(function (r, i) {
      var v = value(r);
      return '<div class="col-w" tabindex="0"><div class="col-tip">' + tip(r) + '</div><div class="col-b" style="height:' + (v ? Math.max(2, v / max * 100) : 0).toFixed(1) + '%"></div>' +
        '<span class="col-x mono">' + (i % every === 0 ? esc(label(r)) : "") + '</span></div>';
    }).join("") + '</div><div class="mono" style="font-size:10px;color:rgba(16,16,16,.55);margin-top:6px">Maximum : ' + fmt(max) + '</div>';
  }
  function table(head, rows) {
    if (!rows.length) return '<div class="empty">Aucune donnée sur la période.</div>';
    return '<div style="overflow:auto"><table class="rt"><thead><tr>' + head.map(function (h, i) { return '<th class="lbl"' + (i ? ' style="text-align:right"' : '') + '>' + h + '</th>'; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="mono" style="text-align:right"' : '') + '>' + c + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
  }
  function dayLabel(k) { var p = k.split("-"); return p[2] + "/" + p[1]; }
  function viewDash() {
    var s = S.stats || {}, r = S.report, P = S.period;
    var live = S.orders.filter(function (o) { return ["received", "picked_up", "en_route"].indexOf(o.status) >= 0; });
    var head = '<h1>Tableau de bord</h1>' +
      '<div class="tools">' + PRESETS.map(function (p) { return '<button class="chip ' + (P.preset === p[0] ? "on" : "") + '" data-a="preset" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join("") +
        '<span class="fx-dates"><label class="lbl" for="pf">Du</label><input class="f mono" type="date" id="pf" data-k="period.from" value="' + P.from + '"><label class="lbl" for="pt">au</label><input class="f mono" type="date" id="pt" data-k="period.to" value="' + P.to + '">' +
        '<button class="btn btn-sm btn-ink" data-a="customPeriod">Appliquer</button></span>' +
        '<button class="btn btn-sm btn-yellow" data-a="exportCsv" style="margin-left:auto">Exporter les commandes (Excel)</button></div>';
    /* temps réel */
    var ops = '<div class="kpis">' +
      kpiA("En cours maintenant", s.in_progress || 0, "orderFilter", "active") +
      kpiA("À assigner", s.unassigned || 0, "orderFilter", "unassigned", (s.unassigned ? " warn" : "")) +
      kpiA("Livreurs en ligne", (s.couriers_online || 0) + " / " + (s.couriers || 0), "nav", "couriers") +
      kpiA("Réclamations ouvertes", s.open_disputes || 0, "nav", "disputes", (s.open_disputes ? " warn" : "")) +
      kpiA("Messages non lus", counts().messages, "nav", "messages", (counts().messages ? " warn" : "")) +
      kpiA("Envois par lien en attente", s.links_waiting || 0, "showLinks", "") + '</div>' + linksTable();
    if (!r) return shell(head + '<h2 class="sec">Opérations en direct</h2>' + ops + '<div class="card empty">' + (S.reportBusy ? "Calcul des rapports…" : "Rapports indisponibles.") + '</div>');
    var t = r.totals, valid = t.orders - t.cancelled;
    var kpis = '<div class="kpis">' +
      kpiB("CA WunaGo", F(t.revenue), evol(t.revenue, r.previous.revenue), true) +
      kpiB("Commandes", t.orders, t.delivered + " livrées · " + t.cancelled + " annulées · " + t.in_progress + " en cours") +
      kpiB("Panier moyen", F(t.basket), "hors avances d'achats") +
      kpiB("Marge brute", F(t.margin), "CA livré " + F(t.revenue_delivered) + " − part livreurs " + F(t.courier_pay)) +
      kpiB("Encaissé", F(t.collected), "À encaisser (espèces) : " + F(t.to_collect)) +
      kpiB("Taux d'annulation", fmtPct(pct(t.cancelled, t.orders)), t.cancelled + " commande(s)") +
      kpiB("Note moyenne", t.rating ? String(t.rating).replace(".", ",") + " / 5" : "—", t.ratings + " avis") +
      kpiB("Clients actifs", t.active_clients, t.new_clients + " nouveaux · " + t.repeat_clients + " ont recommandé") +
      kpiB("Volume payé par les clients", F(t.volume), "dont avances d'achats : " + F(t.articles)) +
      kpiB("Remises accordées", F(t.discounts), "kilo offert, collecte offerte") +
      kpiB("Délai moyen d'assignation", mins(r.timing.to_assign), r.timing.late_unassigned ? r.timing.late_unassigned + " commande(s) en attente > 15 min" : "aucune commande en retard") +
      kpiB("Délai moyen de livraison", mins(r.timing.to_deliver), "de la commande à la remise · " + String(Math.round(t.km)).replace(".", ",") + " km livrés") +
      '</div>';
    var payTotal = r.byPayment.reduce(function (a, x) { return a + x.volume; }, 0);
    var pay = card("Chiffre d'affaires par canal de paiement",
      hbars(r.byPayment, function (x) { return PAY[x.key] || x.key; }, function (x) { return x.volume; }, F) +
      table(["Canal", "Commandes", "Montant payé", "Part", "CA WunaGo", "Encaissé", "En attente"], r.byPayment.map(function (x) {
        return [esc(PAY[x.key] || x.key), x.orders, F(x.volume), fmtPct(pct(x.volume, payTotal)), F(x.revenue), F(x.collected), x.pending ? '<b>' + F(x.pending) + '</b>' : F(0)];
      })));
    var svc = card("Chiffre d'affaires par service",
      hbars(r.byService, function (x) { return SVC[x.key]; }, function (x) { return x.revenue; }, F) +
      table(["Service", "Commandes", "Livrées", "Annulées", "CA", "Panier moyen"], r.byService.map(function (x) {
        return [esc(SVC[x.key]), x.orders, x.delivered, x.cancelled, F(x.revenue), x.basket ? F(x.basket) : "—"];
      })));
    var days = card("Évolution du chiffre d'affaires", columns(r.byDay, function (x) { return dayLabel(x.key); }, function (x) { return x.revenue; }, F,
      function (x) { return '<b>' + dayLabel(x.key) + '</b><br>' + F(x.revenue) + '<br>' + x.orders + ' cmd · ' + x.cancelled + ' annulée(s)'; }));
    var hours = card("Commandes par heure", columns(r.byHour, function (x) { return x.key + "h"; }, function (x) { return x.orders; }, function (v) { return v + " cmd"; },
      function (x) { return '<b>' + x.key + ' h – ' + (x.key + 1) + ' h</b><br>' + x.orders + ' commande(s)'; }) +
      '<p class="note">Heures de pointe tarifées : 7 h–9 h 30 et 16 h 30–19 h 30 (+15 %), soirée 20 h 30–22 h (+20 %).</p>');
    var zones = card("Par zone de livraison", table(["Zone", "Commandes", "CA", "Distance moy."], r.byZone.map(function (x) {
      return [esc(ZONES[x.key] || "Zone " + x.key), x.orders, F(x.revenue), x.km == null ? "—" : String(x.km).replace(".", ",") + " km"];
    })));
    var quart = card("Quartiers de départ les plus actifs", hbars(r.quartiers, function (x) { return x.key; }, function (x) { return x.orders; }, function (v) { return v + " cmd"; }));
    var cour = card("Performance et caisse des livreurs", table(["Livreur", "Courses", "Livrées", "CA généré", "Gains livreur", "Espèces encaissées", "Solde à reverser", "Durée moy.", "Note"],
      r.couriers.map(function (c) {
        var due = c.cash - c.earned;
        return [esc(c.name || phone(c.phone)) + (c.online ? ' <span class="pill k">EN LIGNE</span>' : ''), c.orders, c.delivered, F(c.revenue), F(c.earned), F(c.cash),
          '<b>' + (due >= 0 ? F(due) : "− " + F(-due) + " à payer") + '</b>', mins(c.minutes), c.rating ? String(c.rating).replace(".", ",") + " ★" : "—"];
      })) + '<p class="note">Solde à reverser = espèces encaissées par le livreur − ses gains. Négatif : WunaGo doit payer le livreur.</p>');
    var cli = card("Meilleurs clients", table(["Client", "Commandes", "CA"], r.clients.map(function (c) { return [esc(c.name || phone(c.phone)) + '<br><span class="mono" style="font-size:11px;color:rgba(16,16,16,.6)">' + esc(phone(c.phone)) + '</span>', c.orders, F(c.revenue)]; })));
    var disp = card("Réclamations par motif", table(["Motif", "Reçues", "Ouvertes", "Délai de résolution"], r.disputes.map(function (d) {
      return [esc(REASONS[d.key] || d.key), d.total, d.open, d.hours == null ? "—" : String(d.hours).replace(".", ",") + " h"];
    })));
    var canc = card("Motifs d'annulation", hbars(r.cancels, function (x) { return x.key; }, function (x) { return x.total; }, function (v) { return String(v); }));
    var wal = card("Portefeuille clients", table(["Indicateur", "Montant"], [
      ["Recharges sur la période", F(r.wallet.topups)], ["Remboursements sur la période", F(r.wallet.refunds)],
      ["Soldes détenus par les clients (à ce jour)", '<b>' + F(r.wallet.balances) + '</b>'], ["Portefeuilles avec un solde", String(r.wallet.wallets)]]) +
      '<p class="note">Les soldes des clients sont de l\'argent dû par WunaGo : à garder en trésorerie.</p>');
    return shell(head +
      '<h2 class="sec">Opérations en direct</h2>' + ops +
      (live.length ? ordersTable(live, true) : '') +
      '<h2 class="sec">Indicateurs · ' + periodLabel() + '</h2>' + kpis +
      '<div class="grid1">' + pay + '</div><div class="grid2">' + svc + quart + '</div>' +
      '<div class="grid2">' + days + hours + '</div>' +
      '<div class="grid1">' + cour + '</div>' +
      '<div class="grid2">' + zones + canc + '</div>' +
      '<div class="grid2">' + cli + wal + '</div>' +
      '<div class="grid1">' + disp + '</div>');
  }
  function periodLabel() {
    var P = S.period, f = function (d) { return new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); };
    return P.from === P.to ? f(P.from) : "du " + f(P.from) + " au " + f(P.to);
  }
  /* envois par lien : le correspondant n'a pas encore choisi le lieu, ou le prix attend confirmation */
  function linksTable() {
    if (!S.showLinks) return "";
    var L = S.links || [];
    if (!L.length) return '<div class="card empty" style="margin-bottom:14px">Aucun envoi par lien en attente.</div>';
    var ST = { waiting_place: "Attend le lieu", waiting_confirm: "Prix à confirmer" };
    return '<div class="card" style="margin-bottom:14px;overflow-x:auto"><table><thead><tr><th>Créé par</th><th>Sens</th><th>Correspondant</th><th>Lieu choisi</th><th>Qui paie</th><th>Statut</th><th>Expire</th></tr></thead><tbody>' +
      L.map(function (l) {
        return '<tr><td><b>' + esc(l.creator.name) + '</b><br><span class="mono" style="font-size:11px">' + esc(phone(l.creator.phone)) + '</span></td>' +
          '<td>' + (l.direction === "send" ? "Envoie à" : "Reçoit de") + '</td><td>' + esc(l.contactName || "—") + '<br><span class="mono" style="font-size:11px">' + esc(phone(l.contactPhone)) + '</span></td>' +
          '<td>' + (l.other ? esc(String(l.other.text).split(" · ")[0]) + (l.price ? '<br><b>' + F(l.price) + '</b>' : '') : '—') + '</td>' +
          '<td>' + (l.payer === "me" ? "Le créateur" : "Le correspondant") + '</td><td>' + ST[l.status] + '</td><td class="mono" style="font-size:11px">' + when(l.expiresAt) + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }
  function kpiA(label, value, action, arg, cls) { return '<button class="card kpi kpi-btn' + (cls || "") + '" data-a="' + action + '" data-v="' + arg + '"><span class="lbl">' + label + '</span><b>' + value + '</b><span class="kpi-go">Voir →</span></button>'; }
  function kpiB(label, value, sub, dark) { return '<div class="card kpi' + (dark ? " dark" : "") + '"><span class="lbl">' + label + '</span><b>' + value + '</b>' + (sub ? '<span class="kpi-sub">' + sub + '</span>' : '') + '</div>'; }
  function loadReport() {
    S.reportBusy = true;
    return WAPI.get("/admin/reports?from=" + S.period.from + "&to=" + S.period.to).then(function (r) { S.report = r; S.reportBusy = false; S.reportAt = Date.now(); })
      .catch(function (e) { S.reportBusy = false; err(e); });
  }
  /* ---------- historique des commandes : période jour / semaine / mois / année / dates libres / tout ---------- */
  var MODES = [["day", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"], ["custom", "Dates libres"], ["all", "Tout"]];
  function dUTC(s) { return new Date(s + "T00:00:00Z"); }
  function sD(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = dUTC(s); d.setUTCDate(d.getUTCDate() + n); return sD(d); }
  function rangeOf(mode, ref) {
    var d = dUTC(ref);
    if (mode === "day") return { from: ref, to: ref };
    if (mode === "week") { var wd = (d.getUTCDay() + 6) % 7, f = addDays(ref, -wd); return { from: f, to: addDays(f, 6) }; }
    if (mode === "month") return { from: sD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: sD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) };
    if (mode === "year") return { from: d.getUTCFullYear() + "-01-01", to: d.getUTCFullYear() + "-12-31" };
    return null;
  }
  function shiftRef(mode, ref, dir) {
    var d = dUTC(ref);
    if (mode === "day") return addDays(ref, dir);
    if (mode === "week") return addDays(ref, 7 * dir);
    if (mode === "month") return sD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
    if (mode === "year") return sD(new Date(Date.UTC(d.getUTCFullYear() + dir, 0, 1)));
    return ref;
  }
  var todayD = function () { return ymd(new Date()); };
  S.hist = { mode: "day", ref: todayD(), from: todayD(), to: todayD(), service: "", pay: "", courier: "", limit: 50, summary: null, more: false };
  function histRange(P) { var H = P || S.hist; if (H.mode === "custom") return { from: H.from, to: H.to }; if (H.mode === "all") return { from: "", to: "" }; return rangeOf(H.mode, H.ref); }
  function histLabel(P) {
    var H = P || S.hist, r = histRange(H), fd = function (s, o) { return dUTC(s).toLocaleDateString("fr-FR", Object.assign({ timeZone: "UTC" }, o)); };
    if (H.mode === "all") return "Toutes les commandes";
    if (H.mode === "day") { var l = fd(r.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); return l.charAt(0).toUpperCase() + l.slice(1) + (r.from === todayD() ? " (aujourd'hui)" : ""); }
    if (H.mode === "week") return "Semaine du " + fd(r.from, { day: "numeric", month: "short" }) + " au " + fd(r.to, { day: "numeric", month: "short", year: "numeric" });
    if (H.mode === "month") { var m = fd(r.from, { month: "long", year: "numeric" }); return m.charAt(0).toUpperCase() + m.slice(1); }
    if (H.mode === "year") return "Année " + r.from.slice(0, 4);
    return "Du " + fd(r.from, { day: "numeric", month: "short", year: "numeric" }) + " au " + fd(r.to, { day: "numeric", month: "short", year: "numeric" });
  }
  function histQuery(limit) {
    var H = S.hist, r = histRange();
    return "/admin/orders?status=" + encodeURIComponent(S.orderFilter) + "&q=" + encodeURIComponent(S.orderQ) + "&from=" + r.from + "&to=" + r.to +
      "&service=" + H.service + "&pay=" + H.pay + "&courier=" + encodeURIComponent(H.courier) + "&limit=" + (limit || H.limit) + "&offset=0";
  }
  function histKey() { var H = S.hist; return JSON.stringify([histRange(H), S.orderFilter, S.orderQ, H.service, H.pay, H.courier]); }
  function loadHist(limit) {
    var key = histKey();
    return WAPI.get(histQuery(limit)).then(function (r) { if (key !== histKey()) return; S.orders = r.orders; S.hist.summary = r.summary; S.hist.more = r.more; });
  }
  function periodBar(H, pre, exportAction) {
    var nav = H.mode === "custom"
      ? '<span class="fx-dates"><label class="lbl">Du</label><input class="f mono" type="date" data-k="' + pre + '.from" value="' + H.from + '" aria-label="Date de début"><label class="lbl">au</label><input class="f mono" type="date" data-k="' + pre + '.to" value="' + H.to + '" aria-label="Date de fin"><button class="btn btn-sm btn-ink" data-a="pApply" data-v="' + pre + '">Appliquer</button></span>'
      : H.mode === "all" ? '' : '<span class="pnav"><button class="btn btn-sm btn-ghost" data-a="pShift" data-v="' + pre + '|-1" aria-label="Période précédente">‹</button>' +
        '<input class="f mono" type="date" data-k="' + pre + '.ref" data-change="pRef" data-v="' + pre + '" aria-label="Choisir une date" value="' + H.ref + '"><button class="btn btn-sm btn-ghost" data-a="pShift" data-v="' + pre + '|1" aria-label="Période suivante">›</button>' +
        '<button class="btn btn-sm btn-ghost" data-a="pToday" data-v="' + pre + '">Aujourd\'hui</button></span>';
    return '<div class="tools">' + MODES.map(function (f) { return '<button class="chip ' + (H.mode === f[0] ? "on" : "") + '" data-a="pMode" data-v="' + pre + '|' + f[0] + '">' + f[1] + '</button>'; }).join("") + '</div>' +
      '<div class="tools"><b class="plabel">' + esc(histLabel(H)) + '</b>' + nav +
      (exportAction ? '<button class="btn btn-sm btn-yellow" style="margin-left:auto" data-a="' + exportAction + '"' + (H.mode === "all" ? ' disabled title="Choisissez une période pour exporter"' : '') + '>Exporter cette période (Excel)</button>' : '') + '</div>';
  }
  function chips(list, cur, action) { return list.map(function (f) { return '<button class="chip ' + (cur === f[0] ? "on" : "") + '" data-a="' + action + '" data-v="' + f[0] + '">' + f[1] + '</button>'; }).join(""); }
  function viewOrders() {
    var H = S.hist, sm = H.summary, r = histRange();
    var STAT = [["", "Toutes"], ["active", "En cours"], ["unassigned", "À assigner"], ["delivered", "Livrées"], ["cancelled", "Annulées"]];
    var courierOpts = '<option value="">Tous les livreurs</option><option value="none"' + (H.courier === "none" ? " selected" : "") + '>Sans livreur</option>' +
      S.couriers.map(function (c) { return '<option value="' + c.id + '"' + (H.courier === c.id ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("");
    var summary = sm ? '<div class="sumbar"><span><b>' + sm.orders + '</b> commande(s)</span><span>CA WunaGo <b>' + F(sm.revenue) + '</b></span><span>Payé par les clients <b>' + F(sm.volume) + '</b></span>' +
      '<span>' + sm.delivered + ' livrée(s) · ' + sm.active + ' en cours · ' + sm.cancelled + ' annulée(s)</span></div>' : '';
    /* regroupement par jour quand la période dépasse une journée */
    var grouped = H.mode !== "day" && !(H.mode === "custom" && H.from === H.to);
    return shell('<h1>Historique des commandes <button class="btn btn-sm btn-yellow" data-a="newOrder">+ Nouvelle commande</button></h1>' +
      periodBar(H, "hist", "histExport") +
      '<div class="tools">' + chips(STAT, S.orderFilter, "histStatus") +
        '<input class="f" data-k="orderQ" placeholder="Code, téléphone, nom, quartier" value="' + esc(S.orderQ) + '" aria-label="Rechercher une commande"><button class="btn btn-sm btn-ink" data-a="searchOrders">Rechercher</button></div>' +
      '<div class="tools"><label class="lbl" for="hs">Service</label><select class="f sel" id="hs" data-k="hist.service" data-change="histReload"><option value="">Tous</option>' + Object.keys(SVC).map(function (k) { return '<option value="' + k + '"' + (H.service === k ? " selected" : "") + '>' + SVC[k] + '</option>'; }).join("") + '</select>' +
        '<label class="lbl" for="hp">Paiement</label><select class="f sel" id="hp" data-k="hist.pay" data-change="histReload"><option value="">Tous</option>' + Object.keys(PAY).map(function (k) { return '<option value="' + k + '"' + (H.pay === k ? " selected" : "") + '>' + PAY[k] + '</option>'; }).join("") + '</select>' +
        '<label class="lbl" for="hc">Livreur</label><select class="f sel" id="hc" data-k="hist.courier" data-change="histReload">' + courierOpts + '</select>' +
        (H.service || H.pay || H.courier || S.orderFilter || S.orderQ ? '<button class="btn btn-sm btn-ghost" data-a="histReset">Effacer les filtres</button>' : '') + '</div>' +
      summary + ordersTable(S.orders, false, grouped) +
      (H.more ? '<div style="text-align:center;margin-top:14px"><button class="btn btn-ink" data-a="histMore">Afficher 50 commandes de plus</button></div>' : ''));
  }
  function viewCourier() {
    var H = S.ch, d = H.data, c = d && d.courier, sm = d && d.summary;
    var head = '<h1><button class="btn btn-sm btn-ghost" data-a="nav" data-v="couriers">← Livreurs</button> ' + (c ? esc(c.name) : "Livreur") +
      (c ? ' <span class="pill' + (c.online ? " k" : "") + '">' + (c.online ? "● EN LIGNE" : "HORS LIGNE") + '</span>' : '') + '</h1>' +
      (c ? '<p class="note" style="margin:-8px 0 14px">' + esc(phone(c.phone)) + ' · ' + esc(VEH[c.vehicle] || "") + (c.plate ? ' · ' + esc(c.plate) : '') + ' · livreur depuis le ' + new Date(c.since).toLocaleDateString("fr-FR") + '</p>' : '');
    if (!d) return shell(head + periodBar(H, "ch", "chExport") + '<div class="card empty">Chargement…</div>');
    var kp = '<div class="kpis">' +
      kpiB("Gains du livreur", F(sm.earned), sm.delivered + " course(s) livrée(s)", true) +
      kpiB("Courses", sm.courses, sm.delivered + " livrées · " + sm.active + " en cours · " + sm.cancelled + " annulées") +
      kpiB("Espèces encaissées", F(sm.cash), "auprès des clients") +
      kpiB("Solde à reverser", sm.due >= 0 ? F(sm.due) : "− " + F(-sm.due), sm.due >= 0 ? "le livreur doit à WunaGo" : "WunaGo doit au livreur") +
      kpiB("CA généré", F(sm.revenue), String(sm.km).replace(".", ",") + " km parcourus") +
      kpiB("Note moyenne", sm.rating ? String(sm.rating).replace(".", ",") + " / 5" : "—", sm.ratings + " avis") +
      kpiB("Durée moyenne", mins(sm.minutes), "de l'acceptation à la livraison") + '</div>';
    var chart = d.byDay.length > 1 ? card("Gains par jour", columns(d.byDay, function (x) { return dayLabel(x.day); }, function (x) { return x.earned; }, F,
      function (x) { return '<b>' + dayLabel(x.day) + '</b><br>' + F(x.earned) + '<br>' + x.delivered + ' course(s) · espèces ' + F(x.cash); })) : '';
    var rows = d.orders.length ? '<div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Code</th><th class="lbl">Date</th><th class="lbl">Service</th><th class="lbl">Client</th><th class="lbl">Trajet</th><th class="lbl">Paiement</th><th class="lbl" style="text-align:right">Prix</th><th class="lbl" style="text-align:right">Gain</th><th class="lbl">Statut</th></tr></thead><tbody>' +
      d.orders.map(function (o) {
        return '<tr class="click" data-a="openOrderFromCourier" data-v="' + o.id + '"><td class="mono">' + esc(o.code) + '</td><td class="mono">' + when(o.createdAt) + '</td><td>' + esc(SVC[o.service]) + '</td><td>' + esc(o.client) + '</td>' +
          '<td>' + esc(o.pickup) + (o.dropoff !== o.pickup ? ' → ' + esc(o.dropoff) : '') + '</td><td>' + esc(PAY[o.paymentMethod] || "") + '</td><td class="mono" style="text-align:right">' + F(o.price) + '</td>' +
          '<td class="mono" style="text-align:right"><b>' + (o.status === "delivered" ? F(o.gain) : o.status === "cancelled" ? "—" : '<span style="color:rgba(16,16,16,.5)">' + F(o.estimate) + ' prévu</span>') + '</b></td><td>' + statusPill(o.status) + '</td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="card empty">Aucune course sur cette période.</div>';
    var b = d.balance || { cash: 0, earned: 0, paid: 0, due: 0 };
    var bal = '<div class="card balance' + (b.due > 0 ? " owe" : "") + '"><div><span class="lbl">Caisse du livreur · depuis le début</span><b>' + (b.due >= 0 ? F(b.due) + " à reverser à WunaGo" : F(-b.due) + " à payer au livreur") + '</b>' +
      '<span class="note">Espèces encaissées ' + F(b.cash) + ' − gains ' + F(b.earned) + ' − versements ' + F(b.paid) + '</span></div><button class="btn btn-ink" data-a="addPayment">Enregistrer un versement</button></div>';
    var pays = (d.payments || []).length ? card("Versements enregistrés", table(["Date", "Sens", "Montant", "Note", "Par"], d.payments.map(function (p) {
      return [when(p.at), p.amount > 0 ? "Remis à WunaGo" : "Payé au livreur", F(Math.abs(p.amount)), esc(p.note || "—"), esc(p.by || "")];
    }))) : '';
    return shell(head + bal + periodBar(H, "ch", "chExport") + kp + chart + '<h2 class="sec">Courses</h2>' + rows + pays +
      (d.more ? '<div style="text-align:center;margin-top:14px"><button class="btn btn-ink" data-a="chMore">Afficher 50 courses de plus</button></div>' : ''));
  }
  /* ---------- nouvelle commande saisie par l'équipe (appel, WhatsApp) ---------- */
  function qList() { return (window.WPricing && WPricing.QUARTIERS) || []; }
  function qGeo(name) { var q = qList().filter(function (x) { return x.name === name; })[0]; return q ? { lat: q.lat, lng: q.lng } : null; }
  function newOrderBody(d) {
    var addr = function (txt, q) { return (String(txt || "").trim() ? String(txt).trim() + ", " : "") + (q ? q + ", Douala" : ""); };
    var b = { phone: String(d.phone || "").replace(/\D/g, ""), name: d.name || "", service: d.service, pickup: addr(d.pickupText, d.pickupQ), dropoff: addr(d.dropoffText, d.dropoffQ),
      pickupGeo: qGeo(d.pickupQ), dropoffGeo: qGeo(d.dropoffQ), paymentMethod: d.pay, note: d.note || "",
      vehicle: d.service === "ride" ? (d.rideVehicle || "bike") : "bike", weightKg: Number(String(d.weight || "1").replace(",", ".")) || 1,
      ride: { passengers: Number(d.passengers) || 1 }, hints: { pickup: d.hintP || "", dropoff: d.hintD || "" } };
    var cc = function (v) { var x = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^WG/, ""); return x.length === 4 ? "WG-" + x : undefined; };
    b.pickupCode = cc(d.pickupCode); b.dropoffCode = cc(d.dropoffCode);
    if (b.pickupCode && !d.pickupQ) b.pickup = b.pickupCode;
    if (b.dropoffCode && !d.dropoffQ) b.dropoff = b.dropoffCode;
    if (d.service === "parcel" && (d.rname || d.rphone)) b.recipient = { name: d.rname || "", phone: String(d.rphone || "").replace(/\D/g, "") };
    return b;
  }
  function newOrderDrawer(d) {
    var qs = qList(), sel = function (k, v) { return '<select class="f" data-k="drawer.' + k + '" data-change="noPreview"><option value="">Quartier…</option>' + qs.map(function (q) { return '<option' + (v === q.name ? " selected" : "") + '>' + esc(q.name) + '</option>'; }).join("") + '</select>'; };
    var b = newOrderBody(d), price = "";
    if (window.WPricing && d.pickupQ && d.dropoffQ) {
      var q = WPricing.quote({ service: b.service, pickup: b.pickup, dropoff: b.dropoff, pickupGeo: b.pickupGeo, dropoffGeo: b.dropoffGeo, vehicle: b.vehicle, weightKg: b.weightKg, ride: b.ride }, Date.now());
      price = q.closed ? '<div class="late" style="margin:0">Service fermé à cette heure (6 h – 22 h).</div>' : '<div class="sumbar" style="margin:0"><span>Prix <b>' + F(q.net) + '</b></span><span>' + String(q.distanceKm).replace(".", ",") + ' km</span><span>Part livreur ' + F(WPricing.courierShare(q.lines)) + '</span></div>';
    }
    var chipsRow = function (k, opts) { return '<div class="tools" style="margin:0">' + opts.map(function (o) { return '<button class="chip ' + (d[k] === o[0] ? "on" : "") + '" data-a="noSet" data-v="' + k + '|' + o[0] + '">' + o[1] + '</button>'; }).join("") + '</div>'; };
    return '<h1 style="margin:0">Nouvelle commande</h1><p class="note">Pour un client qui appelle ou écrit sur WhatsApp. Son compte est créé s\'il n\'existe pas : il retrouvera la commande dans l\'app avec son numéro.</p>' +
      '<label class="lbl" for="no-ph">Téléphone du client</label><input class="f mono" id="no-ph" data-k="drawer.phone" inputmode="numeric" placeholder="6 99 12 34 56" value="' + esc(d.phone || "") + '">' +
      '<label class="lbl" for="no-nm">Nom du client</label><input class="f" id="no-nm" data-k="drawer.name" value="' + esc(d.name || "") + '">' +
      '<span class="lbl">Service</span>' + chipsRow("service", [["parcel", "Colis"], ["ride", "Déplacement"]]) +
      '<span class="lbl">Départ</span><input class="f mono" data-k="drawer.pickupCode" placeholder="Code WunaGo (ex. WG-7K3Q) — ou le quartier ci-dessous" value="' + esc(d.pickupCode || "") + '" aria-label="Code WunaGo de départ">' + sel("pickupQ", d.pickupQ) + '<input class="f" data-k="drawer.pickupText" placeholder="Rue, immeuble (facultatif)" value="' + esc(d.pickupText || "") + '" aria-label="Précision départ">' +
      '<input class="f" data-k="drawer.hintP" placeholder="Repère (ex. après la pharmacie)" value="' + esc(d.hintP || "") + '" aria-label="Repère départ">' +
      '<span class="lbl">Arrivée</span><input class="f mono" data-k="drawer.dropoffCode" placeholder="Code WunaGo (ex. WG-7K3Q) — ou le quartier ci-dessous" value="' + esc(d.dropoffCode || "") + '" aria-label="Code WunaGo d\'arrivée">' + sel("dropoffQ", d.dropoffQ) + '<input class="f" data-k="drawer.dropoffText" placeholder="Rue, immeuble (facultatif)" value="' + esc(d.dropoffText || "") + '" aria-label="Précision arrivée">' +
      '<input class="f" data-k="drawer.hintD" placeholder="Repère (ex. portail bleu)" value="' + esc(d.hintD || "") + '" aria-label="Repère arrivée">' +
      (d.service === "parcel"
        ? '<label class="lbl" for="no-kg">Poids (kg)</label><input class="f mono" id="no-kg" data-k="drawer.weight" data-change="noPreview" inputmode="decimal" value="' + esc(d.weight || "1") + '">' +
          '<span class="lbl">Destinataire (si ce n\'est pas le client)</span><input class="f" data-k="drawer.rname" placeholder="Nom" value="' + esc(d.rname || "") + '" aria-label="Nom du destinataire"><input class="f mono" data-k="drawer.rphone" inputmode="numeric" placeholder="Téléphone" value="' + esc(d.rphone || "") + '" aria-label="Téléphone du destinataire">'
        : '<span class="lbl">Véhicule</span>' + chipsRow("rideVehicle", [["bike", "Moto-taxi"], ["car", "Voiture"]]) +
          '<label class="lbl" for="no-px">Passagers</label><input class="f mono" id="no-px" data-k="drawer.passengers" data-change="noPreview" inputmode="numeric" value="' + esc(d.passengers || "1") + '">') +
      '<span class="lbl">Paiement</span>' + chipsRow("pay", [["cash", "Espèces"], ["orange_money", "Orange Money"], ["mtn_momo", "MTN MoMo"]]) +
      '<input class="f" data-k="drawer.note" placeholder="Note pour le livreur (facultatif)" value="' + esc(d.note || "") + '" aria-label="Note">' +
      price + '<button class="btn btn-ink" data-a="noSave">Enregistrer la commande</button>';
  }
  function createdDrawer(d) {
    var o = d.order, c = d.client, link = location.origin + "/suivi.html?c=" + o.trackToken;
    var msg = "Bonjour" + (c.name ? " " + c.name.split(" ")[0] : "") + ", votre commande WunaGo " + o.code + " est enregistrée (" + F(o.price.net) + "). Suivez-la ici : " + link +
      (o.service === "ride" ? "" : " Code de remise à donner au livreur : " + o.deliveryCode + ".") + " Retrouvez-la aussi dans l'app WunaGo avec votre numéro.";
    return '<h1 style="margin:0">Commande enregistrée ✓</h1>' +
      '<div class="card" style="padding:6px 14px">' + [["Code", o.code], ["Client", (c.name || "") + " · " + phone(c.phone)], ["Prix", F(o.price.net)], ["Code de remise", o.deliveryCode], ["Lien de suivi", link]]
        .map(function (r) { return '<div class="row2"><span class="lbl">' + r[0] + '</span><span class="mono" style="text-align:right;word-break:break-all">' + esc(r[1]) + '</span></div>'; }).join("") + '</div>' +
      '<a class="btn btn-yellow" target="_blank" rel="noopener" style="text-decoration:none" href="https://wa.me/237' + esc(c.phone) + '?text=' + encodeURIComponent(msg) + '">Envoyer au client par WhatsApp</a>' +
      '<button class="btn btn-ink" data-a="quickAssign" data-v="' + o.id + '">Assigner un livreur</button>';
  }
  var map = null, markers = [];
  function viewCouriers() {
    var rows = S.couriers.map(function (c) {
      return '<tr class="click" data-a="openCourier" data-v="' + c.id + '"><td><b>' + esc(c.name) + '</b><br><span class="mono" style="font-size:11px">' + esc(phone(c.phone)) + '</span></td><td>' + esc(VEH[c.vehicle] || c.vehicle) + (c.plate ? '<br><span class="mono" style="font-size:11px">' + esc(c.plate) + '</span>' : '') + '</td>' +
        '<td>' + (c.online ? '<span class="pill k">● EN LIGNE</span>' : '<span class="pill">HORS LIGNE</span>') + '</td><td class="mono">' + (c.pos ? ago(c.pos.at) : "—") + '</td>' +
        '<td class="mono">' + c.active + '</td><td class="mono">' + c.delivered + '</td><td class="mono">' + (c.rating ? c.rating + " ★" : "—") + '</td>' +
        '<td><button class="btn btn-sm btn-ghost" data-a="deactivate" data-v="' + c.id + '">Retirer</button></td></tr>';
    }).join("");
    return shell('<h1>Livreurs <button class="btn btn-sm btn-yellow" data-a="addCourier">+ Ajouter un livreur</button></h1><div id="couriers-map"></div>' +
      (S.couriers.length ? '<div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Livreur</th><th class="lbl">Véhicule</th><th class="lbl">Statut</th><th class="lbl">Position</th><th class="lbl">En cours</th><th class="lbl">Livrées</th><th class="lbl">Note</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="card empty">Aucun livreur. Ajoutez le premier : il se connectera à l\'app WunaGo avec son numéro et verra l\'espace livreur.</div>'));
  }
  function mountMap() {
    var el = document.getElementById("couriers-map");
    if (!el || !window.L) return;
    if (!map || map.getContainer() !== el) {
      if (map) map.remove();
      map = L.map(el, { zoomControl: true }).setView([4.05, 9.72], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      markers = [];
    }
    markers.forEach(function (m) { m.remove(); }); markers = [];
    S.couriers.forEach(function (c) {
      if (!c.pos) return;
      var icon = L.divIcon({ className: "", iconSize: [30, 30], html: '<div style="width:30px;height:30px;border-radius:99px;background:' + (c.online ? "#FFD700" : "#ccc") + ';border:3px solid #101010;font:800 10px Manrope,sans-serif;display:flex;align-items:center;justify-content:center">' + esc((c.name || "?").split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2)) + '</div>' });
      markers.push(L.marker([c.pos.lat, c.pos.lng], { icon: icon }).addTo(map).bindPopup("<b>" + esc(c.name) + "</b><br>" + (c.online ? "En ligne" : "Hors ligne") + " · " + ago(c.pos.at)));
    });
  }
  function viewDisputes() {
    if (!S.disputes.length) return shell('<h1>Réclamations</h1><div class="card empty">Aucune réclamation.</div>');
    return shell('<h1>Réclamations</h1><div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Code</th><th class="lbl">Commande</th><th class="lbl">Client</th><th class="lbl">Motif</th><th class="lbl">Statut</th><th class="lbl">Reçue</th></tr></thead><tbody>' +
      S.disputes.map(function (d) {
        return '<tr class="click" data-a="openDispute" data-v="' + d.id + '"><td class="mono">' + esc(d.code) + '</td><td class="mono">' + esc(d.orderCode) + '</td><td>' + esc(d.client.name || phone(d.client.phone)) + '</td>' +
          '<td>' + esc(REASONS[d.reason] || d.reason) + '</td><td><span class="pill ' + (d.status === "closed" ? "" : d.status === "review" ? "k" : "y") + '">' + DSTATUS[d.status] + '</span></td><td class="mono">' + when(d.createdAt) + '</td></tr>';
      }).join("") + '</tbody></table></div>');
  }
  function viewMessages() {
    var list = S.convs.length ? S.convs.map(function (c) {
      return '<button class="row ' + (S.convId === c.id ? "on" : "") + '" data-a="openConv" data-v="' + c.id + '"><span style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(c.title) + '</b><span class="mono" style="font-size:10px">' + (c.last ? when(c.lastAt) : "") + '</span></span>' +
        '<span class="mono" style="font-size:10px;color:rgba(16,16,16,.55)">' + esc(c.kind === "support" ? "SERVICE CLIENT · " + (c.subtitle || "") : c.subtitle) + '</span>' +
        '<span style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:rgba(16,16,16,.7)"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.last ? (c.last.mine ? "Vous : " : "") + c.last.body : "") + '</span>' + (c.unread ? '<span class="pill y">' + c.unread + '</span>' : '') + '</span></button>';
    }).join("") : '<div class="empty">Aucun message de client pour l\'instant.</div>';
    var conv = S.convs.filter(function (c) { return c.id === S.convId; })[0], thread;
    if (!conv) thread = '<div class="card thread"><div class="empty" style="margin:auto">Choisissez une discussion.</div></div>';
    else thread = '<div class="card thread"><div style="padding:12px 16px;border-bottom:1px solid var(--hair)"><b>' + esc(conv.title) + '</b> <span class="mono" style="font-size:11px;color:rgba(16,16,16,.6)">' + esc(conv.subtitle || "") + '</span></div>' +
      '<div class="msgs" id="msgs">' + (S.msgs[conv.id] || []).map(function (m) {
        return '<div class="bubble' + (m.mine ? " me" : "") + '">' + (!m.mine ? '<div class="lbl" style="margin-bottom:2px">' + esc(m.author) + '</div>' : '') +
          (m.photo ? '<img src="' + m.photo + '" alt="Photo">' : '') + (m.body && m.body !== "📷" ? esc(m.body) : '') + '<div class="mono" style="font-size:9px;opacity:.6;text-align:right">' + when(m.at) + '</div></div>';
      }).join("") + '</div><div class="compose"><input class="f" data-k="draft" id="draft" placeholder="Répondre au client…" value="' + esc(S.draft) + '" aria-label="Votre réponse"><button class="btn btn-ink" data-a="sendMsg">Envoyer</button></div></div>';
    return shell('<h1>Messages</h1><div class="split"><div class="card list">' + list + '</div>' + thread + '</div>');
  }
  function viewClients() {
    return shell('<h1>Clients</h1><div class="tools"><input class="f" data-k="clientQ" placeholder="Téléphone ou nom" value="' + esc(S.clientQ) + '" aria-label="Rechercher un client"><button class="btn btn-sm btn-ink" data-a="searchClients">Rechercher</button></div>' +
      (S.clients.length ? '<div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Client</th><th class="lbl">Téléphone</th><th class="lbl">Commandes</th><th class="lbl">Portefeuille</th><th class="lbl">Inscrit</th><th></th></tr></thead><tbody>' +
        S.clients.map(function (c) {
          return '<tr><td><b>' + esc(c.name || "—") + '</b></td><td class="mono">' + esc(phone(c.phone)) + '</td><td class="mono">' + c.orders + '</td><td class="mono">' + F(c.wallet) + '</td><td class="mono">' + when(c.createdAt) + '</td>' +
            '<td><button class="btn btn-sm btn-ghost" data-a="writeClient" data-v="' + c.id + '">Écrire</button></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="card empty">Aucun client trouvé.</div>'));
  }

  /* ---------- tiroirs (détail commande, réclamation, nouveau livreur) ---------- */
  function drawer() {
    var d = S.drawer; if (!d) return "";
    var body = "";
    if (d.kind === "order") {
      var o = S.orders.filter(function (x) { return x.id === d.id; })[0]; if (!o) return "";
      var far = function (c) { return c.pos && o.pickupGeo ? geoKm(c.pos, o.pickupGeo) : 999; };
      var online = S.couriers.slice().sort(function (a, b) { return (b.online - a.online) || (far(a) - far(b)); });
      body = '<h1 style="margin:0">' + esc(o.code) + ' ' + statusPill(o.status) + '</h1>' +
        '<div class="card" style="padding:6px 14px">' +
          [["Service", SVC[o.service]], ["Client", (o.client.name || "") + " · " + phone(o.client.phone)], ["Départ", o.pickup], ["Arrivée", o.dropoff], ["Montant", F(o.price.net) + " · " + (PAY[o.paymentMethod] || o.paymentMethod)],
           ["Distance", o.distanceKm ? o.distanceKm + " km" : "—"], ["Créée", when(o.createdAt)], ["Prévue", o.scheduledAt ? when(o.scheduledAt) : "Dès que possible"], ["Livreur", o.courier ? o.courier.name + " · " + phone(o.courier.phone) : "Non assigné"],
           ["Reçu par", o.deliveredWith === "code" ? (o.proofName ? o.proofName + " · " : "") + "remis avec le code ✓" : o.deliveredWith === "returned" ? "Rendu à l'expéditeur · " + (o.proofName || "") : (o.proofName || "—")],
           ["Code de remise", o.deliveryCode || "—"],
           ["Destinataire", (o.details && o.details.recipient) ? (o.details.recipient.name || "") + " · " + phone(o.details.recipient.phone) : "Le client"]].concat(
           o.details && o.details.pickupContact ? [["Remis par", (o.details.pickupContact.name || "") + " · " + phone(o.details.pickupContact.phone)]] : [],
           o.details && o.details.payBy ? [["Livraison payée par", (o.details.payBy.role === "recipient" ? "le destinataire" : "l'expéditeur") + (o.details.payBy.other ? " (au livreur)" : "")]] : [],
           o.details && o.details.via === "link" ? [["Origine", "Envoi par lien (lieu choisi par le correspondant)"]] : [],
           o.details && o.details.returned ? [["Retour à l'expéditeur", "Frais " + F(o.details.returned.fee) + " · à encaisser " + F(o.details.returned.due)]] : [],
           [["Repère départ", (o.details && o.details.hints && o.details.hints.pickup) || "—"],
           ["Repère arrivée", (o.details && o.details.hints && o.details.hints.dropoff) || "—"]]).map(function (r) { return '<div class="row2"><span class="lbl">' + r[0] + '</span><span style="text-align:right">' + esc(r[1]) + '</span></div>'; }).join("") + '</div>' +
        (o.note ? '<div class="card" style="padding:12px 14px">« ' + esc(o.note) + ' »</div>' : '') +
        (o.proofPhoto ? '<img src="' + o.proofPhoto + '" alt="Preuve de livraison" style="width:100%;border-radius:16px">' : '') +
        (o.status !== "delivered" && o.status !== "cancelled" ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><span class="lbl">Assigner un livreur</span>' +
          (online.length ? '<select class="f" id="assign-sel">' + online.map(function (c) { return '<option value="' + c.id + '"' + (o.courier && o.courier.id === c.id ? " selected" : "") + '>' + esc(c.name) + ' · ' + esc(VEH[c.vehicle]) + (c.online ? " · en ligne" : " · hors ligne") + (far(c) < 999 ? " · à " + far(c).toFixed(1).replace(".", ",") + " km" : "") + (c.active ? " · " + c.active + " course(s) en cours" : "") + '</option>'; }).join("") + '</select>' +
            '<button class="btn btn-yellow" data-a="assign" data-v="' + o.id + '">' + (o.courier ? "Changer de livreur" : "Assigner ce livreur") + '</button><span class="note" style="margin:0">Le livreur est prévenu sur son téléphone et la course apparaît dans son espace « Courses ». Un livreur hors ligne la verra à sa prochaine connexion.</span>'
            : '<span style="color:rgba(16,16,16,.6)">Aucun livreur. Ajoutez-en un dans la section « Livreurs ».</span>') + '</div>' +
          '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><span class="lbl">Changer le statut</span><div style="display:flex;gap:8px;flex-wrap:wrap">' +
          ["picked_up", "en_route", "delivered"].map(function (s) { return '<button class="btn btn-sm btn-ghost" data-a="setStatus" data-v="' + o.id + '|' + s + '">' + STATUS[s] + '</button>'; }).join("") +
          '<button class="btn btn-sm btn-ghost" style="color:#8a1c0c" data-a="setStatus" data-v="' + o.id + '|cancelled">Annuler la commande</button></div></div>' : '') +
        '<button class="btn btn-ink" data-a="writeOrder" data-v="' + o.id + '">Écrire au client (discussion de la commande)</button>';
    } else if (d.kind === "dispute") {
      var x = S.disputes.filter(function (y) { return y.id === d.id; })[0]; if (!x) return "";
      body = '<h1 style="margin:0">' + esc(x.code) + ' <span class="pill">' + DSTATUS[x.status] + '</span></h1>' +
        '<div class="card" style="padding:6px 14px">' + [["Commande", x.orderCode], ["Client", (x.client.name || "") + " · " + phone(x.client.phone)], ["Motif", REASONS[x.reason] || x.reason], ["Reçue", when(x.createdAt)]]
          .map(function (r) { return '<div class="row2"><span class="lbl">' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>'; }).join("") + '</div>' +
        '<div class="card" style="padding:12px 14px;line-height:1.5">' + esc(x.desc) + '</div>' +
        (x.adminReply ? '<div class="card" style="padding:12px 14px;background:#fffbe0"><span class="lbl">Dernière réponse</span><br>' + esc(x.adminReply) + '</div>' : '') +
        '<label class="lbl" for="reply">Réponse au client (envoyée dans sa messagerie)</label><textarea class="f" id="reply" data-k="drawer.reply">' + esc(d.reply || "") + '</textarea>' +
        '<label class="lbl" for="dst">Statut</label><select class="f" id="dst">' + ["open", "review", "closed"].map(function (s) { return '<option value="' + s + '"' + (x.status === s ? " selected" : "") + '>' + DSTATUS[s] + '</option>'; }).join("") + '</select>' +
        '<button class="btn btn-ink" data-a="saveDispute" data-v="' + x.id + '">Enregistrer et répondre</button>';
    } else if (d.kind === "newOrder") { body = newOrderDrawer(d);
    } else if (d.kind === "created") { body = createdDrawer(d);
    } else if (d.kind === "payment") {
      body = '<h1 style="margin:0">Enregistrer un versement</h1><p class="note">Pour remettre à zéro la caisse d\'un livreur : notez l\'argent qu\'il vous remet, ou ce que WunaGo lui paie.</p>' +
        '<div class="tools">' + [["in", "Le livreur remet à WunaGo"], ["out", "WunaGo paie le livreur"]].map(function (x) { return '<button class="chip ' + (d.direction === x[0] ? "on" : "") + '" data-a="payDir" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join("") + '</div>' +
        '<label class="lbl" for="pa">Montant (FCFA)</label><input class="f mono" id="pa" data-k="drawer.amount" inputmode="numeric" value="' + esc(d.amount || "") + '">' +
        '<label class="lbl" for="pn">Note (facultatif)</label><input class="f" id="pn" data-k="drawer.note" placeholder="Ex. dépôt Orange Money, espèces au bureau" value="' + esc(d.note || "") + '">' +
        '<button class="btn btn-ink" data-a="savePayment">Enregistrer</button>';
    } else if (d.kind === "courier") {
      body = '<h1 style="margin:0">Nouveau livreur</h1><p style="margin:0;color:rgba(16,16,16,.7);line-height:1.5">Il se connectera à l\'app WunaGo avec ce numéro et verra directement l\'espace livreur.</p>' +
        '<label class="lbl" for="cn">Nom complet</label><input class="f" id="cn" data-k="drawer.name" value="' + esc(d.name || "") + '">' +
        '<label class="lbl" for="cp">Téléphone</label><input class="f mono" id="cp" data-k="drawer.phone" inputmode="numeric" placeholder="6 77 12 34 56" value="' + esc(d.phone || "") + '">' +
        '<label class="lbl" for="cv">Véhicule</label><select class="f" id="cv" data-k="drawer.vehicle">' + Object.keys(VEH).map(function (k) { return '<option value="' + k + '"' + ((d.vehicle || "bike") === k ? " selected" : "") + '>' + VEH[k] + '</option>'; }).join("") + '</select>' +
        '<label class="lbl" for="cpl">Plaque</label><input class="f mono" id="cpl" data-k="drawer.plate" value="' + esc(d.plate || "") + '">' +
        '<button class="btn btn-ink" data-a="saveCourier">Ajouter le livreur</button>';
    }
    return '<div class="drawer-bg" data-a="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true"><button class="btn btn-sm btn-ghost" style="align-self:flex-end" data-a="closeDrawer">Fermer ✕</button>' + body + '</aside>';
  }

  /* ---------- rendu ---------- */
  function render() {
    var ae = document.activeElement, k = ae && ae.getAttribute && ae.getAttribute("data-k"), pos = null;
    if (k) { try { pos = ae.selectionStart; } catch (e) {} }
    var msgs = document.getElementById("msgs"), atBottom = !msgs || msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
    var html;
    if (!S.me) html = viewLogin();
    else if (S.me.role !== "admin") html = viewDenied();
    else html = ({ dash: viewDash, orders: viewOrders, courier: viewCourier, couriers: viewCouriers, disputes: viewDisputes, messages: viewMessages, clients: viewClients }[S.view])() + drawer();
    if (S.toast) html += '<div class="toast">' + esc(S.toast) + '</div>';
    if (map && S.view !== "couriers") { map.remove(); map = null; }
    var mapEl = map && map.getContainer();
    root.innerHTML = html;
    if (S.view === "couriers" && S.me && S.me.role === "admin") {
      var slot = document.getElementById("couriers-map");
      if (mapEl && slot) { slot.parentNode.replaceChild(mapEl, slot); setTimeout(function () { map.invalidateSize(); }, 0); }
      mountMap();
    }
    if (k) { var nx = root.querySelector('[data-k="' + k + '"]'); if (nx) { nx.focus(); try { if (pos != null) nx.setSelectionRange(pos, pos); } catch (e) {} } }
    var m2 = document.getElementById("msgs"); if (m2 && atBottom) m2.scrollTop = m2.scrollHeight;
  }

  /* ---------- données ---------- */
  function load() {
    if (!S.me || S.me.role !== "admin") return Promise.resolve();
    var v = S.view, jobs = [WAPI.get("/admin/stats").then(function (r) { S.stats = r.stats; }), WAPI.get("/conversations").then(function (r) { S.convs = r.conversations; })];
    if (v === "dash" && (!S.report || S.forceReport || Date.now() - (S.reportAt || 0) > 60000)) { S.forceReport = false; jobs.push(loadReport()); }
    if (v === "dash") jobs.push(WAPI.get("/admin/orders?status=active&limit=100").then(function (r) { S.orders = r.orders; }));
    if (v === "orders") jobs.push(loadHist(Math.max(50, S.orders.length)));
    if (v === "couriers" || v === "orders" || v === "dash" || S.drawer) jobs.push(WAPI.get("/admin/couriers").then(function (r) { S.couriers = r.couriers; }));
    if (v === "disputes") jobs.push(WAPI.get("/admin/disputes").then(function (r) { S.disputes = r.disputes; }));
    if (v === "clients") jobs.push(WAPI.get("/admin/clients?q=" + encodeURIComponent(S.clientQ)).then(function (r) { S.clients = r.clients; }));
    if (v === "messages" && S.convId) jobs.push(loadMsgs());
    return Promise.all(jobs).then(render).catch(function (e) { if (e.status === 401) { WAPI.setToken(null); S.me = null; render(); } });
  }
  function loadMsgs() {
    var id = S.convId, list = S.msgs[id] || [], after = list.length ? list[list.length - 1].id : 0;
    return WAPI.get("/conversations/" + id + "/messages?after=" + after).then(function (r) {
      if (r.messages.length) S.msgs[id] = list.concat(r.messages);
      var c = S.convs.filter(function (x) { return x.id === id; })[0]; if (c) c.unread = 0;
    });
  }
  function openConversation(payload) {
    return WAPI.post("/conversations", payload).then(function (r) {
      var c = r.conversation; S.convs = [c].concat(S.convs.filter(function (x) { return x.id !== c.id; }));
      S.view = "messages"; S.convId = c.id; S.drawer = null; render(); return loadMsgs().then(render);
    }).catch(err);
  }

  /* ---------- actions ---------- */
  var A = {
    showLinks: function () {
      S.showLinks = !S.showLinks; render();
      if (S.showLinks) WAPI.get("/admin/links").then(function (r) { S.links = r.links; render(); }).catch(err);
    },
    sendCode: function () {
      var p = S.login.phone.replace(/\D/g, "");
      WAPI.post("/auth/request", { phone: p }).then(function (r) { S.login.step = "code"; S.login.demoCode = r.demoCode || null; render(); }).catch(err);
    },
    verify: function () {
      WAPI.post("/auth/verify", { phone: S.login.phone.replace(/\D/g, ""), code: S.login.code.replace(/\D/g, "") }).then(function (r) {
        WAPI.setToken(r.token); S.me = r.user; S.login = { phone: "", code: "", step: "phone" }; render(); load();
      }).catch(err);
    },
    restart: function () { S.login.step = "phone"; S.login.code = ""; render(); },
    logout: function () { WAPI.post("/auth/logout").catch(function () {}); WAPI.setToken(null); S.me = null; render(); },
    nav: function (v) { S.view = v; S.drawer = null; if (v === "dash") S.forceReport = true; render(); load(); },
    orderFilter: function (v) { S.orderFilter = v; S.hist.mode = "all"; S.hist.limit = 50; S.orders = []; S.view = "orders"; S.drawer = null; render(); load(); },
    pMode: function (v) { var p = v.split("|"), H = S[p[0]]; H.mode = p[1]; if (p[1] === "custom") { var r = rangeOf("day", H.ref); H.from = H.from || r.from; H.to = H.to || r.to; } reloadP(p[0]); },
    pShift: function (v) { var p = v.split("|"), H = S[p[0]]; H.ref = shiftRef(H.mode, H.ref, Number(p[1])); reloadP(p[0]); },
    pToday: function (v) { S[v].ref = todayD(); reloadP(v); },
    pRef: function (v) { if (S[v].ref) reloadP(v); },
    pApply: function (v) { var H = S[v]; if (!H.from || !H.to || H.from > H.to) { toast("Choisissez une date de début avant la date de fin."); return; } reloadP(v); },
    newOrder: function () { S.drawer = { kind: "newOrder", service: "parcel", pay: "cash", weight: "1", passengers: "1", rideVehicle: "bike" }; render(); },
    noSet: function (v) { var p = v.split("|"); S.drawer[p[0]] = p[1]; render(); },
    noPreview: function () { render(); },
    noSave: function () {
      var d = S.drawer, b = newOrderBody(d);
      if (!/^6\d{8}$/.test(b.phone)) { toast("Numéro du client : 9 chiffres commençant par 6."); return; }
      if (!(d.pickupQ || b.pickupCode) || !(d.dropoffQ || b.dropoffCode)) { toast("Indiquez un Code WunaGo ou un quartier, au départ et à l'arrivée."); return; }
      if (S.busy) return; S.busy = true;
      WAPI.post("/admin/orders", b).then(function (r) { S.busy = false; S.drawer = { kind: "created", order: r.order, client: r.client }; render(); load(); })
        .catch(function (e) { S.busy = false; err(e); });
    },
    addPayment: function () { var b = S.ch.data && S.ch.data.balance; S.drawer = { kind: "payment", direction: b && b.due < 0 ? "out" : "in", amount: b ? String(Math.abs(b.due)) : "" }; render(); },
    payDir: function (v) { S.drawer.direction = v; render(); },
    savePayment: function () {
      var d = S.drawer, amt = Number(String(d.amount || "").replace(/\D/g, ""));
      if (!amt) { toast("Indiquez un montant."); return; }
      WAPI.post("/admin/couriers/" + S.ch.id + "/payments", { amount: amt, direction: d.direction, note: d.note || "" }).then(function () {
        S.drawer = null; toast("Versement enregistré."); S.ch.data = null; render(); loadCh().then(render);
      }).catch(err);
    },
    openCourier: function (id) { S.ch = { id: id, mode: "month", ref: todayD(), from: "", to: "", limit: 50, data: null }; S.view = "courier"; render(); loadCh().then(render).catch(err); },
    chMore: function () { S.ch.limit += 50; loadCh().then(render).catch(err); },
    chExport: function () { var r = histRange(S.ch); if (r.from) exportRange(r.from, r.to); },
    histMode: function (v) { var H = S.hist; H.mode = v; if (v === "custom") { var r = rangeOf("day", H.ref); H.from = H.from || r.from; H.to = H.to || r.to; } A.histReload(); },
    histShift: function (v) { S.hist.ref = shiftRef(S.hist.mode, S.hist.ref, Number(v)); A.histReload(); },
    histToday: function () { S.hist.ref = todayD(); A.histReload(); },
    histApply: function () { var H = S.hist; if (!H.from || !H.to || H.from > H.to) { toast("Choisissez une date de début avant la date de fin."); return; } A.histReload(); },
    histStatus: function (v) { S.orderFilter = v; A.histReload(); },
    histReset: function () { var H = S.hist; H.service = H.pay = H.courier = ""; S.orderFilter = ""; S.orderQ = ""; A.histReload(); },
    histReload: function () { S.hist.limit = 50; S.orders = []; S.hist.summary = null; render(); loadHist().then(render).catch(err); },
    histMore: function () { S.hist.limit += 50; loadHist().then(render).catch(err); },
    histExport: function () { var r = histRange(); if (!r.from) return; exportRange(r.from, r.to); },
    preset: function (v) { S.period = Object.assign({ preset: v }, periodOf(v)); S.report = null; S.forceReport = true; render(); load(); },
    customPeriod: function () {
      var P = S.period;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(P.from) || !/^\d{4}-\d{2}-\d{2}$/.test(P.to) || P.from > P.to) { toast("Choisissez une date de début avant la date de fin."); return; }
      P.preset = "custom"; S.report = null; S.forceReport = true; render(); load();
    },
    exportCsv: function () { exportRange(S.period.from, S.period.to); },
    _unused: function () {
      var P = S.period;
      fetch("/api/admin/export?from=" + P.from + "&to=" + P.to, { headers: { authorization: "Bearer " + WAPI.token() } }).then(function (r) {
        if (!r.ok) throw new Error("Export impossible.");
        return r.blob();
      }).then(function (b) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "wunago-commandes-" + P.from + "-au-" + P.to + ".csv";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast("Fichier téléchargé : il s'ouvre dans Excel.");
      }).catch(err);
    },
    svcFilter: function (v) { S.svcFilter = v; render(); },
    payFilter: function (v) { S.payFilter = v; render(); },
    quickAssign: function (id) {
      if (!S.orders.some(function (o) { return o.id === id; }) && S.drawer && S.drawer.kind === "created") { var co = S.drawer.order; co.client = S.drawer.client; S.orders.unshift(co); }
      S.drawer = { kind: "order", id: id }; render(); var el = document.getElementById("assign-sel"); if (el) el.focus(); },
    searchOrders: function () { A.histReload(); },
    searchClients: function () { load(); },
    openOrderFromCourier: function (id) {
      WAPI.get("/admin/orders?q=" + encodeURIComponent((S.ch.data.orders.filter(function (o) { return o.id === id; })[0] || {}).code || "") + "&limit=1").then(function (r) {
        if (!r.orders[0]) return; S.orders = [r.orders[0]].concat(S.orders.filter(function (o) { return o.id !== id; })); S.drawer = { kind: "order", id: id }; render();
      }).catch(err);
    },
    openOrder: function (id) { S.drawer = { kind: "order", id: id }; render(); if (!S.couriers.length) load(); },
    openDispute: function (id) { S.drawer = { kind: "dispute", id: id, reply: "" }; render(); },
    closeDrawer: function () { S.drawer = null; render(); },
    addCourier: function () { S.drawer = { kind: "courier", vehicle: "bike" }; render(); },
    saveCourier: function () {
      var d = S.drawer;
      WAPI.post("/admin/couriers", { name: d.name, phone: String(d.phone || "").replace(/\D/g, ""), vehicle: d.vehicle || "bike", plate: d.plate }).then(function () { S.drawer = null; toast("Livreur ajouté."); load(); }).catch(err);
    },
    deactivate: function (id) {
      var c = S.couriers.filter(function (x) { return x.id === id; })[0];
      if (!c || S.confirmDeact !== id) { S.confirmDeact = id; toast("Touchez « Retirer » une 2e fois pour confirmer."); return; }
      S.confirmDeact = null; WAPI.post("/admin/couriers/" + id + "/deactivate", {}).then(function () { toast(c.name + " n'est plus livreur."); load(); }).catch(err);
    },
    assign: function (id) {
      var sel = document.getElementById("assign-sel");
      WAPI.post("/admin/orders/" + id + "/assign", { courierId: sel.value }).then(function (r) { replace(r.order); toast("Livreur assigné."); load(); }).catch(err);
    },
    setStatus: function (v) {
      var p = v.split("|");
      if (p[1] === "cancelled" && S.confirmCancel !== p[0]) { S.confirmCancel = p[0]; toast("Touchez « Annuler » une 2e fois pour confirmer."); return; }
      S.confirmCancel = null;
      WAPI.post("/admin/orders/" + p[0] + "/status", { status: p[1] }).then(function (r) { replace(r.order); toast("Statut mis à jour."); load(); }).catch(err);
    },
    writeOrder: function (id) { openConversation({ kind: "order", orderId: id }); },
    writeClient: function (id) { openConversation({ kind: "support", userId: id }); },
    saveDispute: function (id) {
      var reply = (S.drawer.reply || "").trim(), st = document.getElementById("dst").value;
      WAPI.post("/admin/disputes/" + id, { status: st, reply: reply }).then(function () { S.drawer = null; toast(reply ? "Réponse envoyée au client." : "Réclamation mise à jour."); load(); }).catch(err);
    },
    openConv: function (id) { S.convId = id; render(); loadMsgs().then(render); },
    sendMsg: function () {
      var text = S.draft.trim(); if (!text || !S.convId) return;
      S.draft = "";
      WAPI.post("/conversations/" + S.convId + "/messages", { body: text }).then(function (r) { (S.msgs[S.convId] = S.msgs[S.convId] || []).push(r.message); render(); }).catch(err);
    }
  };
  function reloadP(pre) { if (pre === "hist") A.histReload(); else { S.ch.limit = 50; S.ch.data = null; render(); loadCh().then(render).catch(err); } }
  function loadCh() {
    var H = S.ch, r = histRange(H), key = JSON.stringify([H.id, r]);
    return WAPI.get("/admin/couriers/" + H.id + "/history?from=" + r.from + "&to=" + r.to + "&limit=" + H.limit).then(function (d) { if (key === JSON.stringify([S.ch.id, histRange(S.ch)])) H.data = d; });
  }
  function exportRange(from, to) {
    fetch("/api/admin/export?from=" + from + "&to=" + to, { headers: { authorization: "Bearer " + WAPI.token() } }).then(function (r) {
      if (!r.ok) throw new Error("Export impossible.");
      return r.blob();
    }).then(function (b) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "wunago-commandes-" + from + "-au-" + to + ".csv";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("Fichier téléchargé : il s'ouvre dans Excel.");
    }).catch(err);
  }
  function replace(o) {
    var old = S.orders.filter(function (x) { return x.id === o.id; })[0];
    if (old && old.client) o.client = old.client;
    S.orders = S.orders.map(function (x) { return x.id === o.id ? o : x; });
  }
  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]"); if (!el) return;
    if (el.tagName === "SELECT") return;
    var fn = A[el.getAttribute("data-a")]; if (fn) fn(el.getAttribute("data-v"));
  });
  function setK(k, v) { var p = k.split("."); if (p.length === 2) { if (S[p[0]]) S[p[0]][p[1]] = v; } else S[k] = v; }
  root.addEventListener("input", function (e) { var k = e.target.getAttribute("data-k"); if (k) setK(k, e.target.value); });
  root.addEventListener("change", function (e) {
    var k = e.target.getAttribute("data-k"); if (k) setK(k, e.target.value);
    var c = e.target.getAttribute("data-change"); if (c && A[c]) A[c](e.target.getAttribute("data-v"));
  });
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var k = e.target.getAttribute && e.target.getAttribute("data-k");
    if (k === "draft") A.sendMsg(); else if (k === "login.phone") A.sendCode(); else if (k === "login.code") A.verify();
    else if (k === "orderQ") A.searchOrders(); else if (k === "clientQ") A.searchClients();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.drawer) A.closeDrawer(); });

  /* rafraîchissement : messages ouverts toutes les 4 s, le reste toutes les 15 s */
  var n = 0;
  setInterval(function () {
    if (document.hidden || !S.me || S.me.role !== "admin" || S.drawer) return;
    n++;
    if (S.view === "messages" && S.convId) loadMsgs().then(render).catch(function () {});
    if (n % 4 === 0) load();
  }, 4000);

  render();
  WAPI.check().then(function (on) {
    if (!on) { root.innerHTML = '<div class="login"><div class="card"><div class="brand" style="padding:0">WunaGo</div><p style="margin:0">Serveur injoignable. Le backoffice a besoin de l\'API WunaGo en ligne.</p></div></div>'; return; }
    if (WAPI.token()) WAPI.get("/me").then(function (r) { S.me = r.user; render(); load(); }).catch(function () { WAPI.setToken(null); render(); });
  });
})();
