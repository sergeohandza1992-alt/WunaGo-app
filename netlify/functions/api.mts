// WunaGo — API (fonction Netlify unique, routes sous /api/*).
// Base de données : Netlify Database (Postgres). Connexion par code envoyé au téléphone.
// SMS_MODE=demo (par défaut) : pas de SMS envoyé, le code est renvoyé à l'app pour affichage.

import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { SERVICES, VEHICLES, PAY_METHODS, STATUSES, quote, normalizePhone, distanceKm, courierShare, TARIFS } from "../lib/rules.mts";
import { sendPush, publicKey, pushLog } from "../lib/push.mts";

type Row = Record<string, any>;

function env(key: string): string | undefined {
  const n = (globalThis as any).Netlify;
  return (n && n.env && n.env.get(key)) ?? process.env[key];
}
const SMS_MODE = () => env("SMS_MODE") || "demo";
const DEMO_ACTIONS = () => (env("DEMO_ACTIONS") || "on") !== "off";

let dbInstance: ReturnType<typeof getDatabase> | null = null;
function db() {
  if (!dbInstance) {
    const url = env("WG_DB_URL"); // tests locaux uniquement ; en ligne, Netlify fournit la connexion
    dbInstance = url ? getDatabase({ connectionString: url }) : getDatabase();
  }
  return dbInstance;
}

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

async function createOrder(req: Request, user: Row) {
  const b = await body(req);
  const service = String(b.service);
  if (!(SERVICES as readonly string[]).includes(service)) return fail(400, "Service inconnu.");
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
           payment_method, payment_status, price_gross, discount, price_net, details, price_lines, distance_km, zone, scheduled_at)
         VALUES ('WUN-' || $1 || '-' || LPAD(nextval('order_code_seq')::text, 3, '0'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
        [year, user.id, service, pickup, dropoff, plat, plng, dlat, dlng, weight, qt.vehicle, String(b.note || "").slice(0, 500),
          b.paymentMethod, paid ? "paid" : "cod", price.gross, price.discount, price.net, JSON.stringify(details), JSON.stringify(qt.lines),
          qt.distanceKm, qt.zone, scheduledAt ? new Date(scheduledAt).toISOString() : null]);
      if (b.paymentMethod === "wallet") await q("INSERT INTO wallet_tx (user_id, amount, kind, order_id) VALUES ($1, $2, 'order', $3)", [user.id, -price.net, rows[0].id]);
      return rows[0];
    });
    const u = await db().sql`SELECT wallet_balance FROM users WHERE id = ${user.id}`;
    if (!scheduledAt || scheduledAt < Date.now() + 2 * 3600000) {
      const couriers = await db().sql`SELECT id FROM users WHERE role = 'courier' AND online`;
      push(couriers.map((c) => c.id), { title: "Nouvelle course · " + fmtF(order.price_net), body: `${SVC_FR[order.service]} · ${order.pickup}`, url: "/#courses", tag: "offres" }, "offers");
    }
    return json({ order: orderOut(order), wallet: { balance: u[0].wallet_balance } }, 201);
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
    out.proofPhoto = o.proof_photo || null;
    out.assignedAt = o.assigned_at ? new Date(o.assigned_at).getTime() : null;
    return out;
  });
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
  if (path === "/courier/offers" && m === "GET") {
    const rows = await db().sql`
      SELECT * FROM orders WHERE courier_id IS NULL AND status = 'received'
        AND (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '2 hours')
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
    if (to === "picked_up" && o.stage === 0) rows = await db().sql`UPDATE orders SET stage = 1, status = 'picked_up', updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
    else if (to === "en_route" && o.stage === 1) rows = await db().sql`UPDATE orders SET stage = 2, status = 'en_route', en_route_at = NOW(), updated_at = NOW() WHERE id = ${o.id} RETURNING *`;
    else if (to === "delivered" && o.stage >= 1) {
      const photo = typeof b.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400_000 ? b.photo : null;
      const name = String(b.receivedBy || "").trim().slice(0, 60);
      if (!name) return fail(400, "Indiquez le nom de la personne qui a reçu.");
      rows = await db().sql`
        UPDATE orders SET stage = 3, status = 'delivered', delivered_at = NOW(), proof_photo = ${photo}, proof_name = ${name}, updated_at = NOW()
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
  if (path === "/admin/stats") {
    const s = await db().sql`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala') AS orders_today,
        (SELECT COALESCE(SUM(price_net), 0) FROM orders WHERE status <> 'cancelled' AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala') AS revenue_today,
        (SELECT COUNT(*) FROM orders WHERE status IN ('received','picked_up','en_route')) AS in_progress,
        (SELECT COUNT(*) FROM orders WHERE status = 'received' AND courier_id IS NULL) AS unassigned,
        (SELECT COUNT(*) FROM disputes WHERE status <> 'closed') AS open_disputes,
        (SELECT COUNT(*) FROM users WHERE role = 'courier' AND online) AS couriers_online,
        (SELECT COUNT(*) FROM users WHERE role = 'courier') AS couriers,
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND deleted_at IS NULL) AS clients`;
    const x = s[0];
    return json({ stats: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Number(v)])) });
  }
  if (path === "/admin/orders" && m === "GET") {
    const st = url.searchParams.get("status") || "", q = (url.searchParams.get("q") || "").trim();
    const rows = await db().sql`
      SELECT o.*, u.name AS client_name, u.phone AS client_phone FROM orders o JOIN users u ON u.id = o.user_id
      WHERE (${st} = '' OR (${st} = 'active' AND o.status IN ('received','picked_up','en_route')) OR (${st} = 'unassigned' AND o.status = 'received' AND o.courier_id IS NULL) OR o.status = ${st})
        AND (${q} = '' OR o.code ILIKE ${"%" + q + "%"} OR u.phone LIKE ${"%" + q.replace(/\D/g, "") + "%"} OR COALESCE(u.name, '') ILIKE ${"%" + q + "%"})
      ORDER BY o.created_at DESC LIMIT 200`;
    const out = await enrich(rows, user);
    return json({ orders: out.map((o, i) => ({ ...o, client: { name: rows[i].client_name, phone: rows[i].client_phone } })) });
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
export default async (req: Request, context: Context) => {
  currentContext = context;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;
  try {
    if (path === "/health") {
      // L'app ne passe en mode serveur que si la base répond.
      try { await db().sql`SELECT 1`; } catch (e) { console.error("health db", e); return json({ ok: false }, 503); }
      return json({ ok: true, sms: SMS_MODE(), demo: DEMO_ACTIONS(), pushKey: publicKey() });
    }
    if (path === "/auth/request" && m === "POST") return await authRequest(req);
    if (path === "/auth/verify" && m === "POST") return await authVerify(req);
    if (path === "/auth/logout" && m === "POST") return await logout(req);

    const user = await currentUser(req);
    if (!user) return fail(401, "Session expirée : reconnectez-vous.");

    if (path === "/me" && m === "GET") return json({ user: userOut(user) });
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
      const rows = await db().sql`SELECT * FROM orders WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100`;
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

export const config: Config = { path: "/api/*" };
