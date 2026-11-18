// WunaGo sur Cloudflare Workers : sert l'app (dossier web/) et l'API (/api/*), base Neon (variable secrète DATABASE_URL).
import handler, { configure } from "../server/api.mts";
import { runAlerts } from "../server/alerts.mts";
import { db } from "../server/platform.mts";
import { neonDb } from "../server/db-neon.mts";
import { migrate } from "../server/migrate.mts";
// Ajouter ici chaque nouvelle migration (dans l'ordre)
import m1 from "../netlify/database/migrations/20261117140000_schema_initial.sql";
import m2 from "../netlify/database/migrations/20261117160000_parcours_dedies_et_tarifs.sql";
import m3 from "../netlify/database/migrations/20261117170000_livreurs_messagerie_notifications.sql";
import m4 from "../netlify/database/migrations/20261117200000_experience_utilisateur.sql";
import m5 from "../netlify/database/migrations/20261117210000_arrivee_livreur.sql";
import m6 from "../netlify/database/migrations/20261117220000_code_wunago.sql";
import m7 from "../netlify/database/migrations/20261118090000_parametres.sql";
import m8 from "../netlify/database/migrations/20261118120000_envoi_par_lien.sql";
import m9 from "../netlify/database/migrations/20261118150000_remise_controlee.sql";
import m10 from "../netlify/database/migrations/20261118170000_inscription_livreurs.sql";
const MIGRATIONS: [string, string][] = [
  ["20261117140000_schema_initial", m1], ["20261117160000_parcours_dedies_et_tarifs", m2], ["20261117170000_livreurs_messagerie_notifications", m3],
  ["20261117200000_experience_utilisateur", m4], ["20261117210000_arrivee_livreur", m5], ["20261117220000_code_wunago", m6],
  ["20261118090000_parametres", m7], ["20261118120000_envoi_par_lien", m8], ["20261118150000_remise_controlee", m9], ["20261118170000_inscription_livreurs", m10]
];

let ready: Promise<void> | null = null;
function setup(env: Record<string, any>) {
  configure({ env });
  if (!env.DATABASE_URL) return Promise.reject(new Error("Variable DATABASE_URL manquante (adresse de la base Neon)."));
  configure({ db: () => neonDb(env.DATABASE_URL) });
  if (!ready) ready = migrate(db(), MIGRATIONS).catch((e) => { ready = null; throw e; });
  return ready;
}

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try { await setup(env); } catch (e: any) {
      console.error("démarrage", e);
      return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    return handler(request, { waitUntil: (p: Promise<any>) => ctx.waitUntil(p) });
  },
  async scheduled(_event: any, env: any, ctx: any) {
    ctx.waitUntil(setup(env).then(() => runAlerts(db())).then((r) => console.log("alertes", JSON.stringify(r))));
  }
};
