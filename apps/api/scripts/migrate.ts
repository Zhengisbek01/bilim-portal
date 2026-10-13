import { initDb, migrate, closeDb } from "../src/db.js";

await initDb();
await migrate();
await closeDb();
console.log("[migrate] готово");
