// Notifications sur le téléphone (Web Push, clés VAPID dans les variables d'environnement).
import { sendWebPush, generateVapidKeys } from "./webpush.mts";
import { env } from "./platform.mts";

type Row = Record<string, any>;
export const pushLog: Row[] = []; // mode test (WG_PUSH_DRY=1) : notifications enregistrées au lieu d'être envoyées

/* Clés des notifications : variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si elles existent,
   sinon générées une fois au premier démarrage et gardées en base (table app_settings) — rien à configurer. */
let cached: { publicKey: string; privateKey: string } | null = null;
async function keys(db: any) {
  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  if (cached) return cached;
  if (env("WG_PUSH_DRY") === "1") return null;
  try {
    const row = (await db.sql`SELECT value FROM app_settings WHERE key = 'vapid'`)[0];
    if (row) return (cached = row.value);
    const k = await generateVapidKeys();
    await db.sql`INSERT INTO app_settings (key, value) VALUES ('vapid', ${JSON.stringify(k)}::jsonb) ON CONFLICT (key) DO NOTHING`;
    cached = (await db.sql`SELECT value FROM app_settings WHERE key = 'vapid'`)[0].value;
    return cached;
  } catch (e) { console.error("vapid", e); return null; }
}
export async function publicKey(db: any): Promise<string | null> { const k = await keys(db); return k ? k.publicKey : null; }
async function vapid(db: any) {
  const k = await keys(db);
  return k ? { ...k, subject: env("VAPID_SUBJECT") || "mailto:contact@wunago.app" } : null;
}

/** kind : "orders" (suivi), "messages", "offers" (nouvelle course pour les livreurs) — respecte les préférences de chacun. */
export async function sendPush(db: any, userIds: string[], payload: { title: string; body: string; url?: string; tag?: string }, kind: string) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const subs: Row[] = await db.sql`
    SELECT s.endpoint, s.keys, s.user_id, u.prefs FROM push_subscriptions s JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ANY(${ids}::uuid[])`;
  const targets = subs.filter((s) => {
    const n = (s.prefs && s.prefs.notifPrefs) || {};
    if (kind === "orders" && n.orders === false) return false;
    return true;
  });
  if (env("WG_PUSH_DRY") === "1") { targets.forEach((s) => pushLog.push({ userId: s.user_id, kind, ...payload })); return targets.length; }
  const v = await vapid(db); if (!v) return 0;
  await Promise.all(targets.map(async (s) => {
    try {
      const status = await sendWebPush({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), v);
      if (status === 404 || status === 410) await db.sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
    } catch (e) { console.error("push", e); }
  }));
  return targets.length;
}
