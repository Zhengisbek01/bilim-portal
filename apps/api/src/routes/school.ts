/** Внутренняя жизнь организации: классы, дети, семьи, задания, переписка, поручения, лента персонала */
import { Router } from "express";
import { z } from "zod";
import { q, one } from "../db.js";
import { requireRole, requireUser } from "../auth/session.js";
import { parse, fail, forbid, notFound, optDate, text, today } from "../lib/http.js";
import { assertClass, assertPupil, familyPupilIds, teacherClassIds } from "../lib/scope.js";
import { normalizePhone } from "../auth/otp.js";
import { audit } from "../lib/audit.js";
import { ORG_STAFF, ROLES } from "../lib/domain.js";

export const school = Router();

/* ---------- классы и группы ---------- */
school.get("/classes", async (req, res) => {
  const u = requireRole(req, "head", "teacher");
  const params: unknown[] = []; let where: string;
  if (u.role === "head") { params.push(u.org_id); where = `c.org_id = $1`; } else { params.push(u.id); where = `c.teacher_id = $1`; }
  res.json(await q(`SELECT c.*, t.full_name AS teacher_name,
      (SELECT count(*)::int FROM pupils p WHERE p.class_id = c.id) AS pupils,
      (SELECT count(DISTINCT p.id)::int FROM pupils p JOIN parent_children pc ON pc.pupil_id = p.id JOIN users pu ON pu.id = pc.user_id AND pu.active WHERE p.class_id = c.id) AS with_parents
      FROM classes c LEFT JOIN users t ON t.id = c.teacher_id WHERE ${where} ORDER BY c.name`, params));
});

async function checkTeacher(orgId: string, teacherId: string | null | undefined) {
  if (!teacherId) return null;
  const t = await one(`SELECT id FROM users WHERE id = $1 AND org_id = $2 AND role = 'teacher' AND active`, [teacherId, orgId]);
  if (!t) fail(400, "Педагог не найден в вашей организации");
  return teacherId;
}

school.post("/classes", async (req, res) => {
  const u = requireRole(req, "head");
  const b = parse(z.object({ name: text(80), teacherId: z.string().uuid().nullable().optional() }), req.body);
  const tid = await checkTeacher(u.org_id!, b.teacherId);
  const r = await one(`INSERT INTO classes(org_id, name, kind, teacher_id) VALUES ($1,$2,$3,$4) RETURNING id`, [u.org_id, b.name, u.org_kind === "school" ? "class" : "group", tid]);
  await audit(u, `Добавил ${u.org_kind === "school" ? "класс" : "группу"} ${b.name}`, u.org_id);
  res.status(201).json(r);
});

school.patch("/classes/:id", async (req, res) => {
  const u = requireRole(req, "head");
  const c = await assertClass(u, req.params.id, "manage");
  const b = parse(z.object({ name: text(80).optional(), teacherId: z.string().uuid().nullable().optional() }), req.body);
  const tid = b.teacherId === undefined ? c.teacher_id : await checkTeacher(u.org_id!, b.teacherId);
  await q(`UPDATE classes SET name = $2, teacher_id = $3 WHERE id = $1`, [c.id, b.name ?? c.name, tid]);
  await audit(u, `Изменил ${c.name}: педагог назначен`, u.org_id);
  res.json({ ok: true });
});

/* ---------- дети и доступ семей ---------- */
school.get("/classes/:id/pupils", async (req, res) => {
  const u = requireRole(req, "head", "teacher");
  const c = await assertClass(u, req.params.id, "manage");
  const rows = await q(`SELECT p.id, p.full_name,
      COALESCE((SELECT json_agg(json_build_object('id', pu.id, 'name', pu.full_name, 'relation', pc.relation)) FROM parent_children pc JOIN users pu ON pu.id = pc.user_id AND pu.active WHERE pc.pupil_id = p.id), '[]') AS parents,
      EXISTS (SELECT 1 FROM users s WHERE s.pupil_id = p.id AND s.active) AS student_access,
      (SELECT count(*)::int FROM homework_done h WHERE h.pupil_id = p.id) AS done,
      (SELECT count(*)::int FROM messages m WHERE m.pupil_id = p.id AND m.sender_side = 'family' AND NOT m.read_by_teacher) AS unread
     FROM pupils p WHERE p.class_id = $1 ORDER BY p.full_name`, [c.id]);
  res.json({ class: c, pupils: rows });
});

school.post("/classes/:id/pupils", async (req, res) => {
  const u = requireRole(req, "head", "teacher");
  const c = await assertClass(u, req.params.id, "manage");
  const { fullName } = parse(z.object({ fullName: text(150) }), req.body);
  const r = await one(`INSERT INTO pupils(org_id, class_id, full_name) VALUES ($1,$2,$3) RETURNING id`, [c.org_id, c.id, fullName]);
  await audit(u, `Добавил в ${c.name}: ${fullName}`, c.org_id);
  res.status(201).json(r);
});

school.delete("/pupils/:id", async (req, res) => {
  const u = requireRole(req, "head", "teacher");
  const p = await assertPupil(u, req.params.id, "teacher");
  await q(`DELETE FROM pupils WHERE id = $1`, [p.id]);
  await audit(u, `Удалил из ${p.class_name}: ${p.full_name}`, p.org_id);
  res.json({ ok: true });
});

school.post("/pupils/:id/access", async (req, res) => {
  const u = requireRole(req, "head", "teacher");
  const p = await assertPupil(u, req.params.id, "teacher");
  const b = parse(z.object({ role: z.enum(["parent", "student"]), fullName: text(150), phone: z.string(), relation: z.string().max(60).default("") }), req.body);
  const phone = normalizePhone(b.phone);
  if (b.role === "student") {
    if (p.class_kind !== "class") fail(400, "Для детского сада вход ученика не нужен");
    if (await one(`SELECT 1 FROM users WHERE pupil_id = $1 AND active`, [p.id])) fail(409, "У ученика уже есть доступ");
    if (await one(`SELECT 1 FROM users WHERE phone = $1 AND active AND role IN ('parent','student')`, [phone])) fail(409, "Этот номер уже используется — укажите личный номер ученика");
    await q(`INSERT INTO users(full_name, role, phone, org_id, pupil_id, note, created_by) VALUES ($1,'student',$2,$3,$4,$5,$6)`, [b.fullName, phone, p.org_id, p.id, p.class_name, u.id]);
  } else {
    // Родитель с этим номером уже есть — просто привязываем ещё одного ребёнка
    let parent = await one(`SELECT id, role FROM users WHERE phone = $1 AND active AND role IN ('parent','student')`, [phone]);
    if (parent && parent.role !== "parent") fail(409, "Этот номер принадлежит ученику");
    if (!parent) parent = await one(`INSERT INTO users(full_name, role, phone, org_id, note, created_by) VALUES ($1,'parent',$2,$3,$4,$5) RETURNING id`,
      [b.fullName, phone, p.org_id, [b.relation, p.full_name].filter(Boolean).join(" · "), u.id]);
    await q(`INSERT INTO parent_children(user_id, pupil_id, relation) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [parent!.id, p.id, b.relation]);
  }
  await audit(u, `Выдал доступ (${ROLES[b.role]}): ${b.fullName}`, p.org_id);
  res.status(201).json({ ok: true });
});

/* ---------- задания и объявления класса ---------- */
school.get("/classes/:id/posts", async (req, res) => {
  const u = requireUser(req);
  const c = await assertClass(u, req.params.id, "read");
  const total = (await one(`SELECT count(*)::int AS n FROM pupils WHERE class_id = $1`, [c.id]))!.n;
  const kids = await familyPupilIds(u);
  const rows = await q(`SELECT cp.*, (SELECT count(*)::int FROM homework_done h WHERE h.class_post_id = cp.id) AS done_count,
      (SELECT COALESCE(json_agg(h.pupil_id), '[]') FROM homework_done h WHERE h.class_post_id = cp.id AND h.pupil_id = ANY($2::uuid[])) AS done_by
     FROM class_posts cp WHERE cp.class_id = $1 ORDER BY cp.created_at DESC LIMIT 200`, [c.id, kids]);
  const family = ["parent", "student"].includes(u.role);
  res.json({ class: { id: c.id, name: c.name, kind: c.kind }, pupils: total, posts: rows.map((r) => family ? { ...r, done_count: undefined } : r) });
});

school.post("/classes/:id/posts", async (req, res) => {
  const u = requireRole(req, "teacher");
  const c = await assertClass(u, req.params.id, "manage");
  const b = parse(z.object({ type: z.enum(["homework", "announce"]), subject: z.string().max(80).default(""), due: optDate, text: text(3000) }), req.body);
  if (b.type === "homework" && c.kind !== "class") fail(400, "Домашние задания — только для школьных классов");
  await q(`INSERT INTO class_posts(class_id, type, subject, due, text, created_by, author) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [c.id, b.type, b.subject, b.due, b.text, u.id, u.full_name]);
  await audit(u, `Отправил ${b.type === "homework" ? "задание" : "объявление"}: ${c.name}`, c.org_id);
  res.status(201).json({ ok: true });
});

school.delete("/class-posts/:id", async (req, res) => {
  const u = requireRole(req, "teacher", "head");
  const cp = await one(`SELECT * FROM class_posts WHERE id = $1`, [req.params.id]);
  if (!cp) return notFound();
  await assertClass(u, cp.class_id, "manage");
  await q(`DELETE FROM class_posts WHERE id = $1`, [cp.id]);
  res.json({ ok: true });
});

school.post("/class-posts/:id/done", async (req, res) => {
  const u = requireRole(req, "student");
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  const cp = await one(`SELECT cp.* FROM class_posts cp JOIN pupils p ON p.class_id = cp.class_id WHERE cp.id = $1 AND p.id = $2 AND cp.type = 'homework'`, [req.params.id, u.pupil_id]);
  if (!cp) return forbid("Задание не относится к вашему классу");
  if (done) await q(`INSERT INTO homework_done(pupil_id, class_post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.pupil_id, cp.id]);
  else await q(`DELETE FROM homework_done WHERE pupil_id = $1 AND class_post_id = $2`, [u.pupil_id, cp.id]);
  res.json({ ok: true });
});

/* ---------- переписка педагога и родителей ---------- */
async function chatAccess(req: any) {
  const u = requireRole(req, "teacher", "head", "parent");
  const p = await assertPupil(u, req.params.id, "read");
  return { u, p, side: u.role === "parent" ? "family" : "teacher" } as const;
}
school.get("/pupils/:id/messages", async (req, res) => {
  const { u, p, side } = await chatAccess(req);
  if (u.role === "teacher") await q(`UPDATE messages SET read_by_teacher = true WHERE pupil_id = $1 AND sender_side = 'family' AND NOT read_by_teacher`, [p.id]);
  if (u.role === "parent") await q(`UPDATE messages SET read_by_family = true WHERE pupil_id = $1 AND sender_side = 'teacher' AND NOT read_by_family`, [p.id]);
  const teacher = await one(`SELECT u.full_name FROM classes c JOIN users u ON u.id = c.teacher_id WHERE c.id = $1`, [p.class_id]);
  res.json({ pupil: { id: p.id, full_name: p.full_name, class_name: p.class_name }, teacher: teacher?.full_name ?? null, side,
    messages: await q(`SELECT id, sender_name, sender_side, text, created_at FROM messages WHERE pupil_id = $1 ORDER BY created_at LIMIT 500`, [p.id]) });
});
school.post("/pupils/:id/messages", async (req, res) => {
  const { u, p, side } = await chatAccess(req);
  if (u.role === "head") forbid("Руководитель видит переписку, но не участвует в ней");
  const { text: msg } = parse(z.object({ text: text(2000) }), req.body);
  await q(`INSERT INTO messages(pupil_id, sender_id, sender_name, sender_side, text, read_by_teacher, read_by_family) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [p.id, u.id, u.full_name, side, msg, side === "teacher", side === "family"]);
  res.status(201).json({ ok: true });
});

/* ---------- кабинет семьи ---------- */
school.get("/family/children", async (req, res) => {
  const u = requireRole(req, "parent", "student");
  const ids = await familyPupilIds(u);
  const t = today();
  const kids = await q(`SELECT p.id, p.full_name, p.class_id, c.name AS class_name, c.kind AS class_kind, o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.kind AS org_kind, o.district_id,
      t.full_name AS teacher_name FROM pupils p JOIN classes c ON c.id = p.class_id JOIN orgs o ON o.id = p.org_id LEFT JOIN users t ON t.id = c.teacher_id
     WHERE p.id = ANY($1::uuid[]) ORDER BY p.full_name`, [ids]);
  for (const k of kids) {
    const hw = await q(`SELECT cp.id, cp.due, EXISTS(SELECT 1 FROM homework_done h WHERE h.class_post_id = cp.id AND h.pupil_id = $2) AS done FROM class_posts cp WHERE cp.class_id = $1 AND cp.type = 'homework'`, [k.class_id, k.id]);
    k.homework_total = hw.length;
    k.homework_done = hw.filter((h) => h.done).length;
    k.homework_todo = hw.filter((h) => !h.done && (!h.due || h.due >= t)).length;
    k.homework_overdue = hw.filter((h) => !h.done && h.due && h.due < t).length;
    k.unread = (await one(`SELECT count(*)::int AS n FROM messages WHERE pupil_id = $1 AND sender_side = 'teacher' AND NOT read_by_family`, [k.id]))!.n;
    k.last_announce = await one(`SELECT text, created_at FROM class_posts WHERE class_id = $1 AND type = 'announce' ORDER BY created_at DESC LIMIT 1`, [k.class_id]);
    k.menu = await one(`SELECT id, title FROM documents WHERE org_id = $1 AND type = 'Меню' AND (valid_until IS NULL OR valid_until >= $2) ORDER BY created_at DESC LIMIT 1`, [k.org_id, t]);
  }
  res.json(kids);
});

/* ---------- поручения персоналу ---------- */
school.get("/tasks", async (req, res) => {
  const u = requireRole(req, ...ORG_STAFF);
  const rows = u.role === "head"
    ? await q(`SELECT t.*, a.full_name AS assignee_name FROM tasks t JOIN users a ON a.id = t.assignee_id WHERE t.org_id = $1 ORDER BY t.status, t.due NULLS LAST, t.created_at DESC`, [u.org_id])
    : await q(`SELECT t.*, $2::text AS assignee_name FROM tasks t WHERE t.assignee_id = $1 ORDER BY t.status, t.due NULLS LAST, t.created_at DESC`, [u.id, u.full_name]);
  res.json(rows);
});
school.post("/tasks", async (req, res) => {
  const u = requireRole(req, "head");
  const b = parse(z.object({ assigneeId: z.string().uuid(), title: text(300), due: optDate }), req.body);
  const a = await one(`SELECT full_name FROM users WHERE id = $1 AND org_id = $2 AND active AND role = ANY($3::text[])`, [b.assigneeId, u.org_id, ["editor", "author", "teacher", "personnel"]]);
  if (!a) fail(400, "Сотрудник не найден в вашей организации");
  await q(`INSERT INTO tasks(org_id, assignee_id, title, due, status, created_by, author) VALUES ($1,$2,$3,$4,'open',$5,$6)`, [u.org_id, b.assigneeId, b.title, b.due, u.id, u.full_name]);
  await audit(u, `Поручил ${a!.full_name}: ${b.title}`, u.org_id);
  res.status(201).json({ ok: true });
});
school.post("/tasks/:id/:op", async (req, res) => {
  const u = requireRole(req, ...ORG_STAFF);
  const t = await one(`SELECT * FROM tasks WHERE id = $1 AND org_id = $2`, [req.params.id, u.org_id]);
  if (!t) return notFound();
  if (req.params.op === "done") {
    if (t.assignee_id !== u.id) forbid("Отметить выполнение может только исполнитель");
    const { report } = parse(z.object({ report: z.string().max(1000).default("") }), req.body);
    await q(`UPDATE tasks SET status='done', report=$2, done_at=now() WHERE id=$1`, [t.id, report]);
    await audit(u, `Выполнил поручение: ${t.title}`, u.org_id);
  } else if (req.params.op === "reopen") {
    if (u.role !== "head") forbid();
    await q(`UPDATE tasks SET status='open', done_at=NULL WHERE id=$1`, [t.id]);
    await audit(u, `Вернул в работу: ${t.title}`, u.org_id);
  } else fail(404, "Неизвестное действие");
  res.json({ ok: true });
});
school.delete("/tasks/:id", async (req, res) => {
  const u = requireRole(req, "head");
  await q(`DELETE FROM tasks WHERE id = $1 AND org_id = $2`, [req.params.id, u.org_id]);
  res.json({ ok: true });
});

/* ---------- лента для персонала и коллеги ---------- */
school.get("/inner", async (req, res) => {
  const u = requireRole(req, ...ORG_STAFF);
  res.json(await q(`SELECT * FROM inner_posts WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100`, [u.org_id]));
});
school.post("/inner", async (req, res) => {
  const u = requireRole(req, "head");
  const b = parse(z.object({ text: text(3000) }), req.body);
  await q(`INSERT INTO inner_posts(org_id, text, created_by, author) VALUES ($1,$2,$3,$4)`, [u.org_id, b.text, u.id, u.full_name]);
  await audit(u, "Отправил сообщение сотрудникам", u.org_id);
  res.status(201).json({ ok: true });
});
school.delete("/inner/:id", async (req, res) => {
  const u = requireRole(req, "head");
  await q(`DELETE FROM inner_posts WHERE id = $1 AND org_id = $2`, [req.params.id, u.org_id]);
  res.json({ ok: true });
});
school.get("/colleagues", async (req, res) => {
  const u = requireRole(req, ...ORG_STAFF);
  const rows = await q(`SELECT id, full_name, role, note FROM users WHERE org_id = $1 AND active AND role = ANY($2::text[]) ORDER BY array_position($2::text[], role), full_name`, [u.org_id, ORG_STAFF]);
  res.json(rows.map((r) => ({ ...r, role_label: ROLES[r.role as keyof typeof ROLES] })));
});

/* ---------- педагог: обзор переписки ---------- */
school.get("/teacher/threads", async (req, res) => {
  const u = requireRole(req, "teacher");
  const ids = await teacherClassIds(u);
  res.json(await q(`SELECT p.id, p.full_name, p.class_id,
      (SELECT count(*)::int FROM messages m WHERE m.pupil_id = p.id AND m.sender_side = 'family' AND NOT m.read_by_teacher) AS unread,
      (SELECT max(created_at) FROM messages m WHERE m.pupil_id = p.id) AS last_at
     FROM pupils p WHERE p.class_id = ANY($1::uuid[]) ORDER BY p.full_name`, [ids]));
});
