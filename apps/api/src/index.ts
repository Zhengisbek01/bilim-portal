/**
 * Точка входа API.
 * — Локально и в Docker: слушает PORT.
 * — На Vercel: экспортирует приложение по умолчанию (Express zero-config), без listen.
 */
import express from "express";
import { env } from "./env.js";
import { initDb, migrate } from "./db.js";
import { createApp } from "./app.js";
import { seed } from "./seed.js";

let ready: Promise<void> | null = null;
let lastError = "";
function init() {
  ready ??= (async () => {
    await initDb();
    await migrate();
    if (env.SEED_DEMO) await seed();
  })().catch((e) => { ready = null; lastError = String(e?.message ?? e); console.error("[init]", e); throw e; });
  return ready;
}

const inner = createApp();
const app = express();
// Диагностика: отвечает, даже если база не поднялась
app.get("/api/health", async (_req, res) => {
  try { await init(); res.json({ ok: true, db: env.DATABASE_URL.startsWith("pglite:") ? env.DATABASE_URL : "postgres", demo: env.AUTH_DEV_LOGIN, seed: env.SEED_DEMO }); }
  catch { res.status(500).json({ ok: false, error: lastError, db: env.DATABASE_URL.startsWith("pglite:") ? env.DATABASE_URL : "postgres" }); }
});
app.use(async (_req, _res, next) => { try { await init(); next(); } catch (e) { next(e); } });
app.use(inner);

if (!process.env.VERCEL) {
  await init();
  app.listen(env.PORT, () => console.log(`[api] http://localhost:${env.PORT}  (БД: ${env.DATABASE_URL.split("@").pop()})`));
}

export default app;
