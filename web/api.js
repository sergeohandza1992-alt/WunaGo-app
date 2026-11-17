/* WunaGo — client de l'API (/api/*). Si l'API ne répond pas (site sans serveur, hors connexion),
   l'app fonctionne en mode local comme avant. */
(function () {
  "use strict";
  var TOKEN_KEY = "wunago.token";
  var state = { checked: false, on: false, sms: "demo", demo: true };

  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function call(method, path, body) {
    var headers = { "content-type": "application/json" }, t = token();
    if (t) headers.authorization = "Bearer " + t;
    return fetch("/api" + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var err = new Error(data.error || "Erreur " + r.status); err.status = r.status; throw err; }
          return data;
        });
      }, function () { var err = new Error(navigator.onLine === false ? "Hors connexion." : "Serveur injoignable. Réessayez."); err.status = 0; throw err; });
  }

  function check() {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 5000);
    return fetch("/api/health", { cache: "no-store", signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { state.on = !!(d && d.ok); if (d) { state.sms = d.sms; state.demo = d.demo; } })
      .catch(function () { state.on = false; })
      .then(function () { clearTimeout(timer); state.checked = true; return state.on; });
  }

  window.WAPI = {
    status: state, check: check, token: token, setToken: setToken,
    get: function (p) { return call("GET", p); },
    post: function (p, b) { return call("POST", p, b || {}); },
    patch: function (p, b) { return call("PATCH", p, b || {}); },
    del: function (p) { return call("DELETE", p); }
  };
})();
