import { Router } from "express";
import { z } from "zod";
import { q, one } from "../db.js";
import { requireRole, requireUser, type AuthUser } from "../auth/session.js";
import { parse, forbid, notFound, optDate, text, today } from "../lib/http.js";
import { isRegionLevel } from "../lib/scope.js";
import { audit } from "../lib/audit.js";
import { FEED_TAGS, ORG_STAFF } from "../lib/domain.js";
import { perWeek } from "../lib/stats.js";

export const feed = Router();

/** Какие публикации ленты видит пользователь */
function visibility(u: AuthUser, params: unknown[]): string {
  if (isRegionLevel(u)) return "TRUE";
  params.push(u.district_id);
  let w = `(f.scope = 'region' OR f.scope = $${params.length})`;
  if (u.role !== "district") {
    params.push(today());
    w += ` AND (f.until IS NULL OR f.until >= $${params.length})`;
    const aud = ["all", ...(ORG_STAFF.includes(u.role) ? ["staff"] : []), ...(["parent", "student"].includes(u.role) ? ["families"] : [])];
    params.push(aud); w += ` AND f.audience = ANY($${params.length}::text[])`;
  }
  return w;
}

feed.get("/feed", async (req, res) => {
  const u = requireUser(req);
  const params: unknown[] = [];
  const rows = await q(`SELECT f.*, d.name AS district_name FROM feed f LEFT JOIN districts d ON d.id = f.scope WHERE ${visibility(u, params)} ORDER BY f.pinned DESC, f.created_at DESC LIMIT 200`, params);
  res.json(rows.map((f) => ({ ...f, can_edit: u.role === "region" || (u.role === "district" && f.scope === u.district_id) })));
});

feed.get("/feed/schools", async (req, res) => {
  const u = requireUser(req);
  const params: unknown[] = []; let where = "p.status = 'published'";
  if (!isRegionLevel(u)) { params.push(u.district_id); where += ` AND o.district_id = $1`; }
  res.json(await q(`SELECT p.id, p.title, p.body, p.tag, p.published_at, o.name AS org_name, o.slug AS org_slug FROM posts p JOIN orgs o ON o.id = p.org_id WHERE ${where} ORDER BY p.published_at DESC LIMIT 50`, params));
});

const body = z.object({
  title: text(200), body: text(10000), tag: z.enum(FEED_TAGS as [string, ...string[]]).default("Официально"),
  audience: z.enum(["all", "families", "staff"]).default("all"), until: optDate, link: z.union([z.string().url(), z.literal("")]).default(""), pinned: z.boolean().default(false),
});

feed.post("/feed", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const b = parse(body, req.body);
  const scope = u.role === "region" ? "region" : u.district_id;
  const r = await one(`INSERT INTO feed(scope, title, body, tag, audience, until, link, pinned, created_by, author) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [scope, b.title, b.body, b.tag, b.audience, b.until, b.link, b.pinned, u.id, u.full_name]);
  await audit(u, `Опубликовал новость в ленте «${b.title}»`);
  res.status(201).json(r);
});

async function editable(u: AuthUser, id: string) {
  const f = await one(`SELECT * FROM feed WHERE id = $1`, [id]);
  if (!f) return notFound();
  if (!(u.role === "region" || (u.role === "district" && f.scope === u.district_id))) forbid("Новость опубликована другим уровнем");
  return f;
}
feed.put("/feed/:id", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const f = await editable(u, req.params.id);
  const b = parse(body, req.body);
  await q(`UPDATE feed SET title=$2, body=$3, tag=$4, audience=$5, until=$6, link=$7, pinned=$8, updated_at=now() WHERE id=$1`, [f.id, b.title, b.body, b.tag, b.audience, b.until, b.link, b.pinned]);
  await audit(u, `Изменил новость «${b.title}»`);
  res.json({ ok: true });
});
feed.post("/feed/:id/pin", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const f = await editable(u, req.params.id);
  await q(`UPDATE feed SET pinned = NOT pinned WHERE id = $1`, [f.id]);
  res.json({ ok: true });
});
feed.delete("/feed/:id", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const f = await editable(u, req.params.id);
  await q(`DELETE FROM feed WHERE id = $1`, [f.id]);
  await audit(u, `Удалил новость «${f.title}»`);
  res.json({ ok: true });
});

feed.get("/feed/stats", async (req, res) => {
  const u = requireRole(req, "region", "district");
  const params: unknown[] = []; let where = "TRUE";
  if (u.role === "district") { params.push(u.district_id); where = "scope = $1"; }
  const rows = await q(`SELECT tag, audience, pinned, created_at FROM feed WHERE ${where}`, params);
  const from = new Date(Date.now() - 30 * 864e5);
  res.json({
    total: rows.length, last30: rows.filter((r) => new Date(r.created_at) >= from).length, pinned: rows.filter((r) => r.pinned).length,
    perWeek: perWeek(rows.map((r) => r.created_at)),
    byTag: FEED_TAGS.map((t) => ({ label: t, value: rows.filter((r) => r.tag === t).length })),
    byAudience: ["all", "families", "staff"].map((a) => ({ key: a, value: rows.filter((r) => r.audience === a).length })),
  });
});
