// Notifications sur le téléphone (Web Push, clés VAPID dans les variables Netlify).
import * as webpush from "web-push";

type Row = Record<string, any>;
let configured = false;
export const pushLog: Row[] = []; // mode test (WG_PUSH_DRY=1) : notifications enregistrées au lieu d'être envoyées

function env(key: string): string | undefined {
  const n = (globalThis as any).Netlify;
  return (n && n.env && n.env.get(key)) ?? process.env[key];
}
export function publicKey(): string | null { return env("VAPID_PUBLIC_KEY") || null; }

function ready(): boolean {
  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  if (!configured) { webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:contact@wunago.app", pub, priv); configured = true; }
  return true;
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
  if (!ready()) return 0;
  await Promise.all(targets.map((s) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 })
      .catch(async (e: any) => { if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`; })));
  return targets.length;
}
