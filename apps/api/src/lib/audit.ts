import { q } from "../db.js";
import type { AuthUser } from "../auth/session.js";

export async function audit(u: AuthUser | null, action: string, orgId?: string | null) {
  let district = u?.district_id ?? null;
  if (orgId) {
    const r = await q(`SELECT district_id FROM orgs WHERE id = $1`, [orgId]);
    district = r[0]?.district_id ?? district;
  }
  await q(`INSERT INTO audit_log(user_id, user_name, role, action, org_id, district_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [u?.id ?? null, u?.full_name ?? "Посетитель", u?.role ?? "visitor", action, orgId ?? null, district]);
}
