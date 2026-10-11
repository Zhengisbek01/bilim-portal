/** Вход родителей и учеников по SMS-коду */
import crypto from "node:crypto";
import { env } from "../env.js";
import { q, one } from "../db.js";
import { fail } from "../lib/http.js";

export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (!/^7\d{10}$/.test(d)) fail(400, "Введите номер в формате +7 7XX XXX XX XX");
  return "+" + d;
}
const hash = (phone: string, code: string) => crypto.createHmac("sha256", env.JWT_SECRET).update(`${phone}:${code}`).digest("hex");

async function sendSms(phone: string, textMsg: string) {
  if (env.SMS_PROVIDER === "mobizon") {
    const url = new URL("/service/message/sendsmsmessage", env.MOBIZON_API_URL);
    url.searchParams.set("apiKey", env.MOBIZON_API_KEY);
    url.searchParams.set("recipient", phone.replace("+", ""));
    url.searchParams.set("text", textMsg);
    const r = await fetch(url, { method: "POST" }).catch(() => null);
    if (!r || !r.ok) fail(502, "Не удалось отправить SMS, попробуйте позже");
    return;
  }
  console.log(`[SMS → ${phone}] ${textMsg}`);
}

export async function requestCode(phoneRaw: string) {
  const phone = normalizePhone(phoneRaw);
  const user = await one(`SELECT id FROM users WHERE phone = $1 AND active AND role IN ('parent','student')`, [phone]);
  // Не раскрываем, есть ли номер в системе
  if (!user) return { phone, sent: true };
  const code = String(crypto.randomInt(100000, 1000000));
  await q(`INSERT INTO otp_codes(phone, code_hash, expires_at, attempts) VALUES ($1,$2, now() + interval '5 minutes', 0)
           ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`, [phone, hash(phone, code)]);
  await sendSms(phone, `Код для входа в Білім порталы: ${code}. Никому не сообщайте его.`);
  return { phone, sent: true, ...(env.NODE_ENV !== "production" && env.SMS_PROVIDER === "console" ? { devCode: code } : {}) };
}

export async function verifyCode(phoneRaw: string, code: string): Promise<string> {
  const phone = normalizePhone(phoneRaw);
  const row = await one(`SELECT * FROM otp_codes WHERE phone = $1`, [phone]);
  if (!row || new Date(row.expires_at) < new Date()) fail(400, "Код устарел, запросите новый");
  if (row!.attempts >= 5) fail(429, "Слишком много попыток, запросите новый код");
  if (row!.code_hash !== hash(phone, code.trim())) {
    await q(`UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1`, [phone]);
    fail(400, "Неверный код");
  }
  await q(`DELETE FROM otp_codes WHERE phone = $1`, [phone]);
  const user = await one(`SELECT id FROM users WHERE phone = $1 AND active AND role IN ('parent','student') ORDER BY role LIMIT 1`, [phone]);
  if (!user) fail(404, "Учётная запись не найдена");
  return user!.id;
}
