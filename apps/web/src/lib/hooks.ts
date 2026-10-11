import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Загрузка данных с API. reload() — перезапрос после изменений. */
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) { setData(null); setLoading(false); return; }
    const my = ++seq.current;
    setLoading(true);
    try { const d = await api.get<T>(url); if (my === seq.current) { setData(d); setError(null); } }
    catch (e: any) { if (my === seq.current) setError(e.message); }
    finally { if (my === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Обёртка над действием: блокирует кнопку, показывает ошибку/успех */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); return true; }
    catch (e: any) { toast(e.message || "Ошибка"); return false; }
    finally { setBusy(false); }
  }, []);
  return { busy, run };
}

/* Простая глобальная всплывашка */
type Listener = (m: string | null) => void;
const listeners = new Set<Listener>();
let timer: any;
export function toast(m: string) { listeners.forEach((l) => l(m)); clearTimeout(timer); timer = setTimeout(() => listeners.forEach((l) => l(null)), 2800); }
export function useToastMessage() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { listeners.add(setM); return () => { listeners.delete(setM); }; }, []);
  return m;
}
