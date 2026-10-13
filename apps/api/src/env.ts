import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  // postgres://user:pass@host:5432/db  или  pglite:./data/pglite  или  pglite:memory
  // На Vercel без подключённой базы — встроенный PostgreSQL в памяти с демо-данными (только для показа)
  DATABASE_URL: z.string().default(process.env.POSTGRES_URL || (process.env.VERCEL ? "pglite:memory" : "pglite:./data/pglite")),
  JWT_SECRET: z.string().min(16).default(process.env.VERCEL ? `bilim-demo-${process.env.VERCEL_PROJECT_ID ?? "portal"}-fallback-secret` : "dev-secret-change-me-please"),
  COOKIE_SECURE: z.string().default(process.env.VERCEL ? "true" : "false").transform((v) => v === "true" || v === "1"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_DOMAIN: z.string().default("bilim-zhetisu.kz"),
  REGION_NAME: z.string().default("область Жетісу"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  // Vercel Blob: если токен задан, файлы хранятся в Blob (обязательно на Vercel — там нет постоянного диска)
  BLOB_READ_WRITE_TOKEN: z.string().default(""),
  MAX_UPLOAD_MB: z.coerce.number().default(20),
  // Вход сотрудников по ЭЦП: адрес NCANode (https://github.com/ncanode/ncanode)
  NCANODE_URL: z.string().default(""),
  // Только для разработки: вход под любым пользователем без ЭЦП/SMS
  AUTH_DEV_LOGIN: z.string().default("true").transform((v) => v === "true" || v === "1"),
  // Загрузить демо-данные при первом запуске (пустая БД)
  DEMO_PASSWORD: z.string().default("Bilim2026"),
  SEED_DEMO: z.string().default("false").transform((v) => v === "true" || v === "1"),
  // SMS для родителей и учеников: console | mobizon
  SMS_PROVIDER: z.enum(["console", "mobizon"]).default("console"),
  MOBIZON_API_KEY: z.string().default(""),
  MOBIZON_API_URL: z.string().default("https://api.mobizon.kz"),
});

export const env = schema.parse(process.env);

export const DEMO_MEMORY_DB = env.DATABASE_URL === "pglite:memory" && !!process.env.VERCEL;
if (DEMO_MEMORY_DB) {
  env.SEED_DEMO = true;
  console.warn("[!] База не подключена: работает демо-режим в памяти, данные сбрасываются при перезапуске. Для пилота подключите Neon (Storage → Neon)");
}
if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET.startsWith("dev-secret")) throw new Error("Задайте JWT_SECRET для production");
  if (!process.env.JWT_SECRET) console.warn("[!] JWT_SECRET не задан — используется демо-ключ, задайте свой");
  if (env.AUTH_DEV_LOGIN) console.warn("[!] AUTH_DEV_LOGIN включён в production — отключите его");
}
