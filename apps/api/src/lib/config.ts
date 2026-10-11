import { one, q } from "../db.js";
import { DEFAULT_REQUIRED } from "./domain.js";

export interface Requirements { school: string[]; kg: string[]; appealDays: number }
export interface Maintenance { on: boolean; text: string }

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const r = await one(`SELECT value FROM config WHERE key = $1`, [key]);
  return (r?.value as T) ?? fallback;
}
export async function setConfig(key: string, value: unknown) {
  await q(`INSERT INTO config(key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
}
export const getRequirements = () =>
  getConfig<Requirements>("requirements", { school: DEFAULT_REQUIRED, kg: DEFAULT_REQUIRED, appealDays: 10 });
export const getMaintenance = () => getConfig<Maintenance>("maintenance", { on: false, text: "" });

/** Процент заполнения обязательных разделов */
export function compliance(org: { kind: string; sections: Record<string, boolean> }, req: Requirements) {
  const list = org.kind === "school" ? req.school : req.kg;
  if (!list.length) return { score: 100, missing: [] as string[] };
  const missing = list.filter((k) => !org.sections?.[k]);
  return { score: Math.round(((list.length - missing.length) / list.length) * 100), missing };
}
