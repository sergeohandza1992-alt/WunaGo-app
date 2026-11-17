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
- `tests/parcours.test.mjs` (mode OpenStreetMap) et `tests/google-maps.test.mjs` (API Google simulée).
  Lancer : `npm install && npx playwright install chromium && npm test`.
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
3. Écrans manquants : Mes adresses, moyens de paiement, notifications, annulation, litiges
4. Backend réel (hors paiements) : comptes, commandes serveur, SMS de connexion, suivi temps réel
5. App livreur + tableau de bord de suivi
6. **En dernier** : paiements Orange Money / MTN MoMo réels

## Façon de travailler
- Une étape = une branche + une demande de fusion, testée (tests Playwright à jour et au vert).
- Ne jamais pousser directement sur `main`.
- Aucune clé secrète dans le dépôt (il est public) : variables d'environnement Netlify.
