import { Router } from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { parse, notFound, text, today } from "../lib/http.js";
import { compliance, getRequirements, getMaintenance } from "../lib/config.js";
import { SECTION_TITLES } from "../lib/domain.js";
import { openFile, isRemoteKey } from "../lib/storage.js";
import { audit } from "../lib/audit.js";

export const pub = Router();

pub.get("/meta", async (_req, res) => {
  const [districts, req, maint, counts] = await Promise.all([
    q(`SELECT id, name, town FROM districts ORDER BY name`),
    getRequirements(), getMaintenance(),
    one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE kind='school')::int AS schools, count(*) FILTER (WHERE kind='kg')::int AS kgs FROM orgs`),
  ]);
  res.json({ regionName: env.REGION_NAME, domain: env.PUBLIC_DOMAIN, districts, requirements: req, maintenance: maint.on ? maint.text : "", sectionTitles: SECTION_TITLES, counts });
});

pub.get("/orgs", async (req, res) => {
  const f = parse(z.object({
    q: z.string().optional(), district: z.string().optional(), kind: z.enum(["school", "kg"]).optional(),
    limit: z.coerce.number().min(1).max(100).default(24), offset: z.coerce.number().min(0).default(0),
  }), req.query);
  const params: unknown[] = [], where: string[] = [];
  if (f.q) { params.push(`%${f.q.toLowerCase()}%`); where.push(`(lower(o.name) LIKE $${params.length} OR lower(d.town) LIKE $${params.length} OR lower(d.name) LIKE $${params.length})`); }
  if (f.district) { params.push(f.district); where.push(`o.district_id = $${params.length}`); }
  if (f.kind) { params.push(f.kind); where.push(`o.kind = $${params.length}`); }
  const rows = await q(`SELECT o.id, o.name, o.slug, o.kind, o.district_id, o.sections, d.name AS district_name, d.town
     FROM orgs o JOIN districts d ON d.id = o.district_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY d.name, o.kind DESC, o.name`, params);
  const reqs = await getRequirements();
  res.json({
    total: rows.length,
    items: rows.slice(f.offset, f.offset + f.limit).map(({ sections, ...o }) => ({ ...o, score: compliance({ kind: o.kind, sections }, reqs).score })),
  });
});

pub.get("/orgs/:slug", async (req, res) => {
  const o = await one(`SELECT o.*, d.name AS district_name, d.town FROM orgs o JOIN districts d ON d.id = o.district_id WHERE o.slug = $1`, [req.params.slug]);
  if (!o) return notFound("Организация не найдена");
  const t = today();
  const [reqs, posts, docs, appeals, ann] = await Promise.all([
    getRequirements(),
    q(`SELECT id, title, body, tag, published_at FROM posts WHERE org_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 50`, [o.id]),
    q(`SELECT id, type, section, title, valid_until, file_name, (file_key IS NOT NULL) AS has_file FROM documents WHERE org_id = $1 ORDER BY created_at DESC`, [o.id]),
    q(`SELECT id, text, answer, answered_at FROM appeals WHERE org_id = $1 AND status = 'answered' AND is_public ORDER BY answered_at DESC LIMIT 20`, [o.id]),
    q(`SELECT id, scope, text FROM announcements WHERE (scope = 'region' OR scope = $1) AND (until IS NULL OR until >= $2) ORDER BY created_at DESC`, [o.district_id, t]),
  ]);
  const c = compliance(o as any, reqs);
  res.json({
    org: {
      id: o.id, name: o.name, slug: o.slug, kind: o.kind, district_id: o.district_id, district_name: o.district_name, town: o.town,
      director: o.director, phone: o.phone, address: o.address || o.town, reception: o.reception, about: o.about, vacancies: o.vacancies,
      lang: o.lang, size: o.size, sections: o.sections,
    },
    required: o.kind === "school" ? reqs.school : reqs.kg, score: c.score, missing: c.missing, appealDays: reqs.appealDays,
    posts, documents: docs, appeals, announcements: ann,
  });
});

pub.get("/files/:id", async (req, res) => {
  const d = await one(`SELECT file_key, file_name, mime FROM documents WHERE id = $1`, [req.params.id]);
  if (!d?.file_key) return notFound("Файл не найден");
  if (isRemoteKey(d.file_key)) return res.redirect(302, d.file_key);
  res.setHeader("content-type", d.mime || "application/octet-stream");
  res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.file_name || "document")}`);
  openFile(d.file_key).on("error", () => res.status(404).end()).pipe(res);
});

const appealLimiter = rateLimit({ windowMs: 60 * 60e3, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Слишком много обращений с вашего адреса, попробуйте позже" } });
pub.post("/orgs/:id/appeals", appealLimiter, async (req, res) => {
  const b = parse(z.object({ name: text(120), contact: text(120), text: text(3000), consent: z.literal(true, { errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }) }) }), req.body);
  const o = await one(`SELECT id FROM orgs WHERE id = $1`, [req.params.id]);
  if (!o) return notFound("Организация не найдена");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = "A-" + Array.from(crypto.randomBytes(6)).map((x) => alphabet[x % alphabet.length]).join("");
  await q(`INSERT INTO appeals(id, org_id, name, contact, text, status) VALUES ($1,$2,$3,$4,$5,'new')`, [code, o.id, b.name, b.contact, b.text]);
  await audit(null, `Новое обращение ${code}`, o.id);
  res.status(201).json({ code });
});

pub.get("/appeals/:code", async (req, res) => {
  const a = await one(`SELECT id, status, text, answer, created_at, answered_at FROM appeals WHERE id = $1`, [req.params.code.toUpperCase()]);
  if (!a) return notFound("Обращение не найдено. Проверьте номер.");
  res.json(a);
});

pub.get("/feed", async (_req, res) => {
  res.json(await q(`SELECT f.id, f.scope, f.title, f.body, f.tag, f.link, f.pinned, f.created_at, d.name AS district_name
     FROM feed f LEFT JOIN districts d ON d.id = f.scope
    WHERE f.audience = 'all' AND (f.until IS NULL OR f.until >= $1) ORDER BY f.pinned DESC, f.created_at DESC LIMIT 100`, [today()]));
});
