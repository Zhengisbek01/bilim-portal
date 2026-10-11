import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/hooks";
import { useMeta } from "../../lib/meta";
import { fd } from "../../lib/format";
import { Banner, Empty, ScorePill, Loading } from "../../components/ui";

export function Catalog() {
  const { meta } = useMeta();
  const [q, setQ] = useState(""), [dq, setDq] = useState(""), [district, setDistrict] = useState(""), [kind, setKind] = useState(""), [limit, setLimit] = useState(24);
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ limit: String(limit) });
  if (dq) params.set("q", dq); if (district) params.set("district", district); if (kind) params.set("kind", kind);
  const { data } = useApi<any>(`/public/orgs?${params}`);
  const feed = useApi<any[]>("/public/feed");
  return (<>
    <section className="hero">
      <div><span className="lbl">{meta?.regionName ?? "Область"}</span>
        <h1 style={{ marginTop: 8 }}>Все школы и детские сады области на одной платформе</h1>
        <p className="lead">Каждая организация получает готовый сайт с обязательными разделами. Сервер и поддержка на стороне области, для организаций бесплатно.</p></div>
      <div className="facts"><div><b>{meta?.counts.total ?? "—"}</b><span className="muted">организаций</span></div><div><b>{meta?.counts.schools ?? "—"}</b><span className="muted">школ</span></div><div><b>{meta?.counts.kgs ?? "—"}</b><span className="muted">детских садов</span></div></div>
    </section>
    {feed.data && feed.data.length > 0 && (
      <section style={{ display: "grid", gap: 12 }}>
        <div className="spread"><h2>Новости образования</h2><Link to="/feed" className="btn sm">Все новости ({feed.data.length})</Link></div>
        <div className="g3">{feed.data.slice(0, 3).map((f) => (
          <article className="card" key={f.id}><span className="lbl">{fd(f.created_at)} · {f.tag}</span><div className="nm">{f.title}</div>
            <p className="small muted">{f.body.length > 140 ? f.body.slice(0, 140) + "…" : f.body}</p></article>))}</div>
      </section>
    )}
    <section style={{ display: "grid", gap: 12 }}>
      <div className="filters">
        <input className="in" type="search" placeholder="Поиск: название, город, район" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        <select className="in" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Район">
          <option value="">Все районы и города</option>{meta?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="chips" role="group" aria-label="Тип">{[["", "Все"], ["school", "Школы"], ["kg", "Детсады"]].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}</div>
      </div>
      {!data ? <Loading /> : <>
        <p className="muted small">Найдено: {data.total}</p>
        <div className="grid">{data.items.map((o: any) => (
          <Link className="card" key={o.id} to={`/o/${o.slug}`}>
            <div className="spread"><span className="pill t">{o.kind === "school" ? "Школа" : "Детский сад"}</span><ScorePill p={o.score} /></div>
            <div className="nm">{o.name}</div><div className="muted small">{o.town}, {o.district_name}</div>
            <div className="dom">{o.slug}.{meta?.domain}</div>
          </Link>))}
          {!data.items.length && <Empty>Ничего не найдено. Измените запрос или район.</Empty>}
        </div>
        {data.total > limit && <div><button className="btn" onClick={() => setLimit(limit + 48)}>Показать ещё ({data.total - limit})</button></div>}
      </>}
    </section>
    {meta && !meta.counts.total && <Banner kind="info">База пуста: выполните <span className="mono">npm run seed</span> или импорт организаций.</Banner>}
  </>);
}
