/**
 * Импорт справочника организаций из CSV (выгрузка НОБД или реестра управления образования).
 * Формат (разделитель «;», UTF-8, первая строка — заголовки):
 *   id;district_id;kind;name;slug;bin;director;phone;address;lang;size
 * kind: school | kg. district_id должен существовать в таблице districts.
 * Запуск: npm run import:orgs -w apps/api -- ./orgs.csv
 */
import fs from "node:fs/promises";
import { initDb, migrate, closeDb, q } from "../src/db.js";

const file = process.argv[2];
if (!file) { console.error("Укажите путь к CSV"); process.exit(1); }
await initDb();
await migrate();
const lines = (await fs.readFile(file, "utf8")).replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const head = lines.shift()!.split(";").map((s) => s.trim());
let ok = 0;
for (const line of lines) {
  const v = Object.fromEntries(line.split(";").map((s, i) => [head[i], s.trim().replace(/^"|"$/g, "")]));
  await q(`INSERT INTO orgs(id, district_id, kind, name, slug, bin, director, phone, address, lang, size)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO UPDATE SET district_id=EXCLUDED.district_id, kind=EXCLUDED.kind, name=EXCLUDED.name, bin=EXCLUDED.bin,
             director=EXCLUDED.director, phone=EXCLUDED.phone, address=EXCLUDED.address, lang=EXCLUDED.lang, size=EXCLUDED.size, updated_at=now()`,
    [v.id, v.district_id, v.kind, v.name, v.slug, v.bin || null, v.director || "", v.phone || "", v.address || "", v.lang || "", Number(v.size) || 0]);
  ok++;
}
console.log(`[import] загружено организаций: ${ok}`);
await closeDb();
