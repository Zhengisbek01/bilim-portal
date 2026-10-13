import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { requireRole } from "../auth/session.js";
import { parse, fail, forbid, notFound, optDate, text } from "../lib/http.js";
import { compliance, getRequirements } from "../lib/config.js";
import { autoChecks } from "../lib/checks.js";
import { DOC_TYPES, POST_TAGS, SECTION_KEYS } from "../lib/domain.js";
import { saveFile, removeFile, ALLOWED_MIME } from "../lib/storage.js";
import { audit } from "../lib/audit.js";

export const site = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } });

/* ---------- сайт организации: сведения и разделы ---------- */
site.get("/org/site", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const o = await one(`SELECT * FROM orgs WHERE id = $1`, [u.org_id]);
  const reqs = await getRequirements();
  const c = compliance(o as any, reqs);
  res.json({ org: o, required: o!.kind === "school" ? reqs.school : reqs.kg, score: c.score, missing: c.missing, checks: await autoChecks(o, reqs) });
});

site.put("/org/site/info", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const b = parse(z.object({
    director: z.string().max(200), phone: z.string().max(60), address: z.string().max(300), reception: z.string().max(200),
    about: z.string().max(5000), vacancies: z.string().max(3000),
  }), req.body);
  const o = await one(`SELECT sections FROM orgs WHERE id = $1`, [u.org_id]);
  const sections = { ...(o!.sections || {}) };
  if (b.about) sections.about = true;
  if (b.vacancies) sections.vacancies = true;
  await q(`UPDATE orgs SET director=$2, phone=$3, address=$4, reception=$5, about=$6, vacancies=$7, sections=$8::jsonb, updated_at=now() WHERE id=$1`,
    [u.org_id, b.director, b.phone, b.address, b.reception, b.about, b.vacancies, JSON.stringify(sections)]);
  await audit(u, "Обновил сведения об организации", u.org_id);
  res.json({ ok: true });
});

site.put("/org/site/sections", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const b = parse(z.object({ key: z.enum(SECTION_KEYS), filled: z.boolean() }), req.body);
  await q(`UPDATE orgs SET sections = jsonb_set(sections, $2, $3::jsonb), updated_at = now() WHERE id = $1`, [u.org_id, `{${b.key}}`, JSON.stringify(b.filled)]);
  await audit(u, `${b.filled ? "Отметил заполненным" : "Снял отметку"}: раздел ${b.key}`, u.org_id);
  res.json({ ok: true });
});

/* ---------- публикации ---------- */
const POST_ROLES = ["head", "editor", "author", "teacher"] as const;
const isEditor = (r: string) => r === "head" || r === "editor";

site.get("/posts", async (req, res) => {
  const u = requireRole(req, ...POST_ROLES);
  const { status } = parse(z.object({ status: z.enum(["draft", "review", "returned", "published", "all"]).default("all") }), req.query);
  const params: unknown[] = [u.org_id]; let where = `org_id = $1`;
  if (!isEditor(u.role)) { params.push(u.id); where += ` AND author_id = $2`; }
  if (status !== "all") { params.push(status); where += ` AND status = $${params.length}`; }
  res.json(await q(`SELECT * FROM posts WHERE ${where} ORDER BY updated_at DESC LIMIT 200`, params));
});

const postBody = z.object({ title: text(200), body: text(20000), tag: z.enum(POST_TAGS as [string, ...string[]]).default("Новости"), action: z.enum(["draft", "review", "publish"]) });
function statusFor(role: string, action: string) {
  if (action === "publish") { if (!isEditor(role)) forbid("Публикует редактор или руководитель"); return "published"; }
  return action === "review" ? "review" : "draft";
}

site.post("/posts", async (req, res) => {
  const u = requireRole(req, ...POST_ROLES);
  const b = parse(postBody, req.body);
  const st = statusFor(u.role, b.action);
  const r = await one(`INSERT INTO posts(org_id, title, body, tag, status, author_id, author_name, published_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $5 = 'published' THEN now() END) RETURNING id`, [u.org_id, b.title, b.body, b.tag, st, u.id, u.full_name]);
  await audit(u, `${st === "published" ? "Опубликовал" : st === "review" ? "Отправил на проверку" : "Сохранил черновик"} «${b.title}»`, u.org_id);
  res.status(201).json(r);
});

async function loadPost(u: any, id: string) {
  const p = await one(`SELECT * FROM posts WHERE id = $1`, [id]);
  if (!p || p.org_id !== u.org_id) notFound("Материал не найден");
  return p!;
}

site.put("/posts/:id", async (req, res) => {
  const u = requireRole(req, ...POST_ROLES);
  const p = await loadPost(u, req.params.id);
  if (!isEditor(u.role) && (p.author_id !== u.id || !["draft", "returned"].includes(p.status))) forbid("Редактировать можно свои черновики и возвращённые материалы");
  const b = parse(postBody, req.body);
  const st = statusFor(u.role, b.action);
  await q(`UPDATE posts SET title=$2, body=$3, tag=$4, status=$5, updated_at=now(), published_at = CASE WHEN $5='published' THEN COALESCE(published_at, now()) ELSE published_at END WHERE id=$1`,
    [p.id, b.title, b.body, b.tag, st]);
  await audit(u, `Изменил материал «${b.title}»`, u.org_id);
  res.json({ ok: true });
});

site.post("/posts/:id/:op", async (req, res) => {
  const u = requireRole(req, ...POST_ROLES);
  const p = await loadPost(u, req.params.id);
  const op = req.params.op;
  if (op === "submit") {
    if (p.author_id !== u.id || !["draft", "returned"].includes(p.status)) forbid();
    await q(`UPDATE posts SET status='review', updated_at=now() WHERE id=$1`, [p.id]);
  } else if (op === "approve") {
    if (!isEditor(u.role)) forbid();
    await q(`UPDATE posts SET status='published', comment='', published_at=COALESCE(published_at, now()), updated_at=now() WHERE id=$1`, [p.id]);
  } else if (op === "return") {
    if (!isEditor(u.role) || p.status !== "review") forbid();
    const { comment } = parse(z.object({ comment: text(1000) }), req.body);
    await q(`UPDATE posts SET status='returned', comment=$2, updated_at=now() WHERE id=$1`, [p.id, comment]);
  } else if (op === "unpublish") {
    if (!isEditor(u.role)) forbid();
    await q(`UPDATE posts SET status='draft', updated_at=now() WHERE id=$1`, [p.id]);
  } else fail(404, "Неизвестное действие");
  const names: Record<string, string> = { submit: "Отправил на проверку", approve: "Опубликовал", return: "Вернул автору", unpublish: "Снял с сайта" };
  await audit(u, `${names[op]} «${p.title}»`, u.org_id);
  res.json({ ok: true });
});

site.delete("/posts/:id", async (req, res) => {
  const u = requireRole(req, ...POST_ROLES);
  const p = await loadPost(u, req.params.id);
  if (!isEditor(u.role) && (p.author_id !== u.id || p.status === "published")) forbid();
  await q(`DELETE FROM posts WHERE id = $1`, [p.id]);
  await audit(u, `Удалил материал «${p.title}»`, u.org_id);
  res.json({ ok: true });
});

/* ---------- документы ---------- */
site.get("/documents", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  res.json(await q(`SELECT id, type, section, title, valid_until, file_name, mime, size, uploader, created_at FROM documents WHERE org_id = $1 ORDER BY created_at DESC`, [u.org_id]));
});

site.post("/documents", upload.single("file"), async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const b = parse(z.object({ type: z.enum(Object.keys(DOC_TYPES) as [string, ...string[]]), title: text(300), validUntil: optDate }), req.body);
  let key: string | null = null;
  if (req.file) {
    if (!ALLOWED_MIME.has(req.file.mimetype)) fail(415, "Допустимы PDF, Word, Excel, JPG и PNG");
    key = await saveFile(req.file.buffer, req.file.originalname, req.file.mimetype);
  }
  const section = DOC_TYPES[b.type];
  const r = await one(`INSERT INTO documents(org_id, type, section, title, valid_until, file_key, file_name, mime, size, uploaded_by, uploader)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [u.org_id, b.type, section, b.title, b.validUntil, key, req.file ? Buffer.from(req.file.originalname, "latin1").toString("utf8") : null, req.file?.mimetype ?? null, req.file?.size ?? null, u.id, u.full_name]);
  await q(`UPDATE orgs SET sections = jsonb_set(sections, $2, 'true'::jsonb), updated_at = now() WHERE id = $1`, [u.org_id, `{${section}}`]);
  await audit(u, `Загрузил документ «${b.title}»`, u.org_id);
  res.status(201).json(r);
});

site.delete("/documents/:id", async (req, res) => {
  const u = requireRole(req, "head", "editor");
  const d = await one(`SELECT * FROM documents WHERE id = $1 AND org_id = $2`, [req.params.id, u.org_id]);
  if (!d) return notFound();
  await q(`DELETE FROM documents WHERE id = $1`, [d.id]);
  await removeFile(d.file_key);
  await audit(u, `Удалил документ «${d.title}»`, u.org_id);
  res.json({ ok: true });
});
