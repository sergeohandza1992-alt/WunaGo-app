// Génère web/config.js au moment de la publication Netlify, à partir des variables d'environnement.
// La clé Google Maps est publique par nature (elle part dans le navigateur) : elle doit être
// restreinte au site wunago-app.netlify.app dans la console Google Cloud.
import { writeFileSync } from "node:fs";
const key = (process.env.GOOGLE_MAPS_KEY || "").trim();
writeFileSync("web/config.js", `window.WG_CONFIG = ${JSON.stringify({ googleMapsKey: key })};\n`);
console.log(key ? "config.js : clé Google Maps présente" : "config.js : pas de clé Google Maps (OpenStreetMap)");
