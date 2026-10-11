/**
 * Тонкий слой доступа к PostgreSQL.
 * DATABASE_URL=postgres://...  — рабочий PostgreSQL (pg.Pool)
 * DATABASE_URL=pglite:<путь>    — встроенный PostgreSQL (PGlite) для разработки без установки СУБД
 * DATABASE_URL=pglite:memory    — в памяти (тесты)
 */
import pg from "pg";
import { env } from "./env.js";

export type Row = Record<string, any>;
type Exec = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

let exec: Exec;
let execRaw: (sql: string) => Promise<void>;
let closeFn: () => Promise<void> = async () => {};

export async function initDb(url = env.DATABASE_URL) {
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const target = url.slice("pglite:".length);
    const opts = { parsers: { 1082: (v: string) => v } }; // date как 'YYYY-MM-DD', как в pg
    const db = target === "memory" ? new PGlite(opts) : new PGlite(target, opts);
    await db.waitReady;
    exec = async (sql, params = []) => {
      const r = await db.query<Row>(sql, params as any[]);
      return { rows: r.rows };
    };
    execRaw = async (sql) => { await db.exec(sql); };
    closeFn = async () => { await db.close(); };
  } else {
    const pool = new pg.Pool({ connectionString: url, max: 20 });
    pg.types.setTypeParser(1082, (v) => v); // date как 'YYYY-MM-DD'
    exec = async (sql, params = []) => {
      const r = await pool.query(sql, params as any[]);
      return { rows: r.rows };
    };
    execRaw = async (sql) => { await pool.query(sql); };
    closeFn = async () => { await pool.end(); };
  }
}

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await exec(sql, params)).rows as T[];
}
export async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
export async function raw(sql: string) { await execRaw(sql); }
export async function closeDb() { await closeFn(); }

/** Применяет SQL-миграции из каталога migrations по порядку имён. */
export async function migrate(dir: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await raw(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await q(`SELECT name FROM schema_migrations`)).map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(dir, f), "utf8");
    await raw(`BEGIN;\n${sql}\nCOMMIT;`);
    await q(`INSERT INTO schema_migrations(name) VALUES ($1)`, [f]);
    console.log(`[migrate] ${f}`);
  }
}
