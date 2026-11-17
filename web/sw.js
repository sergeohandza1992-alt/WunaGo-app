/* WunaGo — service worker
   Réseau d'abord : on sert toujours la dernière version publiée ;
   le cache ne sert qu'en secours, hors connexion. */
const CACHE = "wunago-v7";
const SHELL = [
  "./", "index.html", "styles.css", "config.js", "app.js", "geo.js", "map.js", "gmaps.js", "api.js", "manifest.webmanifest",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "fonts/Manrope-200-800.woff2", "fonts/IBMPlexMono-400.woff2", "fonts/IBMPlexMono-500.woff2", "fonts/IBMPlexMono-600.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
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
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "index.html" : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "index.html" : req).then((hit) => hit || caches.match(req)))
  );
});
