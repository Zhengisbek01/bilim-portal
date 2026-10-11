import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Role = "operator" | "region" | "observer" | "district" | "head" | "editor" | "author" | "teacher" | "personnel" | "parent" | "student";
export interface Me {
  id: string; full_name: string; role: Role; role_label: string; org_id: string | null; district_id: string | null;
  pupil_id: string | null; note: string; org_kind: "school" | "kg" | null; org: { id: string; name: string; slug: string; kind: string } | null;
}
interface Ctx { me: Me | null; ready: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ me: null, ready: false, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { const r = await api.get<{ user: Me | null }>("/auth/me"); setMe(r.user); } catch { setMe(null); } finally { setReady(true); }
  }, []);
  const logout = useCallback(async () => { await api.post("/auth/logout"); setMe(null); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <AuthCtx.Provider value={{ me, ready, refresh, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
