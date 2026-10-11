import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { one } from "../db.js";
import { fail } from "../lib/http.js";
import type { Role } from "../lib/domain.js";

export interface AuthUser {
  id: string;
  full_name: string;
  role: Role;
  org_id: string | null;
  district_id: string | null; // район пользователя или его организации
  pupil_id: string | null;
  note: string;
  org_kind: "school" | "kg" | null;
}
declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

const COOKIE = "bp_session";
const TTL_DAYS = 7;

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ uid: userId }, env.JWT_SECRET, { expiresIn: `${TTL_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: env.COOKIE_SECURE, maxAge: TTL_DAYS * 864e5, path: "/",
  });
}
export function clearSession(res: Response) { res.clearCookie(COOKIE, { path: "/" }); }

export async function loadUserById(id: string): Promise<AuthUser | null> {
  const u = await one<AuthUser>(
    `SELECT u.id, u.full_name, u.role, u.org_id, COALESCE(u.district_id, o.district_id) AS district_id,
            u.pupil_id, u.note, o.kind AS org_kind
       FROM users u LEFT JOIN orgs o ON o.id = u.org_id
      WHERE u.id = $1 AND u.active`, [id]);
  return u;
}

/** Подгружает пользователя из cookie (если есть). Не требует входа. */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, env.JWT_SECRET) as { uid: string };
      req.user = (await loadUserById(uid)) ?? undefined;
    } catch { /* просроченный или поддельный токен — гость */ }
  }
  next();
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) fail(401, "Требуется вход");
  return req.user!;
}
export function requireRole(req: Request, ...roles: Role[]): AuthUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) fail(403, "Раздел недоступен для вашей роли");
  return u;
}
