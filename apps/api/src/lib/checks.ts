import { q, one } from "../db.js";
import { addDays, today } from "./http.js";
import type { Requirements } from "./config.js";

/** Автопроверки сайта организации */
export async function autoChecks(org: any, req: Requirements): Promise<string[]> {
  const t = today(), out: string[] = [];
  const list = org.kind === "school" ? req.school : req.kg;
  const docs = await q(`SELECT type, title, valid_until FROM documents WHERE org_id = $1`, [org.id]);
  if (list.includes("food")) {
    const menus = docs.filter((d) => d.type === "Меню");
    if (!menus.length) out.push("Меню не загружено");
    else if (menus.every((m) => m.valid_until && m.valid_until < t)) out.push("Меню просрочено — загрузите меню на эту неделю");
  }
  docs.filter((d) => d.type !== "Меню" && d.valid_until && d.valid_until < t).forEach((d) => out.push(`Истёк срок документа «${d.title}»`));
  const last = await one(`SELECT max(published_at) AS at FROM posts WHERE org_id = $1 AND status = 'published'`, [org.id]);
  if (!last?.at || new Date(last.at).toISOString().slice(0, 10) < addDays(t, -30)) out.push("Новостей не было больше 30 дней");
  if (!org.about) out.push("Не заполнено описание организации");
  return out;
}
