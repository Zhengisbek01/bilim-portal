/** Контур управления: замечания, обращения, объявления, пользователи, требования, журнал */
import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { requireRole, requireUser, type AuthUser } from "../auth/session.js";
import { parse, fail, forbid, notFound, isoDate, optDate, text, today, addDays } from "../lib/http.js";
import { orgWhere, assertOrg, isRegionLevel } from "../lib/scope.js";
import { getRequirements, setConfig } from "../lib/config.js";
import { audit } from "../lib/audit.js";
import { CAN_CREATE, REQUIRABLE, ROLES, SECTION_TITLES, FAMILY, type Role } from "../lib/domain.js";
import { normalizePhone } from "../auth/otp.js";

export const control = Router();

/* ---------- замечания ---------- */
control.get("/remarks", async (req, res) => {
  const u = requireRole(req, "region", "observer", "district", "head", "editor");
  const { status } = parse(z.object({ status: z.enum(["open", "fixed", "closed", "all"]).default("open") }), req.query);
  const params: unknown[] = [];
  let where = orgWhere(u, "o", params);
  if (status !== "all") { params.push(status); where += ` AND r.status = $${params.length}`; }
  const rows = await q(`SELECT r.*, o.name AS org_name, o.district_id FROM remarks r JOIN orgs o ON o.id = r.org_id WHERE ${where} ORDER BY r.created_at DESC LIMIT 300`, params);
  const t = today();
  res.json(rows.map((r) => ({ ...r, overdue: r.status === "open" && r.due < t, section_title: SECTION_TITLES[r.section] ?? r.section })));
});

control.post("/remarks", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const b = parse(z.object({ orgId: z.string(), section: z.enum(REQUIRABLE), text: text(2000), due: isoDate }), req.body);
  await assertOrg(u, b.orgId);
  const author = `${u.full_name} · ${u.role === "district" ? "Отдел образования" : "Управление образования"}`;
  const r = await one(`INSERT INTO remarks(org_id, section, text, due, status, created_by, author) VALUES ($1,$2,$3,$4,'open',$5,$6) RETURNING id`,
    [b.orgId, b.section, b.text, b.due, u.id, author]);
  await audit(u, `Направил замечание: ${SECTION_TITLES[b.section]}`, b.orgId);
  res.status(201).json(r);
});

control.post("/remarks/:id/:op", async (req, res) => {
  const u = requireUser(req);
  const r = await one(`SELECT * FROM remarks WHERE id = $1`, [req.params.id]);
  if (!r) return notFound();
  await assertOrg(u, r.org_id);
  const op = req.params.op;
  if (op === "fix") {
    if (!["head", "editor"].includes(u.role) || r.status !== "open") forbid();
    const { reply } = parse(z.object({ reply: text(2000) }), req.body);
    await q(`UPDATE remarks SET status='fixed', reply=$2, fixed_at=now() WHERE id=$1`, [r.id, reply]);
    await audit(u, `Исправил замечание: ${SECTION_TITLES[r.section]}`, r.org_id);
  } else if (op === "accept" || op === "reopen") {
    if (!["region", "district"].includes(u.role) || r.status !== "fixed") forbid();
    if (op === "accept") await q(`UPDATE remarks SET status='closed', closed_at=now() WHERE id=$1`, [r.id]);
    else await q(`UPDATE remarks SET status='open', due=$2 WHERE id=$1`, [r.id, addDays(today(), 3)]);
    await audit(u, `${op === "accept" ? "Принял исправление" : "Вернул на доработку"}: ${SECTION_TITLES[r.section]}`, r.org_id);
  } else fail(404, "Неизвестное действие");
  res.json({ ok: true });
});

/* ---------- обращения граждан ---------- */
control.get("/appeals", async (req, res) => {
  const u = requireRole(req, "region", "observer", "district", "head", "editor");
  const { days } = { days: (await getRequirements()).appealDays };
  const params: unknown[] = [];
  let where = orgWhere(u, "o", params);
  if (!["head", "editor"].includes(u.role)) where += ` AND a.status <> 'answered'`;
  const rows = await q(`SELECT a.*, o.name AS org_name FROM appeals a JOIN orgs o ON o.id = a.org_id WHERE ${where} ORDER BY a.created_at DESC LIMIT 300`, params);
  const t = today();
  res.json(rows.map((a) => {
    const deadline = addDays(new Date(a.created_at).toISOString().slice(0, 10), days);
    const out = { ...a, deadline, overdue: a.status !== "answered" && deadline < t };
    if (!["head", "editor"].includes(u.role)) delete (out as any).contact; // контакты заявителя видит только организация
    return out;
  }));
});

control.post("/appeals/:id/:op", async (req, res) => {
  const u = requireRole(req, "head");
  const a = await one(`SELECT * FROM appeals WHERE id = $1 AND org_id = $2`, [req.params.id, u.org_id]);
  if (!a) return notFound();
  if (req.params.op === "work") {
    await q(`UPDATE appeals SET status='work' WHERE id=$1 AND status='new'`, [a.id]);
    await audit(u, `Взял в работу обращение ${a.id}`, u.org_id);
  } else if (req.params.op === "answer") {
    const b = parse(z.object({ answer: text(5000), isPublic: z.boolean().default(false) }), req.body);
    await q(`UPDATE appeals SET status='answered', answer=$2, is_public=$3, answered_by=$4, answered_at=now() WHERE id=$1`, [a.id, b.answer, b.isPublic, u.id]);
    await audit(u, `Ответил на обращение ${a.id}`, u.org_id);
  } else fail(404, "Неизвестное действие");
  res.json({ ok: true });
});

/* ---------- объявления на сайтах ---------- */
control.get("/announcements", async (req, res) => {
  const u = requireUser(req);
  const params: unknown[] = [];
  let where = "TRUE";
  if (!isRegionLevel(u)) { params.push(u.district_id); where = `(scope = 'region' OR scope = $1)`; }
  if (!["region", "district"].includes(u.role)) { params.push(today()); where += ` AND (until IS NULL OR until >= $${params.length})`; }
  res.json(await q(`SELECT * FROM announcements WHERE ${where} ORDER BY created_at DESC LIMIT 100`, params));
});
control.post("/announcements", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const b = parse(z.object({ text: text(1000), until: optDate }), req.body);
  const scope = u.role === "region" ? "region" : u.district_id;
  await q(`INSERT INTO announcements(scope, text, until, created_by, author) VALUES ($1,$2,$3,$4,$5)`, [scope, b.text, b.until, u.id, u.full_name]);
  await audit(u, `Опубликовал объявление на сайтах (${scope === "region" ? "вся область" : "район"})`);
  res.status(201).json({ ok: true });
});
control.delete("/announcements/:id", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const a = await one(`SELECT * FROM announcements WHERE id = $1`, [req.params.id]);
  if (!a) return notFound();
  if (u.role === "district" && a.scope !== u.district_id) forbid();
  await q(`DELETE FROM announcements WHERE id = $1`, [a.id]);
  await audit(u, "Снял объявление");
  res.json({ ok: true });
});

/* ---------- пользователи (выдача доступа сотрудникам) ---------- */
function manageWhere(u: AuthUser, params: unknown[]): string {
  const roles = CAN_CREATE[u.role] ?? [];
  params.push(roles);
  let w = `u.role = ANY($1::text[])`;
  if (u.role === "district") { params.push(u.district_id); w += ` AND o.district_id = $${params.length}`; }
  else if (["head", "editor"].includes(u.role)) { params.push(u.org_id); w += ` AND u.org_id = $${params.length}`; }
  else if (u.role === "teacher") fail(400, "Доступ семьям выдаётся из раздела «Мой класс»");
  return w;
}

control.get("/users", async (req, res) => {
  const u = requireRole(req, "operator", "region", "district", "head", "editor");
  const params: unknown[] = [];
  const where = manageWhere(u, params);
  const rows = await q(`SELECT u.id, u.full_name, u.role, u.note, u.active, u.org_id, u.district_id, u.created_at,
      CASE WHEN u.iin IS NULL THEN NULL ELSE '••••••••' || right(u.iin, 4) END AS iin_masked, o.name AS org_name, d.name AS district_name
      FROM users u LEFT JOIN orgs o ON o.id = u.org_id LEFT JOIN districts d ON d.id = u.district_id
     WHERE ${where} ORDER BY u.active DESC, u.full_name LIMIT 1000`, params);
  res.json({ canCreate: (CAN_CREATE[u.role] ?? []).map((r) => ({ role: r, label: ROLES[r] })), users: rows.map((r) => ({ ...r, role_label: ROLES[r.role as Role] })) });
});

const iinSchema = z.string().regex(/^\d{12}$/, "ИИН — 12 цифр");
control.post("/users", async (req, res) => {
  const u = requireRole(req, "operator", "region", "district", "head", "editor");
  const b = parse(z.object({
    fullName: text(200), role: z.enum(Object.keys(ROLES) as [Role, ...Role[]]), note: z.string().max(200).default(""),
    iin: z.union([iinSchema, z.literal("")]).optional(), orgId: z.string().optional(), districtId: z.string().optional(),
  }), req.body);
  if (!(CAN_CREATE[u.role] ?? []).includes(b.role) || FAMILY.includes(b.role)) forbid("Вы не можете выдавать эту роль");
  if (!b.iin && !env.AUTH_DEV_LOGIN) fail(400, "Укажите ИИН сотрудника — по нему выполняется вход по ЭЦП");
  if (b.iin && await one(`SELECT 1 FROM users WHERE iin = $1`, [b.iin])) fail(409, "Пользователь с таким ИИН уже есть на платформе");
  let orgId: string | null = null, districtId: string | null = null;
  if (b.role === "district") {
    if (!b.districtId || !(await one(`SELECT 1 FROM districts WHERE id = $1`, [b.districtId]))) fail(400, "Выберите район");
    districtId = b.districtId!;
  } else if (b.role === "head") {
    if (!b.orgId) fail(400, "Выберите организацию");
    await assertOrg(u, b.orgId!); orgId = b.orgId!;
  } else if (["editor", "author", "teacher", "personnel"].includes(b.role)) orgId = u.org_id;
  const r = await one(`INSERT INTO users(full_name, role, iin, org_id, district_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [b.fullName, b.role, b.iin || null, orgId, districtId, b.note, u.id]);
  await audit(u, `Выдал доступ: ${b.fullName} — ${ROLES[b.role]}`, orgId);
  res.status(201).json(r);
});

control.patch("/users/:id", async (req, res) => {
  const u = requireRole(req, "operator", "region", "district", "head", "editor");
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const params: unknown[] = [];
  const where = manageWhere(u, params);
  params.push(req.params.id);
  const t = await one(`SELECT u.id, u.full_name, u.org_id FROM users u LEFT JOIN orgs o ON o.id = u.org_id WHERE ${where} AND u.id = $${params.length}`, params);
  if (!t) return forbid("Этот пользователь вне вашего управления");
  await q(`UPDATE users SET active = $2 WHERE id = $1`, [t.id, active]);
  await audit(u, `${active ? "Вернул" : "Отозвал"} доступ: ${t.full_name}`, t.org_id);
  res.json({ ok: true });
});

/* ---------- требования и техработы ---------- */
control.get("/config/requirements", async (req, res) => { requireUser(req); res.json(await getRequirements()); });
control.put("/config/requirements", async (req, res) => {
  const u = requireRole(req, "region");
  const list = z.array(z.enum(REQUIRABLE));
  const b = parse(z.object({ school: list, kg: list, appealDays: z.number().int().min(1).max(30) }), req.body);
  await setConfig("requirements", b);
  await audit(u, "Изменил требования к сайтам");
  res.json({ ok: true });
});
control.put("/config/maintenance", async (req, res) => {
  const u = requireRole(req, "operator");
  const b = parse(z.object({ on: z.boolean(), text: z.string().max(500) }), req.body);
  await setConfig("maintenance", b);
  await audit(u, "Изменил сообщение о техработах");
  res.json({ ok: true });
});

/* ---------- журнал действий ---------- */
control.get("/log", async (req, res) => {
  const u = requireRole(req, "operator", "region", "district", "head");
  const params: unknown[] = []; let where = "TRUE";
  if (u.role === "district") { params.push(u.district_id); where = `l.district_id = $1`; }
  if (u.role === "head") { params.push(u.org_id); where = `l.org_id = $1`; }
  res.json(await q(`SELECT l.*, o.name AS org_name FROM audit_log l LEFT JOIN orgs o ON o.id = l.org_id WHERE ${where} ORDER BY l.at DESC LIMIT 300`, params));
});
