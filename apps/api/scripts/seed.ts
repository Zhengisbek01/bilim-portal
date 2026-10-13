import { initDb, migrate, closeDb } from "../src/db.js";
import { seed } from "../src/seed.js";

await initDb();
await migrate();
await seed();
await closeDb();
