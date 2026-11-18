// WunaGo — API (routes sous /api/*), utilisée par Cloudflare Workers (worker/index.mts) et par les tests (netlify/functions/api.mts).
// Base de données : Postgres (Neon en ligne). Connexion par code envoyé au téléphone.
// SMS_MODE=demo (par défaut) : pas de SMS envoyé, le code est renvoyé à l'app pour affichage.

import { createHash, randomBytes, randomInt } from "node:crypto";
import { SERVICES, VEHICLES, PAY_METHODS, STATUSES, quote, normalizePhone, distanceKm, courierShare, TARIFS, QUARTIERS } from "./rules.mts";
import { sendPush, publicKey, pushLog } from "./push.mts";
import { runAlerts } from "./alerts.mts";
import { db, env } from "./platform.mts";
export { configure } from "./platform.mts";

type Row = Record<string, any>;

const SMS_MODE = () => env("SMS_MODE") || "demo";
const DEMO_ACTIONS = () => (env("DEMO_ACTIONS") || "on") !== "off";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (status: number, error: string) => json({ error }, status);

async function body(req: Request): Promise<Row> {
  try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

/* ---------- mise en forme ---------- */
function userOut(u: Row) {
  return { id: u.id, phone: u.phone, name: u.name, role: u.role || "client", wallet: { balance: u.wallet_balance }, prefs: u.prefs || {},
    courier: u.role === "courier" ? { ...(u.courier || {}), online: !!u.online } : undefined };
}
function geoOut(lat: any, lng: any) { return lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) }; }
function orderOut(o: Row) {
  return {
    id: o.id, code: o.code, service: o.service, pickup: o.pickup, dropoff: o.dropoff,
    pickupGeo: geoOut(o.pickup_lat, o.pickup_lng), dropoffGeo: geoOut(o.dropoff_lat, o.dropoff_lng),
    weightKg: Number(o.weight_kg), vehicle: o.vehicle, note: o.note,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    price: { gross: o.price_gross, discount: o.discount, net: o.price_net },
    status: o.status, stage: o.stage, rating: o.rating,
    enRouteAt: o.en_route_at ? new Date(o.en_route_at).getTime() : null,
    proofAt: o.delivered_at ? new Date(o.delivered_at).getTime() : null,
    cancelReason: o.cancel_reason, refundNote: o.refund_note,
    details: o.details || {}, priceLines: o.price_lines || null, distanceKm: o.distance_km == null ? null : Number(o.distance_km), zone: o.zone,
    scheduledAt: o.scheduled_at ? new Date(o.scheduled_at).getTime() : null,
    arrivedAt: o.arrived_at ? new Date(o.arrived_at).getTime() : null, byWunago: !!o.created_by,
    createdAt: new Date(o.created_at).getTime(),
  };
}
function disputeOut(x: Row, orderCode?: string) {
  return { id: x.id, code: x.code, orderId: x.order_id, orderCode: orderCode ?? x.order_code, reason: x.reason, desc: x.description,
    photo: x.photo, status: x.status, createdAt: new Date(x.created_at).getTime() };
}

/* ---------- session ---------- */
async function currentUser(req: Request): Promise<Row | null> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const rows = await db().sql`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha(m[1])} AND s.expires_at > NOW()`;
  return rows[0] || null;
}

/* ---------- transactions ---------- */
async function tx<T>(fn: (q: (text: string, params?: any[]) => Promise<Row[]>) => Promise<T>): Promise<T> {
  const client = await db().pool.connect();
  const q = async (text: string, params: any[] = []) => (await client.query(text, params)).rows as Row[];
  try {
    await client.query("BEGIN");
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/* ---------- routes ---------- */
async function authRequest(req: Request) {
  const { phone: raw } = await body(req);
  const phone = normalizePhone(raw);
  if (!phone) return fail(400, "Numéro invalide : 9 chiffres commençant par 6.");
  const recent = await db().sql`SELECT 1 FROM otp_codes WHERE phone = ${phone} AND created_at > NOW() - INTERVAL '20 seconds'`;
  if (recent.length) return fail(429, "Patientez quelques secondes avant de redemander un code.");
  const code = String(randomInt(1000, 10000));
  await db().sql`
    INSERT INTO otp_codes (phone, code_hash, attempts, expires_at, created_at)
    VALUES (${phone}, ${sha(phone + ":" + code)}, 0, NOW() + INTERVAL '10 minutes', NOW())
    ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = NOW()`;
  // Mode démo : aucun SMS n'est envoyé, le code est renvoyé à l'app (à remplacer par un envoi SMS en mode "live").
  return json({ ok: true, sms: SMS_MODE(), demoCode: SMS_MODE() === "demo" ? code : undefined });
}

async function authVerify(req: Request) {
  const { phone: raw, code } = await body(req);
  const phone = normalizePhone(raw);
  if (!phone || !/^\d{4}$/.test(String(code || ""))) return fail(400, "Code incorrect.");
  const rows = await db().sql`SELECT * FROM otp_codes WHERE phone = ${phone}`;
  const otp = rows[0];
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) return fail(400, "Code expiré : demandez-en un nouveau.");
  if (otp.attempts >= 5) return fail(429, "Trop d'essais : demandez un nouveau code.");
  if (otp.code_hash !== sha(phone + ":" + code)) {
    await db().sql`UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ${phone}`;
    return fail(400, "Code incorrect.");
  }
  await db().sql`DELETE FROM otp_codes WHERE phone = ${phone}`;
  const users = await db().sql`
    INSERT INTO users (phone) VALUES (${phone})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING *`;
  let user = users[0];
  if (adminPhones().includes(phone) && user.role !== "admin") user = (await db().sql`UPDATE users SET role = 'admin' WHERE id = ${user.id} RETURNING *`)[0];
  const token = randomBytes(32).toString("base64url");
  await db().sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha(token)}, ${user.id}, NOW() + INTERVAL '90 days')`;
  return json({ token, user: userOut(user) });
}

async function logout(req: Request) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/);
  if (m) await db().sql`DELETE FROM sessions WHERE token_hash = ${sha(m[1])}`;
  return json({ ok: true });
}

const PREF_KEYS = ["addresses", "payAccounts", "defaultPay", "notifPrefs", "lang", "settings"];
async function patchMe(req: Request, user: Row) {
  const b = await body(req);
  const prefs = { ...(user.prefs || {}) };
  if (b.prefs && typeof b.prefs === "object") for (const k of PREF_KEYS) if (k in b.prefs) prefs[k] = b.prefs[k];
  if (JSON.stringify(prefs).length > 50_000) return fail(413, "Préférences trop volumineuses.");
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) || null : user.name;
  const rows = await db().sql`UPDATE users SET prefs = ${JSON.stringify(prefs)}::jsonb, name = ${name} WHERE id = ${user.id} RETURNING *`;
  return json({ user: userOut(rows[0]) });
}

const ERRS: Record<string, string> = {
  closed: "Service fermé à cette heure (6 h – 22 h) : choisissez un autre moment.",
  empty: "Ajoutez au moins un article.",
  advance: "Au-delà de 50 000 F, réglez les articles à la commande.",
  distance: "Trajet trop long (40 km maximum).",
  service: "Service inconnu."
};
function cleanDetails(service: string, b: Row) {
  const extra: Row = {};
  const h = b.hints || {}, hp = String(h.pickup || "").trim().slice(0, 120), hd = String(h.dropoff || "").trim().slice(0, 120);
  if (hp || hd) extra.hints = { pickup: hp, dropoff: hd };
  const rc = b.recipient || {}, rn = String(rc.name || "").trim().slice(0, 60), rph = normalizePhone(rc.phone);
  if (rn || rph) extra.recipient = { name: rn, phone: rph || "" };
  return { ...serviceDetails(service, b), ...extra };
}
function serviceDetails(service: string, b: Row) {
  if (service === "laundry" && b.laundry) {
    const L = b.laundry, items: Record<string, number> = {};
    for (const [k, v] of Object.entries(L.items || {})) { const n = Math.max(0, Math.min(200, Math.floor(Number(v) || 0))); if (n) items[k] = n; }
    return { laundry: { items, kg: Math.max(0, Math.min(200, Number(L.kg) || 0)), mode: String(L.mode || "wash_iron"), speed: String(L.speed || "standard"), sameReturn: L.sameReturn !== false } };
  }
  if (service === "errand" && b.errand) {
    const E = b.errand;
    const list = (Array.isArray(E.list) ? E.list : []).slice(0, 60)
      .map((x: Row) => ({ name: String(x?.name || "").trim().slice(0, 80), qty: Math.max(1, Math.min(99, Math.round(Number(x?.qty) || 1))), price: Math.max(0, Math.min(1_000_000, Math.round(Number(x?.price) || 0))) }))
      .filter((x: Row) => x.name);
    return { errand: { list, load: ["light", "medium", "heavy"].includes(E.load) ? E.load : "light", advance: E.advance !== false } };
  }
  if (service === "ride") return { ride: { passengers: Math.max(1, Math.min(4, Math.round(Number(b.ride?.passengers) || 1))) } };
  return {};
}

async function createOrder(req: Request, user: Row) { return createOrderFrom(await body(req), user, null); }
async function createOrderFrom(b: Row, user: Row, createdBy: string | null) {
  const service = String(b.service);
  if (!(SERVICES as readonly string[]).includes(service)) return fail(400, "Service inconnu.");
  /* Codes WunaGo : le serveur remplit lui-même adresse, position exacte, repère et destinataire */
  const usedCodes: string[] = [];
  for (const f of ["pickup", "dropoff"]) {
    const code = b[f + "Code"]; if (!code) continue;
    const p = await findPlace(code);
    if (!p) return fail(400, "Code WunaGo introuvable : " + String(code).toUpperCase());
    usedCodes.push(p.code);
    b[f] = (p.place_name ? p.place_name + ", " : "") + p.area + ", Douala · " + p.code;
    b[f + "Geo"] = { lat: p.lat, lng: p.lng };
    b.hints = { ...(b.hints || {}), [f]: p.hint || (b.hints || {})[f] || "" };
    if (f === "dropoff" && service === "parcel" && p.user_id !== user.id) b.recipient = { name: p.owner_name || "", phone: p.owner_phone };
  }
  if (!(VEHICLES as readonly string[]).includes(b.vehicle)) return fail(400, "Véhicule inconnu.");
  if (!(PAY_METHODS as readonly string[]).includes(b.paymentMethod)) return fail(400, "Moyen de paiement inconnu.");
  const pickup = String(b.pickup || "").trim().slice(0, 200), dropoff = String(b.dropoff || "").trim().slice(0, 200);
  if (!pickup || !dropoff) return fail(400, "Indiquez les adresses.");
  const weight = service === "parcel" ? Math.round(Number(b.weightKg) * 10) / 10 : 0;
  if (service === "parcel" && !(weight >= 0.5 && weight <= 1000)) return fail(400, "Poids invalide.");
  const now = Date.now();
  let scheduledAt: number | null = Number(b.scheduledAt) || null;
  if (scheduledAt && (scheduledAt < now - 5 * 60000 || scheduledAt > now + 7 * 86400000)) return fail(400, "Créneau invalide.");
  const g = (p: any) => (p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) ? { lat: +p.lat, lng: +p.lng } : null);
  const pg = g(b.pickupGeo), dg = g(b.dropoffGeo);
  const details = cleanDetails(service, b);
  // Le serveur recalcule le prix avec la même grille que l'app : il fait foi.
  const qt = quote({ service, pickup, dropoff, pickupGeo: pg, dropoffGeo: dg, vehicle: b.vehicle, weightKg: weight, scheduledAt, ...details }, now);
  const blocking = qt.errors.find((e: string) => ERRS[e]);
  if (blocking) return fail(400, ERRS[blocking]);
  const price = { gross: qt.gross, discount: qt.discount, net: qt.net };
  const [plat, plng] = pg ? [pg.lat, pg.lng] : [null, null], [dlat, dlng] = dg ? [dg.lat, dg.lng] : [null, null];
  const paid = b.paymentMethod !== "cash";
  try {
    const order = await tx(async (q) => {
      if (b.paymentMethod === "wallet") {
        const r = await q("UPDATE users SET wallet_balance = wallet_balance - $2 WHERE id = $1 AND wallet_balance >= $2 RETURNING wallet_balance", [user.id, price.net]);
        if (!r.length) throw new HttpError(402, "Solde insuffisant.");
      }
      const year = new Date().getFullYear();
      const rows = await q(
        `INSERT INTO orders (code, user_id, service, pickup, dropoff, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, weight_kg, vehicle, note,
           payment_method, payment_status, price_gross, discount, price_net, details, price_lines, distance_km, zone, scheduled_at, delivery_code, track_token)
         VALUES ('WUN-' || $1 || '-' || LPAD(nextval('order_code_seq')::text, 3, '0'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
        [year, user.id, service, pickup, dropoff, plat, plng, dlat, dlng, weight, qt.vehicle, String(b.note || "").slice(0, 500),
          b.paymentMethod, paid ? "paid" : "cod", price.gross, price.discount, price.net, JSON.stringify(details), JSON.stringify(qt.lines),
          qt.distanceKm, qt.zone, scheduledAt ? new Date(scheduledAt).toISOString() : null,
          String(randomInt(1000, 10000)), randomBytes(12).toString("base64url")]);
      if (createdBy) await q("UPDATE orders SET created_by = $2 WHERE id = $1", [rows[0].id, createdBy]);
      if (usedCodes.length) await q("UPDATE places SET uses = uses + 1 WHERE code = ANY($1::text[])", [usedCodes]);
      if (b.paymentMethod === "wallet") await q("INSERT INTO wallet_tx (user_id, amount, kind, order_id) VALUES ($1, $2, 'order', $3)", [user.id, -price.net, rows[0].id]);
      return rows[0];
    });
    const u = await db().sql`SELECT wallet_balance FROM users WHERE id = ${user.id}`;
    if (!scheduledAt || scheduledAt < Date.now() + 2 * 3600000) {
      /* d'abord les 3 livreurs en ligne les plus proches (8 km max) ; les autres sont prévenus après 3 minutes */
      const couriers = await db().sql`SELECT id, pos_lat, pos_lng FROM users WHERE role = 'courier' AND online`;
      const near = pg ? couriers.filter((c) => c.pos_lat != null).map((c) => ({ id: c.id, km: distanceKm(pg, { lat: c.pos_lat, lng: c.pos_lng }) * 1.35 }))
        .filter((c) => c.km <= 8).sort((a, b2) => a.km - b2.km).slice(0, 3) : [];
      const targets = near.length ? near.map((c) => c.id) : couriers.map((c) => c.id);
      if (!near.length) await db().sql`UPDATE orders SET broadcast_at = NOW() WHERE id = ${order.id}`;
      push(targets, { title: "Nouvelle course · " + fmtF(courierShare(order.price_lines || [])) + " pour vous", body: `${SVC_FR[order.service]} · ${order.pickup}`, url: "/#courses", tag: "offres" }, "offers");
    }
    return json({ order: { ...orderOut(order), deliveryCode: order.delivery_code, trackToken: order.track_token }, wallet: { balance: u[0].wallet_balance } }, 201);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
  }
}

async function ownedOrder(user: Row, ref: string) {
  const rows = await db().sql`SELECT * FROM orders WHERE user_id = ${user.id} AND (code = ${ref} OR id::text = ${ref})`;
  return rows[0] || null;
}

async function cancelOrder(req: Request, user: Row, ref: string) {
  const { reason } = await body(req);
  try {
    const out = await tx(async (q) => {
      const rows = await q("SELECT * FROM orders WHERE user_id = $1 AND (code = $2 OR id::text = $2) FOR UPDATE", [user.id, ref]);
      const o = rows[0];
      if (!o) throw new HttpError(404, "Commande introuvable.");
      if (o.status === "cancelled") throw new HttpError(409, "Commande déjà annulée.");
      if (o.stage > 0) throw new HttpError(409, "Le colis a déjà été récupéré : annulation impossible.");
      let note = "Aucun montant n'a été débité.", payStatus = o.payment_status;
      if (o.payment_method === "wallet") {
        await q("UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1", [user.id, o.price_net]);
        await q("INSERT INTO wallet_tx (user_id, amount, kind, order_id) VALUES ($1, $2, 'refund', $3)", [user.id, o.price_net, o.id]);
        note = "Remboursé sur votre portefeuille."; payStatus = "refunded";
      } else if (o.payment_status === "paid") { note = "Remboursement sur votre compte Mobile Money sous 48 h."; payStatus = "refund_pending"; }
      const up = await q(
        "UPDATE orders SET status = 'cancelled', cancel_reason = $2, refund_note = $3, payment_status = $4, updated_at = NOW() WHERE id = $1 RETURNING *",
        [o.id, String(reason || "").slice(0, 120) || null, note, payStatus]);
      return up[0];
    });
    const u = await db().sql`SELECT wallet_balance FROM users WHERE id = ${user.id}`;
    if (out.courier_id) push([out.courier_id], { title: "Course annulée", body: `${out.code} a été annulée par le client.`, url: "/#courses", tag: out.code }, "offers");
    return json({ order: orderOut(out), wallet: { balance: u[0].wallet_balance } });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
  }
}

/* Démo (en attendant l'app livreur de l'étape 5) : fait avancer la livraison d'une étape. */
async function advanceOrder(user: Row, ref: string) {
  if (!DEMO_ACTIONS()) return fail(403, "Action réservée à la démonstration.");
  const o = await ownedOrder(user, ref);
  if (!o) return fail(404, "Commande introuvable.");
  if (o.courier_id) return fail(409, "Un livreur WunaGo s'occupe de cette commande.");
  if (o.status === "cancelled" || o.delivered_at) return json({ order: orderOut(o) });
  // Même progression que l'app : reçue → récupérée → en route → livrée, puis preuve de livraison.
  let rows: Row[];
  if (o.stage >= 3) {
    rows = await db().sql`UPDATE orders SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
  } else {
    const next = o.stage + 1;
    rows = next === 2
      ? await db().sql`UPDATE orders SET stage = 2, status = 'en_route', en_route_at = NOW(), updated_at = NOW() WHERE id = ${o.id} RETURNING *`
      : await db().sql`UPDATE orders SET stage = ${next}, status = ${STATUSES[next]}, updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
  }
  return json({ order: orderOut(rows[0]) });
}

async function rateOrder(req: Request, user: Row, ref: string) {
  const { rating } = await body(req);
  const r = Number(rating);
  if (!(r >= 1 && r <= 5)) return fail(400, "Note entre 1 et 5.");
  const rows = await db().sql`UPDATE orders SET rating = ${r}, updated_at = NOW() WHERE user_id = ${user.id} AND (code = ${ref} OR id::text = ${ref}) AND status = 'delivered' RETURNING *`;
  if (!rows.length) return fail(404, "Commande livrée introuvable.");
  return json({ order: orderOut(rows[0]) });
}

async function walletTopUp(req: Request, user: Row) {
  if (!DEMO_ACTIONS()) return fail(403, "Recharge réelle disponible avec les paiements Mobile Money.");
  const { amount } = await body(req);
  const a = Math.round(Number(amount));
  if (!(a >= 100 && a <= 500000)) return fail(400, "Montant entre 100 et 500 000 FCFA.");
  const out = await tx(async (q) => {
    const r = await q("UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1 RETURNING wallet_balance", [user.id, a]);
    await q("INSERT INTO wallet_tx (user_id, amount, kind) VALUES ($1, $2, 'topup')", [user.id, a]);
    return r[0];
  });
  return json({ wallet: { balance: out.wallet_balance } });
}

async function walletSend(req: Request, user: Row) {
  const { amount, phone: raw } = await body(req);
  const a = Math.round(Number(amount)), phone = normalizePhone(raw);
  if (!phone) return fail(400, "Numéro du destinataire invalide.");
  if (phone === user.phone) return fail(400, "Vous ne pouvez pas vous envoyer de l'argent.");
  if (!(a >= 100)) return fail(400, "Montant minimum : 100 FCFA.");
  try {
    const out = await tx(async (q) => {
      const r = await q("UPDATE users SET wallet_balance = wallet_balance - $2 WHERE id = $1 AND wallet_balance >= $2 RETURNING wallet_balance", [user.id, a]);
      if (!r.length) throw new HttpError(402, "Solde insuffisant.");
      const dest = await q("INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id", [phone]);
      await q("UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1", [dest[0].id, a]);
      await q("INSERT INTO wallet_tx (user_id, amount, kind) VALUES ($1, $2, 'send'), ($3, $4, 'receive')", [user.id, -a, dest[0].id, a]);
      return r[0];
    });
    return json({ wallet: { balance: out.wallet_balance } });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
  }
}

async function createDispute(req: Request, user: Row) {
  const b = await body(req);
  const o = await ownedOrder(user, String(b.orderId || ""));
  if (!o) return fail(404, "Commande introuvable.");
  const reason = String(b.reason || "").trim().slice(0, 80), desc = String(b.desc || "").trim().slice(0, 2000);
  if (!reason || desc.length < 5) return fail(400, "Choisissez le problème et décrivez-le en quelques mots.");
  const photo = typeof b.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400_000 ? b.photo : null;
  const year = new Date().getFullYear();
  const rows = await db().sql`
    INSERT INTO disputes (code, user_id, order_id, reason, description, photo)
    VALUES ('LIT-' || ${year} || '-' || LPAD(nextval('dispute_code_seq')::text, 3, '0'), ${user.id}, ${o.id}, ${reason}, ${desc}, ${photo})
    RETURNING *`;
  return json({ dispute: disputeOut(rows[0], o.code) }, 201);
}

/* ====================== rôles, livreurs, messagerie, backoffice, notifications ====================== */

const fmtF = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F";
const PAY_FR: Record<string, string> = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wallet: "Portefeuille", cash: "Espèces", card: "Carte" };
const PAYST_FR: Record<string, string> = { paid: "Payé", cod: "À la livraison", refunded: "Remboursé", refund_pending: "Remboursement en cours" };
const SVC_FR: Record<string, string> = { parcel: "Livraison colis", laundry: "Pressing", errand: "Courses", ride: "Déplacement" };
const STEP_FR: Record<string, Record<string, string>> = {
  picked_up: { parcel: "Votre colis a été récupéré.", laundry: "Votre linge a été collecté.", errand: "Le livreur fait vos achats.", ride: "Votre chauffeur arrive." },
  en_route: { parcel: "Votre colis est en route.", laundry: "Votre linge est en route.", errand: "Vos courses sont en route.", ride: "Vous êtes en route." },
  delivered: { parcel: "Colis livré. Merci !", laundry: "Linge livré. Merci !", errand: "Courses livrées. Merci !", ride: "Course terminée. Merci !" }
};
let currentContext: any = null;
function later(p: Promise<any>) {
  const safe = p.catch((e) => console.error("background", e));
  if (currentContext && typeof currentContext.waitUntil === "function") currentContext.waitUntil(safe);
}
const push = (ids: string[], payload: { title: string; body: string; url?: string; tag?: string }, kind: string) => later(sendPush(db(), ids, payload, kind));
const firstName = (u: Row | null | undefined) => (u && u.name ? String(u.name).split(" ")[0] : "Client");
function adminPhones(): string[] { return String(env("ADMIN_PHONES") || "").split(",").map((x) => normalizePhone(x)).filter(Boolean) as string[]; }

/* livreurs rattachés aux commandes (nom, téléphone, véhicule, note, position) */
async function enrich(rows: Row[], viewer: Row) {
  const ids = [...new Set(rows.map((o) => o.courier_id).filter(Boolean))];
  const map: Record<string, Row> = {};
  if (ids.length) {
    const cs = await db().sql`
      SELECT u.id, u.name, u.phone, u.courier, u.pos_lat, u.pos_lng, u.pos_at,
        (SELECT ROUND(AVG(rating)::numeric, 1) FROM orders WHERE courier_id = u.id AND rating IS NOT NULL) AS rating
      FROM users u WHERE u.id = ANY(${ids}::uuid[])`;
    cs.forEach((c) => (map[c.id] = c));
  }
  return rows.map((o) => {
    const out: Row = orderOut(o);
    const c = o.courier_id ? map[o.courier_id] : null;
    if (c) {
      const live = o.status !== "delivered" && o.status !== "cancelled";
      out.courier = { id: c.id, name: c.name || "Livreur WunaGo", phone: live || viewer.role === "admin" ? c.phone : null,
        vehicle: (c.courier || {}).vehicle || o.vehicle, plate: (c.courier || {}).plate || null, rating: c.rating == null ? null : Number(c.rating),
        pos: live && c.pos_lat != null ? { lat: c.pos_lat, lng: c.pos_lng, at: new Date(c.pos_at).getTime() } : null };
    }
    out.proofName = o.proof_name || null;
    out.deliveredWith = o.delivered_with || null;
    if (o.user_id === viewer.id || viewer.role === "admin") { out.deliveryCode = o.delivery_code || null; out.trackToken = o.track_token || null; }
    out.proofPhoto = o.proof_photo || null;
    out.assignedAt = o.assigned_at ? new Date(o.assigned_at).getTime() : null;
    return out;
  });
}

/* historique des courses d'un livreur et ses gains, sur une période (dates de Douala) */
async function courierHistory(courierId: string, sp: URLSearchParams) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(sp.get("from") || "") ? sp.get("from") : null, to = iso.test(sp.get("to") || "") ? sp.get("to") : null;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50)), offset = Math.max(0, Number(sp.get("offset")) || 0);
  const W = `WHERE o.courier_id = $1 AND ($2::date IS NULL OR o.created_at >= ($2::date)::timestamp AT TIME ZONE 'Africa/Douala')
    AND ($3::date IS NULL OR o.created_at < ($3::date + 1)::timestamp AT TIME ZONE 'Africa/Douala')`;
  const args = [courierId, from, to];
  const [all, page, life, pays] = await Promise.all([
    db().pool.query(`SELECT o.status, o.payment_method, o.price_net, o.price_lines, o.distance_km, o.rating, o.created_at, o.assigned_at, o.delivered_at FROM orders o ${W}`, args),
    db().pool.query(`SELECT o.*, u.name AS client_name FROM orders o JOIN users u ON u.id = o.user_id ${W} ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`, args),
    db().pool.query(`SELECT payment_method, price_net, price_lines FROM orders WHERE courier_id = $1 AND status = 'delivered'`, [courierId]),
    db().pool.query(`SELECT p.id, p.amount, p.note, p.created_at, a.name AS by_name FROM courier_payments p LEFT JOIN users a ON a.id = p.created_by
      WHERE p.courier_id = $1 ORDER BY p.created_at DESC LIMIT 200`, [courierId])
  ]);
  /* solde depuis le début : espèces encaissées − gains − versements déjà faits */
  const lifeRows = life.rows as Row[], payRows = pays.rows as Row[];
  const cashAll = lifeRows.filter((o) => o.payment_method === "cash").reduce((a, o) => a + o.price_net, 0);
  const earnedAll = lifeRows.reduce((a, o) => a + courierShare(o.price_lines || []), 0);
  const paidAll = payRows.reduce((a, p) => a + Number(p.amount), 0);
  const balance = { cash: cashAll, earned: earnedAll, paid: paidAll, due: cashAll - earnedAll - paidAll };
  const payments = payRows.map((p) => ({ id: Number(p.id), amount: Number(p.amount), note: p.note, by: p.by_name || "", at: new Date(p.created_at).getTime() }));
  const rows = all.rows as Row[];
  const art = (o: Row) => (o.price_lines || []).filter((l: Row) => l.key === "articles").reduce((a: number, l: Row) => a + (l.amount || 0), 0);
  const days: Record<string, Row> = {};
  const sum = { courses: rows.length, delivered: 0, cancelled: 0, active: 0, earned: 0, cash: 0, revenue: 0, km: 0, rating: null as number | null, ratings: 0, minutes: null as number | null };
  let rs = 0, ms = 0, mn = 0;
  for (const o of rows) {
    if (o.status === "cancelled") { sum.cancelled++; continue; }
    if (o.status !== "delivered") { sum.active++; continue; }
    sum.delivered++;
    const g = courierShare(o.price_lines || []);
    sum.earned += g; sum.revenue += o.price_net - art(o); sum.km += Number(o.distance_km || 0);
    if (o.payment_method === "cash") sum.cash += o.price_net;
    if (o.rating) { rs += o.rating; sum.ratings++; }
    if (o.assigned_at && o.delivered_at) { ms += (new Date(o.delivered_at).getTime() - new Date(o.assigned_at).getTime()) / 60000; mn++; }
    const k = new Date(new Date(o.created_at).getTime() + 3600000).toISOString().slice(0, 10);
    const d = days[k] || (days[k] = { day: k, delivered: 0, earned: 0, cash: 0 });
    d.delivered++; d.earned += g; if (o.payment_method === "cash") d.cash += o.price_net;
  }
  sum.rating = sum.ratings ? Math.round(rs / sum.ratings * 10) / 10 : null;
  sum.minutes = mn ? Math.round(ms / mn) : null;
  sum.km = Math.round(sum.km * 10) / 10;
  const list = page.rows as Row[];
  const out = list.map((o) => ({ id: o.id, code: o.code, service: o.service, status: o.status, pickup: o.pickup, dropoff: o.dropoff, client: o.client_name || "Client",
    price: o.price_net, paymentMethod: o.payment_method, gain: o.status === "delivered" ? courierShare(o.price_lines || []) : 0,
    estimate: courierShare(o.price_lines || []), distanceKm: o.distance_km == null ? null : Number(o.distance_km), rating: o.rating,
    createdAt: new Date(o.created_at).getTime(), deliveredAt: o.delivered_at ? new Date(o.delivered_at).getTime() : null }));
  return { period: { from, to }, summary: { ...sum, due: sum.cash - sum.earned }, byDay: Object.values(days).sort((a, b) => a.day < b.day ? -1 : 1),
    orders: out, more: offset + out.length < rows.length, balance, payments };
}

/* ---------- Code WunaGo : adresse en 6 caractères ---------- */
const CODE_ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const normCode = (c: any) => { const s = String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^WG/, ""); return s.length === 4 ? "WG-" + s : null; };
function nearestArea(lat: number, lng: number) {
  let best: any = null, bd = 1e9;
  for (const q of QUARTIERS as any[]) { const d = distanceKm({ lat, lng }, q); if (d < bd) { bd = d; best = q; } }
  return best ? (bd < 1.2 ? best.name : "Près de " + best.name) : "Douala";
}
function placeOut(p: Row, owner?: Row) {
  return { code: p.code, label: p.label, placeName: p.place_name, area: p.area, hint: p.hint, geo: { lat: p.lat, lng: p.lng }, uses: p.uses,
    address: (p.place_name ? p.place_name + ", " : "") + p.area + ", Douala", name: owner ? owner.name || "" : undefined, phone: owner ? owner.phone : undefined,
    createdAt: new Date(p.created_at).getTime(), updatedAt: new Date(p.updated_at).getTime() };
}
async function findPlace(code: any) {
  const c = normCode(code); if (!c) return null;
  const r = (await db().sql`SELECT p.*, u.name AS owner_name, u.phone AS owner_phone FROM places p JOIN users u ON u.id = p.user_id WHERE p.code = ${c} AND u.deleted_at IS NULL`)[0];
  return r || null;
}
async function placesRoutes(req: Request, user: Row, path: string, m: string): Promise<Response | null> {
  if (path === "/places" && m === "GET") {
    const rows = await db().sql`SELECT * FROM places WHERE user_id = ${user.id} ORDER BY created_at`;
    return json({ places: rows.map((p) => placeOut(p, user)) });
  }
  if (path === "/places" && m === "POST") {
    const b = await body(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return fail(400, "Position introuvable : activez la localisation.");
    if (distanceKm({ lat, lng }, { lat: 4.05, lng: 9.72 }) > 60) return fail(400, "Le Code WunaGo est disponible à Douala et ses environs.");
    const count = (await db().sql`SELECT COUNT(*) AS n FROM places WHERE user_id = ${user.id}`)[0].n;
    if (Number(count) >= 5) return fail(409, "5 codes au maximum par compte.");
    const label = String(b.label || "Maison").trim().slice(0, 30) || "Maison";
    for (let i = 0; i < 8; i++) {
      let c = "WG-"; for (let k = 0; k < 4; k++) c += CODE_ALPHA[randomInt(0, CODE_ALPHA.length)];
      try {
        const rows = await db().sql`INSERT INTO places (code, user_id, label, place_name, area, lat, lng, hint)
          VALUES (${c}, ${user.id}, ${label}, ${String(b.placeName || "").trim().slice(0, 60)}, ${nearestArea(lat, lng)}, ${lat}, ${lng}, ${String(b.hint || "").trim().slice(0, 120)}) RETURNING *`;
        return json({ place: placeOut(rows[0], user) }, 201);
      } catch (e: any) { if (!String(e && e.message).includes("duplicate")) throw e; }
    }
    return fail(500, "Réessayez dans un instant.");
  }
  const r = path.match(/^\/places\/(WG-[0-9A-Z]{4})$/);
  if (r && m === "PATCH") {
    const b = await body(req);
    const p = (await db().sql`SELECT * FROM places WHERE code = ${r[1]} AND user_id = ${user.id}`)[0];
    if (!p) return fail(404, "Code introuvable.");
    const lat = b.lat != null ? Number(b.lat) : p.lat, lng = b.lng != null ? Number(b.lng) : p.lng;
    const rows = await db().sql`UPDATE places SET lat = ${lat}, lng = ${lng}, area = ${nearestArea(lat, lng)},
      label = ${b.label != null ? String(b.label).trim().slice(0, 30) || p.label : p.label},
      place_name = ${b.placeName != null ? String(b.placeName).trim().slice(0, 60) : p.place_name},
      hint = ${b.hint != null ? String(b.hint).trim().slice(0, 120) : p.hint}, updated_at = NOW() WHERE code = ${r[1]} RETURNING *`;
    return json({ place: placeOut(rows[0], user) });
  }
  if (r && m === "DELETE") {
    await db().sql`DELETE FROM places WHERE code = ${r[1]} AND user_id = ${user.id}`;
    return json({ ok: true });
  }
  const lk = path.match(/^\/codes\/([A-Za-z0-9-]{4,8})$/);
  if (lk && m === "GET") {
    const p = await findPlace(lk[1]);
    if (!p) return fail(404, "Ce Code WunaGo n'existe pas. Vérifiez les 4 caractères après « WG- ».");
    const out = placeOut(p, { name: p.owner_name, phone: p.owner_phone });
    return json({ place: { ...out, mine: p.user_id === user.id } });
  }
  return null;
}

/* ---------- suivi public (lien partagé au destinataire, sans compte) ---------- */
async function publicTrack(token: string) {
  const o = (await db().sql`SELECT * FROM orders WHERE track_token = ${token}`)[0];
  if (!o) return fail(404, "Lien de suivi introuvable ou expiré.");
  const live = o.status !== "delivered" && o.status !== "cancelled";
  let courier = null;
  if (o.courier_id) {
    const c = (await db().sql`SELECT name, phone, courier, pos_lat, pos_lng, pos_at FROM users WHERE id = ${o.courier_id}`)[0];
    if (c) courier = { name: String(c.name || "Livreur").split(" ")[0], vehicle: (c.courier || {}).vehicle || o.vehicle, plate: (c.courier || {}).plate || null,
      phone: live ? c.phone : null, pos: live && c.pos_lat != null ? { lat: c.pos_lat, lng: c.pos_lng, at: new Date(c.pos_at).getTime() } : null };
  }
  const d = o.details || {};
  return json({ code: o.code, service: o.service, status: o.status, stage: o.stage, pickup: o.pickup, dropoff: o.dropoff, hints: d.hints || null,
    positionShared: !!d.dropoffShared, canSharePosition: live && o.service !== "ride" && !(o.service === "laundry" && d.laundry && d.laundry.sameReturn),
    recipient: d.recipient ? { name: d.recipient.name || "" } : null, vehicle: o.vehicle,
    pickupGeo: o.pickup_lat != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null, dropoffGeo: o.dropoff_lat != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null,
    createdAt: new Date(o.created_at).getTime(), deliveredAt: o.delivered_at ? new Date(o.delivered_at).getTime() : null,
    arrivedAt: o.arrived_at && o.status !== "delivered" ? new Date(o.arrived_at).getTime() : null, courier });
}

/* le destinataire envoie sa position exacte depuis le lien de suivi (point d'arrivée corrigé, prix inchangé) */
async function shareDropoff(token: string, b: Row) {
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return fail(400, "Position invalide.");
  const o = (await db().sql`SELECT * FROM orders WHERE track_token = ${token}`)[0];
  if (!o) return fail(404, "Lien de suivi introuvable.");
  if (o.status === "delivered" || o.status === "cancelled") return fail(409, "Cette livraison est terminée.");
  if (o.service === "ride" || (o.service === "laundry" && (o.details || {}).laundry?.sameReturn)) return fail(409, "Non disponible pour ce service.");
  const before = o.dropoff_lat != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null;
  if (before && distanceKm(before, { lat, lng }) * 1.35 > 2.5)
    return fail(409, "Vous êtes loin de l'adresse indiquée dans la commande. Appelez le livreur ou le client pour la corriger.");
  const details = { ...(o.details || {}), dropoffShared: { at: Date.now(), acc: Math.round(Number(b.accuracy) || 0) } };
  const rows = await db().sql`UPDATE orders SET dropoff_lat = ${lat}, dropoff_lng = ${lng}, details = ${JSON.stringify(details)}::jsonb, updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
  if (o.courier_id) push([o.courier_id], { title: "Position exacte reçue · " + o.code, body: "Le destinataire a envoyé sa position : l'itinéraire est à jour.", url: "/#courses", tag: o.code }, "orders");
  push([o.user_id], { title: "Position du destinataire reçue", body: o.code + " : le livreur ira directement au bon endroit.", url: "/#commande=" + o.id, tag: o.code }, "orders");
  return json({ ok: true, dropoffGeo: { lat: rows[0].dropoff_lat, lng: rows[0].dropoff_lng } });
}

/* Les fonctions planifiées ne tournent qu'en production. En version de test (deploy preview), les alertes
   sont aussi déclenchées par l'activité : écrans du backoffice et des livreurs (au plus une fois par minute et par instance). */
let lastAlerts = 0;
function maybeAlerts() {
  if (Date.now() - lastAlerts < 60000) return;
  lastAlerts = Date.now();
  later(runAlerts(db()));
}

/* ---------- livreur ---------- */
async function withClient(o: Row, viewer: Row) {
  const c = (await db().sql`SELECT name, phone FROM users WHERE id = ${o.user_id}`)[0] || {};
  const out = (await enrich([o], viewer))[0];
  out.client = { name: c.name || "Client", phone: o.status === "delivered" || o.status === "cancelled" ? null : c.phone };
  return out;
}
async function courierRoutes(req: Request, user: Row, path: string, m: string): Promise<Response | null> {
  if (!path.startsWith("/courier")) return null;
  if (user.role !== "courier") return fail(403, "Espace réservé aux livreurs WunaGo.");
  const b = m === "POST" ? await body(req) : {};
  if (path === "/courier/status" && m === "POST") {
    const rows = await db().sql`UPDATE users SET online = ${!!b.online} WHERE id = ${user.id} RETURNING *`;
    return json({ user: userOut(rows[0]) });
  }
  if (path === "/courier/position" && m === "POST") {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return fail(400, "Position invalide.");
    await db().sql`UPDATE users SET pos_lat = ${lat}, pos_lng = ${lng}, pos_at = NOW() WHERE id = ${user.id}`;
    return json({ ok: true });
  }
  if (path === "/courier/history" && m === "GET") return json(await courierHistory(user.id, new URL(req.url).searchParams));
  if (path === "/courier/offers" && m === "GET") {
    maybeAlerts();
    const rows = await db().sql`
      SELECT * FROM orders WHERE courier_id IS NULL AND status = 'received'
        AND (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '2 hours')
        AND (broadcast_at IS NOT NULL OR created_at < NOW() - INTERVAL '3 minutes' OR pickup_lat IS NULL
          OR (${user.pos_lat}::float8 IS NOT NULL AND 2 * 6371 * asin(sqrt(power(sin(radians(pickup_lat - ${user.pos_lat}::float8) / 2), 2)
             + cos(radians(${user.pos_lat}::float8)) * cos(radians(pickup_lat)) * power(sin(radians(pickup_lng - ${user.pos_lng}::float8) / 2), 2))) * 1.35 <= 8))
      ORDER BY created_at ASC LIMIT 50`;
    const me = user.pos_lat != null ? { lat: user.pos_lat, lng: user.pos_lng } : null;
    const out = (await enrich(rows, user)).map((o) => ({ ...o, fromMeKm: me && o.pickupGeo ? Math.round(distanceKm(me, o.pickupGeo) * 13.5) / 10 : null }));
    out.sort((a, b2) => (a.fromMeKm ?? 99) - (b2.fromMeKm ?? 99));
    return json({ offers: out.slice(0, 30) });
  }
  if (path === "/courier/orders" && m === "GET") {
    const rows = await db().sql`SELECT * FROM orders WHERE courier_id = ${user.id} ORDER BY (status IN ('delivered','cancelled')), created_at DESC LIMIT 50`;
    const clients = await db().sql`SELECT id, name, phone FROM users WHERE id = ANY(${[...new Set(rows.map((r) => r.user_id))]}::uuid[])`;
    const cmap: Row = {}; clients.forEach((c) => (cmap[c.id] = c));
    return json({ orders: (await enrich(rows, user)).map((o, i) => ({ ...o, client: { name: cmap[rows[i].user_id]?.name || "Client", phone: o.status === "delivered" || o.status === "cancelled" ? null : cmap[rows[i].user_id]?.phone } })) });
  }
  let r = path.match(/^\/courier\/orders\/([A-Za-z0-9-]+)\/(accept|step)$/);
  if (r && m === "POST") {
    const ref = r[1];
    if (r[2] === "accept") {
      const rows = await db().sql`
        UPDATE orders SET courier_id = ${user.id}, assigned_at = NOW(), updated_at = NOW()
        WHERE (code = ${ref} OR id::text = ${ref}) AND courier_id IS NULL AND status = 'received' RETURNING *`;
      if (!rows.length) return fail(409, "Course déjà prise ou annulée.");
      const o = rows[0];
      await db().sql`UPDATE users SET online = true WHERE id = ${user.id}`;
      await addOrderMember(o, user.id);
      push([o.user_id], { title: "Livreur trouvé", body: `${firstName(user)} prend en charge votre commande ${o.code}.`, url: "/#commande=" + o.id, tag: o.code }, "orders");
      return json({ order: await withClient(o, user) });
    }
    const to = String(b.to);
    const rows0 = await db().sql`SELECT * FROM orders WHERE (code = ${ref} OR id::text = ${ref}) AND courier_id = ${user.id}`;
    const o = rows0[0];
    if (!o) return fail(404, "Course introuvable.");
    if (o.status === "cancelled") return fail(409, "Commande annulée par le client.");
    let rows: Row[];
    if (to === "arrived") {
      if (!(o.stage === 2 || (o.service === "ride" && o.stage === 0))) return fail(409, "Indiquez votre arrivée une fois sur place.");
      rows = await db().sql`UPDATE orders SET arrived_at = NOW(), updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
      const a = rows[0];
      push([a.user_id], { title: o.service === "ride" ? "Votre chauffeur est arrivé" : "Votre livreur est arrivé",
        body: (o.service === "ride" ? "Il vous attend au point de départ." : "Il est sur place") + (o.delivery_code && o.service !== "ride" ? ". Code de remise : " + o.delivery_code + "." : "."),
        url: "/#commande=" + a.id, tag: a.code }, "orders");
      return json({ order: await withClient(a, user) });
    }
    if (to === "picked_up" && o.stage === 0) rows = await db().sql`UPDATE orders SET stage = 1, status = 'picked_up', updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
    else if (to === "en_route" && o.stage === 1) rows = await db().sql`UPDATE orders SET stage = 2, status = 'en_route', en_route_at = NOW(), updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
    else if (to === "delivered" && o.stage >= 1) {
      const photo = typeof b.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400_000 ? b.photo : null;
      const name = String(b.receivedBy || "").trim().slice(0, 60), code = String(b.code || "").replace(/\D/g, "");
      let how = "name";
      if (code) {
        if (!o.delivery_code || code !== o.delivery_code) return fail(400, "Code de remise incorrect. Demandez-le au destinataire.");
        how = "code";
      } else {
        /* sans code : nom de la personne et photo obligatoires */
        if (name.length < 2) return fail(400, "Indiquez le nom de la personne qui a reçu.");
        if (o.delivery_code && !photo) return fail(400, "Sans code, une photo de la remise est obligatoire.");
      }
      rows = await db().sql`
        UPDATE orders SET stage = 3, status = 'delivered', delivered_at = NOW(), proof_photo = ${photo}, proof_name = ${name || null}, delivered_with = ${how}, updated_at = NOW()
        WHERE id = ${o.id} RETURNING *`;
    } else return fail(409, "Étape impossible depuis le statut actuel.");
    const done = rows[0];
    push([done.user_id], { title: SVC_FR[done.service] + " · " + done.code, body: STEP_FR[to][done.service], url: "/#commande=" + done.id, tag: done.code }, "orders");
    return json({ order: await withClient(done, user) });
  }
  return fail(404, "Route inconnue.");
}

/* ---------- messagerie ---------- */
async function addOrderMember(o: Row, userId: string) {
  const c = await db().sql`SELECT id FROM conversations WHERE kind = 'order' AND order_id = ${o.id}`;
  if (c.length) await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${c[0].id}, ${userId}) ON CONFLICT DO NOTHING`;
}
async function convAccess(user: Row, convId: string): Promise<Row | null> {
  const rows = await db().sql`
    SELECT c.*, EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ${user.id}) AS is_member
    FROM conversations c WHERE c.id::text = ${convId}`;
  const c = rows[0];
  if (!c) return null;
  if (c.is_member) return c;
  if (user.role === "admin" && (c.kind === "support" || c.kind === "order")) return c;
  return null;
}
async function convTitles(user: Row, convs: Row[]) {
  if (!convs.length) return [];
  const ids = convs.map((c) => c.id);
  const mem = await db().sql`
    SELECT cm.conversation_id, u.id, u.name, u.phone, u.role FROM conversation_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ANY(${ids}::uuid[])`;
  const orderIds = convs.map((c) => c.order_id).filter(Boolean);
  const orders = orderIds.length ? await db().sql`SELECT id, code, service, status FROM orders WHERE id = ANY(${orderIds}::uuid[])` : [];
  const omap: Row = {}; orders.forEach((o) => (omap[o.id] = o));
  const owners = await db().sql`SELECT id, name, phone FROM users WHERE id = ANY(${convs.map((c) => c.owner_id).filter(Boolean)}::uuid[])`;
  const umap: Row = {}; owners.forEach((u) => (umap[u.id] = u));
  return convs.map((c) => {
    const members = mem.filter((x) => x.conversation_id === c.id);
    const others = members.filter((x) => x.id !== user.id);
    let title = "", subtitle = "";
    if (c.kind === "support") {
      if (user.role === "admin") { const o = umap[c.owner_id]; title = (o && o.name) || "Client"; subtitle = o ? "+237 " + o.phone : ""; }
      else { title = "Service client WunaGo"; subtitle = "Réponse en moins de 2 min"; }
    } else if (c.kind === "order") {
      const o = omap[c.order_id];
      const other = others.find((x) => x.role !== "admin");
      title = other ? other.name || (other.role === "courier" ? "Livreur" : "Client") : "Commande";
      subtitle = o ? (SVC_FR[o.service] || "") + " · " + o.code : "";
    } else {
      const other = others[0];
      title = other ? other.name || "+237 " + other.phone : "Discussion";
      subtitle = other ? "+237 " + other.phone : "";
    }
    const last = c.last ? { id: Number(c.last.id), body: c.last.body, mine: c.last.sender_id === user.id, at: new Date(c.last.created_at).getTime(), photo: !!c.last.has_photo } : null;
    return { id: c.id, kind: c.kind, title, subtitle, orderId: c.order_id, orderCode: c.order_id && omap[c.order_id] ? omap[c.order_id].code : null,
      last, unread: Number(c.unread || 0), lastAt: new Date(c.last_message_at).getTime() };
  });
}
async function listConversations(user: Row) {
  const rows = await db().sql`
    SELECT c.*, cm.last_read_id,
      (SELECT row_to_json(x) FROM (SELECT id, body, sender_id, created_at, photo IS NOT NULL AS has_photo FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) x) AS last,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND id > COALESCE(cm.last_read_id, 0) AND sender_id IS DISTINCT FROM ${user.id}) AS unread
    FROM conversations c
    LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ${user.id}
    WHERE (cm.user_id IS NOT NULL AND (c.kind = 'support' OR EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id)))
       OR (${user.role === "admin"} AND c.kind = 'support' AND EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id))
    ORDER BY c.last_message_at DESC LIMIT 100`;
  return convTitles(user, rows);
}
async function openConversation(req: Request, user: Row) {
  const b = await body(req);
  let id: string | null = null;
  if (b.kind === "support") {
    const owner = user.role === "admin" && b.userId ? String(b.userId) : user.id;
    await db().sql`INSERT INTO conversations (kind, owner_id) VALUES ('support', ${owner}) ON CONFLICT DO NOTHING`;
    const c = await db().sql`SELECT id FROM conversations WHERE kind = 'support' AND owner_id = ${owner}`;
    id = c[0].id;
    await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${id}, ${owner}) ON CONFLICT DO NOTHING`;
    if (user.role === "admin") await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${id}, ${user.id}) ON CONFLICT DO NOTHING`;
  } else if (b.kind === "order") {
    const rows = await db().sql`SELECT * FROM orders WHERE id::text = ${String(b.orderId || "")} OR code = ${String(b.orderId || "")}`;
    const o = rows[0];
    if (!o || !(o.user_id === user.id || o.courier_id === user.id || user.role === "admin")) return fail(404, "Commande introuvable.");
    await db().sql`INSERT INTO conversations (kind, owner_id, order_id) VALUES ('order', ${o.user_id}, ${o.id}) ON CONFLICT DO NOTHING`;
    const c = await db().sql`SELECT id FROM conversations WHERE kind = 'order' AND order_id = ${o.id}`;
    id = c[0].id;
    for (const uid of [o.user_id, o.courier_id, user.role === "admin" ? user.id : null].filter(Boolean))
      await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${id}, ${uid}) ON CONFLICT DO NOTHING`;
  } else if (b.kind === "direct") {
    const phone = normalizePhone(b.phone);
    if (!phone) return fail(400, "Numéro invalide : 9 chiffres commençant par 6.");
    const others = await db().sql`SELECT * FROM users WHERE phone = ${phone} AND deleted_at IS NULL`;
    const other = others[0];
    if (!other) return fail(404, "Ce numéro n'utilise pas encore WunaGo. Invitez-le !");
    if (other.id === user.id) return fail(400, "C'est votre propre numéro.");
    const key = [user.id, other.id].sort().join(":");
    await db().sql`INSERT INTO conversations (kind, direct_key) VALUES ('direct', ${key}) ON CONFLICT DO NOTHING`;
    const c = await db().sql`SELECT id FROM conversations WHERE direct_key = ${key}`;
    id = c[0].id;
    await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${id}, ${user.id}), (${id}, ${other.id}) ON CONFLICT DO NOTHING`;
  } else return fail(400, "Type de discussion inconnu.");
  const conv = await db().sql`SELECT c.*, 0 AS unread, NULL AS last FROM conversations c WHERE c.id = ${id}`;
  return json({ conversation: (await convTitles(user, conv))[0] });
}
async function messagesRoute(req: Request, user: Row, convId: string, m: string, url: URL) {
  const c = await convAccess(user, convId);
  if (!c) return fail(404, "Discussion introuvable.");
  if (m === "GET") {
    const after = Number(url.searchParams.get("after") || 0);
    const rows = await db().sql`
      SELECT m.id, m.body, m.photo, m.created_at, m.sender_id, u.name, u.role FROM messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ${c.id} AND m.id > ${after} ORDER BY m.id ASC LIMIT 200`;
    const out = rows.map((x) => ({ id: Number(x.id), body: x.body, photo: x.photo, at: new Date(x.created_at).getTime(), mine: x.sender_id === user.id,
      author: x.role === "admin" ? "Service client WunaGo" : x.name || (x.role === "courier" ? "Livreur" : "Client"), role: x.role || "system" }));
    if (out.length && c.is_member) await db().sql`UPDATE conversation_members SET last_read_id = GREATEST(last_read_id, ${out[out.length - 1].id}) WHERE conversation_id = ${c.id} AND user_id = ${user.id}`;
    return json({ messages: out });
  }
  if (m === "POST") {
    const b = await body(req);
    const text = String(b.body || "").trim().slice(0, 2000);
    const photo = typeof b.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400_000 ? b.photo : null;
    if (!text && !photo) return fail(400, "Message vide.");
    await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${c.id}, ${user.id}) ON CONFLICT DO NOTHING`;
    const ins = await db().sql`INSERT INTO messages (conversation_id, sender_id, body, photo) VALUES (${c.id}, ${user.id}, ${text || "📷"}, ${photo}) RETURNING *`;
    await db().sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${c.id}`;
    await db().sql`UPDATE conversation_members SET last_read_id = ${ins[0].id} WHERE conversation_id = ${c.id} AND user_id = ${user.id}`;
    const mem = await db().sql`SELECT user_id FROM conversation_members WHERE conversation_id = ${c.id} AND user_id <> ${user.id}`;
    let targets = mem.map((x) => x.user_id);
    if (c.kind === "support" && user.role !== "admin") {
      const admins = await db().sql`SELECT id FROM users WHERE role = 'admin'`;
      targets = targets.concat(admins.map((a) => a.id));
    }
    const from = user.role === "admin" ? "Service client WunaGo" : user.name || "+237 " + user.phone;
    push(targets, { title: from, body: text ? text.slice(0, 120) : "Photo", url: "/#discussion=" + c.id, tag: "conv-" + c.id }, "messages");
    const x = ins[0];
    return json({ message: { id: Number(x.id), body: x.body, photo: x.photo, at: new Date(x.created_at).getTime(), mine: true, author: from, role: user.role } }, 201);
  }
  return fail(405, "Méthode non permise.");
}

/* ---------- backoffice (administrateurs) ---------- */
async function adminRoutes(req: Request, user: Row, path: string, m: string, url: URL): Promise<Response | null> {
  if (!path.startsWith("/admin")) return null;
  if (user.role !== "admin") return fail(403, "Espace réservé à l'équipe WunaGo.");
  if (path === "/admin/orders" && m === "POST") {
    /* commande passée par téléphone ou WhatsApp : l'équipe la saisit pour le client (créé s'il n'existe pas) */
    const b = await body(req);
    const phone = normalizePhone(b.phone);
    if (!phone) return fail(400, "Numéro du client invalide (9 chiffres, commence par 6).");
    if (!["parcel", "ride"].includes(b.service)) return fail(400, "Depuis le backoffice : colis ou déplacement.");
    if (!["cash", "orange_money", "mtn_momo"].includes(b.paymentMethod)) return fail(400, "Paiement : espèces, Orange Money ou MTN MoMo.");
    const name = String(b.name || "").trim().slice(0, 60);
    let client = (await db().sql`SELECT * FROM users WHERE phone = ${phone}`)[0];
    if (!client) client = (await db().sql`INSERT INTO users (phone, name) VALUES (${phone}, ${name || null}) RETURNING *`)[0];
    else if (!client.name && name) client = (await db().sql`UPDATE users SET name = ${name} WHERE id = ${client.id} RETURNING *`)[0];
    if (client.deleted_at) return fail(409, "Ce compte client a été supprimé.");
    const res = await createOrderFrom(b, client, user.id);
    if (res.status === 201) {
      const out = await res.clone().json();
      push([client.id], { title: "Commande " + out.order.code + " enregistrée", body: "WunaGo a enregistré votre commande. Suivez-la dans l'app.", url: "/#commande=" + out.order.id, tag: out.order.code }, "orders");
      return json({ order: out.order, client: { id: client.id, name: client.name, phone: client.phone } }, 201);
    }
    return res;
  }
  if (path === "/admin/run-alerts" && m === "POST") return json(await runAlerts(db()));
  let rp = path.match(/^\/admin\/couriers\/([A-Za-z0-9-]+)\/payments$/);
  if (rp && m === "POST") {
    const b = await body(req);
    const amount = Math.round(Number(b.amount) || 0);
    if (!(amount > 0 && amount <= 5_000_000)) return fail(400, "Montant invalide.");
    const c = (await db().sql`SELECT id FROM users WHERE id::text = ${rp[1]}`)[0];
    if (!c) return fail(404, "Livreur introuvable.");
    const signed = b.direction === "out" ? -amount : amount;
    await db().sql`INSERT INTO courier_payments (courier_id, amount, note, created_by) VALUES (${c.id}, ${signed}, ${String(b.note || "").trim().slice(0, 140)}, ${user.id})`;
    push([c.id], { title: "Versement enregistré", body: (signed > 0 ? "Vous avez remis " : "WunaGo vous a versé ") + fmtF(amount) + ".", url: "/#compte", tag: "versement" }, "orders");
    return json({ ok: true }, 201);
  }
  if (path === "/admin/stats") {
    maybeAlerts();
    const s = await db().sql`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala') AS orders_today,
        (SELECT COALESCE(SUM(price_net), 0) FROM orders WHERE status <> 'cancelled' AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala') AS revenue_today,
        (SELECT COUNT(*) FROM orders WHERE status IN ('received','picked_up','en_route')) AS in_progress,
        (SELECT COUNT(*) FROM orders WHERE status = 'received' AND courier_id IS NULL) AS unassigned,
        (SELECT COUNT(*) FROM disputes WHERE status <> 'closed') AS open_disputes,
        (SELECT COUNT(*) FROM users WHERE role = 'courier' AND online) AS couriers_online,
        (SELECT COUNT(*) FROM users WHERE role = 'courier') AS couriers,
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND deleted_at IS NULL) AS clients,
        (SELECT COUNT(*) FROM orders WHERE status = 'received' AND courier_id IS NULL
           AND GREATEST(created_at, COALESCE(scheduled_at, created_at) - INTERVAL '1 hour') < NOW() - INTERVAL '10 minutes') AS late`;
    const x = s[0];
    return json({ stats: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Number(v)])) });
  }
  if (path === "/admin/orders" && m === "GET") {
    /* historique : filtres combinables (statut, période en dates de Douala, service, paiement, livreur, recherche) + pagination */
    const sp = url.searchParams, iso = /^\d{4}-\d{2}-\d{2}$/;
    const where: string[] = [], args: any[] = [];
    const add = (sql: string, ...vals: any[]) => { let k = sql; vals.forEach((v) => { args.push(v); k = k.replace("?", "$" + args.length); }); where.push(k); };
    const st = sp.get("status") || "";
    if (st === "active") add("o.status IN ('received','picked_up','en_route')");
    else if (st === "unassigned") add("o.status = 'received' AND o.courier_id IS NULL");
    else if (st) add("o.status = ?", st);
    const from = sp.get("from") || "", to = sp.get("to") || "";
    if (iso.test(from)) add("o.created_at >= (?::date)::timestamp AT TIME ZONE 'Africa/Douala'", from);
    if (iso.test(to)) add("o.created_at < (?::date + 1)::timestamp AT TIME ZONE 'Africa/Douala'", to);
    if (sp.get("service")) add("o.service = ?", sp.get("service"));
    if (sp.get("pay")) add("o.payment_method = ?", sp.get("pay"));
    if (sp.get("courier") === "none") add("o.courier_id IS NULL");
    else if (sp.get("courier")) add("o.courier_id::text = ?", sp.get("courier"));
    const q = (sp.get("q") || "").trim(), digits = q.replace(/\D/g, "");
    if (q) {
      if (digits.length >= 3) add("(o.code ILIKE ? OR u.phone LIKE ? OR COALESCE(u.name, '') ILIKE ?)", "%" + q + "%", "%" + digits + "%", "%" + q + "%");
      else add("(o.code ILIKE ? OR COALESCE(u.name, '') ILIKE ? OR o.pickup ILIKE ? OR o.dropoff ILIKE ?)", "%" + q + "%", "%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    const W = where.length ? "WHERE " + where.join(" AND ") : "";
    const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50)), offset = Math.max(0, Number(sp.get("offset")) || 0);
    const articles = `COALESCE((SELECT SUM((l->>'amount')::int) FROM jsonb_array_elements(COALESCE(o.price_lines,'[]'::jsonb)) l WHERE l->>'key' = 'articles'), 0)`;
    const [rowsR, sumR] = await Promise.all([
      db().pool.query(`SELECT o.*, u.name AS client_name, u.phone AS client_phone FROM orders o JOIN users u ON u.id = o.user_id ${W}
        ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`, args),
      db().pool.query(`SELECT COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered, COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE o.status IN ('received','picked_up','en_route')) AS active,
          COALESCE(SUM(o.price_net) FILTER (WHERE o.status <> 'cancelled'), 0) AS volume,
          COALESCE(SUM(o.price_net - ${articles}) FILTER (WHERE o.status <> 'cancelled'), 0) AS revenue
        FROM orders o JOIN users u ON u.id = o.user_id ${W}`, args)
    ]);
    const rows = rowsR.rows;
    const out = await enrich(rows, user);
    const sum = Object.fromEntries(Object.entries(sumR.rows[0]).map(([k, v]) => [k, Number(v)]));
    return json({ orders: out.map((o, i) => ({ ...o, client: { name: rows[i].client_name, phone: rows[i].client_phone } })), summary: sum, offset, limit,
      more: offset + rows.length < sum.orders });
  }
  let r = path.match(/^\/admin\/orders\/([A-Za-z0-9-]+)\/(assign|status)$/);
  if (r && m === "POST") {
    const b = await body(req);
    const rows0 = await db().sql`SELECT * FROM orders WHERE code = ${r[1]} OR id::text = ${r[1]}`;
    const o = rows0[0];
    if (!o) return fail(404, "Commande introuvable.");
    let rows: Row[];
    if (r[2] === "assign") {
      const c = await db().sql`SELECT * FROM users WHERE id::text = ${String(b.courierId || "")} AND role = 'courier'`;
      if (!c.length) return fail(404, "Livreur introuvable.");
      rows = await db().sql`UPDATE orders SET courier_id = ${c[0].id}, assigned_at = NOW(), updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
      await addOrderMember(o, c[0].id);
      push([c[0].id], { title: "Nouvelle course assignée", body: `${SVC_FR[o.service]} · ${o.code} · ${o.pickup}`, url: "/#course=" + o.id, tag: o.code }, "offers");
      push([o.user_id], { title: "Livreur trouvé", body: `${firstName(c[0])} prend en charge votre commande ${o.code}.`, url: "/#commande=" + o.id, tag: o.code }, "orders");
    } else {
      const to = String(b.status);
      if (to === "cancelled") {
        rows = await tx(async (q) => {
          let note = "Aucun montant n'a été débité.", ps = o.payment_status;
          if (o.payment_method === "wallet" && o.status !== "cancelled") {
            await q("UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1", [o.user_id, o.price_net]);
            await q("INSERT INTO wallet_tx (user_id, amount, kind, order_id) VALUES ($1, $2, 'refund', $3)", [o.user_id, o.price_net, o.id]);
            note = "Remboursé sur votre portefeuille."; ps = "refunded";
          } else if (o.payment_status === "paid") { note = "Remboursement sur votre compte Mobile Money sous 48 h."; ps = "refund_pending"; }
          return q("UPDATE orders SET status = 'cancelled', cancel_reason = $2, refund_note = $3, payment_status = $4, updated_at = NOW() WHERE id = $1 RETURNING *",
            [o.id, String(b.reason || "Annulée par WunaGo").slice(0, 120), note, ps]);
        });
        push([o.user_id, o.courier_id], { title: "Commande annulée", body: `${o.code} : ${rows[0].refund_note}`, url: "/#commande=" + o.id, tag: o.code }, "orders");
      } else {
        const idx = (STATUSES as readonly string[]).indexOf(to);
        if (idx < 0) return fail(400, "Statut inconnu.");
        rows = await db().sql`
          UPDATE orders SET stage = ${idx}, status = ${to},
            en_route_at = CASE WHEN ${idx} >= 2 THEN COALESCE(en_route_at, NOW()) ELSE en_route_at END,
            delivered_at = CASE WHEN ${to} = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END, updated_at = NOW()
          WHERE id = ${o.id} RETURNING *`;
        if (to !== "received") push([o.user_id], { title: SVC_FR[o.service] + " · " + o.code, body: STEP_FR[to][o.service], url: "/#commande=" + o.id, tag: o.code }, "orders");
      }
    }
    return json({ order: (await enrich(rows, user))[0] });
  }
  if (path === "/admin/disputes" && m === "GET") {
    const rows = await db().sql`
      SELECT d.*, o.code AS order_code, u.name AS client_name, u.phone AS client_phone FROM disputes d
      JOIN orders o ON o.id = d.order_id JOIN users u ON u.id = d.user_id ORDER BY (d.status = 'closed'), d.created_at DESC LIMIT 200`;
    return json({ disputes: rows.map((x) => ({ ...disputeOut(x), adminReply: x.admin_reply, client: { id: x.user_id, name: x.client_name, phone: x.client_phone } })) });
  }
  r = path.match(/^\/admin\/disputes\/([A-Za-z0-9-]+)$/);
  if (r && m === "POST") {
    const b = await body(req);
    const st = ["open", "review", "closed"].includes(b.status) ? b.status : null;
    const reply = typeof b.reply === "string" ? b.reply.trim().slice(0, 2000) : "";
    const rows = await db().sql`
      UPDATE disputes SET status = COALESCE(${st}, status), admin_reply = CASE WHEN ${reply} = '' THEN admin_reply ELSE ${reply} END, updated_at = NOW()
      WHERE id::text = ${r[1]} OR code = ${r[1]} RETURNING *`;
    const d = rows[0];
    if (!d) return fail(404, "Réclamation introuvable.");
    if (reply) {
      await db().sql`INSERT INTO conversations (kind, owner_id) VALUES ('support', ${d.user_id}) ON CONFLICT DO NOTHING`;
      const c = await db().sql`SELECT id FROM conversations WHERE kind = 'support' AND owner_id = ${d.user_id}`;
      await db().sql`INSERT INTO conversation_members (conversation_id, user_id) VALUES (${c[0].id}, ${d.user_id}), (${c[0].id}, ${user.id}) ON CONFLICT DO NOTHING`;
      await db().sql`INSERT INTO messages (conversation_id, sender_id, body) VALUES (${c[0].id}, ${user.id}, ${"Réclamation " + d.code + " : " + reply})`;
      await db().sql`UPDATE conversations SET last_message_at = NOW() WHERE id = ${c[0].id}`;
      push([d.user_id], { title: "Service client WunaGo", body: `Réclamation ${d.code} : ${reply.slice(0, 100)}`, url: "/#discussion=" + c[0].id, tag: d.code }, "messages");
    }
    return json({ dispute: { ...disputeOut(d), adminReply: d.admin_reply } });
  }
  if (path === "/admin/couriers" && m === "GET") {
    const rows = await db().sql`
      SELECT u.*, (SELECT COUNT(*) FROM orders WHERE courier_id = u.id AND status IN ('received','picked_up','en_route')) AS active,
        (SELECT COUNT(*) FROM orders WHERE courier_id = u.id AND status = 'delivered') AS delivered,
        (SELECT ROUND(AVG(rating)::numeric, 1) FROM orders WHERE courier_id = u.id AND rating IS NOT NULL) AS rating
      FROM users u WHERE u.role = 'courier' ORDER BY u.online DESC, u.name`;
    return json({ couriers: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, vehicle: (c.courier || {}).vehicle || "bike", plate: (c.courier || {}).plate || "",
      online: c.online, active: Number(c.active), delivered: Number(c.delivered), rating: c.rating == null ? null : Number(c.rating),
      pos: c.pos_lat != null ? { lat: c.pos_lat, lng: c.pos_lng, at: new Date(c.pos_at).getTime() } : null })) });
  }
  if (path === "/admin/couriers" && m === "POST") {
    const b = await body(req);
    const phone = normalizePhone(b.phone);
    if (!phone) return fail(400, "Numéro invalide.");
    const name = String(b.name || "").trim().slice(0, 60);
    if (name.length < 2) return fail(400, "Indiquez le nom du livreur.");
    const vehicle = ["bike", "tricycle", "van", "car"].includes(b.vehicle) ? b.vehicle : "bike";
    const courier = JSON.stringify({ vehicle, plate: String(b.plate || "").trim().slice(0, 20) });
    const rows = await db().sql`
      INSERT INTO users (phone, name, role, courier) VALUES (${phone}, ${name}, 'courier', ${courier}::jsonb)
      ON CONFLICT (phone) DO UPDATE SET role = CASE WHEN users.role = 'admin' THEN 'admin' ELSE 'courier' END, name = EXCLUDED.name, courier = EXCLUDED.courier
      RETURNING *`;
    return json({ courier: { id: rows[0].id, name: rows[0].name, phone: rows[0].phone } }, 201);
  }
  r = path.match(/^\/admin\/couriers\/([A-Za-z0-9-]+)\/history$/);
  if (r && m === "GET") {
    const c = (await db().sql`SELECT id, name, phone, courier, online, role, created_at FROM users WHERE id::text = ${r[1]}`)[0];
    if (!c) return fail(404, "Livreur introuvable.");
    return json({ courier: { id: c.id, name: c.name, phone: c.phone, vehicle: (c.courier || {}).vehicle, plate: (c.courier || {}).plate, online: c.online, active: c.role === "courier", since: new Date(c.created_at).getTime() },
      ...(await courierHistory(c.id, url.searchParams)) });
  }
  r = path.match(/^\/admin\/couriers\/([A-Za-z0-9-]+)\/deactivate$/);
  if (r && m === "POST") {
    await db().sql`UPDATE users SET role = 'client', online = false WHERE id::text = ${r[1]} AND role = 'courier'`;
    return json({ ok: true });
  }
  /* rapports : période en dates de Douala (du … au … inclus) */
  if ((path === "/admin/reports" || path === "/admin/export") && m === "GET") {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    const from = iso.test(url.searchParams.get("from") || "") ? url.searchParams.get("from")! : today;
    const to = iso.test(url.searchParams.get("to") || "") ? url.searchParams.get("to")! : today;
    if (from > to) return fail(400, "Période invalide.");
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    if (days > 400) return fail(400, "Période trop longue (400 jours maximum).");
    const T = TARIFS as any, part = T.partLivreur, transport = T.lignesTransport;
    const base = `
      WITH b AS (
        SELECT o.*,
          COALESCE((SELECT SUM((l->>'amount')::int) FROM jsonb_array_elements(COALESCE(o.price_lines,'[]'::jsonb)) l WHERE l->>'key' = 'articles'), 0) AS articles,
          COALESCE((SELECT SUM((l->>'amount')::int) FROM jsonb_array_elements(COALESCE(o.price_lines,'[]'::jsonb)) l WHERE l->>'key' = ANY($3::text[])), 0) AS transport,
          (o.created_at AT TIME ZONE 'Africa/Douala') AS local_at
        FROM orders o
        WHERE o.created_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Douala'
          AND o.created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Douala'
      ), v AS (SELECT * FROM b WHERE status <> 'cancelled')`;
    const args = [from, to, transport];
    const q = (sql: string) => db().pool.query(base + sql, args).then((r: any) => r.rows || r);

    if (path === "/admin/export") {
      const rows = await db().pool.query(base + `
        SELECT b.code, to_char(b.local_at, 'YYYY-MM-DD') AS day, to_char(b.local_at, 'HH24:MI') AS hm, b.service, b.status, b.pickup, b.dropoff, b.zone, b.distance_km, b.payment_method, b.payment_status,
          b.price_gross, b.discount, b.price_net, b.articles, b.transport, b.rating, b.cancel_reason, u.name AS client, u.phone AS client_phone,
          c.name AS courier, to_char(b.delivered_at AT TIME ZONE 'Africa/Douala', 'YYYY-MM-DD HH24:MI') AS delivered_local
        FROM b JOIN users u ON u.id = b.user_id LEFT JOIN users c ON c.id = b.courier_id ORDER BY b.created_at`, args).then((r: any) => r.rows || r);
      const head = ["Code", "Date", "Heure", "Service", "Statut", "Départ", "Arrivée", "Zone", "Distance (km)", "Paiement", "État du paiement",
        "Prix brut", "Remise", "Montant payé", "Avance achats", "CA WunaGo", "Part livreur", "Note", "Motif d'annulation", "Client", "Téléphone client", "Livreur", "Livrée le"];
      const cell = (x: any) => { const t = x == null ? "" : String(x); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const lines = rows.map((r: Row) => {
        const ca = r.status === "cancelled" ? 0 : r.price_net - r.articles;
        const share = r.status === "delivered" ? Math.round(Math.max(0, r.transport) * part / 50) * 50 : 0;
        return [r.code, r.day, r.hm, SVC_FR[r.service], ({ received: "Reçue", picked_up: "Prise en charge", en_route: "En route", delivered: "Livrée", cancelled: "Annulée" } as any)[r.status],
          r.pickup, r.dropoff, r.zone, r.distance_km, PAY_FR[r.payment_method], (r.payment_method === "cash" && r.status === "delivered" ? "Encaissé (espèces)" : PAYST_FR[r.payment_status] || r.payment_status),
          r.price_gross, r.discount, r.price_net, r.articles, ca, share, r.rating, r.cancel_reason, r.client, r.client_phone, r.courier, r.delivered_local].map(cell).join(";");
      });
      return new Response("﻿" + [head.join(";")].concat(lines).join("\r\n"), { status: 200, headers: {
        "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wunago-commandes-${from}-au-${to}.csv"`, "cache-control": "no-store" } });
    }

    const shareSql = `ROUND(GREATEST(transport, 0) * ${Number(part)} / 50) * 50`;
    const [tot, byPay, byService, byDay, byHour, byZone, couriers, clients, quartiers, disputes, wallet, timing, cancels, prev] = await Promise.all([
      q(`SELECT
          (SELECT COUNT(*) FROM b) AS orders,
          (SELECT COUNT(*) FROM b WHERE status = 'delivered') AS delivered,
          (SELECT COUNT(*) FROM b WHERE status = 'cancelled') AS cancelled,
          (SELECT COUNT(*) FROM b WHERE status IN ('received','picked_up','en_route')) AS in_progress,
          (SELECT COALESCE(SUM(price_net), 0) FROM v) AS volume,
          (SELECT COALESCE(SUM(articles), 0) FROM v) AS articles,
          (SELECT COALESCE(SUM(price_net - articles), 0) FROM v) AS revenue,
          (SELECT COALESCE(SUM(discount), 0) FROM v) AS discounts,
          (SELECT COALESCE(SUM(${shareSql}), 0) FROM b WHERE status = 'delivered') AS courier_pay,
          (SELECT COALESCE(SUM(price_net - articles), 0) FROM b WHERE status = 'delivered') AS revenue_delivered,
          (SELECT COALESCE(SUM(price_net), 0) FROM v WHERE payment_status = 'paid' OR (payment_method = 'cash' AND status = 'delivered')) AS collected,
          (SELECT COALESCE(SUM(price_net), 0) FROM v WHERE payment_method = 'cash' AND status <> 'delivered') AS to_collect,
          (SELECT ROUND(AVG(rating)::numeric, 2) FROM b WHERE rating IS NOT NULL) AS rating,
          (SELECT COUNT(*) FROM b WHERE rating IS NOT NULL) AS ratings,
          (SELECT COUNT(DISTINCT user_id) FROM b) AS active_clients,
          (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Douala' AND created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Douala') AS new_clients,
          (SELECT COUNT(*) FROM (SELECT user_id FROM b GROUP BY user_id HAVING COUNT(*) > 1) r) AS repeat_clients,
          (SELECT COALESCE(SUM(distance_km), 0) FROM b WHERE status = 'delivered') AS km`),
      q(`SELECT payment_method AS key, COUNT(*) AS orders, COALESCE(SUM(price_net), 0) AS volume, COALESCE(SUM(price_net - articles), 0) AS revenue,
           COALESCE(SUM(price_net) FILTER (WHERE payment_status = 'paid' OR (payment_method = 'cash' AND status = 'delivered')), 0) AS collected,
           COALESCE(SUM(price_net) FILTER (WHERE payment_method = 'cash' AND status <> 'delivered'), 0) AS pending
         FROM v GROUP BY payment_method ORDER BY volume DESC`),
      q(`SELECT service AS key, COUNT(*) AS orders, COUNT(*) FILTER (WHERE status = 'delivered') AS delivered, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           COALESCE(SUM(price_net - articles) FILTER (WHERE status <> 'cancelled'), 0) AS revenue,
           ROUND(AVG(price_net - articles) FILTER (WHERE status <> 'cancelled')) AS basket FROM b GROUP BY service ORDER BY revenue DESC`),
      q(`SELECT to_char(d, 'YYYY-MM-DD') AS key, COALESCE(x.orders, 0) AS orders, COALESCE(x.revenue, 0) AS revenue, COALESCE(x.cancelled, 0) AS cancelled
         FROM generate_series($1::date, $2::date, interval '1 day') d
         LEFT JOIN (SELECT local_at::date AS day, COUNT(*) AS orders, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           COALESCE(SUM(price_net - articles) FILTER (WHERE status <> 'cancelled'), 0) AS revenue FROM b GROUP BY 1) x ON x.day = d::date ORDER BY d`),
      q(`SELECT h AS key, COALESCE(x.orders, 0) AS orders FROM generate_series(6, 21) h
         LEFT JOIN (SELECT EXTRACT(HOUR FROM local_at)::int AS hr, COUNT(*) AS orders FROM b GROUP BY 1) x ON x.hr = h ORDER BY h`),
      q(`SELECT COALESCE(zone, 0) AS key, COUNT(*) AS orders, COALESCE(SUM(price_net - articles), 0) AS revenue, ROUND(AVG(distance_km)::numeric, 1) AS km FROM v GROUP BY 1 ORDER BY 1`),
      q(`SELECT c.id, c.name, c.phone, c.online, COUNT(b.id) AS orders, COUNT(*) FILTER (WHERE b.status = 'delivered') AS delivered,
           COALESCE(SUM(${shareSql}) FILTER (WHERE b.status = 'delivered'), 0) AS earned, COALESCE(SUM(b.price_net - b.articles) FILTER (WHERE b.status = 'delivered'), 0) AS revenue,
           ROUND(AVG(b.rating)::numeric, 1) AS rating, ROUND(AVG(EXTRACT(EPOCH FROM (b.delivered_at - b.assigned_at)) / 60) FILTER (WHERE b.delivered_at IS NOT NULL AND b.assigned_at IS NOT NULL)) AS minutes,
           COALESCE(SUM(b.price_net) FILTER (WHERE b.payment_method = 'cash' AND b.status = 'delivered'), 0) AS cash
         FROM b JOIN users c ON c.id = b.courier_id GROUP BY c.id ORDER BY delivered DESC, earned DESC LIMIT 20`),
      q(`SELECT u.id, u.name, u.phone, COUNT(*) AS orders, COALESCE(SUM(b.price_net - b.articles) FILTER (WHERE b.status <> 'cancelled'), 0) AS revenue
         FROM b JOIN users u ON u.id = b.user_id GROUP BY u.id ORDER BY revenue DESC LIMIT 10`),
      q(`SELECT split_part(pickup, ',', 1) AS key, COUNT(*) AS orders, COALESCE(SUM(price_net - articles), 0) AS revenue FROM v GROUP BY 1 ORDER BY orders DESC, revenue DESC LIMIT 10`),
      db().pool.query(`SELECT reason AS key, COUNT(*) AS total, COUNT(*) FILTER (WHERE status <> 'closed') AS open,
           ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status = 'closed')::numeric, 1) AS hours
         FROM disputes WHERE created_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Douala' AND created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Douala'
         GROUP BY reason ORDER BY total DESC`, [from, to]).then((r: any) => r.rows || r),
      db().pool.query(`SELECT
           (SELECT COALESCE(SUM(amount), 0) FROM wallet_tx WHERE kind = 'topup' AND created_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Douala' AND created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Douala') AS topups,
           (SELECT COALESCE(SUM(amount), 0) FROM wallet_tx WHERE kind = 'refund' AND created_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Douala' AND created_at < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Douala') AS refunds,
           (SELECT COALESCE(SUM(wallet_balance), 0) FROM users WHERE deleted_at IS NULL) AS balances,
           (SELECT COUNT(*) FROM users WHERE wallet_balance > 0) AS wallets`, [from, to]).then((r: any) => r.rows || r),
      q(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - GREATEST(created_at, COALESCE(scheduled_at, created_at) - interval '1 hour'))) / 60) FILTER (WHERE assigned_at IS NOT NULL)) AS to_assign,
           ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60) FILTER (WHERE delivered_at IS NOT NULL AND scheduled_at IS NULL)) AS to_deliver,
           COUNT(*) FILTER (WHERE status = 'received' AND courier_id IS NULL AND created_at < NOW() - interval '15 minutes' AND (scheduled_at IS NULL OR scheduled_at < NOW())) AS late_unassigned
         FROM b`),
      q(`SELECT COALESCE(NULLIF(cancel_reason, ''), 'Non précisé') AS key, COUNT(*) AS total FROM b WHERE status = 'cancelled' GROUP BY 1 ORDER BY total DESC LIMIT 8`),
      db().pool.query(`SELECT COUNT(*) AS orders, COALESCE(SUM(price_net - COALESCE((SELECT SUM((l->>'amount')::int) FROM jsonb_array_elements(COALESCE(o.price_lines,'[]'::jsonb)) l WHERE l->>'key' = 'articles'), 0)) FILTER (WHERE status <> 'cancelled'), 0) AS revenue
         FROM orders o WHERE o.created_at >= ($1::date - $2::int)::timestamp AT TIME ZONE 'Africa/Douala' AND o.created_at < ($1::date)::timestamp AT TIME ZONE 'Africa/Douala'`, [from, days]).then((r: any) => r.rows || r)
    ]);
    const num = (o: Row) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && !["id", "name", "phone"].includes(k) ? Number(v) : v]));
    const t0 = num(tot[0]);
    return json({ period: { from, to, days }, totals: { ...t0, margin: t0.revenue_delivered - t0.courier_pay, basket: t0.orders - t0.cancelled ? Math.round(t0.revenue / (t0.orders - t0.cancelled)) : 0 },
      previous: num(prev[0]), byPayment: byPay.map(num), byService: byService.map(num), byDay: byDay.map(num), byHour: byHour.map(num), byZone: byZone.map(num),
      couriers: couriers.map(num), clients: clients.map(num), quartiers: quartiers.map(num), disputes: disputes.map(num), wallet: num(wallet[0]), timing: num(timing[0]), cancels: cancels.map(num) });
  }
  if (path === "/admin/clients" && m === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    const rows = await db().sql`
      SELECT u.id, u.name, u.phone, u.wallet_balance, u.created_at, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS orders
      FROM users u WHERE u.role = 'client' AND u.deleted_at IS NULL
        AND (${q} = '' OR u.phone LIKE ${"%" + q.replace(/\D/g, "") + "%"} OR COALESCE(u.name, '') ILIKE ${"%" + q + "%"})
      ORDER BY u.created_at DESC LIMIT 200`;
    return json({ clients: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, wallet: c.wallet_balance, orders: Number(c.orders), createdAt: new Date(c.created_at).getTime() })) });
  }
  return fail(404, "Route inconnue.");
}

/* ---------- routeur ---------- */
export default async (req: Request, context: any) => {
  currentContext = context;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;
  try {
    if (path === "/health") {
      // L'app ne passe en mode serveur que si la base répond.
      try { await db().sql`SELECT 1`; } catch (e) { console.error("health db", e); return json({ ok: false }, 503); }
      return json({ ok: true, sms: SMS_MODE(), demo: DEMO_ACTIONS(), pushKey: await publicKey(db()) });
    }
    if (path === "/auth/request" && m === "POST") return await authRequest(req);
    const sv = path.match(/^\/suivi\/([A-Za-z0-9_-]{10,40})$/);
    if (sv && m === "GET") return await publicTrack(sv[1]);
    const pc = path.match(/^\/code\/([A-Za-z0-9-]{4,8})$/);
    if (pc && m === "GET") {
      const p = await findPlace(pc[1]);
      if (!p) return fail(404, "Ce Code WunaGo n'existe pas.");
      return json({ code: p.code, name: String(p.owner_name || "").split(" ")[0] || "", label: p.label, placeName: p.place_name, area: p.area });
    }
    const sp2 = path.match(/^\/suivi\/([A-Za-z0-9_-]{10,40})\/position$/);
    if (sp2 && m === "POST") return await shareDropoff(sp2[1], await body(req));
    if (path === "/auth/verify" && m === "POST") return await authVerify(req);
    if (path === "/auth/logout" && m === "POST") return await logout(req);

    const user = await currentUser(req);
    if (!user) return fail(401, "Session expirée : reconnectez-vous.");

    if (path === "/me" && m === "GET") return json({ user: userOut(user) });
    const pr = await placesRoutes(req, user, path, m); if (pr) return pr;
    const cr = await courierRoutes(req, user, path, m); if (cr) return cr;
    const ad = await adminRoutes(req, user, path, m, url); if (ad) return ad;
    if (path === "/conversations" && m === "GET") return json({ conversations: await listConversations(user) });
    if (path === "/conversations" && m === "POST") return await openConversation(req, user);
    const cm = path.match(/^\/conversations\/([A-Za-z0-9-]+)\/messages$/);
    if (cm) return await messagesRoute(req, user, cm[1], m, url);
    if (path === "/push/subscribe" && m === "POST") {
      const b = await body(req), sub = b.subscription || {};
      if (!sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return fail(400, "Abonnement invalide.");
      await db().sql`INSERT INTO push_subscriptions (endpoint, user_id, keys) VALUES (${sub.endpoint}, ${user.id}, ${JSON.stringify(sub.keys)}::jsonb)
        ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`;
      return json({ ok: true });
    }
    if (path === "/push/unsubscribe" && m === "POST") { const b = await body(req); await db().sql`DELETE FROM push_subscriptions WHERE endpoint = ${String(b.endpoint || "")} AND user_id = ${user.id}`; return json({ ok: true }); }
    if (path === "/push/_log" && env("WG_PUSH_DRY") === "1") return json({ log: pushLog });
    if (path === "/me" && m === "PATCH") return await patchMe(req, user);
    if (path === "/me" && m === "DELETE") {
      // Suppression : données personnelles effacées, commandes conservées anonymement (comptabilité).
      await tx(async (q) => {
        await q("DELETE FROM sessions WHERE user_id = $1", [user.id]);
        await q("UPDATE users SET phone = $2, name = NULL, prefs = '{}'::jsonb, deleted_at = NOW() WHERE id = $1", [user.id, "supprime-" + user.id]);
        await q("UPDATE orders SET pickup_lat = NULL, pickup_lng = NULL, dropoff_lat = NULL, dropoff_lng = NULL WHERE user_id = $1", [user.id]);
      });
      return json({ ok: true });
    }
    if (path === "/orders" && m === "GET") {
      /* historique du client sur une période (dates de Douala) ; sans période : les 100 dernières */
      const iso = /^\d{4}-\d{2}-\d{2}$/, f = url.searchParams.get("from") || "", t2 = url.searchParams.get("to") || "";
      const rows = iso.test(f) && iso.test(t2)
        ? await db().sql`SELECT * FROM orders WHERE user_id = ${user.id}
            AND created_at >= (${f}::date)::timestamp AT TIME ZONE 'Africa/Douala' AND created_at < (${t2}::date + 1)::timestamp AT TIME ZONE 'Africa/Douala'
            ORDER BY created_at DESC LIMIT 500`
        : await db().sql`SELECT * FROM orders WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100`;
      return json({ orders: await enrich(rows, user) });
    }
    if (path === "/orders" && m === "POST") return await createOrder(req, user);
    let r = path.match(/^\/orders\/([A-Za-z0-9-]+)$/);
    if (r && m === "GET") { const o = await ownedOrder(user, r[1]); return o ? json({ order: (await enrich([o], user))[0] }) : fail(404, "Commande introuvable."); }
    r = path.match(/^\/orders\/([A-Za-z0-9-]+)\/(cancel|advance|rate)$/);
    if (r && m === "POST") {
      if (r[2] === "cancel") return await cancelOrder(req, user, r[1]);
      if (r[2] === "advance") return await advanceOrder(user, r[1]);
      return await rateOrder(req, user, r[1]);
    }
    if (path === "/wallet/topup" && m === "POST") return await walletTopUp(req, user);
    if (path === "/wallet/send" && m === "POST") return await walletSend(req, user);
    if (path === "/disputes" && m === "GET") {
      const rows = await db().sql`
        SELECT d.*, o.code AS order_code FROM disputes d JOIN orders o ON o.id = d.order_id
        WHERE d.user_id = ${user.id} ORDER BY d.created_at DESC LIMIT 50`;
      return json({ disputes: rows.map((x) => disputeOut(x)) });
    }
    if (path === "/disputes" && m === "POST") return await createDispute(req, user);
    return fail(404, "Route inconnue.");
  } catch (e) {
    console.error("api error", path, e);
    return fail(500, "Erreur du serveur. Réessayez dans un instant.");
  }
};

