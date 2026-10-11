import { Link } from "react-router-dom";
import { useApi } from "../../lib/hooks";
import { fd } from "../../lib/format";
import { Empty, Loading } from "../../components/ui";

export function PublicFeed() {
  const { data } = useApi<any[]>("/public/feed");
  return (<>
    <div><Link to="/" className="btn sm">← К каталогу</Link></div>
    <div><span className="lbl">Управление и отделы образования</span><h1 style={{ marginTop: 6 }}>Новости образования</h1></div>
    {!data ? <Loading /> : <div className="list">{data.map((f) => <FeedCard key={f.id} f={f} />)}{!data.length && <Empty>Новостей пока нет.</Empty>}</div>}
  </>);
}
export function FeedCard({ f, actions }: { f: any; actions?: React.ReactNode }) {
  const who = f.scope === "region" ? "Управление образования области" : `Отдел образования · ${f.district_name ?? ""}`;
  const aud: Record<string, string> = { families: "Родителям и ученикам", staff: "Персоналу" };
  return (
    <article className={`item${f.pinned ? " hl" : ""}`}>
      <div className="spread"><span className="lbl">{f.pinned ? "Закреплено · " : ""}{fd(f.created_at)} · {f.tag}</span>
        <span className="row">{aud[f.audience] && <span className="pill acc">{aud[f.audience]}</span>}<span className="pill t">{who}</span></span></div>
      <h3>{f.title}</h3><p className="pre" style={{ maxWidth: "72ch" }}>{f.body}</p>
      {f.link && <p className="small"><a href={f.link} target="_blank" rel="noopener noreferrer">Подробнее</a></p>}
      {actions}
    </article>
  );
}
