/* WunaGo — géographie : quartiers de Douala, recherche d'adresses, distances.
   Recherche et géocodage inverse : Photon (données OpenStreetMap, sans clé).
   Les coordonnées des quartiers sont des centres approximatifs, affinés par Photon. */
(function () {
  "use strict";

  var DOUALA = { lat: 4.0511, lng: 9.7679 };
  var BBOX = "9.55,3.93,9.92,4.20"; // lon min, lat min, lon max, lat max
  var PHOTON = "https://photon.komoot.io";

  var QUARTIERS = [
    ["Akwa", 4.0489, 9.6996], ["Akwa Nord", 4.0605, 9.7160], ["Bonanjo", 4.0425, 9.6890],
    ["Bonapriso", 4.0300, 9.6950], ["Bali", 4.0430, 9.7040], ["Deïdo", 4.0640, 9.7080],
    ["Bonamoussadi", 4.0950, 9.7400], ["Makepe", 4.0820, 9.7520], ["Kotto", 4.0790, 9.7680],
    ["Logpom", 4.0960, 9.7660], ["Bepanda", 4.0630, 9.7330], ["Ndokoti", 4.0460, 9.7390],
    ["Cité-Cicam", 4.0480, 9.7300], ["New Bell", 4.0370, 9.7150], ["Bonabéri", 4.0720, 9.6640],
    ["Logbaba", 4.0350, 9.7750], ["Yassa", 4.0050, 9.8050], ["PK 8", 4.0450, 9.7900],
    ["Village", 4.0260, 9.7560], ["Ndogbong", 4.0560, 9.7520], ["Bonadibong", 4.0420, 9.7120],
    ["Japoma", 3.9950, 9.8150], ["Bassa", 4.0350, 9.7300], ["Nyalla", 4.0230, 9.7800]
  ].map(function (q) { return { name: q[0], label: q[0] + ", Douala", lat: q[1], lng: q[2], kind: "quartier" }; });

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function matchQuartiers(q, limit) {
    var n = norm(q);
    if (!n) return [];
    return QUARTIERS.filter(function (x) { return norm(x.name).indexOf(n) === 0 || norm(x.name).indexOf(" " + n) !== -1; })
      .concat(QUARTIERS.filter(function (x) { var k = norm(x.name); return k.indexOf(n) > 0 && k.indexOf(" " + n) === -1; }))
      .slice(0, limit || 4);
  }

  function findQuartier(text) {
    var n = norm(text);
    for (var i = 0; i < QUARTIERS.length; i++) if (n.indexOf(norm(QUARTIERS[i].name)) === 0) return QUARTIERS[i];
    return null;
  }

  function labelFrom(p) {
    var street = p.street ? (p.housenumber ? p.housenumber + " " : "") + p.street : "";
    var parts = [];
    if (p.name && p.name !== p.street) parts.push(p.name);
    if (street) parts.push(street);
    var area = p.district || p.locality || p.suburb;
    if (area && parts.indexOf(area) === -1) parts.push(area);
    var city = p.city || p.county;
    if (city && parts.indexOf(city) === -1) parts.push(city);
    return parts.slice(0, 3).join(", ");
  }

  function searchPlaces(q, signal) {
    var url = PHOTON + "/api/?q=" + encodeURIComponent(q) + "&lang=fr&limit=6&lat=" + DOUALA.lat + "&lon=" + DOUALA.lng + "&bbox=" + BBOX;
    return fetch(url, { signal: signal }).then(function (r) { if (!r.ok) throw new Error("photon " + r.status); return r.json(); })
      .then(function (data) {
        var seen = {};
        return (data.features || []).map(function (f) {
          return { label: labelFrom(f.properties || {}), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: "place" };
        }).filter(function (x) { if (!x.label || seen[x.label]) return false; seen[x.label] = 1; return true; });
      });
  }

  function reverse(lat, lng) {
    return fetch(PHOTON + "/reverse?lat=" + lat + "&lon=" + lng + "&lang=fr")
      .then(function (r) { if (!r.ok) throw new Error("photon " + r.status); return r.json(); })
      .then(function (data) { var f = (data.features || [])[0]; return f ? labelFrom(f.properties || {}) : null; });
  }

  function distanceKm(a, b) {
    if (!a || !b) return null;
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* Distance par la route ≈ vol d'oiseau × 1,35 en ville */
  function roadKm(a, b) { var d = distanceKm(a, b); return d == null ? null : d * 1.35; }

  var SPEED_KMH = { bike: 22, tricycle: 16, van: 14 };
  function etaMin(km, vehicle) { if (km == null) return null; return Math.max(3, Math.round(km / (SPEED_KMH[vehicle] || 18) * 60)); }

  window.WGeo = {
    DOUALA: DOUALA, QUARTIERS: QUARTIERS, norm: norm, matchQuartiers: matchQuartiers, findQuartier: findQuartier,
    searchPlaces: searchPlaces, reverse: reverse, distanceKm: distanceKm, roadKm: roadKm, etaMin: etaMin
  };
})();
