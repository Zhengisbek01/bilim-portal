/** Кабинет педагога / воспитателя */
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { addDays, fd, fmtDur, today } from "../../lib/format";
import { ConfirmButton, DueBadge, Empty, Kpi, Loading, PageHead } from "../../components/ui";
import { ColChart, HBars, SegBar } from "../../components/charts";
import { Chat } from "../../components/Chat";

/** Выбранный класс педагога (если их несколько) */
function useMyClass() {
  const { data } = useApi<any[]>("/classes");
  const [id, setId] = useState<string | null>(() => sessionStorage.getItem("bp-class"));
  const cls = data?.find((c) => c.id === id) ?? data?.[0] ?? null;
  const pick = (v: string) => { setId(v); try { sessionStorage.setItem("bp-class", v); } catch { /* приватный режим */ } };
  const switcher = data && data.length > 1 ? <div className="chips">{data.map((c) => <button key={c.id} className="chip" aria-pressed={cls?.id === c.id} onClick={() => pick(c.id)}>{c.name}</button>)}</div> : null;
  return { classes: data, cls, switcher, loading: !data };
}
const NoClass = ({ title }: { title: string }) => <><PageHead title={title} /><Empty>Вам ещё не назначен класс или группа. Обратитесь к руководителю организации.</Empty></>;

export function TeacherOverview() {
  const { cls, switcher, loading } = useMyClass();
  const { data } = useApi<any>(cls ? `/stats/teacher?classId=${cls.id}` : null);
  if (loading) return <Loading />;
  if (!cls) return <NoClass title="Обзор" />;
  if (!data) return <Loading />;
  const sch = data.class.kind === "class";
  return (<>
    <PageHead title="Обзор" sub={data.class.name} />{switcher}
    <div className="kpis">
      <Kpi label={sch ? "Учеников" : "Детей"} value={data.pupils} />
      <Kpi label="Родители подключены" value={`${data.pupils ? Math.round((data.withParents / data.pupils) * 100) : 0}%`} sub={`${data.withParents} из ${data.pupils}`} />
      <Kpi label={sch ? "Заданий за 30 дней" : "Объявлений за 30 дней"} value={data.posts30} />
      {sch && <Kpi label="Средняя выполняемость" value={data.avgCompletion == null ? "—" : `${data.avgCompletion}%`} sub="по отметкам учеников" />}
      <Kpi label="Новых сообщений" value={data.unread} sub="от родителей" alert={data.unread > 0} />
      <Kpi label="Средний ответ родителям" value={fmtDur(data.avgReplyDays)} />
    </div>
    {sch && (data.completion.length ? <section className="panel"><ColChart items={data.completion} title="Выполнение домашних заданий" unit="% учеников класса, по сроку сдачи" /></section> : <Empty>Статистика выполнения появится после первого домашнего задания.</Empty>)}
    <div className="g2">
      <div className="panel"><HBars title={sch ? "Выполнено заданий по ученикам" : "Сообщений от семей"} items={data.byPupil} max={sch ? 100 : undefined} unit={sch ? "%" : ""} colorFn={sch ? (v) => (v < 50 ? "warn" : "ok") : undefined} /></div>
      <div className="panel"><SegBar title="Мои материалы для сайта" parts={[{ label: "Опубликовано", value: data.myPosts.published, color: "ok" }, { label: "На проверке", value: data.myPosts.review, color: "accent" }, { label: "Возвращено", value: data.myPosts.returned, color: "warn" }]} /></div>
    </div>
  </>);
}

export function MyClass() {
  const { me } = useAuth();
  const { cls, switcher, loading } = useMyClass();
  const { data, reload } = useApi<any>(cls ? `/classes/${cls.id}/pupils` : null);
  const [name, setName] = useState("");
  const [acc, setAcc] = useState<{ role: "parent" | "student"; pupil: any } | null>(null);
  const [af, setAf] = useState({ fullName: "", phone: "", relation: "" });
  const [chat, setChat] = useState<string | null>(null);
  const { busy, run } = useAction();
  if (loading) return <Loading />;
  if (!cls) return <NoClass title={me!.org_kind === "kg" ? "Моя группа" : "Мой класс"} />;
  const sch = cls.kind === "class";
  return (<>
    <PageHead title={cls.name} sub={me!.org?.name} />{switcher}
    {acc && <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/pupils/${acc.pupil.id}/access`, { role: acc.role, ...af }), "Доступ выдан. На этот номер можно войти по SMS")) { setAcc(null); reload(); } }}>
      <div className="spread"><h2>{acc.role === "parent" ? "Доступ родителю" : "Доступ ученику"}: {acc.pupil.full_name}</h2><button type="button" className="btn sm ghost" onClick={() => setAcc(null)}>Отмена</button></div>
      <div className="g3"><label className="field"><span>ФИО</span><input className="in" required value={af.fullName} onChange={(e) => setAf({ ...af, fullName: e.target.value })} /></label>
        <label className="field"><span>Телефон для входа</span><input className="in" required inputMode="tel" value={af.phone} onChange={(e) => setAf({ ...af, phone: e.target.value })} placeholder="+7 7__ ___ __ __" /></label>
        {acc.role === "parent" && <label className="field"><span>Кем приходится</span><input className="in" value={af.relation} onChange={(e) => setAf({ ...af, relation: e.target.value })} placeholder="Мама, папа, опекун" /></label>}</div>
      <p className="muted small">Вход по SMS-коду на этот номер. Если у родителя уже есть доступ к другому ребёнку, второй ребёнок привяжется к той же учётной записи.</p>
      <div><button className="btn pri" disabled={busy}>Выдать доступ</button></div>
    </form>}
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/classes/${cls.id}/pupils`, { fullName: name }), "Добавлено в список")) { setName(""); reload(); } }}>
      <div className="row"><label className="field" style={{ flex: 1, minWidth: 220 }}><span>Добавить {sch ? "ученика" : "ребёнка"}</span><input className="in" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Фамилия Имя" /></label>
        <button className="btn" disabled={busy} style={{ alignSelf: "end" }}>Добавить</button></div>
    </form>
    {!data ? <Loading /> : <div className="tbl-wrap"><table>
      <thead><tr><th>{sch ? "Ученик" : "Ребёнок"}</th><th>Родители на платформе</th>{sch && <th>Вход ученика</th>}{sch && <th className="num">Сдано заданий</th>}<th /></tr></thead>
      <tbody>{data.pupils.map((p: any) => <tr key={p.id}>
        <td><b>{p.full_name}</b>{p.unread > 0 && <> <span className="badge" style={{ display: "inline-grid" }}>{p.unread}</span></>}</td>
        <td>{p.parents.length ? p.parents.map((x: any) => <div key={x.id}>{x.name}{x.relation && <span className="muted small"> · {x.relation}</span>}</div>) : <span className="muted">нет</span>}</td>
        {sch && <td>{p.student_access ? <span className="pill ok">есть</span> : <span className="muted">нет</span>}</td>}
        {sch && <td className="num">{p.done}</td>}
        <td className="nw"><button className="btn sm" onClick={() => { setAcc({ role: "parent", pupil: p }); setAf({ fullName: "", phone: "", relation: "" }); window.scrollTo(0, 0); }}>Доступ родителю</button>
          {sch && !p.student_access && <> <button className="btn sm" onClick={() => { setAcc({ role: "student", pupil: p }); setAf({ fullName: p.full_name, phone: "", relation: "" }); window.scrollTo(0, 0); }}>Доступ ученику</button></>}
          {" "}<button className="btn sm ghost" onClick={() => setChat(chat === p.id ? null : p.id)}>Переписка</button>
          {" "}<ConfirmButton onConfirm={() => run(() => api.del(`/pupils/${p.id}`), "Удалено из списка").then(reload)} /></td>
      </tr>)}{!data.pupils.length && <tr><td colSpan={5} className="muted">Список пуст. Добавьте {sch ? "учеников" : "детей"} выше.</td></tr>}</tbody></table></div>}
    {chat && <section style={{ display: "grid", gap: 10 }}><h2>Переписка: {data?.pupils.find((p: any) => p.id === chat)?.full_name}</h2><Chat pupilId={chat} onRead={reload} /></section>}
  </>);
}

export function ClassPosts() {
  const { cls, switcher, loading } = useMyClass();
  const { data, reload } = useApi<any>(cls ? `/classes/${cls.id}/posts` : null);
  const sch = cls?.kind === "class";
  const [f, setF] = useState({ type: "homework", subject: "", due: addDays(today(), 2), text: "" });
  useEffect(() => { if (cls && cls.kind !== "class") setF((x) => ({ ...x, type: "announce" })); }, [cls]);
  const { busy, run } = useAction();
  if (loading) return <Loading />;
  if (!cls) return <NoClass title="Объявления и задания" />;
  return (<>
    <PageHead title="Объявления и задания" sub={cls.name} />{switcher}
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/classes/${cls.id}/posts`, { ...f, due: f.due || null }), "Отправлено")) { setF({ ...f, subject: "", text: "" }); reload(); } }}>
      <div className="g3"><label className="field"><span>Тип</span><select className="in" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{sch && <option value="homework">Домашнее задание</option>}<option value="announce">Объявление</option></select></label>
        <label className="field"><span>{sch ? "Предмет" : "Тема"}</span><input className="in" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={sch ? "Информатика" : "Утренник"} /></label>
        <label className="field"><span>{f.type === "homework" ? "Сдать до" : "Дата события"}</span><input className="in" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label></div>
      <label className="field"><span>Текст</span><textarea className="in" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={sch ? "§ 5, упражнения 1–4." : "В пятницу утренник в 10:00."} /></label>
      <div><button className="btn pri" disabled={busy}>Отправить {sch ? "классу" : "группе"} и родителям</button></div>
    </form>
    {!data ? <Loading /> : <div className="list">{data.posts.map((p: any) => <div key={p.id} className="item">
      <div className="spread"><span className="lbl">{p.type === "homework" ? "Домашнее задание" : "Объявление"}{p.subject && ` · ${p.subject}`}</span>{p.type === "homework" ? <DueBadge due={p.due} /> : p.due && <span className="pill t">{fd(p.due)}</span>}</div>
      <p className="pre">{p.text}</p><div className="muted small">{p.author} · {fd(p.created_at)}</div>
      <div className="row">{p.type === "homework" && <span className="pill acc">Отметили выполнение: {p.done_count} из {data.pupils}</span>}<ConfirmButton onConfirm={() => run(() => api.del(`/class-posts/${p.id}`), "Удалено").then(reload)} /></div>
    </div>)}{!data.posts.length && <Empty>Пока ничего не отправлено.</Empty>}</div>}
  </>);
}

export function Messages() {
  const { cls, switcher, loading } = useMyClass();
  const { data, reload } = useApi<any[]>("/teacher/threads");
  const [sel, setSel] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (!cls) return <NoClass title="Сообщения родителей" />;
  const list = (data ?? []).filter((p) => p.class_id === cls.id);
  const current = list.find((p) => p.id === sel);
  return (<>
    <PageHead title="Сообщения родителей" sub={cls.name} />{switcher}
    <div className="msgs-grid">
      <div className="side" style={{ position: "static" }}>{list.map((p) => <button key={p.id} type="button" aria-current={sel === p.id} onClick={() => setSel(p.id)}><span>{p.full_name}</span>{p.unread > 0 && <span className="badge">{p.unread}</span>}</button>)}
        {!list.length && <span className="muted small" style={{ padding: 10 }}>В классе пока нет детей.</span>}</div>
      <div style={{ minWidth: 0, display: "grid", gap: 10, alignContent: "start" }}>{current ? <><h2>{current.full_name}</h2><Chat pupilId={current.id} onRead={reload} /></> : <Empty>Выберите ребёнка, чтобы открыть переписку с родителями.</Empty>}</div>
    </div>
  </>);
}
