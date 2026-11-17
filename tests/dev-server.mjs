// Serveur local pour les tests : sert web/ et fait tourner la fonction /api/* sur une base Postgres locale.
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { NetlifyDB } from "@netlify/database-dev";

const PORT = Number(process.argv[2] || 8770);
const db = new NetlifyDB();
process.env.WG_DB_URL = await db.start();
await db.applyMigrations("./netlify/database/migrations");
const { default: handler } = await import("../netlify/functions/api.mts");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await handler(request, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    const data = await readFile(join("web", rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});
server.listen(PORT, () => console.log("ready", PORT));
process.on("SIGTERM", async () => { server.close(); await db.stop(); process.exit(0); });
