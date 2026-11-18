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
- `server/api.mts` : API (routes `/api/*`) — connexion par code, compte, commandes, portefeuille, réclamations.
  `server/rules.mts` : règles de prix (le serveur fait foi). `server/platform.mts` : base et variables fournies par le point d'entrée
  (`worker/index.mts` sur Cloudflare avec Neon via `server/db-neon.mts` ; `netlify/functions/api.mts` pour les tests locaux). Variables : `SMS_MODE` (`demo` par défaut : code renvoyé
  à l'app, aucun SMS), `DEMO_ACTIONS` (`on` par défaut : recharge et avancement de livraison simulés).
- `netlify/database/migrations/` : schéma Postgres. Ne jamais modifier une migration déjà appliquée. Sur Cloudflare, appliquées automatiquement
  au premier appel (`server/migrate.mts`, table `schema_migrations`) : **ajouter chaque nouvelle migration à la liste de `worker/index.mts`**.
- Rôles : `client`, `courier` (ajouté depuis le backoffice), `admin` (numéros listés dans la variable `ADMIN_PHONES`, séparés par des virgules).
  Même app pour client et livreur (l'espace livreur s'affiche selon le rôle). Backoffice : `web/admin.html` + `admin.js`.
  Notifications : `server/push.mts` + `server/webpush.mts` (Web Push en WebCrypto ; clés VAPID générées au premier démarrage et gardées dans `app_settings`, ou variables `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` ; `WG_PUSH_DRY=1` en test). Part livreur : `TARIFS.partLivreur` × lignes de transport (`TARIFS.lignesTransport`, fonction `courierShare`) — jamais sur les articles ni les prestations pressing.
  Rapports du backoffice : `GET /api/admin/reports?from&to` (dates de Douala) et export CSV `GET /api/admin/export`.
  Historique : `GET /api/admin/orders` (filtres status, from, to, service, pay, courier, q, limit, offset + totaux) ; courses et gains d'un livreur :
  `GET /api/admin/couriers/:id/history` (backoffice) et `GET /api/courier/history` (app livreur, onglet Compte) ; dépenses du client : `GET /api/orders?from&to` (onglet Commandes, par période).
- Expérience : point de repère et destinataire (`details.hints`, `details.recipient`), code de remise à 4 chiffres (`orders.delivery_code`,
  obligatoire pour livrer, sinon nom + photo), lien de suivi public `web/suivi.html?c=<track_token>` (`GET /api/suivi/:token`), bouton « Recommander ».
  Courses proposées d'abord aux 3 livreurs les plus proches (8 km), puis à tous après 3 min ; alerte au backoffice après 10 min sans livreur :
  déclencheur Cloudflare toutes les 2 min (`[triggers]` de `wrangler.toml`, `server/alerts.mts`). Versements des livreurs : table `courier_payments`.
  « Je suis arrivé » (étape `arrived`, `orders.arrived_at`) ; commande saisie par l'équipe pour un client (`POST /api/admin/orders`, `orders.created_by`, colis ou déplacement).
  Le destinataire peut envoyer sa position exacte depuis le lien de suivi (`POST /api/suivi/:token/position`, 2,5 km max de l'adresse, prix inchangé) ;
  trajets récents sur l'accueil ; destinataire depuis les contacts (Android) ; « Combien ça coûte ? » sans compte (écran de connexion).
  **Code WunaGo** (`WG-XXXX`, table `places`) : adresse en 6 caractères = point GPS exact + repère + nom/numéro du titulaire. Création « devant la porte »
  (Portefeuille › Mon Code WunaGo, carte sur l'accueil), QR code (`web/vendor/qrcode/`, MIT), page publique `web/code.html?c=` (nom + quartier seulement,
  autocollant imprimable), lien `/#code=WG-XXXX`, saisie ou scan dans une commande et au backoffice ; le serveur résout `pickupCode` / `dropoffCode`.
  **Commande éclair** : en haut de l'accueil, « Envoyer à… » / « Aller chez… » (colis léger ou trajet) + carnet de codes (`prefs.codebook`, ajout automatique) ;
  un seul écran (contact, départ = mon code ou ma position, paiement, prix) → « Envoyer ». Le lien `/#code=` ouvre cet écran.
  Version affichée : `APP_VERSION` (app.js) et pied du menu (admin.js), à changer avec `CACHE` (sw.js).
- Tests : `livraison2` (multi-acteurs : backoffice, livreur, clients, messagerie, notifications), `tarifs` (grille, sans navigateur), `services` (parcours dédiés, profil), `parcours` (mode local), `google-maps` (API Google simulée), `ecrans-compte` (étape 3), `serveur` (API + Postgres local
  via `tests/dev-server.mjs`). Les tests décalent l'heure à midi la nuit (`tests/horloge.mjs`). Lancer : `npm install && npx playwright install chromium && npm test`. Serveur local : `npm run dev`.
- Mise en ligne : **Cloudflare Workers** (offre gratuite, `wrangler.toml`) relié au dépôt GitHub : chaque fusion dans `main` publie
  automatiquement. Base : **Neon** (Postgres gratuit). Secrets Cloudflare : `DATABASE_URL`, `ADMIN_PHONES`. Netlify (crédits épuisés en nov. 2026) abandonné ;
  la PR permanente `live` peut être fermée.
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
5. ✅ Deuxième livraison : messagerie (client / livreur / service client / entre clients), espace livreur avec position en direct, backoffice `admin.html`, notifications Web Push
6. **En dernier** : paiements Orange Money / MTN MoMo réels

## Décisions
- Pas de clé Google Maps payante pour l'instant : carte OpenStreetMap + bouton « Ouvrir dans Google Maps ».
- SMS de connexion : mode démo (code affiché) tant qu'aucun fournisseur SMS n'est choisi — gratuit pour l'instant.
- Accès mobile : certains réseaux mobiles coupent `*.netlify.app` → prévoir un nom de domaine propre.

## Façon de travailler
- Une étape = une branche + une demande de fusion, testée (tests Playwright à jour et au vert).
- Ne jamais pousser directement sur `main`.
- Aucune clé secrète dans le dépôt (il est public) : variables d'environnement Netlify.
