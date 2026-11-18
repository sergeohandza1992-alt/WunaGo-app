// Point d'entrée Netlify / tests locaux : même API que sur Cloudflare (server/api.mts), base fournie par @netlify/database.
import { getDatabase } from "@netlify/database";
import handler, { configure } from "../../server/api.mts";

configure({ db: () => {
  const url = process.env.WG_DB_URL; // tests locaux ; sur Netlify, la connexion est fournie par la plateforme
  return (url ? getDatabase({ connectionString: url }) : getDatabase()) as any;
} });

export default handler;
export const config = { path: "/api/*" };
