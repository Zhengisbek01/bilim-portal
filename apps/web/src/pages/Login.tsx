import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApi, useAction } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { signWithNcaLayer } from "../lib/ncalayer";
import { Banner, Tabs } from "../components/ui";

export function Login() {
  const [tab, setTab] = useState<"pwd" | "ecp" | "sms" | "dev">("ecp");
  const dev = useApi<any>("/auth/dev/users");
  const pw = useApi<any>("/auth/password/logins");
  useEffect(() => { if (pw.data?.enabled) setTab((t) => (t === "ecp" ? "pwd" : t)); }, [pw.data?.enabled]);
  const [login, setLogin] = useState(""), [password, setPassword] = useState("");
  const { refresh } = useAuth();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const done = async () => { await refresh(); nav("/cabinet"); };
  const [phone, setPhone] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState<string | null>(null), [err, setErr] = useState<string | null>(null);

  const ecp = () => run(async () => {
    setErr(null);
    const ch = await api.post("/auth/ecp/challenge");
    const cms = await signWithNcaLayer(ch.data);
    await api.post("/auth/ecp/login", { nonce: ch.nonce, cms });
    await done();
  }).then((ok) => { if (!ok) setErr("Не удалось войти. Проверьте, что NCALayer запущен и выбран ключ AUTH."); });

  const groups = [
    ["Платформа и область", ["operator", "region", "observer"]], ["Район", ["district"]],
    ["Персонал школ и детских садов", ["head", "editor", "author", "teacher", "personnel"]], ["Родители и ученики", ["parent", "student"]],
  ] as const;
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div><span className="lbl">Вход</span><h1 style={{ marginTop: 6 }}>Вход на платформу</h1></div>
      <Tabs value={tab} onChange={setTab} items={[...(pw.data?.enabled ? [["pwd", "Логин и пароль"] as ["pwd", string]] : []), ["ecp", "Сотрудникам: ЭЦП"], ["sms", "Родителям и ученикам: SMS"], ...(dev.data?.enabled && new URLSearchParams(location.search).has("dev") ? [["dev", "Демо-вход"] as ["dev", string]] : [])]} />
      {tab === "pwd" && pw.data?.enabled && <>
        <form className="login-box panel" onSubmit={async (e) => { e.preventDefault(); setErr(null);
          const ok = await run(async () => { await api.post("/auth/password", { login, password }); await done(); });
          if (!ok) setErr("Неверный логин или пароль"); }}>
          <p>Вход для сотрудников, родителей и учеников по логину и паролю, выданному администратором.</p>
          <label className="field"><span>Логин</span><input className="in" required value={login} placeholder="например, region" onChange={(e) => setLogin(e.target.value)} autoComplete="username" /></label>
          <label className="field"><span>Пароль</span><input className="in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <div><button className="btn pri" disabled={busy}>Войти</button></div>
          {err && <div className="err">{err}</div>}
        </form>
        <details className="panel" style={{ padding: "14px 18px" }}>
          <summary className="muted" style={{ cursor: "pointer" }}>Тестовые учётные записи</summary>
          <div className="accs" style={{ marginTop: 14 }}>{pw.data.logins.map((u: any) => (
            <button key={u.login} type="button" className="acc" onClick={() => setLogin(u.login)}>
              <span className="rl">{u.role_label}</span><b>{u.login}</b><span className="muted small">{[u.full_name, u.note].filter(Boolean).join(" · ")}</span></button>))}</div>
        </details>
      </>}
      {tab === "ecp" && <div className="login-box panel">
        <p>Вход для сотрудников управления, отделов образования, школ и детских садов. Подпишите запрос ключом <b>AUTH</b> в NCALayer — роль определится по ИИН.</p>
        <div><button className="btn pri" disabled={busy} onClick={ecp}>Войти с ЭЦП</button></div>
        {err && <div className="err">{err}</div>}
        <p className="muted small">NCALayer можно скачать на pki.gov.kz. Доступ выдаёт администратор района или руководитель организации.</p>
      </div>}
      {tab === "sms" && <form className="login-box panel" onSubmit={async (e) => {
        e.preventDefault();
        if (!sent) await run(async () => { const r = await api.post("/auth/otp/request", { phone }); setSent(r.phone); if (r.devCode) setCode(r.devCode); }, "Если номер зарегистрирован, придёт SMS с кодом");
        else await run(async () => { await api.post("/auth/otp/verify", { phone: sent, code }); await done(); });
      }}>
        <p>Номер телефона должен быть указан в школе или детском саду. Доступ выдаёт классный руководитель или воспитатель.</p>
        <label className="field"><span>Телефон</span><input className="in" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 7__ ___ __ __" inputMode="tel" disabled={!!sent} /></label>
        {sent && <label className="field"><span>Код из SMS</span><input className="in" required value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>}
        <div className="row"><button className="btn pri" disabled={busy}>{sent ? "Войти" : "Получить код"}</button>{sent && <button type="button" className="btn ghost" onClick={() => { setSent(null); setCode(""); }}>Другой номер</button>}</div>
      </form>}
      {tab === "dev" && dev.data?.enabled && <>
        <Banner kind="bad" title="Только для разработки">Демо-вход без ЭЦП и SMS. В рабочей среде отключите его: AUTH_DEV_LOGIN=false.</Banner>
        {groups.map(([title, roles]) => {
          const list = dev.data.users.filter((u: any) => (roles as readonly string[]).includes(u.role));
          if (!list.length) return null;
          return <div key={title} style={{ display: "grid", gap: 10 }}><h2>{title}</h2><div className="accs">{list.map((u: any) => (
            <button key={u.id} className="acc" disabled={busy} onClick={() => run(async () => { await api.post("/auth/dev", { userId: u.id }); await done(); })}>
              <span className="rl">{u.role_label}</span><b>{u.full_name}</b><span className="muted small">{[u.note, u.org_name, u.district_name].filter(Boolean).join(" · ")}</span></button>))}</div></div>;
        })}
      </>}
    </section>
  );
}
