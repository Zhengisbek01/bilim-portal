/** Кабинеты контура управления: оператор, область, наблюдатель, район (+ общие разделы замечаний и обращений) */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useMeta, REQUIRABLE, SEC } from "../../lib/meta";
import { addDays, fd, fdt, fmtDur, today } from "../../lib/format";
import { AppealPill, ConfirmButton, Empty, ErrorText, Kpi, Loading, Meter, PageHead, Tabs } from "../../components/ui";
import { ColChart, HBars, SegBar } from "../../components/charts";

/* ---------- оператор ---------- */
export function Platform() {
  const { data } = useApi<any>("/stats/platform");
  const { meta, reload } = useMeta();
  const [m, setM] = useState({ on: false, text: "" });
  useEffect(() => { if (meta) setM({ on: !!meta.maintenance, text: meta.maintenance }); }, [meta]);
  const { busy, run } = useAction();
  return (<>
    <PageHead title="Состояние платформы" sub="Оператор" />
    {!data ? <Loading /> : <>
      <div className="kpis">{data.counts.slice(0, 5).map((c: any) => <Kpi key={c.label} label={c.label} value={c.value} />)}<Kpi label="Файлов на сервере" value={data.files.n} sub={`${(Number(data.files.bytes) / 1048576).toFixed(1)} МБ`} /></div>
      <section className="panel"><h2>Нагрузка и данные</h2>
        <div className="g2"><ColChart items={data.activity.map((p: any) => ({ label: p.label, value: p.value }))} title="Действия пользователей за 14 дней" unit="по всей области" /><HBars title="Учётные записи по ролям" items={data.usersByRole} /></div>
        <HBars title="Записей в базе" items={data.counts} />
      </section>
    </>}
    <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => api.put("/config/maintenance", m).then(reload), "Сохранено"); }}>
      <h2>Сообщение о техработах</h2>
      <label className="field"><span>Показывается на всех сайтах и в кабинетах</span><textarea className="in" value={m.text} onChange={(e) => setM({ ...m, text: e.target.value })} placeholder="Например: 20 октября с 22:00 до 23:00 платформа недоступна из-за обновления" /></label>
      <label className="check" style={{ border: 0 }}><input type="checkbox" checked={m.on} onChange={(e) => setM({ ...m, on: e.target.checked })} /><span>Показывать сообщение</span></label>
      <div><button className="btn pri" disabled={busy}>Сохранить</button></div>
    </form>
  </>);
}

/* ---------- мониторинг области / района ---------- */
export function Area() {
  const { me } = useAuth();
  const { data, error } = useApi<any>("/monitoring/area");
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const k = data.kpi, isDist = me!.role === "district";
  return (<>
    <PageHead title={isDist ? `Мониторинг района` : "Мониторинг сайтов области"} sub={me!.role_label}
      actions={<a className="btn" href="/api/monitoring/export.csv">Выгрузить CSV</a>} />
    <div className="kpis">
      <Kpi label="Организаций" value={k.orgs} /><Kpi label="Среднее соответствие" value={`${k.avgScore}%`} />
      <Kpi label="Заполнены полностью" value={k.full} sub={`${Math.round((k.full / (k.orgs || 1)) * 100)}% от всех`} />
      <Kpi label="Открытых замечаний" value={k.openRemarks} sub={k.overdueRemarks ? `${k.overdueRemarks} просрочено` : undefined} />
      <Kpi label="Просроченных обращений" value={k.overdueAppeals} alert={k.overdueAppeals > 0} />
    </div>
    {data.districts && <section style={{ display: "grid", gap: 10 }}><h2>По районам</h2><div className="tbl-wrap"><table>
      <thead><tr><th>Район / город</th><th className="num">Орг.</th><th>Соответствие</th><th className="num">Заполнены</th><th className="num">Замечания</th><th className="num">Просроч. обращения</th></tr></thead>
      <tbody>{data.districts.map((d: any) => <tr key={d.id}><td className="nw">{d.name}</td><td className="num">{d.orgs}</td><td><Meter p={d.avgScore} /></td><td className="num">{d.full}</td><td className="num">{d.openRemarks}</td><td className="num">{d.overdueAppeals ? <span className="pill bad">{d.overdueAppeals}</span> : 0}</td></tr>)}</tbody>
    </table></div></section>}
    <section style={{ display: "grid", gap: 10 }}><h2>Требуют внимания</h2><div className="tbl-wrap"><table>
      <thead><tr><th>Организация</th>{!isDist && <th>Район</th>}<th>Соответствие</th><th>Не заполнено</th></tr></thead>
      <tbody>{data.worst.map((o: any) => <tr key={o.id}><td>{o.name}</td>{!isDist && <td className="nw">{o.district_name}</td>}<td><span className={`pill ${o.score >= 85 ? "ok" : o.score >= 55 ? "warn" : "bad"}`}>{o.score}%</span></td><td className="muted">{o.missing.join(", ")}</td></tr>)}</tbody>
    </table></div></section>
    <section className="panel"><h2>Статистика</h2>
      <div className="kpis"><Kpi label="Активны за 30 дней" value={k.active30} sub={`организаций из ${k.orgs}`} /><Kpi label="Публикаций за 30 дней" value={k.published30} /><Kpi label="Пользователей" value={k.users} sub="персонал и семьи" /><Kpi label="Семей подключено" value={k.families} /></div>
      <div className="g2"><ColChart items={data.histogram} title="Организации по заполненности сайта" unit="число организаций" /><ColChart items={data.activity} title="Активность за 14 дней" unit="действий в день" /></div>
      <h3>Обращения граждан</h3>
      <div className="kpis"><Kpi label="Обращений" value={data.appeals.total} /><Kpi label="Отвечено" value={data.appeals.answered} /><Kpi label="Средний срок ответа" value={fmtDur(data.appeals.avgDays)} /><Kpi label="Просрочено" value={data.appeals.overdue} alert={data.appeals.overdue > 0} /></div>
      <div className="g2"><SegBar title="Замечания" parts={[{ label: "Открыто", value: data.remarks.open, color: "warn" }, { label: "На проверке", value: data.remarks.fixed, color: "accent" }, { label: "Закрыто", value: data.remarks.closed, color: "ok" }]} />
        <HBars title="Пользователи по ролям" items={data.usersByRole} /></div>
    </section>
  </>);
}

/* ---------- организации (список, замечание, назначение руководителя) ---------- */
export function Orgs() {
  const { me } = useAuth();
  const { meta } = useMeta();
  const [q, setQ] = useState(""), [dq, setDq] = useState(""), [district, setDistrict] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ limit: "100" }); if (dq) params.set("q", dq); if (district) params.set("district", district);
  const { data, reload } = useApi<any>(`/monitoring/orgs?${params}`);
  const [form, setForm] = useState<{ t: "remark" | "head"; org: any } | null>(null);
  const canRemark = ["region", "district"].includes(me!.role);
  return (<>
    <PageHead title={me!.role === "district" ? "Организации района" : "Организации"} sub={me!.role_label} />
    {form?.t === "remark" && <RemarkForm org={form.org} onDone={() => { setForm(null); reload(); }} />}
    {form?.t === "head" && <HeadForm org={form.org} onDone={() => { setForm(null); reload(); }} />}
    <div className="row">
      <input className="in" type="search" placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} aria-label="Поиск" />
      {me!.role !== "district" && <select className="in" value={district} onChange={(e) => setDistrict(e.target.value)} style={{ maxWidth: 240 }} aria-label="Район"><option value="">Все районы</option>{meta?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      {data && <span className="muted small">{data.total} организаций{data.total > 100 ? " · показаны первые 100" : ""}</span>}
    </div>
    {!data ? <Loading /> : <div className="tbl-wrap"><table>
      <thead><tr><th>Организация</th><th>Соответствие</th><th>Руководитель на платформе</th><th className="num">Замечания</th><th /></tr></thead>
      <tbody>{data.items.map((o: any) => <tr key={o.id}>
        <td><b>{o.name}</b><div className="muted small">{o.district_name}</div></td><td><Meter p={o.score} /></td>
        <td>{o.head_name ?? <span className="muted">не назначен</span>}</td><td className="num">{o.open_remarks || "—"}</td>
        <td className="nw"><Link className="btn sm" to={`/o/${o.slug}`}>Сайт</Link>{canRemark && <> <button className="btn sm" onClick={() => setForm({ t: "remark", org: o })}>Замечание</button></>}
          {me!.role === "district" && !o.head_name && <> <button className="btn sm pri" onClick={() => setForm({ t: "head", org: o })}>Назначить</button></>}</td>
      </tr>)}</tbody></table></div>}
  </>);
}

function RemarkForm({ org, onDone }: { org: any; onDone: () => void }) {
  const [f, setF] = useState({ section: org.missing?.[0] ?? "food", text: "", due: addDays(today(), 5) });
  const { busy, run } = useAction();
  return <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/remarks", { orgId: org.id, ...f }), "Замечание направлено организации")) onDone(); }}>
    <div className="spread"><h2>Замечание: {org.name}</h2><button type="button" className="btn sm ghost" onClick={onDone}>Отмена</button></div>
    <div className="g2"><label className="field"><span>Раздел</span><select className="in" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>{REQUIRABLE.map((k) => <option key={k} value={k}>{SEC[k].ru}</option>)}</select></label>
      <label className="field"><span>Срок исправления</span><input className="in" type="date" required value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label></div>
    <label className="field"><span>Что исправить</span><textarea className="in" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Например: загрузите меню на текущую неделю" /></label>
    <div><button className="btn pri" disabled={busy}>Направить замечание</button></div>
  </form>;
}

function HeadForm({ org, onDone }: { org: any; onDone: () => void }) {
  const [f, setF] = useState({ fullName: "", iin: "", note: org.kind === "school" ? "Директор" : "Заведующая" });
  const { busy, run } = useAction();
  return <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/users", { ...f, role: "head", orgId: org.id }), "Руководитель назначен")) onDone(); }}>
    <div className="spread"><h2>Руководитель сайта: {org.name}</h2><button type="button" className="btn sm ghost" onClick={onDone}>Отмена</button></div>
    <div className="g3"><label className="field"><span>ФИО</span><input className="in" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
      <label className="field"><span>ИИН (для входа по ЭЦП)</span><input className="in" inputMode="numeric" pattern="\d{12}" value={f.iin} onChange={(e) => setF({ ...f, iin: e.target.value })} /></label>
      <label className="field"><span>Должность</span><input className="in" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label></div>
    <div><button className="btn pri" disabled={busy}>Назначить</button></div>
  </form>;
}

/* ---------- замечания (контроль и организация) ---------- */
export function Remarks() {
  const { me } = useAuth();
  const orgSide = ["head", "editor"].includes(me!.role);
  const [status, setStatus] = useState<"open" | "fixed" | "closed" | "all">(orgSide ? "open" : "fixed");
  const { data, reload } = useApi<any[]>(`/remarks?status=${status}`);
  const [open, setOpen] = useState<string | null>(null), [reply, setReply] = useState("");
  const { busy, run } = useAction();
  const act = (url: string, body: any, ok: string) => run(() => api.post(url, body), ok).then((r) => { if (r) { setOpen(null); setReply(""); reload(); } });
  return (<>
    <PageHead title="Замечания" sub={orgSide ? "От отдела и управления образования" : "Контроль исправлений"} />
    <Tabs value={status} onChange={setStatus} items={[["open", "Открытые"], ["fixed", "На проверке"], ["closed", "Закрытые"], ["all", "Все"]]} />
    {!orgSide && me!.role !== "observer" && <p className="muted small">Новое замечание направляется из раздела «Организации» кнопкой «Замечание».</p>}
    {!data ? <Loading /> : <div className="list">{data.map((r) => (
      <div key={r.id} className={`item${r.status === "fixed" && !orgSide ? " hl" : ""}`}>
        <div className="spread"><div><b>{r.section_title}</b>{!orgSide && ` · ${r.org_name}`}</div>
          {r.status === "closed" ? <span className="pill ok">Закрыто</span> : r.status === "fixed" ? <span className="pill acc">На проверке</span> : r.overdue ? <span className="pill bad">Просрочено</span> : <span className="pill warn">Открыто</span>}</div>
        <p className="pre">{r.text}</p><div className="muted small">{r.author} · {fd(r.created_at)} · срок до {fd(r.due)}</div>
        {r.reply && <p className="small"><b>Ответ организации:</b> {r.reply}</p>}
        {orgSide && r.status === "open" && (open === r.id
          ? <form className="row" onSubmit={(e) => { e.preventDefault(); act(`/remarks/${r.id}/fix`, { reply }, "Отправлено на проверку"); }}><input className="in" required value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Что сделано" style={{ flex: 1, minWidth: 200 }} /><button className="btn pri sm" disabled={busy}>Отметить исправленным</button></form>
          : <div className="row"><button className="btn sm" onClick={() => setOpen(r.id)}>Ответить и закрыть</button><Link className="btn sm ghost" to={["food", "budget", "anticorr", "docs"].includes(r.section) ? "/cabinet/documents" : "/cabinet/site"}>Перейти к разделу</Link></div>)}
        {["region", "district"].includes(me!.role) && r.status === "fixed" && <div className="row">
          <button className="btn sm pri" disabled={busy} onClick={() => act(`/remarks/${r.id}/accept`, {}, "Замечание закрыто")}>Принять</button>
          <button className="btn sm" disabled={busy} onClick={() => act(`/remarks/${r.id}/reopen`, {}, "Возвращено, новый срок — 3 дня")}>Вернуть на доработку</button></div>}
      </div>))}{!data.length && <Empty>Список пуст.</Empty>}</div>}
  </>);
}

/* ---------- обращения граждан ---------- */
export function Appeals() {
  const { me } = useAuth();
  const { data, reload } = useApi<any[]>("/appeals");
  const [open, setOpen] = useState<string | null>(null), [ans, setAns] = useState(""), [pub, setPub] = useState(false);
  const { busy, run } = useAction();
  const orgSide = ["head", "editor"].includes(me!.role);
  return (<>
    <PageHead title="Обращения граждан" sub={orgSide ? "Блог руководителя" : "Контроль сроков"} />
    {me!.role === "editor" && <p className="muted small">Отвечает руководитель. Редактор видит обращения, чтобы подготовить ответ.</p>}
    {!data ? <Loading /> : <div className="list">{data.map((a) => (
      <div key={a.id} className={`item${a.overdue ? " hl" : ""}`}>
        <div className="spread"><div><b className="mono">{a.id}</b> · {a.name}{!orgSide && ` · ${a.org_name}`}</div><AppealPill a={a} /></div>
        <p className="pre">{a.text}</p>
        <div className="muted small">{fd(a.created_at)} · ответить до {fd(a.deadline)}{a.contact && ` · контакт: ${a.contact}`}</div>
        {a.answer && <p className="small"><b>Ответ:</b> {a.answer}{a.is_public && <> <span className="pill t">опубликован на сайте</span></>}</p>}
        {me!.role === "head" && a.status !== "answered" && (open === a.id
          ? <form className="field" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/appeals/${a.id}/answer`, { answer: ans, isPublic: pub }), "Ответ отправлен")) { setOpen(null); setAns(""); reload(); } }}>
              <textarea className="in" required value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Ответ заявителю" />
              <label className="check" style={{ border: 0 }}><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /><span>Опубликовать вопрос и ответ на сайте без персональных данных</span></label>
              <div className="row"><button className="btn pri sm" disabled={busy}>Отправить ответ</button><button type="button" className="btn sm ghost" onClick={() => setOpen(null)}>Отмена</button></div></form>
          : <div className="row"><button className="btn sm pri" onClick={() => setOpen(a.id)}>Ответить</button>{a.status === "new" && <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/appeals/${a.id}/work`), "Взято в работу").then(reload)}>Взять в работу</button>}</div>)}
      </div>))}{!data.length && <Empty>{orgSide ? "Обращений пока нет. Они приходят из раздела «Блог руководителя» на сайте." : "Открытых обращений нет."}</Empty>}</div>}
  </>);
}

/* ---------- объявления на сайтах ---------- */
export function Announcements() {
  const { me } = useAuth();
  const { data, reload } = useApi<any[]>("/announcements");
  const [f, setF] = useState({ text: "", until: addDays(today(), 3) });
  const { busy, run } = useAction();
  return (<>
    <PageHead title="Объявления на сайтах" sub={me!.role === "region" ? "На все сайты области" : "На сайты района"} />
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/announcements", f), "Объявление опубликовано на сайтах")) { setF({ ...f, text: "" }); reload(); } }}>
      <label className="field"><span>Текст объявления</span><textarea className="in" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Например: занятия отменены из-за сильных морозов для учащихся 1–5 классов" /></label>
      <label className="field" style={{ maxWidth: 220 }}><span>Показывать до</span><input className="in" type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></label>
      <div><button className="btn pri" disabled={busy}>Опубликовать на сайтах</button></div>
    </form>
    {!data ? <Loading /> : <div className="list">{data.map((a) => {
      const ended = a.until && a.until < today();
      const mine = me!.role === "region" || a.scope === me!.district_id;
      return <div key={a.id} className="item"><div className="spread"><span className={`pill ${ended ? "t" : "acc"}`}>{a.scope === "region" ? "Вся область" : "Район"}{ended ? " · завершено" : ""}</span>
        {mine && <ConfirmButton onConfirm={() => run(() => api.del(`/announcements/${a.id}`), "Объявление снято").then(reload)}>Снять</ConfirmButton>}</div>
        <p className="pre">{a.text}</p><div className="muted small">{a.author} · {fd(a.created_at)}{a.until && ` · до ${fd(a.until)}`}</div></div>;
    })}{!data.length && <Empty>Объявлений нет.</Empty>}</div>}
  </>);
}

/* ---------- требования к сайтам ---------- */
export function Requirements() {
  const { data } = useApi<any>("/config/requirements");
  const { reload } = useMeta();
  const [f, setF] = useState<{ school: string[]; kg: string[]; appealDays: number } | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const { busy, run } = useAction();
  if (!f) return <Loading />;
  const box = (key: "school" | "kg") => REQUIRABLE.map((k) => <label key={k} className="check"><input type="checkbox" checked={f[key].includes(k)}
    onChange={(e) => setF({ ...f, [key]: e.target.checked ? [...f[key], k] : f[key].filter((x) => x !== k) })} /><span>{SEC[k].ru}</span></label>);
  return (<form style={{ display: "grid", gap: 16 }} onSubmit={(e) => { e.preventDefault(); run(() => api.put("/config/requirements", f).then(reload), "Требования сохранены"); }}>
    <PageHead title="Требования к сайтам" sub="Применяются ко всем организациям области" />
    <div className="g2"><div className="panel"><h2>Школы</h2><div>{box("school")}</div></div><div className="panel"><h2>Детские сады</h2><div>{box("kg")}</div></div></div>
    <div className="panel"><label className="field" style={{ maxWidth: 280 }}><span>Срок ответа на обращение, дней</span><input className="in" type="number" min={1} max={30} value={f.appealDays} onChange={(e) => setF({ ...f, appealDays: Number(e.target.value) })} /></label>
      <p className="muted small">Сверьте перечень с действующими требованиями МОН РК к интернет-ресурсам организаций образования. После сохранения проценты соответствия пересчитаются у всех организаций.</p>
      <div><button className="btn pri" disabled={busy}>Сохранить требования</button></div></div>
  </form>);
}

/* ---------- выдача доступа сотрудникам ---------- */
export function Users() {
  const { me } = useAuth();
  const { meta } = useMeta();
  const { data, reload } = useApi<any>("/users");
  const orgs = useApi<any>(me!.role === "district" ? "/monitoring/orgs?limit=700" : null);
  const [f, setF] = useState({ fullName: "", role: "", iin: "", note: "", orgId: "", districtId: "" });
  const { busy, run } = useAction();
  useEffect(() => { if (data?.canCreate?.length && !f.role) setF((x) => ({ ...x, role: data.canCreate[0].role })); }, [data]); // eslint-disable-line
  const title = { operator: "Администраторы области", region: "Администраторы и наблюдатели", district: "Руководители организаций", head: "Сотрудники", editor: "Авторы" }[me!.role as string] ?? "Доступ";
  return (<>
    <PageHead title={title} sub="Выдача доступа" />
    {!data ? <Loading /> : <>
      <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/users", f), "Доступ выдан")) { setF({ ...f, fullName: "", iin: "", note: "" }); reload(); } }}>
        <h2>Добавить</h2>
        <div className="g3">
          <label className="field"><span>ФИО</span><input className="in" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
          <label className="field"><span>Роль</span><select className="in" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{data.canCreate.map((c: any) => <option key={c.role} value={c.role}>{c.label}</option>)}</select></label>
          <label className="field"><span>ИИН (вход по ЭЦП)</span><input className="in" inputMode="numeric" pattern="\d{12}" value={f.iin} onChange={(e) => setF({ ...f, iin: e.target.value })} placeholder="12 цифр" /></label>
          <label className="field"><span>Должность</span><input className="in" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          {f.role === "district" && <label className="field"><span>Район</span><select className="in" required value={f.districtId} onChange={(e) => setF({ ...f, districtId: e.target.value })}><option value="">—</option>{meta?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
          {f.role === "head" && <label className="field"><span>Организация</span><select className="in" required value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })}><option value="">—</option>{orgs.data?.items.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        </div>
        <div><button className="btn pri" disabled={busy}>Выдать доступ</button></div>
      </form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Сотрудник</th><th>Роль</th><th>Где</th><th>ИИН</th><th>Статус</th><th /></tr></thead>
        <tbody>{data.users.map((u: any) => <tr key={u.id}>
          <td><b>{u.full_name}</b><div className="muted small">{u.note}</div></td><td>{u.role_label}</td><td>{u.org_name ?? u.district_name ?? "Область"}</td><td className="mono">{u.iin_masked ?? "—"}</td>
          <td>{u.active ? <span className="pill ok">Активен</span> : <span className="pill t">Отозван</span>}</td>
          <td className="nw">{u.active ? <ConfirmButton className="btn sm danger" onConfirm={() => run(() => api.patch(`/users/${u.id}`, { active: false }), "Доступ отозван").then(reload)}>Отозвать</ConfirmButton>
            : <button className="btn sm" onClick={() => run(() => api.patch(`/users/${u.id}`, { active: true }), "Доступ восстановлен").then(reload)}>Вернуть</button>}</td>
        </tr>)}{!data.users.length && <tr><td colSpan={6} className="muted">Пока никого нет.</td></tr>}</tbody></table></div>
    </>}
  </>);
}

/* ---------- журнал ---------- */
export function AuditLog() {
  const { data } = useApi<any[]>("/log");
  return (<>
    <PageHead title="Журнал действий" sub="Кто, что и когда изменил" />
    {!data ? <Loading /> : <div className="tbl-wrap"><table>
      <thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Организация</th></tr></thead>
      <tbody>{data.map((l) => <tr key={l.id}><td className="nw mono">{fdt(l.at)}</td><td>{l.user_name}</td><td>{l.action}</td><td className="muted">{l.org_name ?? "—"}</td></tr>)}
        {!data.length && <tr><td colSpan={4} className="muted">Записей пока нет.</td></tr>}</tbody></table></div>}
  </>);
}
