// Web Push (RFC 8291 « aes128gcm » + RFC 8292 « VAPID ») avec WebCrypto : fonctionne sur Cloudflare Workers et Node.
const te = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; } return out;
};
const subtle = () => (globalThis.crypto as Crypto).subtle;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Chiffre le message pour un abonnement (clés p256dh et auth du navigateur). */
export async function encryptPayload(payload: string, p256dh: string, auth: string) {
  const uaPublic = fromB64u(p256dh), authSecret = fromB64u(auth);
  const local = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle().exportKey("raw", local.publicKey));
  const uaKey = await subtle().importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey } as any, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await subtle().importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Jeton VAPID signé (ES256) pour le service de notification du navigateur. */
export async function vapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = fromB64u(publicKey);
  const jwk = { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const key = await subtle().importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

/** Envoie une notification. Renvoie le code HTTP du service (201 = accepté, 404/410 = abonnement expiré). */
export async function sendWebPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string,
  vapid: { publicKey: string; privateKey: string; subject: string }, ttl = 3600) {
  const body = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, { method: "POST", body, headers: {
    TTL: String(ttl), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
    Authorization: await vapidAuthorization(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject) } });
  return res.status;
}

/** Nouvelle paire de clés VAPID (format base64url, comme la bibliothèque web-push). */
export async function generateVapidKeys() {
  const kp = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const jwk = await subtle().exportKey("jwk", kp.privateKey) as JsonWebKey;
  return { publicKey: b64u(pub), privateKey: jwk.d as string };
}
