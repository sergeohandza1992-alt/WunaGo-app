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

Le test couvre : installabilité, service worker, connexion par code, commande et tarif,
paiement, suivi, livraison, portefeuille, historique, assistance, bouton retour,
reprise après rechargement, mode hors connexion, petit écran.

## Mise en ligne (GitHub Pages)

1. Dépôt GitHub › **Settings › Pages** › Source : **GitHub Actions**.
2. Chaque mise à jour de `web/` sur `main` publie l'app en HTTPS.

## Mode démo

`var DEMO = true;` en tête de `web/app.js` : code SMS affiché à l'écran et bouton
« Avancer la livraison » pour simuler le livreur. À passer à `false` une fois branchés
les SMS, les paiements Orange Money / MTN MoMo et le suivi GPS.
Les données sont gardées dans le navigateur (`localStorage`) en attendant l'API.
