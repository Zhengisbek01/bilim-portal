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
    const pool = new pg.Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 20 });
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

/**
 * Применяет миграции по порядку. Каждая выполняется одной транзакцией под advisory-блокировкой,
 * поэтому одновременный холодный старт нескольких экземпляров (serverless) не применит её дважды.
 */
export async function migrate() {
  const { MIGRATIONS } = await import("./migrations/index.js");
  try { await raw(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); }
  catch { /* таблицу параллельно создал другой экземпляр */ }
  for (const m of MIGRATIONS) {
    const done = await one(`SELECT 1 FROM schema_migrations WHERE name = $1`, [m.name]);
    if (done) continue;
    const name = m.name.replace(/'/g, "''");
    try {
      await raw(`BEGIN;
SELECT pg_advisory_xact_lock(727262);
DO $mig$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE name = '${name}') THEN RAISE EXCEPTION 'migration-already-applied'; END IF; END $mig$;
${m.sql}
INSERT INTO schema_migrations(name) VALUES ('${name}');
COMMIT;`);
      console.log(`[migrate] ${m.name}`);
    } catch (e: any) {
      try { await raw("ROLLBACK"); } catch { /* соединение уже чистое */ }
      if (!String(e?.message).includes("migration-already-applied")) throw e;
    }
  }
}
