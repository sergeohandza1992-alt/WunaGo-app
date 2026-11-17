# WunaGo-app

Application de transport et livraison de colis à Douala : colis, pressing, courses et déplacements.

## Structure

| Dossier | Contenu |
|---|---|
| `web/` | Web app client installable (PWA) — HTML/CSS/JS, sans étape de build |
| `tests/` | Test automatisé du parcours client (Playwright) |
| `.github/workflows/` | Tests à chaque PR · publication sur GitHub Pages à chaque mise à jour de `main` |

Prochainement : `mobile/` (application Android / iOS bâtie sur la même base).

## Lancer en local

```bash
npm start            # http://localhost:8080
```

## Tester

```bash
npm install
npx playwright install chromium
npm test
```

Le test couvre : installabilité, service worker, connexion par code, suggestions d'adresses,
bouton Ma position, adresses enregistrées, carte de suivi, commande et tarif,
paiement, suivi, livraison, portefeuille, historique, assistance, bouton retour,
reprise après rechargement, mode hors connexion, petit écran.

## Mise en ligne (GitHub Pages)

1. Dépôt GitHub › **Settings › Pages** › Source : **GitHub Actions**.
2. Chaque mise à jour de `web/` sur `main` publie l'app en HTTPS.

## Carte et adresses

- Carte : [Leaflet](https://leafletjs.com) (inclus dans `web/vendor/`) + tuiles OpenStreetMap — mention « © OpenStreetMap » obligatoire.
- Recherche et adresse de « Ma position » : [Photon](https://photon.komoot.io) (OpenStreetMap, sans clé). Pour un trafic important, prévoir un serveur Photon dédié ou un service payant.
- Les centres des quartiers de Douala (`web/geo.js`) sont approximatifs : à affiner sur le terrain.

## Google Maps

Avec une clé (variable d'environnement Netlify `GOOGLE_MAPS_KEY`), l'app passe sur Google Maps :
carte et itinéraire routier au suivi, recherche d'adresses, adresse de « Ma position ».
APIs à activer : Maps JavaScript API, Places API (New), Directions API (ou Routes API), Geocoding API.
Restreindre la clé au site (`https://wunago-app.netlify.app/*`). Sans clé : OpenStreetMap.
Le bouton « Ouvrir dans Google Maps » fonctionne dans tous les cas.

## Serveur (étape 4)

- API : `netlify/functions/api.mts` (routes `/api/*`), base Postgres Netlify Database (`netlify/database/migrations/`).
- Comptes par numéro de téléphone + code à 4 chiffres, session de 90 jours.
- Commandes, prix, portefeuille, annulations et réclamations enregistrés sur le serveur ; même compte sur plusieurs téléphones.
- Variables Netlify : `SMS_MODE` (`demo` : code affiché, aucun SMS envoyé) et `DEMO_ACTIONS` (`on` : recharge et livreur simulés),
  `ADMIN_PHONES` (numéros ayant accès au backoffice `/admin.html`), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (notifications sur le téléphone, à générer avec `npx web-push generate-vapid-keys`).
- Sans serveur disponible, l'app bascule en mode local.
- Local : `npm run dev` (Postgres local + API) → http://localhost:8080

## Mode démo

`var DEMO = true;` en tête de `web/app.js` : code SMS affiché à l'écran et bouton
« Avancer la livraison » pour simuler le livreur. À passer à `false` une fois branchés
les SMS, les paiements Orange Money / MTN MoMo et le suivi GPS.
Les données sont gardées dans le navigateur (`localStorage`) en attendant l'API.

## Backoffice
Adresse : `/admin.html` (ex. https://wunago-app.netlify.app/admin.html). Connexion par code, réservée aux numéros de la variable Netlify `ADMIN_PHONES`.

## Code WunaGo et commande éclair
Adresse en 6 caractères (`WG-XXXX`) avec QR code, carnet de codes et envoi en un écran depuis l'accueil.
