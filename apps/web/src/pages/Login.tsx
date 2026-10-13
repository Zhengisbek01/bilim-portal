import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAction } from "../lib/hooks";
import { useAuth } from "../lib/auth";

/** Тестовые учётные записи (пароль у всех: Bilim2026) */
const TEST_USERS: [string, string, string][] = [
  ["region", "Администратор области", "Управление образования"],
  ["akimat", "Наблюдатель акимата", "Только просмотр отчётов"],
  ["operator", "Оператор платформы", "Сервисная служба"],
  ["district", "Администратор района", "Отдел образования г. Талдыкорган"],
  ["director", "Руководитель", "Директор школы"],
  ["editor", "Редактор", "Заместитель директора"],
  ["author", "Автор", "Учитель физкультуры"],
  ["teacher", "Педагог", "Классный руководитель 5 «А»"],
  ["kg_teacher", "Педагог", "Воспитатель детского сада"],
  ["staff", "Сотрудник", "Медицинская сестра"],
  ["parent", "Родитель", "Мама ученицы 5 «А»"],
  ["parent_kg", "Родитель", "Папа воспитанника детсада"],
  ["student", "Ученик", "5 «А»"],
];

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [login, setLogin] = useState(""), [password, setPassword] = useState(""), [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let msg = "Неверный логин или пароль";
    const ok = await run(async () => {
      try { await api.post("/auth/password", { login, password }); }
      catch (e: any) { if (e?.status !== 401) msg = `Сервер не отвечает, попробуйте через минуту${e?.status ? ` (код ${e.status})` : ""}`; throw e; }
      await refresh(); nav("/cabinet");
    });
    if (!ok) setErr(msg);
  };

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div><span className="lbl">Вход</span><h1 style={{ marginTop: 6 }}>Вход на платформу</h1></div>
      <form className="login-box panel" onSubmit={submit}>
        <label className="field"><span>Логин</span><input className="in" required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" /></label>
        <label className="field"><span>Пароль</span><input className="in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <div><button className="btn pri" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></div>
        {err && <div className="err">{err}</div>}
      </form>
      <details className="panel" style={{ padding: "14px 18px" }}>
        <summary className="muted" style={{ cursor: "pointer" }}>Тестовые учётные записи · пароль <b>Bilim2026</b></summary>
        <div className="accs" style={{ marginTop: 14 }}>{TEST_USERS.map(([l, role, who]) => (
          <button key={l} type="button" className="acc" onClick={() => { setLogin(l); setPassword("Bilim2026"); }}>
            <span className="rl">{role}</span><b>{l}</b><span className="muted small">{who}</span></button>))}</div>
      </details>
    </section>
  );
}
