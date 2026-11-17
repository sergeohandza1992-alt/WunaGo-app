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
- Tests : `parcours` (mode local), `google-maps` (API Google simulée), `ecrans-compte` (étape 3), `serveur` (API + Postgres local
  via `tests/dev-server.mjs`). Lancer : `npm install && npx playwright install chromium && npm test`. Serveur local : `npm run dev`.
- Mise en ligne : Netlify (projet `wunago-app` → https://wunago-app.netlify.app).
  GitHub Actions est bloqué tant que le compte GitHub a un problème de facturation (ticket ouvert).

## Identité visuelle (à respecter strictement)
Jaune `#FFD700`, encre `#101010`, fond `#FBFAF7`, cartes blanches filet `rgba(16,16,16,.08)`.
Polices : Manrope (texte), IBM Plex Mono (données, codes, libellés en capitales).
Rayons : boutons 17 px, cartes 16–18 px, pilules 99 px. Zones tactiles ≥ 44 px.
Design de référence : projet Claude Design « WunaGo — App Client ».

## Règles métier
- Colis 1 000 FCFA/kg, pressing 1 300 FCFA/kg : 1 kg offert dès 5 kg, livraison offerte dès 10 kg.
- Courses 1 000 FCFA, déplacement 700 FCFA (forfaits).
- Codes commande `WUN-AAAA-NNN`. Paiements : Orange Money, MTN MoMo, portefeuille, espèces, carte.
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
