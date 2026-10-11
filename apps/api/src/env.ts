import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  // postgres://user:pass@host:5432/db  или  pglite:./data/pglite  или  pglite:memory
  DATABASE_URL: z.string().default("pglite:./data/pglite"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-please"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_DOMAIN: z.string().default("bilim-zhetisu.kz"),
  REGION_NAME: z.string().default("область Жетісу"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().default(20),
  // Вход сотрудников по ЭЦП: адрес NCANode (https://github.com/ncanode/ncanode)
  NCANODE_URL: z.string().default(""),
  // Только для разработки: вход под любым пользователем без ЭЦП/SMS
  AUTH_DEV_LOGIN: z.string().default("true").transform((v) => v === "true" || v === "1"),
  // Загрузить демо-данные при первом запуске (пустая БД)
  SEED_DEMO: z.string().default("false").transform((v) => v === "true" || v === "1"),
  // SMS для родителей и учеников: console | mobizon
  SMS_PROVIDER: z.enum(["console", "mobizon"]).default("console"),
  MOBIZON_API_KEY: z.string().default(""),
  MOBIZON_API_URL: z.string().default("https://api.mobizon.kz"),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET.startsWith("dev-secret")) throw new Error("Задайте JWT_SECRET для production");
  if (env.AUTH_DEV_LOGIN) console.warn("[!] AUTH_DEV_LOGIN включён в production — отключите его");
}
