import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DemoAccess, DEMO_PASSWORD } from "../components/DemoAccess";
import { api } from "../lib/api";
import { useAction } from "../lib/hooks";
import { useAuth } from "../lib/auth";

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [sp] = useSearchParams();
  const [login, setLogin] = useState(sp.get("u") ?? ""), [password, setPassword] = useState(sp.get("u") ? DEMO_PASSWORD : ""), [err, setErr] = useState<string | null>(null);

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
    <section style={{ display: "grid", gap: 18, maxWidth: 1000 }}>
      <div><span className="lbl">Вход</span><h1 style={{ marginTop: 6 }}>Вход на платформу</h1></div>
      <form className="login-box panel" onSubmit={submit} style={{ maxWidth: 560 }}>
        <label className="field"><span>Логин</span><input className="in" required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" /></label>
        <label className="field"><span>Пароль</span><input className="in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <div><button className="btn pri" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></div>
        {err && <div className="err">{err}</div>}
      </form>
      <DemoAccess onPick={(l) => { setLogin(l); setPassword(DEMO_PASSWORD); }} />
    </section>
  );
}
