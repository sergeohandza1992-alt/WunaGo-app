/* WunaGo — carte de suivi (Leaflet + tuiles OpenStreetMap).
   La carte vit dans un conteneur persistant, déplacé dans l'écran de suivi à
   chaque affichage : l'application redessine ses écrans, la carte, elle, est conservée. */
(function () {
  "use strict";

  var host = null, map = null, layers = null, courier = null, currentKey = null;

  function icon(html, size) {
    return L.divIcon({ className: "wg-pin", html: html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  var PICKUP = '<span style="display:block;width:16px;height:16px;box-sizing:border-box;border-radius:99px;background:#101010;border:3.5px solid #FFD700;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>';
  var DROPOFF = '<span style="display:block;width:15px;height:15px;border-radius:3px;background:#101010;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>';
  var COURIER = '<span class="wg-courier"><span class="wg-courier-pulse"></span><span class="wg-courier-dot">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M8.5 17.5h6l3-7h-4M12 10.5 9.5 6H7"/></svg></span></span>';

  function ensure() {
    if (host) return true;
    if (!window.L) return false;
    host = document.createElement("div");
    host.className = "wg-map";
    host.style.position = "absolute"; host.style.top = "0"; host.style.left = "0"; host.style.width = "100%"; host.style.height = "100%";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Carte du trajet de livraison");
    map = L.map(host, { zoomControl: false, attributionControl: true, tap: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    layers = L.layerGroup().addTo(map);
    return true;
  }

  /* opts: { key, pickup:{lat,lng}, dropoff:{lat,lng}, courier:{lat,lng}|null } */
  function mount(slotId, opts) {
    var slot = document.getElementById(slotId);
    if (!slot || !ensure()) return false;
    slot.appendChild(host);
    map.invalidateSize();
    if (currentKey !== opts.key) {
      currentKey = opts.key;
      layers.clearLayers();
      courier = null;
      L.polyline([opts.pickup, opts.dropoff], { color: "#101010", weight: 4, opacity: .85, dashArray: "1 8", lineCap: "round" }).addTo(layers);
      L.marker(opts.pickup, { icon: icon(PICKUP, 16), keyboard: false, title: "Récupération" }).addTo(layers);
      L.marker(opts.dropoff, { icon: icon(DROPOFF, 15), keyboard: false, title: "Livraison" }).addTo(layers);
      map.fitBounds(L.latLngBounds([opts.pickup, opts.dropoff]), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 40], maxZoom: 16 });
    }
    setCourier(opts.courier);
    return true;
  }

  function setCourier(pos) {
    if (!map) return;
    if (!pos) { if (courier) { layers.removeLayer(courier); courier = null; } return; }
    if (!courier) courier = L.marker(pos, { icon: icon(COURIER, 30), keyboard: false, zIndexOffset: 1000, title: "Livreur" }).addTo(layers);
    else courier.setLatLng(pos);
  }

  window.WMap = { mount: mount, setCourier: setCourier, available: function () { return !!window.L; } };
})();
