import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { initDb, migrate } from "./db.js";
import { createApp } from "./app.js";
import { seed } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
await initDb();
await migrate(path.resolve(here, "..", "migrations"));
if (env.SEED_DEMO) await seed();
createApp().listen(env.PORT, () => console.log(`[api] http://localhost:${env.PORT}  (БД: ${env.DATABASE_URL.split("@").pop()})`));
