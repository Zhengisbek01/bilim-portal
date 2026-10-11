import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/hooks";
import { useMeta } from "../../lib/meta";
import { fd, level } from "../../lib/format";
import { Banner, Empty, Loading } from "../../components/ui";
import { Icon, Motif, Ornament, OrgTile } from "../../components/Brand";

export function Catalog() {
  const { meta } = useMeta();
  const [q, setQ] = useState(""), [dq, setDq] = useState(""), [district, setDistrict] = useState(""), [kind, setKind] = useState(""), [limit, setLimit] = useState(24);
  const catalogRef = useRef<HTMLElement>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ limit: String(limit) });
  if (dq) params.set("q", dq); if (district) params.set("district", district); if (kind) params.set("kind", kind);
  const { data, error } = useApi<any>(`/public/orgs?${params}`);
  const feed = useApi<any[]>("/public/feed");
  const toCatalog = (e?: React.FormEvent) => { e?.preventDefault(); catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const news = feed.data ?? [];
  const lead = news[0], rest = news.slice(1, 3);

  return (<>
    <section className="home-hero bleed">
      <Ornament id="hero-orn" />
      <div className="inner">
        <span className="eyebrow">Мектептер мен балабақшалардың бірыңғай порталы</span>
        <h1>Каждая школа и детский сад области — в одном месте</h1>
        <p className="lead">Расписание, меню, документы, новости и ответы директора. Официальные сайты {meta?.counts.total || "всех"} организаций образования на одной платформе.</p>
        <form className="searchbox" onSubmit={toCatalog} role="search">
          <label className="q"><Icon name="search" />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Поиск</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название школы, сада или населённого пункта" />
          </label>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Район">
            <option value="">Все районы и города</option>{meta?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn gold" style={{ minHeight: 52, padding: "0 28px", fontSize: 16 }}>Найти</button>
        </form>
        <div className="quick">
          <a href="https://egov.kz" target="_blank" rel="noopener noreferrer">Записать в 1 класс</a>
          <a href="https://egov.kz" target="_blank" rel="noopener noreferrer">Очередь в детский сад</a>
          <a href="#catalog" onClick={(e) => { e.preventDefault(); toCatalog(); }}>Меню питания</a>
          <a href="#catalog" onClick={(e) => { e.preventDefault(); toCatalog(); }}>Вопрос директору</a>
        </div>
      </div>
    </section>

    <section className="statband bleed">
      <div className="inner">
        <div><b>{meta?.counts.total ?? "—"}</b><span>школ и детских садов</span></div>
        <div><b>{meta?.districts.length ?? "—"}</b><span>районов и городов</span></div>
        <div><b>3</b><span>языка: қазақша, русский, English</span></div>
        <div><b>0 ₸</b><span>для организаций</span></div>
      </div>
    </section>

    {meta && !meta.counts.total && <Banner kind="info">База пуста: выполните <span className="mono">npm run seed</span> или задайте SEED_DEMO=true.</Banner>}
    {error && <Banner kind="bad" title="Нет связи с сервером">{error}. Проверьте, что API запущен и база подключена.</Banner>}

    {lead && (
      <section style={{ display: "grid", gap: 22, paddingTop: 24 }}>
        <div className="sec-head"><div><span className="eyebrow">Білім басқармасы</span><h2>Новости образования</h2></div><Link to="/feed" style={{ fontWeight: 600 }}>Все новости →</Link></div>
        <div className="news-grid">
          <article className="news-lead">
            <Motif style={{ position: "absolute", right: -40, bottom: -40, opacity: 0.22 }} />
            <span className="tag-gold">{lead.pinned ? "Закреплено · " : ""}{lead.tag}</span>
            <h3>{lead.title}</h3>
            <p>{lead.body.length > 220 ? lead.body.slice(0, 220) + "…" : lead.body}</p>
            <span className="small" style={{ marginTop: "auto", color: "var(--night-ink)" }}>{lead.scope === "region" ? "Управление образования" : `Отдел образования · ${lead.district_name ?? ""}`} · {fd(lead.created_at)}</span>
          </article>
          {rest.map((f) => (
            <article className="news-card" key={f.id}>
              <span className="kicker">{f.tag}{f.scope !== "region" && f.district_name ? ` · ${f.district_name}` : ""}</span>
              <h3>{f.title}</h3>
              <span className="small muted" style={{ marginTop: "auto" }}>{fd(f.created_at)}</span>
            </article>
          ))}
          <div className="ask-band">
            <Icon name="chat" size={40} color="var(--sun-deep)" />
            <div style={{ flex: "1 1 300px", display: "grid", gap: 4 }}><b style={{ fontSize: 17 }}>Есть вопрос к директору?</b>
              <span style={{ fontSize: 15 }}>Напишите на сайте школы — ответ придёт в течение {meta?.requirements.appealDays ?? 10} рабочих дней, статус проверяется по номеру.</span></div>
            <button type="button" className="btn" style={{ background: "var(--night)", color: "#fff", borderColor: "var(--night)" }} onClick={() => toCatalog()}>Выбрать школу</button>
          </div>
        </div>
      </section>
    )}

    <section id="catalog" ref={catalogRef} style={{ display: "grid", gap: 20, paddingTop: 24, scrollMarginTop: 90 }}>
      <div className="sec-head"><div><span className="eyebrow">Каталог</span><h2>Найдите свою школу или сад</h2></div>
        <div className="seg-tabs" role="group" aria-label="Тип организации">{[["", "Все"], ["school", "Школы"], ["kg", "Детские сады"]].map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}</div>
      </div>
      {!data ? (error ? null : <Loading />) : <>
        <p className="muted small">Найдено: {data.total}{dq && ` по запросу «${dq}»`}</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>{data.items.map((o: any) => (
          <Link className="org-card" key={o.id} to={`/o/${o.slug}`}>
            <OrgTile kind={o.kind} />
            <div style={{ flex: 1, display: "grid", gap: 6, minWidth: 0 }}>
              <span className="meta">{o.kind === "school" ? "Школа" : "Детский сад"} · {o.district_name}</span>
              <b style={{ fontSize: 16, lineHeight: 1.3 }}>{o.name}</b>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap", marginTop: 4 }}>
                <div className="bar"><i style={{ width: `${o.score}%`, background: `var(--${level(o.score)})` }} /></div>
                <span className="small" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{o.score}% сайта</span>
              </div>
            </div>
          </Link>))}
        </div>
        {!data.items.length && <Empty>Ничего не найдено. Измените запрос или район.</Empty>}
        {data.total > limit && <div style={{ display: "flex", justifyContent: "center" }}><button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 }} onClick={() => setLimit(limit + 48)}>Показать ещё ({data.total - limit})</button></div>}
      </>}
    </section>

    <section className="audience" style={{ paddingTop: 24 }}>
      <div><Icon name="people" size={34} color="var(--accent)" /><h3>Родителям</h3><p>Задания ребёнка, объявления класса и переписка с учителем — вход по SMS, без паролей.</p></div>
      <div><Icon name="cap" size={34} color="var(--accent)" /><h3>Школам и садам</h3><p>Готовый сайт с обязательными разделами. Редактор публикует новости, загружает меню и документы за минуту.</p></div>
      <div><Icon name="chart" size={34} color="var(--accent)" /><h3>Управлению образования</h3><p>Заполненность сайтов, замечания и сроки ответов на обращения по каждому району — в одном окне.</p></div>
    </section>
  </>);
}
