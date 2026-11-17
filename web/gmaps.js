/* WunaGo — Google Maps (carte, itinéraire routier, recherche d'adresses, adresse de « Ma position »).
   Actif seulement si une clé est fournie (variable Netlify GOOGLE_MAPS_KEY → config.js).
   Sans clé, ou si Google ne répond pas, l'app garde OpenStreetMap (map.js + geo.js). */
(function () {
  "use strict";

  var KEY = (window.WG_CONFIG && window.WG_CONFIG.googleMapsKey) || "";
  window.WGMaps = { enabled: false, ready: false };
  if (!KEY) return;

  var DOUALA = { lat: 4.0511, lng: 9.7679 };
  var loading = null;

  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      window.__wgGmapsReady = function () { resolve(window.google); };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(KEY) +
        "&libraries=places,geometry&language=fr&region=CM&loading=async&callback=__wgGmapsReady";
      s.async = true;
      s.onerror = function () { reject(new Error("google maps")); };
      document.head.appendChild(s);
      setTimeout(function () { reject(new Error("google maps timeout")); }, 15000);
    });
    return loading;
  }

  /* ---------- itinéraire routier (Directions, puis Routes, sinon ligne droite) ---------- */
  var routeCache = {};
  function routeKey(a, b) { return [a.lat, a.lng, b.lat, b.lng].map(function (x) { return x.toFixed(5); }).join(","); }
  function toLL(p) { return { lat: typeof p.lat === "function" ? p.lat() : p.lat, lng: typeof p.lng === "function" ? p.lng() : p.lng }; }

  function computeRoute(a, b) {
    var k = routeKey(a, b);
    if (routeCache[k]) return Promise.resolve(routeCache[k]);
    var g = window.google.maps;
    var viaDirections = new Promise(function (resolve, reject) {
      if (!g.DirectionsService) return reject(new Error("no directions"));
      new g.DirectionsService().route({ origin: a, destination: b, travelMode: "DRIVING", region: "cm" }, function (res, status) {
        if (status !== "OK" || !res.routes || !res.routes[0]) return reject(new Error(status));
        var leg = res.routes[0].legs[0];
        resolve({ path: res.routes[0].overview_path.map(toLL), km: leg.distance.value / 1000, min: Math.round(leg.duration.value / 60) });
      });
    });
    return viaDirections.catch(function () {
      if (!g.importLibrary) throw new Error("no routes");
      return g.importLibrary("routes").then(function (lib) {
        if (!lib.Route || !lib.Route.computeRoutes) throw new Error("no routes");
        return lib.Route.computeRoutes({ origin: a, destination: b, travelMode: "DRIVING", fields: ["path", "distanceMeters", "durationMillis"] });
      }).then(function (r) {
        var rt = r.routes && r.routes[0]; if (!rt) throw new Error("no route");
        return { path: rt.path.map(toLL), km: rt.distanceMeters / 1000, min: Math.round(rt.durationMillis / 60000) };
      });
    }).then(function (r) { routeCache[k] = r; return r; });
  }

  /* point situé à la fraction f (0→1) du trajet */
  function along(path, f) {
    if (!path || path.length < 2) return null;
    var seg = [], total = 0, i;
    for (i = 1; i < path.length; i++) { var d = window.WGeo.distanceKm(path[i - 1], path[i]); seg.push(d); total += d; }
    var target = total * Math.max(0, Math.min(1, f));
    for (i = 0; i < seg.length; i++) {
      if (target <= seg[i] || i === seg.length - 1) {
        var r = seg[i] ? target / seg[i] : 0, p = path[i], q = path[i + 1];
        return { lat: p.lat + (q.lat - p.lat) * r, lng: p.lng + (q.lng - p.lng) * r };
      }
      target -= seg[i];
    }
    return path[path.length - 1];
  }

  /* ---------- carte de suivi ---------- */
  var host = null, map = null, items = [], courier = null, currentKey = null, currentRoute = null;

  function ensureMap() {
    if (map) return;
    var g = window.google.maps;
    host = document.createElement("div");
    host.className = "wg-map";
    host.style.position = "absolute"; host.style.top = "0"; host.style.left = "0"; host.style.width = "100%"; host.style.height = "100%";
    host.setAttribute("aria-label", "Carte Google Maps du trajet de livraison");
    map = new g.Map(host, {
      center: DOUALA, zoom: 13, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy",
      clickableIcons: false, keyboardShortcuts: false
    });
  }
  function dot(fill, stroke, scale) {
    return { path: window.google.maps.SymbolPath.CIRCLE, scale: scale, fillColor: fill, fillOpacity: 1, strokeColor: stroke, strokeWeight: 3 };
  }
  function square() {
    return { path: "M -6 -6 L 6 -6 L 6 6 L -6 6 Z", fillColor: "#101010", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1 };
  }

  function mount(slotId, opts) {
    var slot = document.getElementById(slotId);
    if (!slot || !window.google) return false;
    var g = window.google.maps;
    ensureMap();
    slot.appendChild(host);
    if (currentKey !== opts.key) {
      currentKey = opts.key; currentRoute = null;
      items.forEach(function (x) { x.setMap(null); }); items = [];
      if (courier) { courier.setMap(null); courier = null; }
      items.push(new g.Marker({ position: opts.pickup, map: map, icon: dot("#101010", "#FFD700", 7), title: "Récupération" }));
      items.push(new g.Marker({ position: opts.dropoff, map: map, icon: square(), title: "Livraison" }));
      var line = new g.Polyline({ path: [opts.pickup, opts.dropoff], map: map, strokeColor: "#101010", strokeOpacity: 0.5, strokeWeight: 4 });
      items.push(line);
      var bounds = new g.LatLngBounds(); bounds.extend(opts.pickup); bounds.extend(opts.dropoff);
      map.fitBounds(bounds, { top: 90, bottom: 40, left: 40, right: 40 });
      var key = opts.key;
      computeRoute(opts.pickup, opts.dropoff).then(function (r) {
        if (currentKey !== key) return;
        currentRoute = r;
        line.setPath(r.path); line.setOptions({ strokeOpacity: 0.9, strokeWeight: 5 });
        var b = new g.LatLngBounds(); r.path.forEach(function (p) { b.extend(p); });
        map.fitBounds(b, { top: 90, bottom: 40, left: 40, right: 40 });
        if (opts.onRoute) opts.onRoute(r);
      }).catch(function () {});
    }
    setCourier(opts.courier, opts.fraction);
    return true;
  }

  function setCourier(pos, fraction) {
    if (!map) return;
    var g = window.google.maps;
    if (currentRoute && typeof fraction === "number") pos = along(currentRoute.path, fraction) || pos;
    if (!pos) { if (courier) { courier.setMap(null); courier = null; } return; }
    if (!courier) courier = new g.Marker({ position: pos, map: map, icon: dot("#FFD700", "#101010", 9), zIndex: 1000, title: "Livreur" });
    else courier.setPosition(pos);
  }

  /* ---------- recherche d'adresses (Places API New) et adresse d'une position ---------- */
  var session = null;
  function searchPlaces(q) {
    return window.google.maps.importLibrary("places").then(function (lib) {
      if (!session) session = new lib.AutocompleteSessionToken();
      return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q, includedRegionCodes: ["cm"], language: "fr", region: "cm", sessionToken: session,
        locationBias: { center: DOUALA, radius: 30000 }
      });
    }).then(function (res) {
      return (res.suggestions || []).filter(function (s) { return s.placePrediction; }).slice(0, 6).map(function (s) {
        var pp = s.placePrediction;
        return {
          label: pp.text.toString(), kind: "google",
          resolve: function () {
            var place = pp.toPlace();
            return place.fetchFields({ fields: ["location", "formattedAddress"] }).then(function () {
              session = null;
              return { lat: place.location.lat(), lng: place.location.lng() };
            });
          }
        };
      });
    });
  }
  function reverse(lat, lng) {
    return new Promise(function (resolve, reject) {
      new window.google.maps.Geocoder().geocode({ location: { lat: lat, lng: lng }, language: "fr" }, function (res, status) {
        if (status !== "OK" || !res || !res[0]) return reject(new Error(status));
        resolve(res[0].formatted_address.replace(/, Cameroun$|, Cameroon$/, ""));
      });
    });
  }

  window.WGMaps = { enabled: true, ready: false, load: load };

  load().then(function () {
    var osmSearch = window.WGeo.searchPlaces, osmReverse = window.WGeo.reverse;
    window.WGeo.searchPlaces = function (q, signal) { return searchPlaces(q).catch(function () { return osmSearch(q, signal); }); };
    window.WGeo.reverse = function (lat, lng) { return reverse(lat, lng).catch(function () { return osmReverse(lat, lng); }); };
    window.WGeo.provider = "google";
    window.WMap = { mount: mount, setCourier: setCourier, available: function () { return true; }, provider: "google" };
    window.WGMaps.ready = true;
    document.dispatchEvent(new Event("wg:maps-ready"));
  }).catch(function () { /* on reste sur OpenStreetMap */ });
})();
