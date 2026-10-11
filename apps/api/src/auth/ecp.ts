/**
 * Вход по ЭЦП (НУЦ РК).
 * 1) Клиент получает одноразовый nonce: POST /api/auth/ecp/challenge
 * 2) Подписывает его в NCALayer (detached CMS) и отправляет: POST /api/auth/ecp/login {nonce, cms}
 * 3) Сервер проверяет подпись в NCANode (с OCSP-проверкой отзыва) и находит пользователя по ИИН.
 */
import crypto from "node:crypto";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { fail } from "../lib/http.js";

export async function createChallenge() {
  const nonce = crypto.randomBytes(24).toString("hex");
  await q(`DELETE FROM auth_challenges WHERE expires_at < now()`);
  await q(`INSERT INTO auth_challenges(nonce, expires_at) VALUES ($1, now() + interval '5 minutes')`, [nonce]);
  return { nonce, data: Buffer.from(`bilim-portal-login:${nonce}`).toString("base64") };
}

export async function consumeChallenge(nonce: string) {
  const r = await one(`DELETE FROM auth_challenges WHERE nonce = $1 AND expires_at > now() RETURNING nonce`, [nonce]);
  if (!r) fail(400, "Срок подписи истёк, попробуйте ещё раз");
}

/** Ищет ИИН в ответе NCANode (структура ответа отличается между версиями) */
function findIin(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === "iin" && typeof v === "string" && /^\d{12}$/.test(v)) return v;
    if (typeof v === "string") {
      const m = v.match(/(?:SERIALNUMBER=)?IIN(\d{12})/);
      if (m) return m[1];
    }
    if (typeof v === "object") { const r = findIin(v); if (r) return r; }
  }
  return null;
}

export async function verifyCms(cms: string, dataB64: string): Promise<{ iin: string }> {
  if (!env.NCANODE_URL) fail(503, "Вход по ЭЦП не настроен: задайте NCANODE_URL");
  const res = await fetch(`${env.NCANODE_URL.replace(/\/$/, "")}/cms/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cms, data: dataB64, revocationCheck: ["OCSP"] }),
  }).catch(() => fail(503, "Сервис проверки ЭЦП недоступен"));
  const body: any = await (res as Response).json().catch(() => ({}));
  if (!(res as Response).ok || body.valid !== true) fail(401, "Подпись не прошла проверку или сертификат отозван");
  const iin = findIin(body.signers ?? body);
  if (!iin) fail(401, "Не удалось определить ИИН владельца сертификата");
  return { iin: iin! };
}
