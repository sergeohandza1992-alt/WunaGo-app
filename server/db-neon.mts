// Base de données en ligne : Neon (Postgres), pilote « serverless » compatible Cloudflare Workers.
// Requêtes simples par HTTP ; transactions et migrations par WebSocket (une connexion ouverte puis refermée à chaque fois).
import { neon, Pool } from "@neondatabase/serverless";
import type { Db } from "./platform.mts";

export function neonDb(url: string): Db {
  const http = neon(url);
  return {
    sql: (strings: TemplateStringsArray, ...values: any[]) => http(strings, ...values) as any,
    pool: {
      query: async (text: string, params: any[] = []) => ({ rows: (await http.query(text, params)) as any }),
      // transaction : une connexion dédiée, libérée puis fermée par release()
      connect: async () => {
        const pool = new Pool({ connectionString: url });
        const client = await pool.connect();
        const release = client.release.bind(client);
        client.release = () => { release(); pool.end().catch(() => {}); };
        return client;
      }
    }
  };
}
