import { useState, type ReactNode } from "react";
import { useToastMessage } from "../lib/hooks";
import { level, levelTxt, fd } from "../lib/format";

export const PageHead = ({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) => (
  <div className="spread"><div>{sub && <span className="lbl">{sub}</span>}<h1 style={{ marginTop: sub ? 6 : 0 }}>{title}</h1></div>{actions}</div>
);
export const Kpi = ({ label, value, sub, alert }: { label: string; value: ReactNode; sub?: ReactNode; alert?: boolean }) => (
  <div className={`kpi${alert ? " alert" : ""}`}><span className="lbl">{label}</span><b>{value}</b>{sub ? <span className="muted small">{sub}</span> : null}</div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="muted small">Загрузка…</div>;
export const ErrorText = ({ error }: { error: string | null }) => (error ? <div className="err">{error}</div> : null);
export const ScorePill = ({ p }: { p: number }) => <span className={`pill ${level(p)}`}>{p}% · {levelTxt(p)}</span>;
export const Meter = ({ p, color }: { p: number; color?: string }) => (
  <div className="bar-cell"><div className="meter"><i style={{ width: `${Math.min(100, p)}%`, background: `var(--${color ?? level(p)})` }} /></div><span>{Math.round(p)}%</span></div>
);
export const Banner = ({ kind = "sun", title, children }: { kind?: "sun" | "bad" | "info"; title?: string; children: ReactNode }) => (
  <div className={`banner ${kind}`}>{title && <b style={{ whiteSpace: "nowrap" }}>{title}</b>}<span>{children}</span></div>
);
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return <div className="tabs" role="tablist">{items.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Toast() { const m = useToastMessage(); return m ? <div className="toast" role="status">{m}</div> : null; }

/** Кнопка удаления с подтверждением вторым нажатием (без системных диалогов) */
export function ConfirmButton({ onConfirm, children = "Удалить", className = "btn sm ghost danger", disabled }: { onConfirm: () => void; children?: ReactNode; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return <button type="button" className={className} disabled={disabled} onBlur={() => setArmed(false)}
    onClick={() => { if (armed) { setArmed(false); onConfirm(); } else { setArmed(true); setTimeout(() => setArmed(false), 3000); } }}>{armed ? "Нажмите ещё раз" : children}</button>;
}

export const STATUS_POST: Record<string, ReactNode> = {
  draft: <span className="pill t">Черновик</span>, review: <span className="pill acc">На проверке</span>,
  published: <span className="pill ok">Опубликовано</span>, returned: <span className="pill warn">Возвращено</span>,
};
export function AppealPill({ a }: { a: { status: string; overdue?: boolean } }) {
  if (a.status === "answered") return <span className="pill ok">Ответ дан</span>;
  if (a.overdue) return <span className="pill bad">Просрочено</span>;
  return a.status === "work" ? <span className="pill warn">В работе</span> : <span className="pill acc">Новое</span>;
}
export function DueBadge({ due, done }: { due?: string | null; done?: boolean }) {
  if (done) return <span className="pill ok">Выполнено</span>;
  if (!due) return <span className="pill t">без срока</span>;
  const t = new Date().toISOString().slice(0, 10);
  return due < t ? <span className="pill bad">Просрочено · {fd(due)}</span> : <span className="pill warn">до {fd(due)}</span>;
}
