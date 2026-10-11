import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, migrate, closeDb } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
await initDb();
await migrate(path.join(here, "..", "migrations"));
await closeDb();
console.log("[migrate] готово");
