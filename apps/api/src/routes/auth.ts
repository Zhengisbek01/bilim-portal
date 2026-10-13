import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { issueSession, clearSession, requireUser, loadUserById } from "../auth/session.js";
import { createChallenge, consumeChallenge, verifyCms } from "../auth/ecp.js";
import { requestCode, verifyCode } from "../auth/otp.js";
import { fail, parse } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { ROLES, FAMILY } from "../lib/domain.js";

export const auth = Router();
const limiter = rateLimit({ windowMs: 10 * 60e3, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Слишком много попыток, подождите 10 минут" } });

auth.get("/me", async (req, res) => {
  const u = req.user;
  if (!u) return res.json({ user: null });
  const org = u.org_id ? await one(`SELECT id, name, slug, kind, district_id FROM orgs WHERE id = $1`, [u.org_id]) : null;
  res.json({ user: { ...u, role_label: ROLES[u.role], org } });
});

auth.post("/logout", async (req, res) => { clearSession(res); res.json({ ok: true }); });

/* --- ЭЦП --- */
auth.post("/ecp/challenge", limiter, async (_req, res) => res.json(await createChallenge()));
auth.post("/ecp/login", limiter, async (req, res) => {
  const { nonce, cms } = parse(z.object({ nonce: z.string(), cms: z.string().min(100) }), req.body);
  await consumeChallenge(nonce);
  const { iin } = await verifyCms(cms, Buffer.from(`bilim-portal-login:${nonce}`).toString("base64"));
  const user = await one(`SELECT id FROM users WHERE iin = $1 AND active AND role NOT IN ('parent','student')`, [iin]);
  if (!user) fail(403, "Для вашего ИИН нет доступа к платформе. Обратитесь к администратору района или руководителю.");
  issueSession(res, user!.id);
  const u = await loadUserById(user!.id);
  await audit(u, "Вход по ЭЦП", u?.org_id);
  res.json({ ok: true });
});

/* --- SMS для семей --- */
auth.post("/otp/request", limiter, async (req, res) => {
  const { phone } = parse(z.object({ phone: z.string() }), req.body);
  res.json(await requestCode(phone));
});
auth.post("/otp/verify", limiter, async (req, res) => {
  const { phone, code } = parse(z.object({ phone: z.string(), code: z.string().min(4).max(8) }), req.body);
  const id = await verifyCode(phone, code);
  issueSession(res, id);
  res.json({ ok: true });
});

/* --- Демо-вход (только при AUTH_DEV_LOGIN=true) --- */
auth.get("/dev/users", async (_req, res) => {
  if (!env.AUTH_DEV_LOGIN) return res.json({ enabled: false, users: [] });
  const users = await q(`SELECT u.id, u.full_name, u.role, u.note, o.name AS org_name, d.name AS district_name
      FROM users u LEFT JOIN orgs o ON o.id = u.org_id LEFT JOIN districts d ON d.id = u.district_id
     WHERE u.active ORDER BY array_position(ARRAY['operator','region','observer','district','head','editor','author','teacher','personnel','parent','student'], u.role), u.created_at
     LIMIT 300`);
  res.json({ enabled: true, users: users.map((u) => ({ ...u, role_label: ROLES[u.role as keyof typeof ROLES], family: FAMILY.includes(u.role) })) });
});
auth.post("/dev", async (req, res) => {
  if (!env.AUTH_DEV_LOGIN) fail(404, "Не найдено");
  const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
  const u = await loadUserById(userId);
  if (!u) fail(404, "Пользователь не найден или отключён");
  issueSession(res, userId);
  res.json({ ok: true });
});

/* --- Вход по логину и паролю (тестовые учётные записи, пароль DEMO_PASSWORD) --- */
export const DEMO_LOGINS: Record<string, { iin?: string; phone?: string }> = {
  operator: { iin: "000000000001" }, region: { iin: "000000000002" }, akimat: { iin: "000000000003" },
  district: { iin: "000000000004" }, director: { iin: "000000000005" }, editor: { iin: "000000000006" },
  teacher: { iin: "000000000007" }, staff: { iin: "000000000008" }, kg_teacher: { iin: "000000000009" },
  author: { iin: "000000000010" }, parent: { phone: "+77010000001" }, parent_kg: { phone: "+77010000002" },
  student: { phone: "+77010000003" },
};
auth.get("/password/logins", async (_req, res) => {
  if (!env.AUTH_DEV_LOGIN) return res.json({ enabled: false, logins: [] });
  const out = [];
  for (const [login, k] of Object.entries(DEMO_LOGINS)) {
    const u = await one(`SELECT full_name, role, note FROM users WHERE active AND ${k.iin ? "iin" : "phone"} = $1 LIMIT 1`, [k.iin ?? k.phone]);
    if (u) out.push({ login, full_name: u.full_name, role_label: ROLES[u.role as keyof typeof ROLES], note: u.note });
  }
  res.json({ enabled: true, logins: out });
});
auth.post("/password", limiter, async (req, res) => {
  const { login, password } = parse(z.object({ login: z.string().trim().toLowerCase(), password: z.string() }), req.body);
  const k = DEMO_LOGINS[login];
  if (!k || password !== env.DEMO_PASSWORD) fail(401, "Неверный логин или пароль");
  const u = await one(`SELECT id FROM users WHERE active AND ${k!.iin ? "iin" : "phone"} = $1 LIMIT 1`, [k!.iin ?? k!.phone]);
  if (!u) fail(404, "Демо-пользователь не найден. Включите SEED_DEMO=true и перезапустите.");
  issueSession(res, u!.id);
  const full = await loadUserById(u!.id);
  await audit(full, "Вход по демо-паролю", full?.org_id);
  res.json({ ok: true });
});

auth.get("/check", async (req, res) => { requireUser(req); res.json({ ok: true }); });
