/* WunaGo — service worker
   Réseau d'abord : on sert toujours la dernière version publiée ;
   le cache ne sert qu'en secours, hors connexion. */
const CACHE = "wunago-v27";
const SHELL = [
  "./", "index.html", "styles.css", "config.js", "app.js", "pricing.mjs", "geo.js", "map.js", "gmaps.js", "api.js", "manifest.webmanifest",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/qrcode/qrcode.js",
  "fonts/Manrope-200-800.woff2", "fonts/IBMPlexMono-400.woff2", "fonts/IBMPlexMono-500.woff2", "fonts/IBMPlexMono-600.woff2",
  "icons/wouri-icon-192.png", "icons/wouri-icon-512.png", "icons/wouri-apple-touch-icon.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  const appPage = req.mode === "navigate" && (u.pathname === "/" || u.pathname.endsWith("/index.html"));
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(appPage ? "index.html" : req, copy)); }
      return res;
    }).catch(() => caches.match(appPage ? "index.html" : req).then((hit) => hit || caches.match(req)))
  );
});

/* Notifications sur le téléphone (Web Push) */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "WunaGo", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "WunaGo", {
    body: d.body || "", tag: d.tag, renotify: !!d.tag, data: { url: d.url || "/" },
    icon: "icons/wouri-icon-192.png", badge: "icons/wouri-icon-192.png", lang: "fr"
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).origin === self.location.origin && !c.url.includes("admin"));
    if (win) { win.postMessage({ wgOpen: url }); return win.focus(); }
    return self.clients.openWindow(url);
  }));
});
