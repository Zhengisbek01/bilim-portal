import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, migrate, closeDb } from "../src/db.js";
import { seed } from "../src/seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
await initDb();
await migrate(path.join(here, "..", "migrations"));
await seed();
await closeDb();
