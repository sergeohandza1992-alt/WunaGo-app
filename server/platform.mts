// Plateforme d'hébergement : la même API tourne sur Cloudflare Workers (en ligne) et sur Node (tests locaux).
// Chaque point d'entrée fournit la base de données et les variables d'environnement via configure().

type Row = Record<string, any>;
export type Db = {
  sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<Row[]>;
  pool: { query: (text: string, params?: any[]) => Promise<{ rows: Row[] }>; connect: () => Promise<any> };
  close?: () => Promise<void>;
};

let dbFactory: (() => Db) | null = null;
let dbInstance: Db | null = null;
let envSource: Record<string, any> = {};

export function configure(opts: { db?: () => Db; env?: Record<string, any> }) {
  if (opts.db && opts.db !== dbFactory) { dbFactory = opts.db; dbInstance = null; }
  if (opts.env) envSource = opts.env;
}
export function db(): Db {
  if (!dbInstance) {
    if (!dbFactory) throw new Error("Base de données non configurée.");
    dbInstance = dbFactory();
  }
  return dbInstance;
}
export function env(key: string): string | undefined {
  const v = envSource[key];
  if (v != null && v !== "") return String(v);
  const p = (globalThis as any).process;
  return p && p.env ? p.env[key] : undefined;
}
