/* Page livreur ultra-légère (/api/lite) : HTML simple, sans JavaScript ni images, pour téléphones à touches
   (KaiOS, Opera Mini) et petits forfaits. Elle s'appuie sur l'API habituelle (mêmes règles, mêmes contrôles). */

import { courierShare } from "./rules.mts";

type Call = (path: string, method?: string, body?: any, token?: string | null) => Promise<{ status: number; j: any }>;

const esc = (s: any) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
const F = (n: number) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F";
const SVC: Record<string, string> = { parcel: "Colis", ride: "Trajet", laundry: "Pressing", errand: "Courses" };
const COOKIE = "wgl";
const ST: Record<string, string> = { received: "à récupérer", picked_up: "colis récupéré", en_route: "en route", delivered: "livrée", cancelled: "annulée" };

function page(title: string, inner: string, refresh = 0) {
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    (refresh ? '<meta http-equiv="refresh" content="' + refresh + '">' : '') + '<title>' + esc(title) + '</title><style>' +
    'body{margin:0;font:15px/1.4 sans-serif;background:#fff;color:#0B1F3A}h1{font-size:18px;margin:0;padding:10px;background:#1FD1B2}' +
    'h2{font-size:15px;margin:14px 10px 6px}.c{border:1px solid #ccc;margin:8px 10px;padding:8px}.c p{margin:4px 0}' +
    'input,button{font-size:16px;padding:9px;width:100%;box-sizing:border-box;margin:4px 0}button{background:#0B1F3A;color:#1FD1B2;border:0;font-weight:bold}' +
    '.y{background:#1FD1B2;color:#0B1F3A}.code{font:bold 30px monospace;letter-spacing:6px}.m{color:#555;font-size:13px}a{color:#0B1F3A;font-weight:bold}form{margin:0}' +
    '</style></head><body><h1>WunaGo livreur</h1>' + inner + '</body></html>';
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function cookieToken(req: Request) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([A-Za-z0-9_-]+)"));
  return m ? m[1] : null;
}
function redirect(to: string, setCookie?: string) {
  const h: Record<string, string> = { location: to };
  if (setCookie !== undefined) h["set-cookie"] = COOKIE + "=" + setCookie + "; Path=/api/lite; HttpOnly; SameSite=Lax; Max-Age=" + (setCookie ? 7776000 : 0) + (setCookie ? "; Secure" : "");
  return new Response(null, { status: 303, headers: h });
}
async function form(req: Request): Promise<Record<string, string>> {
  const t = await req.text(), o: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(t)) o[k] = v;
  return o;
}
const msg = (url: URL) => { const e = url.searchParams.get("e"), ok = url.searchParams.get("ok"); return (e ? '<p class="c y">' + esc(e) + '</p>' : '') + (ok ? '<p class="c">' + esc(ok) + '</p>' : ''); };
const back = (e: string) => "/api/lite?e=" + encodeURIComponent(e);

export async function liteRoute(req: Request, url: URL, path: string, call: Call): Promise<Response | null> {
  if (!path.startsWith("/lite")) return null;
  const m = req.method, tok = cookieToken(req);
  /* connexion par code */
  if (path === "/lite/code" && m === "POST") {
    const b = await form(req), r = await call("/auth/request", "POST", { phone: b.phone });
    if (r.status >= 400) return redirect(back(r.j.error || "Numéro invalide."));
    return page("Code", msg(url) + '<form method="post" action="/api/lite/login" class="c"><p>Code envoyé au ' + esc(b.phone) + (r.j.demoCode ? ' (démo : <b>' + esc(r.j.demoCode) + '</b>)' : '') + '</p>' +
      '<input type="hidden" name="phone" value="' + esc(b.phone) + '"><input name="code" inputmode="numeric" maxlength="6" placeholder="Code"><button>Valider</button></form>');
  }
  if (path === "/lite/login" && m === "POST") {
    const b = await form(req), r = await call("/auth/verify", "POST", { phone: b.phone, code: b.code });
    if (r.status >= 400) return redirect(back(r.j.error || "Code incorrect."));
    return redirect("/api/lite", r.j.token);
  }
  if (path === "/lite/logout") return redirect("/api/lite", "");
  const me = tok ? await call("/me", "GET", null, tok) : null;
  if (!me || me.status >= 400) {
    return page("Connexion", msg(url) + '<form method="post" action="/api/lite/code" class="c"><p>Espace livreur, version légère (peu de données).</p>' +
      '<input name="phone" inputmode="tel" placeholder="Votre numéro : 6 XX XX XX XX"><button>Recevoir mon code</button></form>');
  }
  const u = me.j.user;
  if (u.role !== "courier") return page("Livreurs", '<p class="c">Cet espace est réservé aux livreurs validés. Inscription : <a href="/livreur.html">devenir livreur</a>.</p><p class="c"><a href="/api/lite/logout">Se déconnecter</a></p>');
  /* actions : formulaires simples, puis retour à la page */
  if (m === "POST") {
    const b = await form(req);
    let r: { status: number; j: any } = { status: 200, j: {} }, ok = "";
    if (path === "/lite/online") { r = await call("/courier/status", "POST", { online: b.online === "1" }, tok); ok = b.online === "1" ? "Vous êtes en ligne." : "Vous êtes hors ligne."; }
    else if (path === "/lite/accept") { r = await call("/courier/orders/" + b.id + "/accept", "POST", {}, tok); ok = "Course acceptée."; }
    else if (path === "/lite/step") { r = await call("/courier/orders/" + b.id + "/step", "POST", { to: b.to }, tok); ok = "C'est noté."; }
    else if (path === "/lite/deliver") { r = await call("/courier/orders/" + b.id + "/step", "POST", { to: "delivered", code: b.code }, tok); ok = "Course livrée ✓"; }
    else return redirect("/api/lite");
    return redirect(r.status >= 400 ? back(r.j.error || "Action impossible.") : "/api/lite?ok=" + encodeURIComponent(ok));
  }
  const [orders, offers] = await Promise.all([call("/courier/orders", "GET", null, tok), u.courier && u.courier.online ? call("/courier/offers", "GET", null, tok) : Promise.resolve({ status: 200, j: { offers: [] } })]);
  const day = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  const hist = await call("/courier/history?from=" + day + "&to=" + day + "&limit=1", "GET", null, tok);
  const mine = (orders.j.orders || []).filter((o: any) => o.status !== "delivered" && o.status !== "cancelled");
  const online = !!(u.courier && u.courier.online), sum = hist.j.summary || {};
  const tel = (p: string, n: string) => p ? '<a href="tel:+237' + esc(p) + '">' + esc(n || p) + ' ☎</a>' : esc(n || "");
  const pay = (o: any) => o.paymentMethod === "cash" ? "Encaisser " + F(o.price.net) : "Déjà payé";
  const card = (o: any) => {
    const d = o.details || {}, h = d.hints || {}, rc = d.recipient || {}, pc = d.pickupContact || {}, cl = o.client || {};
    const step = o.stage === 0 ? ["picked_up", "Colis récupéré"] : o.stage === 1 ? ["en_route", "En route"] : !o.arrivedAt ? ["arrived", "Je suis arrivé"] : null;
    const code = o.handoverCode || (u.courier && u.courier.basic ? u.courier.pin : "");
    return '<div class="c"><p><b>' + esc(o.code) + '</b> · ' + esc(SVC[o.service] || o.service) + ' · ' + esc(ST[o.status] || o.status) + '</p>' +
      '<p>1) ' + esc(o.pickup) + (h.pickup ? '<br><span class="m">Repère : ' + esc(h.pickup) + '</span>' : '') + '<br>' + tel(pc.phone || cl.phone, pc.name || cl.name) + '</p>' +
      '<p>2) ' + esc(o.dropoff) + (h.dropoff ? '<br><span class="m">Repère : ' + esc(h.dropoff) + '</span>' : '') + '<br>' + tel(rc.phone || cl.phone, rc.name || cl.name) + '</p>' +
      '<p>' + esc(pay(o)) + ' · Gain ' + F(courierShare(o.priceLines || [])) + '</p>' +
      (o.stage === 2 && code && o.service !== "ride" ? '<p>Code à montrer au destinataire :</p><p class="code">' + esc(code) + '</p><p class="m">Il le tape sur son téléphone pour confirmer la réception.</p>' : '') +
      (step ? '<form method="post" action="/api/lite/step"><input type="hidden" name="id" value="' + esc(o.id) + '"><input type="hidden" name="to" value="' + step[0] + '"><button>' + step[1] + '</button></form>' : '') +
      (o.stage >= 1 ? '<form method="post" action="/api/lite/deliver"><input type="hidden" name="id" value="' + esc(o.id) + '"><input name="code" inputmode="numeric" maxlength="4" placeholder="Code de secours du client"><button class="y">Livrer avec son code</button></form>' : '') + '</div>';
  };
  const offerCard = (o: any) => '<div class="c"><p><b>' + esc(SVC[o.service] || "") + '</b> · ' + esc(o.pickup) + ' → ' + esc(o.dropoff) + '</p><p>' +
    (o.fromMeKm != null ? 'À ' + esc(o.fromMeKm) + ' km · ' : '') + esc(pay(o)) + ' · Gain ' + F(courierShare(o.priceLines || [])) + '</p>' +
    '<form method="post" action="/api/lite/accept"><input type="hidden" name="id" value="' + esc(o.id) + '"><button class="y">Accepter</button></form></div>';
  return page("Mes courses", msg(url) +
    '<p class="c">' + esc(u.name || "") + ' · ' + (online ? '<b>En ligne</b>' : 'Hors ligne') + (u.courier && u.courier.pin ? '<br><span class="m">Code livreur (badge) : ' + esc(u.courier.pin) + '</span>' : '') + '</p>' +
    '<form method="post" action="/api/lite/online" class="c"><input type="hidden" name="online" value="' + (online ? "0" : "1") + '"><button' + (online ? '' : ' class="y"') + '>' + (online ? "Passer hors ligne" : "Passer en ligne") + '</button></form>' +
    '<p class="c">Aujourd\'hui : ' + (sum.delivered || 0) + ' course(s) · gagné ' + F(sum.earned || 0) + ' · espèces ' + F(sum.cash || 0) + '</p>' +
    '<h2>Mes courses (' + mine.length + ')</h2>' + (mine.length ? mine.map(card).join("") : '<p class="c m">Aucune course en cours.</p>') +
    (online ? '<h2>Courses disponibles</h2>' + ((offers.j.offers || []).length ? offers.j.offers.slice(0, 8).map(offerCard).join("") : '<p class="c m">Aucune pour l\'instant. La page se met à jour toute seule.</p>') : '') +
    '<p class="c"><a href="/api/lite">Actualiser</a> · <a href="/api/lite/logout">Se déconnecter</a></p>', 60);
}
