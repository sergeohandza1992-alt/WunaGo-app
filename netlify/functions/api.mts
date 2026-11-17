// WunaGo — API (fonction Netlify unique, routes sous /api/*).
// Base de données : Netlify Database (Postgres). Connexion par code envoyé au téléphone.
// SMS_MODE=demo (par défaut) : pas de SMS envoyé, le code est renvoyé à l'app pour affichage.

import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { SERVICES, VEHICLES, PAY_METHODS, STATUSES, quote, normalizePhone } from "../lib/rules.mts";

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
  return { id: u.id, phone: u.phone, name: u.name, wallet: { balance: u.wallet_balance }, prefs: u.prefs || {} };
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
  const user = users[0];
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

/* ---------- routeur ---------- */
export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;
  try {
    if (path === "/health") {
      // L'app ne passe en mode serveur que si la base répond.
      try { await db().sql`SELECT 1`; } catch (e) { console.error("health db", e); return json({ ok: false }, 503); }
      return json({ ok: true, sms: SMS_MODE(), demo: DEMO_ACTIONS() });
    }
    if (path === "/auth/request" && m === "POST") return await authRequest(req);
    if (path === "/auth/verify" && m === "POST") return await authVerify(req);
    if (path === "/auth/logout" && m === "POST") return await logout(req);

    const user = await currentUser(req);
    if (!user) return fail(401, "Session expirée : reconnectez-vous.");

    if (path === "/me" && m === "GET") return json({ user: userOut(user) });
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
      return json({ orders: rows.map(orderOut) });
    }
    if (path === "/orders" && m === "POST") return await createOrder(req, user);
    let r = path.match(/^\/orders\/([A-Za-z0-9-]+)$/);
    if (r && m === "GET") { const o = await ownedOrder(user, r[1]); return o ? json({ order: orderOut(o) }) : fail(404, "Commande introuvable."); }
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
