/** Кабинеты родителя и ученика */
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { fd, pct, today } from "../../lib/format";
import { DueBadge, Empty, Kpi, Loading, PageHead } from "../../components/ui";
import { HBars } from "../../components/charts";
import { Chat } from "../../components/Chat";

/** Дети пользователя и выбранный ребёнок */
function useKids() {
  const { data, reload } = useApi<any[]>("/family/children");
  const [id, setId] = useState<string | null>(() => sessionStorage.getItem("bp-child"));
  const kid = data?.find((k) => k.id === id) ?? data?.[0] ?? null;
  const pick = (v: string) => { setId(v); try { sessionStorage.setItem("bp-child", v); } catch { /* приватный режим */ } };
  const switcher = data && data.length > 1 ? <div className="chips">{data.map((k) => <button key={k.id} className="chip" aria-pressed={kid?.id === k.id} onClick={() => pick(k.id)}>{k.full_name}</button>)}</div> : null;
  return { kids: data, kid, switcher, reload, pick };
}
const NoKid = ({ title }: { title: string }) => <><PageHead title={title} /><Empty>К учётной записи пока не привязан ребёнок. Обратитесь к классному руководителю.</Empty></>;

export function Kids() {
  const { kids } = useKids();
  const ann = useApi<any[]>("/announcements");
  if (!kids) return <Loading />;
  if (!kids.length) return <NoKid title="Мои дети" />;
  return (<>
    <PageHead title="Мои дети" sub="Родитель" />
    {ann.data?.map((a) => <div key={a.id} className="banner sun"><b>{a.scope === "region" ? "Управление образования" : "Отдел образования"}</b><span>{a.text}</span></div>)}
    <div className="g2">{kids.map((k) => {
      const school = k.class_kind === "class";
      return <div key={k.id} className="panel">
        <div><span className="lbl">{k.org_name}</span><h2 style={{ marginTop: 4 }}>{k.full_name}</h2><p className="muted small">{k.class_name} · {school ? "классный руководитель" : "воспитатель"} {k.teacher_name ?? "не назначен"}</p></div>
        {k.last_announce && <div className="item"><span className="lbl">Последнее объявление · {fd(k.last_announce.created_at)}</span><p className="pre">{k.last_announce.text}</p></div>}
        <div className="row">
          {school && <><span className={`pill ${k.homework_todo ? "warn" : "ok"}`}>К сдаче: {k.homework_todo}</span><span className="pill acc">Выполнено: {pct(k.homework_done, k.homework_total)}%</span>{k.homework_overdue > 0 && <span className="pill bad">Пропущено сроков: {k.homework_overdue}</span>}</>}
          <span className={`pill ${k.unread ? "bad" : "t"}`}>Новых сообщений: {k.unread}</span>
          {k.menu ? <a className="pill t" href={`/api/public/files/${k.menu.id}`} target="_blank" rel="noopener noreferrer">Меню: {k.menu.title}</a> : <span className="pill t">Меню не загружено</span>}
        </div>
        <div className="row"><Link className="btn sm" to="/cabinet/family-news" onClick={() => sessionStorage.setItem("bp-child", k.id)}>Объявления</Link>
          {school && <Link className="btn sm" to="/cabinet/diary" onClick={() => sessionStorage.setItem("bp-child", k.id)}>Задания</Link>}
          <Link className="btn sm pri" to="/cabinet/chat" onClick={() => sessionStorage.setItem("bp-child", k.id)}>Написать педагогу</Link></div>
        <div className="row"><Link className="btn sm ghost" to={`/o/${k.org_slug}/blog`}>Вопрос руководителю</Link><Link className="btn sm ghost" to={`/o/${k.org_slug}/news`}>Новости {k.org_kind === "school" ? "школы" : "сада"}</Link></div>
      </div>;
    })}</div>
  </>);
}

export function FamilyNews() {
  const { kid, switcher, kids } = useKids();
  const { data } = useApi<any>(kid ? `/classes/${kid.class_id}/posts` : null);
  const ann = useApi<any[]>("/announcements");
  if (!kids) return <Loading />;
  if (!kid) return <NoKid title="Объявления" />;
  const list = (data?.posts ?? []).filter((p: any) => p.type === "announce");
  return (<>
    <PageHead title="Объявления" sub={`${kid.class_name} · ${kid.org_name}`} />{switcher}
    {ann.data?.map((a) => <div key={a.id} className="banner sun"><b>{a.scope === "region" ? "Управление образования" : "Отдел образования"}</b><span>{a.text}</span></div>)}
    {!data ? <Loading /> : <div className="list">{list.map((p: any) => <div key={p.id} className="item"><div className="spread"><span className="lbl">{p.subject || "Объявление"}</span>{p.due && <span className="pill t">{fd(p.due)}</span>}</div><p className="pre">{p.text}</p><div className="muted small">{p.author} · {fd(p.created_at)}</div></div>)}
      {!list.length && <Empty>Объявлений {kid.class_kind === "class" ? "класса" : "группы"} пока нет.</Empty>}</div>}
  </>);
}

function Homework({ kid, canMark }: { kid: any; canMark: boolean }) {
  const { data, reload } = useApi<any>(`/classes/${kid.class_id}/posts`);
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const hw = data.posts.filter((p: any) => p.type === "homework");
  const isDone = (p: any) => p.done_by.includes(kid.id);
  const t = today();
  const up = hw.filter((p: any) => !p.due || p.due >= t).sort((a: any, b: any) => (a.due ?? "").localeCompare(b.due ?? ""));
  const past = hw.filter((p: any) => p.due && p.due < t);
  const item = (p: any) => <div key={p.id} className="item"><div className="spread"><span className="lbl">Домашнее задание{p.subject && ` · ${p.subject}`}</span><DueBadge due={p.due} done={isDone(p)} /></div>
    <p className="pre">{p.text}</p><div className="muted small">{p.author} · {fd(p.created_at)}</div>
    {canMark && <div><button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/class-posts/${p.id}/done`, { done: !isDone(p) }), isDone(p) ? undefined : "Отмечено. Учитель и родители видят выполнение").then(reload)}>{isDone(p) ? "Отметить невыполненным" : "Отметить сделанным"}</button></div>}</div>;
  return <><h2>К сдаче</h2><div className="list">{up.map(item)}{!up.length && <Empty>Актуальных заданий нет.</Empty>}</div>
    {past.length > 0 && <><h2>Прошедшие</h2><div className="list">{past.slice(0, 10).map(item)}</div></>}
    <p className="muted small">Оценки ведутся в электронном журнале школы.</p></>;
}

export function Diary() {
  const { me } = useAuth();
  const { kid, switcher, kids } = useKids();
  if (!kids) return <Loading />;
  if (!kid) return <NoKid title="Задания" />;
  return (<>
    <PageHead title="Задания" sub={`${kid.class_name} · ${kid.full_name}`} />{switcher}
    {kid.class_kind === "class" ? <Homework kid={kid} canMark={me!.role === "student"} /> : <Empty>В детском саду домашних заданий нет. Сообщения воспитателя — в разделе «Объявления».</Empty>}
  </>);
}

export function ParentChat() {
  const { kid, switcher, kids, reload } = useKids();
  if (!kids) return <Loading />;
  if (!kid) return <NoKid title="Сообщения педагогу" />;
  return (<>
    <PageHead title="Сообщения педагогу" sub={`${kid.teacher_name ?? "Педагог не назначен"} · ${kid.class_name}`} />{switcher}
    <Chat key={kid.id} pupilId={kid.id} onRead={reload} />
    <p className="muted small">Переписку видят родители ребёнка с доступом и {kid.class_kind === "class" ? "классный руководитель" : "воспитатель"}.</p>
  </>);
}

export function StudentOverview() {
  const { data } = useApi<any>("/stats/student");
  if (!data) return <Loading />;
  if (!data.pupil) return <NoKid title="Обзор" />;
  const first = data.pupil.full_name.split(" ").slice(-1)[0];
  return (<>
    <PageHead title={`Привет, ${first}!`} sub={`${data.pupil.class_name} · ${data.pupil.org_name}`} />
    <div className="kpis"><Kpi label="Заданий всего" value={data.total} /><Kpi label="Выполнено" value={data.done} sub={`${pct(data.done, data.total)}%`} />
      <Kpi label="Осталось сделать" value={data.upcoming.length} /><Kpi label="Пропущено сроков" value={data.overdue} alert={data.overdue > 0} /></div>
    <div className="g2"><div className="panel"><HBars title="Выполнение по предметам" items={data.bySubject} max={100} unit="%" /></div>
      <div className="panel"><h3>Ближайшие сроки</h3><div className="list">{data.upcoming.map((h: any) => <div key={h.id} className="item"><div className="spread"><b className="small">{h.subject || "Задание"}</b><DueBadge due={h.due} /></div><p className="small pre">{h.text}</p></div>)}
        {!data.upcoming.length && <span className="muted small">Все задания выполнены.</span>}</div>
        <div><Link className="btn sm" to="/cabinet/diary">Все задания</Link></div></div></div>
  </>);
}

export function SchoolNews() {
  const { kid, kids } = useKids();
  const { data } = useApi<any>(kid ? `/public/orgs/${kid.org_slug}` : null);
  if (!kids) return <Loading />;
  if (!kid) return <NoKid title="Новости школы" />;
  return (<>
    <PageHead title="Новости школы" sub={kid.org_name} />
    {!data ? <Loading /> : <div className="news">{data.posts.map((p: any) => <article key={p.id}><span className="lbl">{fd(p.published_at)} · {p.tag}</span><h3>{p.title}</h3><p className="pre">{p.body}</p></article>)}
      {!data.posts.length && <Empty>Новостей пока нет.</Empty>}</div>}
  </>);
}
