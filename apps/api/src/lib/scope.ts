/**
 * Область видимости данных — главная гарантия того, что каждая роль видит только свои данные.
 * Все запросы к данным организаций проходят через эти функции.
 */
import { one, q } from "../db.js";
import { forbid, notFound } from "./http.js";
import type { AuthUser } from "../auth/session.js";
import { REGION_LEVEL } from "./domain.js";

export const isRegionLevel = (u: AuthUser) => REGION_LEVEL.includes(u.role);

/** SQL-условие для таблицы организаций с алиасом `alias`. Дописывает параметры в params. */
export function orgWhere(u: AuthUser, alias: string, params: unknown[]): string {
  if (isRegionLevel(u)) return "TRUE";
  if (u.role === "district") { params.push(u.district_id); return `${alias}.district_id = $${params.length}`; }
  params.push(u.org_id); return `${alias}.id = $${params.length}`;
}

export async function getOrg(orgId: string) {
  const o = await one(`SELECT * FROM orgs WHERE id = $1`, [orgId]);
  if (!o) notFound("Организация не найдена");
  return o!;
}

/** Проверяет, что организация входит в зону пользователя */
export async function assertOrg(u: AuthUser, orgId: string) {
  const o = await getOrg(orgId);
  if (isRegionLevel(u)) return o;
  if (u.role === "district" && o.district_id === u.district_id) return o;
  if (u.org_id === orgId) return o;
  return forbid("Организация вне вашей зоны ответственности");
}

/** Классы, которые ведёт педагог */
export async function teacherClassIds(u: AuthUser): Promise<string[]> {
  return (await q(`SELECT id FROM classes WHERE teacher_id = $1`, [u.id])).map((r) => r.id);
}

/** Дети, к которым у родителя/ученика есть доступ */
export async function familyPupilIds(u: AuthUser): Promise<string[]> {
  if (u.role === "student") return u.pupil_id ? [u.pupil_id] : [];
  if (u.role === "parent") return (await q(`SELECT pupil_id FROM parent_children WHERE user_id = $1`, [u.id])).map((r) => r.pupil_id);
  return [];
}

/**
 * Доступ к ребёнку: педагог его класса, руководитель его организации,
 * родитель с привязкой, сам ученик.
 */
export async function assertPupil(u: AuthUser, pupilId: string, mode: "read" | "teacher" = "read") {
  const p = await one(`SELECT p.*, c.teacher_id, c.name AS class_name, c.kind AS class_kind FROM pupils p JOIN classes c ON c.id = p.class_id WHERE p.id = $1`, [pupilId]);
  if (!p) return notFound("Ученик не найден");
  if (u.role === "teacher" && p.teacher_id === u.id) return p;
  if (mode === "teacher") {
    if (u.role === "head" && u.org_id === p.org_id) return p;
    return forbid();
  }
  if (u.role === "head" && u.org_id === p.org_id) return p;
  if ((u.role === "parent" || u.role === "student") && (await familyPupilIds(u)).includes(pupilId)) return p;
  return forbid("Нет доступа к данным этого ребёнка");
}

/** Доступ к классу: педагог класса, руководитель организации; семьи — только чтение */
export async function assertClass(u: AuthUser, classId: string, mode: "read" | "manage" = "read") {
  const c = await one(`SELECT * FROM classes WHERE id = $1`, [classId]);
  if (!c) return notFound("Класс не найден");
  if (u.role === "teacher" && c.teacher_id === u.id) return c;
  if (u.role === "head" && u.org_id === c.org_id) return c;
  if (mode === "read" && (u.role === "parent" || u.role === "student")) {
    const ids = await familyPupilIds(u);
    if (ids.length) {
      const hit = await one(`SELECT 1 FROM pupils WHERE class_id = $1 AND id = ANY($2::uuid[])`, [classId, ids]);
      if (hit) return c;
    }
  }
  return forbid("Нет доступа к этому классу");
}
