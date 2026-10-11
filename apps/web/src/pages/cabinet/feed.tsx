/** Лента новостей: публикуют администраторы области и района, читают все роли */
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { AUDIENCE, FEED_TAGS } from "../../lib/meta";
import { fd } from "../../lib/format";
import { ConfirmButton, Empty, Kpi, Loading, PageHead, Tabs } from "../../components/ui";
import { ColChart, HBars, SegBar } from "../../components/charts";
import { FeedCard } from "../public/PublicFeed";

export function Feed() {
  const { me } = useAuth();
  const admin = ["region", "district"].includes(me!.role);
  const regionLevel = ["region", "observer", "operator"].includes(me!.role);
  const [tab, setTab] = useState<"official" | "schools" | "manage">("official");
  const [edit, setEdit] = useState<any | null>(null);
  const feed = useApi<any[]>("/feed");
  const { busy, run } = useAction();
  const items: [typeof tab, string][] = [["official", "Официальные"], ["schools", regionLevel ? "Новости школ области" : "Новости школ района"]];
  if (admin) items.push(["manage", edit ? "Редактирование" : "Публикация и статистика"]);
  return (<>
    <PageHead title="Лента новостей" sub={admin ? (me!.role === "region" ? "Публикует управление образования" : "Публикует отдел образования района") : "Новости управления и отдела образования"} />
    <Tabs value={tab} onChange={(v) => { setTab(v); if (v !== "manage") setEdit(null); }} items={items} />
    {tab === "official" && (!feed.data ? <Loading /> : <div className="list">{feed.data.map((f) => <FeedCard key={f.id} f={f} actions={f.can_edit && <div className="row">
      <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/feed/${f.id}/pin`)).then(feed.reload)}>{f.pinned ? "Открепить" : "Закрепить"}</button>
      <button className="btn sm" onClick={() => { setEdit(f); setTab("manage"); }}>Изменить</button>
      <ConfirmButton onConfirm={() => run(() => api.del(`/feed/${f.id}`), "Новость удалена").then(feed.reload)} /></div>} />)}
      {!feed.data.length && <Empty>{admin ? "Лента пуста. Опубликуйте первую новость во вкладке «Публикация и статистика»." : "Новостей пока нет."}</Empty>}</div>)}
    {tab === "schools" && <SchoolsNews />}
    {tab === "manage" && admin && <><FeedForm item={edit} onDone={() => { setEdit(null); setTab("official"); feed.reload(); }} /><FeedStats /></>}
  </>);
}

function SchoolsNews() {
  const { data } = useApi<any[]>("/feed/schools");
  if (!data) return <Loading />;
  return <div className="list">{data.map((p) => <article key={p.id} className="item"><span className="lbl">{fd(p.published_at)} · {p.org_name}</span><h3>{p.title}</h3><p className="small pre">{p.body}</p>
    <div><Link className="btn sm ghost" to={`/o/${p.org_slug}/news`}>Сайт организации</Link></div></article>)}{!data.length && <Empty>Организации ещё не публиковали новостей.</Empty>}</div>;
}

function FeedForm({ item, onDone }: { item: any | null; onDone: () => void }) {
  const { me } = useAuth();
  const [f, setF] = useState({ title: item?.title ?? "", body: item?.body ?? "", tag: item?.tag ?? FEED_TAGS[0], audience: item?.audience ?? "all", until: item?.until ?? "", link: item?.link ?? "", pinned: !!item?.pinned });
  const { busy, run } = useAction();
  return <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => item ? api.put(`/feed/${item.id}`, { ...f, until: f.until || null }) : api.post("/feed", { ...f, until: f.until || null }), item ? "Сохранено" : "Опубликовано в ленте")) onDone(); }}>
    <div className="spread"><h2>{item ? "Изменить публикацию" : "Новая публикация"}</h2>{item && <button type="button" className="btn sm ghost" onClick={onDone}>Отмена</button>}</div>
    <label className="field"><span>Заголовок</span><input className="in" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Стартовал приём заявок на областную олимпиаду" /></label>
    <div className="g3"><label className="field"><span>Рубрика</span><select className="in" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>{FEED_TAGS.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Кто увидит</span><select className="in" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field"><span>Показывать до (необязательно)</span><input className="in" type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></label></div>
    <label className="field"><span>Текст</span><textarea className="in" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ minHeight: 140 }} /></label>
    <label className="field"><span>Ссылка (необязательно)</span><input className="in" type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></label>
    <div className="row"><label className="check" style={{ border: 0, padding: 0 }}><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /><span>Закрепить сверху</span></label>
      <span className="muted small">Охват: {me!.role === "region" ? "все организации области" : "организации района"}</span></div>
    <div><button className="btn pri" disabled={busy}>{item ? "Сохранить" : "Опубликовать"}</button></div>
  </form>;
}

function FeedStats() {
  const { data } = useApi<any>("/feed/stats");
  if (!data) return <Loading />;
  return <section className="panel"><h2>Статистика ленты</h2>
    <div className="kpis"><Kpi label="Публикаций" value={data.total} /><Kpi label="За 30 дней" value={data.last30} /><Kpi label="Закреплено" value={data.pinned} /></div>
    <div className="g2"><ColChart items={data.perWeek} title="Публикации по неделям" /><HBars title="По рубрикам" items={data.byTag} /></div>
    <SegBar title="Аудитория" parts={data.byAudience.map((a: any) => ({ label: AUDIENCE[a.key], value: a.value, color: a.key === "all" ? "accent" : a.key === "families" ? "ok" : "warn" }))} />
  </section>;
}
