import { q } from "../db.js";
import { addDays, today } from "./http.js";

export type Point = { label: string; value: number };
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Число записей журнала по дням за последние n дней */
export async function activity(where: string, params: unknown[], days = 14): Promise<Point[]> {
  const from = addDays(today(), -(days - 1));
  const rows = await q(`SELECT at FROM audit_log l WHERE ${where} AND l.at >= $${params.length + 1}::date`, [...params, from]);
  const cnt: Record<string, number> = {};
  for (let i = 0; i < days; i++) cnt[addDays(from, i)] = 0;
  rows.forEach((r) => { const k = localIso(new Date(r.at)); if (k in cnt) cnt[k]++; });
  return Object.entries(cnt).map(([k, v]) => ({ label: ddmm(k), value: v }));
}

/** Количество дат по неделям (с понедельника), последние n недель */
export function perWeek(dates: (string | Date)[], weeks = 8): Point[] {
  const t = today(), dow = (new Date(t + "T12:00:00").getDay() + 6) % 7, mon = addDays(t, -dow);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(mon, -7 * (weeks - 1 - i)));
  const isos = dates.map((d) => localIso(new Date(d)));
  return starts.map((s) => ({ label: ddmm(s), value: isos.filter((d) => d >= s && d < addDays(s, 7)).length }));
}

export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const daysBetween = (a: string | Date, b: string | Date) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5;

export async function appealStats(where: string, params: unknown[], appealDays: number) {
  const rows = await q(`SELECT a.status, a.created_at, a.answered_at FROM appeals a JOIN orgs o ON o.id = a.org_id WHERE ${where}`, params);
  const t = today();
  const answered = rows.filter((r) => r.status === "answered" && r.answered_at);
  return {
    total: rows.length,
    answered: answered.length,
    avgDays: avg(answered.map((r) => daysBetween(r.created_at, r.answered_at))),
    overdue: rows.filter((r) => r.status !== "answered" && addDays(localIso(new Date(r.created_at)), appealDays) < t).length,
  };
}
