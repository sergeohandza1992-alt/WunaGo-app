/* WunaGo — backoffice (service client, suivi des commandes, livreurs, réclamations).
   Même API que l'app ; accès réservé aux numéros listés dans ADMIN_PHONES (Netlify). */
(function () {
  "use strict";
  var root = document.getElementById("admin");
  var S = {
    me: null, view: "dash", login: { phone: "", code: "", step: "phone", demoCode: null },
    stats: null, orders: [], orderFilter: "active", orderQ: "", couriers: [], disputes: [], clients: [], clientQ: "",
    convs: [], convId: null, msgs: {}, draft: "", drawer: null, toast: null
  };
  var SVC = { parcel: "Colis", laundry: "Pressing", errand: "Courses", ride: "Déplacement" };
  var STATUS = { received: "Reçue", picked_up: "Prise en charge", en_route: "En route", delivered: "Livrée", cancelled: "Annulée" };
  var VEH = { bike: "Moto", tricycle: "Tricycle", van: "Camionnette", car: "Voiture" };
  var PAY = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wallet: "Portefeuille", cash: "Espèces", card: "Carte" };
  var DSTATUS = { open: "OUVERTE", review: "EN COURS", closed: "RÉSOLUE" };
  var REASONS = { damaged: "Colis endommagé", missing: "Article manquant", late: "Retard important", courier: "Comportement du livreur", payment: "Problème de paiement", other: "Autre" };

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
  function shell(inner) {
    var c = counts();
    return '<div class="shell"><nav class="side" aria-label="Sections">' +
      '<div class="brand"><svg width="22" height="28" viewBox="0 0 60 76" aria-hidden="true"><path d="M30 4C14.5 4 4 15.4 4 29.5C4 47 30 72 30 72C30 72 56 47 56 29.5C56 15.4 45.5 4 30 4Z" fill="#FFD700"/><rect x="20" y="20" width="20" height="20" rx="3" fill="#101010"/></svg><span>WunaGo<br><small>BACKOFFICE</small></span></div>' +
      NAV.map(function (n) { var k = c[n[0]]; return '<button class="' + (S.view === n[0] ? "on" : "") + '" data-a="nav" data-v="' + n[0] + '">' + n[1] + (k ? '<span class="count">' + k + '</span>' : '') + '</button>'; }).join("") +
      '<div class="foot"><span>' + esc(S.me.name || "Administrateur") + '<br><span class="mono">' + esc(phone(S.me.phone)) + '</span></span><button class="btn btn-sm btn-ghost" style="background:rgba(255,255,255,.1);color:#fff" data-a="logout">Se déconnecter</button></div>' +
      '</nav><main>' + inner + '</main></div>';
  }
  function kpi(label, value, dark) { return '<div class="card kpi' + (dark ? " dark" : "") + '"><span class="lbl">' + label + '</span><b>' + value + '</b></div>'; }
  function ordersTable(list, compact) {
    if (!list.length) return '<div class="card empty">Aucune commande.</div>';
    return '<div class="card" style="overflow:auto"><table><thead><tr><th class="lbl">Code</th><th class="lbl">Service</th><th class="lbl">Client</th><th class="lbl">Trajet</th>' +
      (compact ? '' : '<th class="lbl">Montant</th>') + '<th class="lbl">Livreur</th><th class="lbl">Statut</th><th class="lbl">Créée</th></tr></thead><tbody>' +
      list.map(function (o) {
        return '<tr class="click" data-a="openOrder" data-v="' + o.id + '"><td class="mono">' + esc(o.code) + '</td><td>' + esc(SVC[o.service]) + '</td><td>' + esc(o.client ? o.client.name || phone(o.client.phone) : "") + '</td>' +
          '<td>' + esc(o.pickup) + (o.dropoff !== o.pickup ? ' → ' + esc(o.dropoff) : '') + '</td>' + (compact ? '' : '<td class="mono">' + F(o.price.net) + '</td>') +
          '<td>' + (o.courier ? esc(o.courier.name) : '<span class="pill y">À ASSIGNER</span>') + '</td><td>' + statusPill(o.status) + '</td><td class="mono">' + when(o.createdAt) + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }
  function viewDash() {
    var s = S.stats || {};
    var live = S.orders.filter(function (o) { return ["received", "picked_up", "en_route"].indexOf(o.status) >= 0; });
    return shell('<h1>Tableau de bord <span class="pill">' + new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + '</span></h1>' +
      '<div class="kpis">' + kpi("Commandes du jour", s.orders_today || 0) + kpi("Chiffre du jour", F(s.revenue_today), true) + kpi("En cours", s.in_progress || 0) +
      kpi("À assigner", s.unassigned || 0) + kpi("Livreurs en ligne", (s.couriers_online || 0) + " / " + (s.couriers || 0)) + kpi("Réclamations ouvertes", s.open_disputes || 0) + kpi("Clients", s.clients || 0) + '</div>' +
      '<h1 style="font-size:17px">Commandes en cours</h1>' + ordersTable(live, true));
  }
  function viewOrders() {
    var F_ = [["active", "En cours"], ["unassigned", "À assigner"], ["delivered", "Livrées"], ["cancelled", "Annulées"], ["", "Toutes"]];
    return shell('<h1>Commandes</h1><div class="tools">' + F_.map(function (f) { return '<button class="chip ' + (S.orderFilter === f[0] ? "on" : "") + '" data-a="orderFilter" data-v="' + f[0] + '">' + f[1] + '</button>'; }).join("") +
      '<input class="f" data-k="orderQ" placeholder="Code, téléphone ou nom" value="' + esc(S.orderQ) + '" aria-label="Rechercher une commande"><button class="btn btn-sm btn-ink" data-a="searchOrders">Rechercher</button></div>' + ordersTable(S.orders));
  }
  var map = null, markers = [];
  function viewCouriers() {
    var rows = S.couriers.map(function (c) {
      return '<tr><td><b>' + esc(c.name) + '</b><br><span class="mono" style="font-size:11px">' + esc(phone(c.phone)) + '</span></td><td>' + esc(VEH[c.vehicle] || c.vehicle) + (c.plate ? '<br><span class="mono" style="font-size:11px">' + esc(c.plate) + '</span>' : '') + '</td>' +
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
      var online = S.couriers.filter(function (c) { return c.online || (o.courier && c.id === o.courier.id); });
      body = '<h1 style="margin:0">' + esc(o.code) + ' ' + statusPill(o.status) + '</h1>' +
        '<div class="card" style="padding:6px 14px">' +
          [["Service", SVC[o.service]], ["Client", (o.client.name || "") + " · " + phone(o.client.phone)], ["Départ", o.pickup], ["Arrivée", o.dropoff], ["Montant", F(o.price.net) + " · " + (PAY[o.paymentMethod] || o.paymentMethod)],
           ["Distance", o.distanceKm ? o.distanceKm + " km" : "—"], ["Créée", when(o.createdAt)], ["Prévue", o.scheduledAt ? when(o.scheduledAt) : "Dès que possible"], ["Livreur", o.courier ? o.courier.name + " · " + phone(o.courier.phone) : "Non assigné"],
           ["Reçu par", o.proofName || "—"]].map(function (r) { return '<div class="row2"><span class="lbl">' + r[0] + '</span><span style="text-align:right">' + esc(r[1]) + '</span></div>'; }).join("") + '</div>' +
        (o.note ? '<div class="card" style="padding:12px 14px">« ' + esc(o.note) + ' »</div>' : '') +
        (o.proofPhoto ? '<img src="' + o.proofPhoto + '" alt="Preuve de livraison" style="width:100%;border-radius:16px">' : '') +
        (o.status !== "delivered" && o.status !== "cancelled" ? '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><span class="lbl">Assigner un livreur</span>' +
          (online.length ? '<select class="f" id="assign-sel">' + online.map(function (c) { return '<option value="' + c.id + '"' + (o.courier && o.courier.id === c.id ? " selected" : "") + '>' + esc(c.name) + ' · ' + esc(VEH[c.vehicle]) + (c.online ? "" : " (hors ligne)") + '</option>'; }).join("") + '</select><button class="btn btn-yellow" data-a="assign" data-v="' + o.id + '">Assigner</button>' : '<span style="color:rgba(16,16,16,.6)">Aucun livreur en ligne.</span>') + '</div>' +
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
    else html = ({ dash: viewDash, orders: viewOrders, couriers: viewCouriers, disputes: viewDisputes, messages: viewMessages, clients: viewClients }[S.view])() + drawer();
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
    if (v === "dash" || v === "orders") jobs.push(WAPI.get("/admin/orders?status=" + (v === "dash" ? "active" : encodeURIComponent(S.orderFilter)) + "&q=" + encodeURIComponent(v === "dash" ? "" : S.orderQ)).then(function (r) { S.orders = r.orders; }));
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
    nav: function (v) { S.view = v; S.drawer = null; render(); load(); },
    orderFilter: function (v) { S.orderFilter = v; load(); },
    searchOrders: function () { load(); },
    searchClients: function () { load(); },
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
  root.addEventListener("change", function (e) { var k = e.target.getAttribute("data-k"); if (k) setK(k, e.target.value); });
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
