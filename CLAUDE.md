# WunaGo-app — fiche projet pour Claude

## Contexte
WunaGo : service de livraison à Douala (Cameroun) — colis, pressing, courses, déplacements.
Porteur du projet : Serge-Venant OHANDZA. Langue de travail et de l'interface : **français**
(l'app propose aussi l'anglais). Livrables concis, aérés, professionnels.

## Ce qui existe
- `web/` : web app client installable (PWA), HTML/CSS/JS sans build ni framework.
  - `app.js` : écrans (gabarits HTML en chaînes), état, actions, persistance `localStorage`.
  - `geo.js` : quartiers de Douala, recherche d'adresses Photon, distances.
  - `map.js` : carte de suivi Leaflet + OpenStreetMap (`vendor/leaflet/`) — utilisée sans clé Google.
  - `gmaps.js` : Google Maps (carte, itinéraire, recherche Places, adresse de « Ma position ») si une clé existe.
  - `config.js` : généré par Netlify (`scripts/write-config.mjs`) depuis la variable `GOOGLE_MAPS_KEY`.
  - `sw.js` : service worker hors ligne — **incrémenter `CACHE`** à chaque modification de fichier.
  - `api.js` : client de l'API. Si `/api/health` ne répond pas, l'app reste en mode local (démo).
- `netlify/functions/api.mts` : API (routes `/api/*`) — connexion par code, compte, commandes, portefeuille, réclamations.
  `netlify/lib/rules.mts` : règles de prix (le serveur fait foi). Variables : `SMS_MODE` (`demo` par défaut : code renvoyé
  à l'app, aucun SMS), `DEMO_ACTIONS` (`on` par défaut : recharge et avancement de livraison simulés).
- `netlify/database/migrations/` : schéma Postgres (Netlify Database). Ne jamais modifier une migration déjà appliquée.
- Tests : `tarifs` (grille, sans navigateur), `services` (parcours dédiés, profil), `parcours` (mode local), `google-maps` (API Google simulée), `ecrans-compte` (étape 3), `serveur` (API + Postgres local
  via `tests/dev-server.mjs`). Lancer : `npm install && npx playwright install chromium && npm test`. Serveur local : `npm run dev`.
- Mise en ligne : Netlify (projet `wunago-app` → https://wunago-app.netlify.app).
  GitHub Actions est bloqué tant que le compte GitHub a un problème de facturation (ticket ouvert).

## Identité visuelle (à respecter strictement)
Jaune `#FFD700`, encre `#101010`, fond `#FBFAF7`, cartes blanches filet `rgba(16,16,16,.08)`.
Polices : Manrope (texte), IBM Plex Mono (données, codes, libellés en capitales).
Rayons : boutons 17 px, cartes 16–18 px, pilules 99 px. Zones tactiles ≥ 44 px.
Design de référence : projet Claude Design « WunaGo — App Client ».

## Règles métier
- **Grille tarifaire unique : `web/pricing.mjs` (objet `TARIFS`)**, utilisée par l'app ET le serveur (le serveur recalcule et fait foi).
  Prix selon distance (route ≈ vol d'oiseau × 1,35), poids, véhicule, zone (centre / intermédiaire / périphérie),
  heure (pointe 7 h–9 h 30 et 16 h 30–19 h 30 en semaine +15 %, soirée 20 h 30–22 h +20 %), service 6 h–22 h, arrondi au 50 F.
- Parcours dédiés : colis (poids, véhicule), pressing (articles, linge au kilo, prestation, délai, collecte + retour),
  courses (liste d'achats, marché, volume, avance livreur ≤ 50 000 F), déplacement (passagers, moto-taxi / voiture).
- Pressing : 1 kg offert dès 5 kg, collecte offerte dès 10 kg ou 15 000 F. Adresse de l'atelier : `TARIFS.pressing.atelier` (à renseigner).
- Codes commande `WUN-AAAA-NNN`. Paiements : Orange Money, MTN MoMo, portefeuille, espèces, carte.
- Numéro du service client : `SUPPORT_PHONE` en tête de `app.js` (provisoire, à remplacer).
- `DEMO = true` (en tête de `app.js`) : code SMS affiché, livreur simulé — tant que le backend n'est pas branché.

## Feuille de route (dans cet ordre)
1. ✅ Carte de suivi réelle (OpenStreetMap, puis Google Maps dès que la clé est fournie)
2. ✅ Saisie d'adresses : suggestions, Ma position, adresses enregistrées, distance
3. ✅ Écrans manquants : Mes adresses, moyens de paiement, notifications, annulation, litiges
4. ✅ Backend réel (hors paiements) : comptes, commandes serveur, connexion par code (SMS réels à brancher), suivi rafraîchi
5. App livreur + tableau de bord de suivi
6. **En dernier** : paiements Orange Money / MTN MoMo réels

## Décisions
- Pas de clé Google Maps payante pour l'instant : carte OpenStreetMap + bouton « Ouvrir dans Google Maps ».
- SMS de connexion : mode démo (code affiché) tant qu'aucun fournisseur SMS n'est choisi — gratuit pour l'instant.
- Accès mobile : certains réseaux mobiles coupent `*.netlify.app` → prévoir un nom de domaine propre.

## Façon de travailler
- Une étape = une branche + une demande de fusion, testée (tests Playwright à jour et au vert).
- Ne jamais pousser directement sur `main`.
- Aucune clé secrète dans le dépôt (il est public) : variables d'environnement Netlify.
