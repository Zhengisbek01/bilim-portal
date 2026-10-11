const pad = (n: number) => String(n).padStart(2, "0");
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** 'YYYY-MM-DD' или ISO-время → ДД.ММ.ГГГГ */
export const fd = (v?: string | null) => {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join(".");
  return new Date(v).toLocaleDateString("ru-RU");
};
export const fdt = (v?: string | null) => (v ? new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
export const fmtDur = (d: number | null | undefined) => (d == null ? "—" : d < 1 ? `${Math.max(1, Math.round(d * 24))} ч` : `${d.toFixed(1).replace(".", ",")} дн.`);
export const level = (p: number) => (p >= 85 ? "ok" : p >= 55 ? "warn" : "bad");
export const levelTxt = (p: number) => (p >= 85 ? "Заполнен" : p >= 55 ? "Частично" : "Не заполнен");
export const initials = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("");
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
