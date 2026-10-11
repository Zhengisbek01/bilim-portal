/** Мониторинг и статистика: у каждой роли — своя, в пределах своей зоны */
import { Router } from "express";
import { z } from "zod";
import { q, one } from "../db.js";
import { requireRole } from "../auth/session.js";
import { parse, today, addDays } from "../lib/http.js";
import { orgWhere, isRegionLevel, teacherClassIds, assertClass } from "../lib/scope.js";
import { compliance, getRequirements } from "../lib/config.js";
import { activity, perWeek, appealStats, avg, pct, daysBetween } from "../lib/stats.js";
import { ROLES, ORG_STAFF, SECTION_TITLES, type Role } from "../lib/domain.js";

export const stats = Router();

/* ---------- область / наблюдатель / район ---------- */
stats.get("/monitoring/area", async (req, res) => {
  const u = requireRole(req, "region", "observer", "district");
  const reqs = await getRequirements();
  const p0: unknown[] = []; const ow = orgWhere(u, "o", p0);
  const orgs = await q(`SELECT o.id, o.name, o.kind, o.sections, o.district_id, d.name AS district_name FROM orgs o JOIN districts d ON d.id = o.district_id WHERE ${ow}`, p0);
  const scored: any[] = orgs.map((o) => ({ ...o, ...compliance(o as any, reqs) }));
  const remarks = await q(`SELECT r.status, r.due, o.district_id FROM remarks r JOIN orgs o ON o.id = r.org_id WHERE ${ow}`, p0);
  const appeals = await appealStats(ow, p0, reqs.appealDays);
  const appealsOpen = await q(`SELECT a.created_at, o.district_id FROM appeals a JOIN orgs o ON o.id = a.org_id WHERE ${ow} AND a.status <> 'answered'`, p0);
  const t = today();
  const overdueAppeal = (r: any) => addDays(new Date(r.created_at).toISOString().slice(0, 10), reqs.appealDays) < t;
  const users = await q(`SELECT u.role FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.active AND ${ow}`, p0);
  const active30 = await one(`SELECT count(DISTINCT l.org_id)::int AS n FROM audit_log l JOIN orgs o ON o.id = l.org_id WHERE ${ow} AND l.at >= now() - interval '30 days'`, p0);
  const pub30 = await one(`SELECT count(*)::int AS n FROM posts p JOIN orgs o ON o.id = p.org_id WHERE ${ow} AND p.published_at >= now() - interval '30 days'`, p0);
  const logParams: unknown[] = []; let logWhere = "TRUE";
  if (u.role === "district") { logParams.push(u.district_id); logWhere = "l.district_id = $1"; }
  const avgScore = avg(scored.map((o) => o.score)) ?? 0;
  const bins: [string, number, number][] = [["0–24%", 0, 24], ["25–49%", 25, 49], ["50–74%", 50, 74], ["75–99%", 75, 99], ["100%", 100, 100]];
  const districts = isRegionLevel(u) ? (await q(`SELECT id, name FROM districts ORDER BY name`)).map((d) => {
    const os = scored.filter((o) => o.district_id === d.id);
    return { id: d.id, name: d.name, orgs: os.length, avgScore: Math.round(avg(os.map((o) => o.score)) ?? 0), full: os.filter((o) => o.score >= 85).length,
      openRemarks: remarks.filter((r) => r.district_id === d.id && r.status === "open").length, overdueAppeals: appealsOpen.filter((a) => a.district_id === d.id && overdueAppeal(a)).length };
  }).sort((a, b) => a.avgScore - b.avgScore) : null;
  res.json({
    kpi: { orgs: scored.length, avgScore: Math.round(avgScore), full: scored.filter((o) => o.score >= 85).length,
      openRemarks: remarks.filter((r) => r.status === "open").length, overdueRemarks: remarks.filter((r) => r.status === "open" && r.due < t).length,
      overdueAppeals: appeals.overdue, active30: active30!.n, published30: pub30!.n, users: users.length, families: users.filter((x) => x.role === "parent").length },
    districts,
    worst: scored.sort((a, b) => a.score - b.score).slice(0, 10).map((o) => ({ id: o.id, name: o.name, district_name: o.district_name, score: o.score, missing: o.missing.map((k: string) => SECTION_TITLES[k]) })),
    histogram: bins.map(([label, a, b]) => ({ label, value: scored.filter((o) => o.score >= a && o.score <= b).length })),
    activity: await activity(logWhere, logParams),
    appeals,
    remarks: { open: remarks.filter((r) => r.status === "open").length, fixed: remarks.filter((r) => r.status === "fixed").length, closed: remarks.filter((r) => r.status === "closed").length },
    usersByRole: (["head", "editor", "author", "teacher", "personnel", "parent", "student"] as Role[]).map((r) => ({ label: ROLES[r], value: users.filter((x) => x.role === r).length })),
  });
});

stats.get("/monitoring/orgs", async (req, res) => {
  const u = requireRole(req, "region", "observer", "district");
  const f = parse(z.object({ q: z.string().optional(), district: z.string().optional(), limit: z.coerce.number().max(700).default(100) }), req.query);
  const params: unknown[] = []; let where = orgWhere(u, "o", params);
  if (f.q) { params.push(`%${f.q.toLowerCase()}%`); where += ` AND lower(o.name) LIKE $${params.length}`; }
  if (f.district) { params.push(f.district); where += ` AND o.district_id = $${params.length}`; }
  const reqs = await getRequirements();
  const rows = await q(`SELECT o.id, o.name, o.slug, o.kind, o.sections, d.name AS district_name,
      (SELECT full_name FROM users h WHERE h.org_id = o.id AND h.role = 'head' AND h.active LIMIT 1) AS head_name,
      (SELECT count(*)::int FROM remarks r WHERE r.org_id = o.id AND r.status = 'open') AS open_remarks
     FROM orgs o JOIN districts d ON d.id = o.district_id WHERE ${where} ORDER BY d.name, o.name`, params);
  const items = rows.map(({ sections, ...o }) => { const c = compliance({ kind: o.kind, sections }, reqs); return { ...o, score: c.score, missing: c.missing }; });
  res.json({ total: items.length, items: items.slice(0, f.limit) });
});

stats.get("/monitoring/export.csv", async (req, res) => {
  const u = requireRole(req, "region", "observer", "district");
  const params: unknown[] = []; const where = orgWhere(u, "o", params);
  const reqs = await getRequirements();
  const rows = await q(`SELECT o.name, o.kind, o.sections, d.name AS district FROM orgs o JOIN districts d ON d.id = o.district_id WHERE ${where} ORDER BY d.name, o.name`, params);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Организация", "Район", "Тип", "Соответствие, %", "Не заполнено"].map(esc).join(";")];
  rows.forEach((o) => { const c = compliance(o as any, reqs); lines.push([o.name, o.district, o.kind === "school" ? "Школа" : "Детский сад", c.score, c.missing.map((k) => SECTION_TITLES[k]).join(", ")].map(esc).join(";")); });
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="monitoring-${today()}.csv"`);
  res.send("﻿" + lines.join("\r\n"));
});

/* ---------- руководитель и редактор ---------- */
stats.get("/stats/org", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const org = u.org_id!, t = today();
  const posts = await q(`SELECT status, author_name, published_at FROM posts WHERE org_id = $1`, [org]);
  const docs = await q(`SELECT valid_until FROM documents WHERE org_id = $1`, [org]);
  const out: any = {
    counters: {
      review: posts.filter((p) => p.status === "review").length,
      openRemarks: (await one(`SELECT count(*)::int AS n FROM remarks WHERE org_id = $1 AND status = 'open'`, [org]))!.n,
      appealsOpen: (await one(`SELECT count(*)::int AS n FROM appeals WHERE org_id = $1 AND status <> 'answered'`, [org]))!.n,
      published: posts.filter((p) => p.status === "published").length,
    },
    postsPerWeek: perWeek(posts.filter((p) => p.published_at).map((p) => p.published_at)),
    activity: await activity("l.org_id = $1", [org]),
    postsByStatus: { published: posts.filter((p) => p.status === "published").length, review: posts.filter((p) => p.status === "review").length, draft: posts.filter((p) => ["draft", "returned"].includes(p.status)).length },
    docs: { valid: docs.filter((d) => !d.valid_until || d.valid_until > addDays(t, 7)).length, expiring: docs.filter((d) => d.valid_until && d.valid_until >= t && d.valid_until <= addDays(t, 7)).length, expired: docs.filter((d) => d.valid_until && d.valid_until < t).length },
    byAuthor: Object.entries(posts.reduce<Record<string, number>>((m, p) => { m[p.author_name || "—"] = (m[p.author_name || "—"] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value })),
  };
  if (u.role === "head") {
    const reqs = await getRequirements();
    out.appeals = await appealStats("o.id = $1", [org], reqs.appealDays);
    const classes = await q(`SELECT c.id, c.name, (SELECT count(*)::int FROM pupils p WHERE p.class_id = c.id) AS pupils,
        (SELECT count(DISTINCT p.id)::int FROM pupils p JOIN parent_children pc ON pc.pupil_id = p.id JOIN users x ON x.id = pc.user_id AND x.active WHERE p.class_id = c.id) AS with_parents
        FROM classes c WHERE c.org_id = $1 ORDER BY c.name`, [org]);
    const pupils = classes.reduce((a, c) => a + c.pupils, 0), withParents = classes.reduce((a, c) => a + c.with_parents, 0);
    const tasks = await q(`SELECT status, due FROM tasks WHERE org_id = $1`, [org]);
    out.family = { classes: classes.length, pupils, withParents, coverage: classes.map((c) => ({ label: c.name, value: pct(c.with_parents, c.pupils) })) };
    out.staff = (await one(`SELECT count(*)::int AS n FROM users WHERE org_id = $1 AND active AND role = ANY($2::text[])`, [org, ORG_STAFF]))!.n;
    out.tasks = { open: tasks.filter((x) => x.status === "open" && !(x.due && x.due < t)).length, overdue: tasks.filter((x) => x.status === "open" && x.due && x.due < t).length, done: tasks.filter((x) => x.status === "done").length };
  }
  res.json(out);
});

/* ---------- педагог ---------- */
stats.get("/stats/teacher", async (req, res) => {
  const u = requireRole(req, "teacher");
  const { classId } = parse(z.object({ classId: z.string().uuid().optional() }), req.query);
  const mine = await teacherClassIds(u);
  const cid = classId && mine.includes(classId) ? classId : mine[0];
  if (!cid) return res.json({ class: null });
  const c = await assertClass(u, cid, "manage");
  const pupils = await q(`SELECT p.id, p.full_name, EXISTS (SELECT 1 FROM parent_children pc JOIN users x ON x.id = pc.user_id AND x.active WHERE pc.pupil_id = p.id) AS has_parent FROM pupils p WHERE p.class_id = $1 ORDER BY p.full_name`, [cid]);
  const posts = await q(`SELECT id, type, subject, due, created_at FROM class_posts WHERE class_id = $1 ORDER BY created_at DESC`, [cid]);
  const hw = posts.filter((p) => p.type === "homework");
  const done = await q(`SELECT h.pupil_id, h.class_post_id FROM homework_done h JOIN class_posts cp ON cp.id = h.class_post_id WHERE cp.class_id = $1`, [cid]);
  const msgs = await q(`SELECT m.pupil_id, m.sender_side, m.created_at, m.read_by_teacher FROM messages m JOIN pupils p ON p.id = m.pupil_id WHERE p.class_id = $1 ORDER BY m.created_at`, [cid]);
  const replies: number[] = [];
  pupils.forEach((p) => {
    const th = msgs.filter((m) => m.pupil_id === p.id);
    th.forEach((m, i) => { if (m.sender_side === "family" && (i === 0 || th[i - 1].sender_side !== "family")) { const r = th.slice(i).find((x) => x.sender_side === "teacher"); if (r) replies.push(daysBetween(m.created_at, r.created_at)); } });
  });
  const my = await q(`SELECT status FROM posts WHERE author_id = $1`, [u.id]);
  const since = new Date(Date.now() - 30 * 864e5);
  res.json({
    class: { id: c.id, name: c.name, kind: c.kind }, classes: await q(`SELECT id, name FROM classes WHERE id = ANY($1::uuid[]) ORDER BY name`, [mine]),
    pupils: pupils.length, withParents: pupils.filter((p) => p.has_parent).length,
    posts30: (c.kind === "class" ? hw : posts).filter((p) => new Date(p.created_at) >= since).length,
    avgCompletion: hw.length ? Math.round(avg(hw.map((h) => pct(done.filter((d) => d.class_post_id === h.id).length, pupils.length)))!) : null,
    completion: hw.slice(0, 10).reverse().map((h) => ({ label: h.due ? `${h.due.slice(8, 10)}.${h.due.slice(5, 7)}` : "—", value: pct(done.filter((d) => d.class_post_id === h.id).length, pupils.length) })),
    byPupil: pupils.map((p) => ({ label: p.full_name, value: c.kind === "class" ? pct(done.filter((d) => d.pupil_id === p.id).length, hw.length) : msgs.filter((m) => m.pupil_id === p.id && m.sender_side === "family").length })),
    familyMessages: msgs.filter((m) => m.sender_side === "family").length, unread: msgs.filter((m) => m.sender_side === "family" && !m.read_by_teacher).length,
    avgReplyDays: avg(replies),
    myPosts: { published: my.filter((p) => p.status === "published").length, review: my.filter((p) => p.status === "review").length, returned: my.filter((p) => p.status === "returned").length },
  });
});

/* ---------- ученик ---------- */
stats.get("/stats/student", async (req, res) => {
  const u = requireRole(req, "student");
  const p = await one(`SELECT p.*, c.name AS class_name, o.name AS org_name FROM pupils p JOIN classes c ON c.id = p.class_id JOIN orgs o ON o.id = p.org_id WHERE p.id = $1`, [u.pupil_id]);
  if (!p) return res.json({ pupil: null });
  const hw = await q(`SELECT cp.*, EXISTS(SELECT 1 FROM homework_done h WHERE h.class_post_id = cp.id AND h.pupil_id = $2) AS done FROM class_posts cp WHERE cp.class_id = $1 AND cp.type = 'homework' ORDER BY cp.due NULLS LAST`, [p.class_id, p.id]);
  const t = today(), subj: Record<string, { t: number; d: number }> = {};
  hw.forEach((h) => { const s = h.subject || "Без предмета"; subj[s] ??= { t: 0, d: 0 }; subj[s].t++; if (h.done) subj[s].d++; });
  res.json({
    pupil: { id: p.id, full_name: p.full_name, class_name: p.class_name, org_name: p.org_name, class_id: p.class_id },
    total: hw.length, done: hw.filter((h) => h.done).length, overdue: hw.filter((h) => !h.done && h.due && h.due < t).length,
    upcoming: hw.filter((h) => !h.done && (!h.due || h.due >= t)).slice(0, 5),
    bySubject: Object.entries(subj).map(([label, x]) => ({ label, value: pct(x.d, x.t) })),
  });
});

/* ---------- сотрудник: свои поручения ---------- */
stats.get("/stats/me/tasks", async (req, res) => {
  const u = requireRole(req, ...ORG_STAFF);
  const t = today();
  const rows = await q(`SELECT status, due, done_at FROM tasks WHERE assignee_id = $1`, [u.id]);
  const inner = await one(`SELECT count(*)::int AS n, max(created_at) AS last FROM inner_posts WHERE org_id = $1`, [u.org_id]);
  res.json({ open: rows.filter((r) => r.status === "open" && !(r.due && r.due < t)).length, overdue: rows.filter((r) => r.status === "open" && r.due && r.due < t).length,
    done30: rows.filter((r) => r.status === "done" && new Date(r.done_at) >= new Date(Date.now() - 30 * 864e5)).length, doneTotal: rows.filter((r) => r.status === "done").length, inner });
});

/* ---------- оператор ---------- */
stats.get("/stats/platform", async (req, res) => {
  requireRole(req, "operator");
  const tables = [["orgs", "Организации"], ["users", "Учётные записи"], ["posts", "Публикации"], ["documents", "Документы"], ["appeals", "Обращения"], ["remarks", "Замечания"], ["class_posts", "Задания и объявления классов"], ["messages", "Сообщения"], ["tasks", "Поручения"], ["feed", "Лента новостей"], ["audit_log", "Журнал"]];
  const counts = [];
  for (const [t, label] of tables) counts.push({ label, value: (await one(`SELECT count(*)::int AS n FROM ${t}`))!.n });
  const roles = await q(`SELECT role, count(*)::int AS n FROM users WHERE active GROUP BY role`);
  const files = await one(`SELECT count(*)::int AS n, COALESCE(sum(size),0)::bigint AS bytes FROM documents WHERE file_key IS NOT NULL`);
  res.json({ counts, usersByRole: (Object.keys(ROLES) as Role[]).map((r) => ({ label: ROLES[r], value: roles.find((x) => x.role === r)?.n ?? 0 })), activity: await activity("TRUE", []), files });
});

/* ---------- счётчики для меню кабинета ---------- */
stats.get("/counters", async (req, res) => {
  const u = req.user; if (!u) return res.json({});
  const c: Record<string, number> = {};
  if (["head", "editor"].includes(u.role)) {
    c.posts = (await one(`SELECT count(*)::int AS n FROM posts WHERE org_id = $1 AND status = 'review'`, [u.org_id]))!.n;
    c.remarks = (await one(`SELECT count(*)::int AS n FROM remarks WHERE org_id = $1 AND status = 'open'`, [u.org_id]))!.n;
    c.appeals = (await one(`SELECT count(*)::int AS n FROM appeals WHERE org_id = $1 AND status <> 'answered'`, [u.org_id]))!.n;
  }
  if (["region", "district"].includes(u.role)) {
    const p: unknown[] = []; const w = orgWhere(u, "o", p);
    c.remarks = (await one(`SELECT count(*)::int AS n FROM remarks r JOIN orgs o ON o.id = r.org_id WHERE ${w} AND r.status = 'fixed'`, p))!.n;
  }
  if (u.role === "teacher") c.messages = (await one(`SELECT count(*)::int AS n FROM messages m JOIN pupils p ON p.id = m.pupil_id JOIN classes cl ON cl.id = p.class_id WHERE cl.teacher_id = $1 AND m.sender_side = 'family' AND NOT m.read_by_teacher`, [u.id]))!.n;
  if (["author", "teacher"].includes(u.role)) c.mine = (await one(`SELECT count(*)::int AS n FROM posts WHERE author_id = $1 AND status = 'returned'`, [u.id]))!.n;
  if (u.role === "parent") c.chat = (await one(`SELECT count(*)::int AS n FROM messages m JOIN parent_children pc ON pc.pupil_id = m.pupil_id WHERE pc.user_id = $1 AND m.sender_side = 'teacher' AND NOT m.read_by_family`, [u.id]))!.n;
  if (ORG_STAFF.includes(u.role) && u.role !== "head") c.tasks = (await one(`SELECT count(*)::int AS n FROM tasks WHERE assignee_id = $1 AND status = 'open'`, [u.id]))!.n;
  res.json(c);
});
