/**
 * Интеграционные тесты API на встроенном PostgreSQL (PGlite в памяти).
 * Главное, что проверяем: каждая роль видит и меняет только свои данные.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";

process.env.DATABASE_URL = "pglite:memory";
process.env.AUTH_DEV_LOGIN = "true";
process.env.UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".uploads");
process.env.NODE_ENV = "test";

const { initDb, migrate, q, one, closeDb } = await import("../src/db.js");
const { seed } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

let server: Server, base = "";
const ids: Record<string, string> = {};

before(async () => {
  await initDb();
  await migrate(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations"));
  await seed();
  for (const r of await q(`SELECT id, role, full_name FROM users`)) ids[r.role + ":" + r.full_name] = r.id;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
after(async () => { server.close(); await closeDb(); });

const byRole = async (role: string) => (await one(`SELECT id FROM users WHERE role = $1 ORDER BY created_at LIMIT 1`, [role]))!.id;

async function as(role: string) {
  const r = await fetch(`${base}/auth/dev`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: await byRole(role) }) });
  assert.equal(r.status, 200, await r.text());
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { get: (u: string) => call("GET", u), post: (u: string, b?: unknown) => call("POST", u, b ?? {}), put: (u: string, b: unknown) => call("PUT", u, b), patch: (u: string, b: unknown) => call("PATCH", u, b), del: (u: string) => call("DELETE", u) };
}

test("публичный портал: каталог, сайт, обращение", async () => {
  const meta = await (await fetch(`${base}/public/meta`)).json();
  assert.equal(meta.counts.total, 600);
  const list = await (await fetch(`${base}/public/orgs?district=tal&kind=school&limit=5`)).json();
  assert.ok(list.total > 0 && list.items.length <= 5);
  const site = await (await fetch(`${base}/public/orgs/sch1-taldykorgan`)).json();
  assert.equal(site.posts.length, 2, "на сайте только опубликованные материалы");
  const ap = await fetch(`${base}/public/orgs/o1/appeals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Тест", contact: "+77000000000", text: "Вопрос", consent: true }) });
  assert.equal(ap.status, 201);
  const { code } = await ap.json();
  const st = await (await fetch(`${base}/public/appeals/${code}`)).json();
  assert.equal(st.status, "new");
  assert.equal(st.contact, undefined, "контакт заявителя не раскрывается");
});

test("без входа кабинетные методы закрыты", async () => {
  assert.equal((await fetch(`${base}/posts`)).status, 401);
  assert.equal((await fetch(`${base}/monitoring/area`)).status, 401);
});

test("автор → редактор: проверка и публикация", async () => {
  const t = await as("teacher");
  const created = await t.post("/posts", { title: "Новость класса", body: "Текст", tag: "Новости", action: "review" });
  assert.equal(created.status, 201);
  const pub = await t.post("/posts", { title: "Сам опубликую", body: "x", action: "publish" });
  assert.equal(pub.status, 403, "педагог не публикует без редактора");
  const e = await as("editor");
  const queue = await e.get("/posts?status=review");
  const item = queue.body.find((p: any) => p.title === "Новость класса");
  assert.ok(item);
  assert.equal((await e.post(`/posts/${item.id}/approve`)).status, 200);
  const mine = await t.get("/posts");
  assert.ok(mine.body.every((p: any) => p.author_id === (mine.body[0]?.author_id)), "автор видит только свои материалы");
});

test("район видит только свой район, область — всё", async () => {
  const d = await as("district");
  const area = await d.get("/monitoring/area");
  assert.equal(area.status, 200);
  assert.equal(area.body.districts, null);
  const orgs = await d.get("/monitoring/orgs?limit=700");
  assert.ok(orgs.body.items.every((o: any) => o.district_name === "г. Талдыкорган"));
  const foreign = (await one(`SELECT id FROM orgs WHERE district_id = 'pan' LIMIT 1`))!.id;
  const bad = await d.post("/remarks", { orgId: foreign, section: "food", text: "x", due: "2030-01-01" });
  assert.equal(bad.status, 403, "замечание чужому району запрещено");
  const r = await as("region");
  const all = await r.get("/monitoring/area");
  assert.equal(all.body.kpi.orgs, 600);
  assert.equal(all.body.districts.length, 10);
});

test("замечание: район → школа исправляет → район принимает", async () => {
  const d = await as("district");
  const created = await d.post("/remarks", { orgId: "o1", section: "budget", text: "Загрузите план закупок", due: "2030-01-01" });
  assert.equal(created.status, 201);
  const e = await as("editor");
  const list = await e.get("/remarks?status=open");
  const rem = list.body.find((x: any) => x.section === "budget");
  assert.equal((await e.post(`/remarks/${rem.id}/fix`, { reply: "Загрузили" })).status, 200);
  assert.equal((await e.post(`/remarks/${rem.id}/accept`)).status, 403, "редактор не закрывает замечания");
  assert.equal((await d.post(`/remarks/${rem.id}/accept`)).status, 200);
});

test("обращения: отвечает только руководитель; район не видит контакты", async () => {
  const e = await as("editor");
  const ap = (await e.get("/appeals")).body[0];
  assert.ok(ap.contact);
  assert.equal((await e.post(`/appeals/${ap.id}/answer`, { answer: "x" })).status, 403);
  const h = await as("head");
  assert.equal((await h.post(`/appeals/${ap.id}/answer`, { answer: "Ответ", isPublic: true })).status, 200);
  const d = await as("district");
  const dl = await d.get("/appeals");
  assert.ok(dl.body.every((a: any) => a.contact === undefined));
});

test("выдача доступа: каждая роль выдаёт только свои роли", async () => {
  const h = await as("head");
  assert.equal((await h.post("/users", { fullName: "Новый педагог", role: "teacher", iin: "000000000099" })).status, 201);
  assert.equal((await h.post("/users", { fullName: "Захват", role: "region" })).status, 403);
  const e = await as("editor");
  assert.equal((await e.post("/users", { fullName: "Редактор 2", role: "editor" })).status, 403);
  const d = await as("district");
  const users = await d.get("/users");
  assert.ok(users.body.users.every((u: any) => u.role === "head"));
});

test("педагог и семья: задание, отметка, переписка, изоляция чужих детей", async () => {
  const t = await as("teacher");
  const classes = (await t.get("/classes")).body;
  assert.equal(classes.length, 1);
  const cid = classes[0].id;
  assert.equal((await t.post(`/classes/${cid}/posts`, { type: "homework", subject: "Математика", due: "2030-01-01", text: "№1–5" })).status, 201);
  const pupils = (await t.get(`/classes/${cid}/pupils`)).body.pupils;
  const dan = pupils.find((p: any) => p.full_name === "Ахметов Данияр");
  assert.equal((await t.post(`/pupils/${dan.id}/access`, { role: "parent", fullName: "Ахметова Динара", phone: "+7 701 555 44 33", relation: "Мама" })).status, 201);

  const s = await as("student");
  const posts = (await s.get(`/classes/${cid}/posts`)).body.posts;
  const hw = posts.find((p: any) => p.subject === "Математика");
  assert.equal((await s.post(`/class-posts/${hw.id}/done`, { done: true })).status, 200);

  const p = await as("parent");
  const kids = (await p.get("/family/children")).body;
  assert.equal(kids.length, 1);
  assert.ok(kids[0].homework_done >= 1);
  assert.equal((await p.get(`/pupils/${dan.id}/messages`)).status, 403, "родитель не видит чужого ребёнка");
  assert.equal((await p.post(`/pupils/${kids[0].id}/messages`, { text: "Спасибо!" })).status, 201);
  const otherTeacherKg = (await one(`SELECT id FROM users WHERE role='teacher' AND full_name='Есенова Гульнара'`))!.id;
  void otherTeacherKg;
  const ts = await t.get("/stats/teacher");
  assert.ok(ts.body.unread >= 1);
  assert.ok(ts.body.avgCompletion !== null);
});

test("поручения: руководитель → сотрудник", async () => {
  const pers = await as("personnel");
  const tasks = (await pers.get("/tasks")).body;
  assert.ok(tasks.length >= 1 && tasks.every((x: any) => x.assignee_name === tasks[0].assignee_name));
  assert.equal((await pers.post(`/tasks/${tasks[0].id}/done`, { report: "Сделано" })).status, 200);
  assert.equal((await pers.post("/tasks", { assigneeId: tasks[0].assignee_id, title: "x" })).status, 403);
  const st = (await pers.get("/stats/me/tasks")).body;
  assert.equal(st.doneTotal, 1);
});

test("лента: публикуют только администраторы, аудитория соблюдается", async () => {
  const r = await as("region");
  assert.equal((await r.post("/feed", { title: "Только персоналу", body: "x", audience: "staff" })).status, 201);
  const h = await as("head");
  assert.equal((await h.post("/feed", { title: "x", body: "x" })).status, 403);
  const p = await as("parent");
  const pf = (await p.get("/feed")).body.map((f: any) => f.title);
  assert.ok(!pf.includes("Только персоналу"));
  assert.ok(pf.some((t: string) => t.includes("всеобуч")), "родитель Талдыкоргана видит новость района для семей");
  const dist = await as("district");
  assert.equal((await dist.get("/feed")).status, 200);
  const pers = await as("personnel");
  assert.ok((await pers.get("/feed")).body.some((f: any) => f.title === "Только персоналу"));
  const pubFeed = await (await fetch(`${base}/public/feed`)).json();
  assert.ok(pubFeed.every((f: any) => f.title !== "Только персоналу"));
});

test("требования и статистика по ролям", async () => {
  const r = await as("region");
  assert.equal((await r.put("/config/requirements", { school: ["about", "contacts"], kg: ["about"], appealDays: 7 })).status, 200);
  const d = await as("district");
  assert.equal((await d.put("/config/requirements", { school: [], kg: [], appealDays: 7 })).status, 403);
  const o = await as("operator");
  assert.equal((await o.get("/stats/platform")).status, 200);
  assert.equal((await o.get("/stats/org")).status, 403);
  const h = await as("head");
  const so = (await h.get("/stats/org")).body;
  assert.ok(so.family && so.tasks && so.appeals);
  const e = await as("editor");
  const se = (await e.get("/stats/org")).body;
  assert.equal(se.family, undefined, "редактор не видит статистику семей");
  const s = await as("student");
  assert.equal((await s.get("/stats/student")).status, 200);
  assert.equal((await s.get("/monitoring/area")).status, 403);
});
