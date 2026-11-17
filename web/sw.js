/* WunaGo — service worker : coque de l'app disponible hors connexion */
const CACHE = "wunago-v4";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "geo.js", "map.js", "manifest.webmanifest",
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
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Réseau d'abord pour la page, cache en secours
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  // Fichiers statiques : cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
