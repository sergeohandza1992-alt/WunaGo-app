// SasPay : encaissement par mobile money (Orange Money, MTN MoMo) via une page de paiement hébergée.
// Variables (secrets Cloudflare, jamais dans le dépôt) :
//   SASPAY_SECRET_KEY     clé secrète (sk_test_… en test, sk_live_… en production)
//   SASPAY_WEBHOOK_SECRET secret de signature des notifications (tableau de bord SasPay › Webhooks)
//   SASPAY_MODE           "test" (par défaut) ou "live"
// Garde-fous : en test on appelle l'hôte de bac à sable de SasPay ; une clé qui ne correspond pas au mode
// (sk_live_ en test, sk_test_ en live) désactive les paiements, pour ne jamais débiter de vrai argent par erreur.
import { env } from "./platform.mts";

const HOSTS = { test: "https://sandbox-api.saspay.me/api/v1", live: "https://api.saspay.me/api/v1" };

export function payMode(): "test" | "live" { return env("SASPAY_MODE") === "live" ? "live" : "test"; }
function base() { return env("SASPAY_API_BASE") || HOSTS[payMode()]; }

/** Paiements actifs : clé présente et cohérente avec le mode. */
export function saspayOn(): boolean {
  const k = env("SASPAY_SECRET_KEY") || "";
  if (!k) return false;
  if (env("SASPAY_API_BASE")) return true; // banc de test local
  return payMode() === "live" ? k.startsWith("sk_live_") : k.startsWith("sk_test_");
}

export class PayError extends Error { status: number; constructor(msg: string, status = 502) { super(msg); this.status = status; } }

async function call(method: string, path: string, body?: any): Promise<any> {
  let r: Response;
  try {
    r = await fetch(base() + path, {
      method, headers: { authorization: "Bearer " + env("SASPAY_SECRET_KEY"), "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new PayError("Service de paiement injoignable. Réessayez dans un instant."); }
  let j: any = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok || j.success === false) {
    console.error("saspay", method, path, r.status, JSON.stringify(j.error || j).slice(0, 300));
    throw new PayError(r.status === 429 ? "Trop de demandes de paiement, réessayez dans une minute." : "Paiement refusé par le service de paiement.");
  }
  return j.data || {};
}

const money = (n: number) => Math.round(n).toFixed(2);

/** Adresse de la page de paiement : uniquement un domaine SasPay en HTTPS (ou le banc de test local). */
export function safeCheckoutUrl(u: any): string | null {
  const s = String(u || "");
  if (/^https:\/\/([a-z0-9-]+\.)?saspay\.me\/[^\s"'<>]*$/i.test(s)) return s;
  if (env("SASPAY_API_BASE") && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/[^\s"'<>]*$/.test(s)) return s;
  return null;
}

export async function createCheckout(o: { amount: number; description: string; returnUrl: string; customerName?: string; reference: string }) {
  const d = await call("POST", "/checkout-sessions/", {
    amount: money(o.amount), currency: "XAF", country: "CM", description: o.description,
    customer_name: o.customerName || undefined, return_url: o.returnUrl, metadata: { wg_payment: o.reference }
  });
  const url = safeCheckoutUrl(d.checkout_url);
  if (!d.id || !url) throw new PayError("Page de paiement indisponible. Réessayez.");
  return { id: String(d.id), url };
}

/** État réel d'une session (SasPay revérifie auprès de l'opérateur à chaque appel). */
export async function sessionStatus(id: string) {
  const d = await call("GET", "/checkout-sessions/" + encodeURIComponent(id) + "/status/");
  const t = d.transaction || {};
  return {
    status: String(d.status || "").toUpperCase(),                         // PENDING | PAID | EXPIRED | CANCELLED
    txStatus: String(d.transaction_status || t.status || "").toUpperCase(), // PENDING | SUCCESS | FAILED | CANCELLED
    txId: d.transaction_id || d.payment_id || t.id || null,
    amount: num(d.amount ?? t.amount), fee: num(d.fee ?? t.fee), network: d.network || t.network || null
  };
}

/** Contrôle d'une transaction par son identifiant (verify). */
export async function verifyPayment(txId: string) {
  const d = await call("GET", "/payments/" + encodeURIComponent(txId) + "/verify/");
  return { status: String(d.status || "").toUpperCase(), amount: num(d.amount ?? (d.amounts || {}).requested), fee: num(d.fee ?? (d.amounts || {}).fee) };
}

function num(v: any): number | null { const n = Number(v); return v == null || v === "" || !isFinite(n) ? null : n; }

/** Signature des notifications : HMAC-SHA256 hex de `${timestamp}.${corps brut}`, à 5 minutes près. */
export async function webhookValid(raw: string, ts: string | null, sig: string | null): Promise<boolean> {
  const secret = env("SASPAY_WEBHOOK_SECRET");
  if (!secret || !ts || !sig || !/^\d+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const s = sig.trim().toLowerCase().replace(/^sha256=/, "");
  if (s.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}
