// Migrations appliquées automatiquement au premier appel (Cloudflare) : chaque fichier SQL n'est exécuté qu'une fois,
// dans l'ordre, sous verrou (deux démarrages simultanés ne peuvent pas l'appliquer deux fois).
import type { Db } from "./platform.mts";

export async function migrate(db: Db, migrations: [string, string][]) {
  const client = await db.pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(424242)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r: any) => r.name));
    for (const [name, sql] of migrations) {
      if (done.has(name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.log("migration appliquée", name);
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    client.release();
  }
}
