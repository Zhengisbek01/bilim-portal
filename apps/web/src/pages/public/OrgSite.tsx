import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useMeta, SEC, SECTION_KEYS } from "../../lib/meta";
import { useAuth } from "../../lib/auth";
import { fd } from "../../lib/format";
import { AppealPill, Banner, Empty, ErrorText, Loading } from "../../components/ui";

type L = "ru" | "kk" | "en";
const UI = {
  ru: { dir: "Директор", ph: "Телефон", ad: "Адрес", lang: "Язык обучения", size: "Контингент", back: "← К каталогу", none: "Раздел пока не заполнен организацией." },
  kk: { dir: "Директор", ph: "Телефон", ad: "Мекенжай", lang: "Оқыту тілі", size: "Контингент", back: "← Каталогқа", none: "Бөлім әлі толтырылмаған." },
  en: { dir: "Director", ph: "Phone", ad: "Address", lang: "Language of instruction", size: "Enrolment", back: "← Back to catalog", none: "This section has not been filled in yet." },
};

export function OrgSite() {
  const { slug = "", section = "about" } = useParams();
  const { meta } = useMeta();
  const { me } = useAuth();
  const [lang, setLang] = useState<L>("ru");
  const { data, error, reload } = useApi<any>(`/public/orgs/${slug}`);
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const o = data.org, u = UI[lang];
  const mine = me && me.org_id === o.id && ["head", "editor"].includes(me.role);
  return (<>
    <div className="row"><Link to="/" className="btn sm">{u.back}</Link>{mine && <Link to="/cabinet/site" className="btn sm">Редактировать в кабинете</Link>}</div>
    {data.announcements.map((a: any) => <Banner key={a.id} title={a.scope === "region" ? "Управление образования" : "Отдел образования"}>{a.text}</Banner>)}
    <section className="site">
      <div className="site-head">
        <div className="crumbs"><span>{o.district_name} · {o.kind === "school" ? "организация среднего образования" : "дошкольная организация"}</span>
          <span className="langs" role="group" aria-label="Язык">{(["kk", "ru", "en"] as L[]).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</span></div>
        <h1>КГУ «{o.name}»</h1>
        <div style={{ fontSize: 14, opacity: .9 }}>{o.town} · {u.dir}: {o.director} · {o.phone}</div>
      </div>
      <div className="urlbar">https://{o.slug}.{meta?.domain}/{section}</div>
      <div className="site-body">
        <nav className="snav" aria-label="Разделы">{SECTION_KEYS.map((k) => (
          <Link key={k} to={`/o/${o.slug}/${k}`} aria-current={section === k ? "page" : undefined}>
            <span>{SEC[k][lang]}</span>{data.required.includes(k) && !o.sections[k] && <span className="dot" title="Обязательный раздел не заполнен" />}</Link>))}</nav>
        <div className="sc"><h2>{SEC[section]?.[lang] ?? ""}</h2><Section data={data} k={section} u={u} reload={reload} /></div>
      </div>
    </section>
  </>);
}

function Docs({ data, sec, fallback }: { data: any; sec: string; fallback: string[] }) {
  const ds = data.documents.filter((d: any) => d.section === sec);
  if (!ds.length) return <div className="doclist">{fallback.map((t) => <div className="doc" key={t}><span className="ext">PDF</span><span>{t}</span></div>)}</div>;
  return <div className="doclist">{ds.map((d: any) => {
    const inner = <><span className="ext">{(d.file_name?.split(".").pop() || "PDF").toUpperCase()}</span><span>{d.title}</span>{d.valid_until && <span className="muted small" style={{ marginLeft: "auto" }}>действует до {fd(d.valid_until)}</span>}</>;
    return d.has_file ? <a key={d.id} className="doc" href={`/api/public/files/${d.id}`} target="_blank" rel="noopener noreferrer">{inner}</a> : <div key={d.id} className="doc">{inner}</div>;
  })}</div>;
}

function Section({ data, k, u, reload }: { data: any; k: string; u: (typeof UI)["ru"]; reload: () => void }) {
  const o = data.org, sc = o.kind === "school";
  if (k === "news") return data.posts.length ? <div className="news">{data.posts.map((p: any) => <article key={p.id}><span className="lbl">{fd(p.published_at)} · {p.tag}</span><h3>{p.title}</h3><p className="pre">{p.body}</p></article>)}</div> : <Empty>Новостей пока нет.</Empty>;
  if (k === "blog") return <Blog data={data} reload={reload} />;
  if (!o.sections[k]) return <Empty>{u.none}</Empty>;
  switch (k) {
    case "about": return <><p className="pre">{o.about || (sc ? `${o.name} — государственная организация среднего образования.` : `${o.name} — государственная дошкольная организация.`)}</p>
      <dl className="kv"><dt>{u.ad}</dt><dd>{o.address}</dd><dt>{u.lang}</dt><dd>{o.lang}</dd><dt>{u.size}</dt><dd>{o.size} {sc ? "учащихся" : "воспитанников"}</dd><dt>{u.ph}</dt><dd>{o.phone}</dd></dl></>;
    case "admin": return <dl className="kv"><dt>{u.dir}</dt><dd>{o.director}</dd><dt>Приём граждан</dt><dd>{o.reception || "по предварительной записи"}</dd></dl>;
    case "docs": return <Docs data={data} sec="docs" fallback={["Устав организации", "Лицензия на образовательную деятельность"]} />;
    case "admission": return <><p>{sc ? "Приём в 1 класс — через портал электронного правительства, госуслуга «Приём документов и зачисление в организации образования»." : "Постановка в очередь и направление в детский сад — через портал электронного правительства."}</p><p><a href="https://egov.kz" target="_blank" rel="noopener noreferrer">Перейти на eGov.kz</a></p></>;
    case "food": return <Docs data={data} sec="food" fallback={["Меню на текущую неделю"]} />;
    case "budget": return <Docs data={data} sec="budget" fallback={["План госзакупок", "Отчёт об исполнении бюджета"]} />;
    case "anticorr": return <><p>Сообщить о факте коррупции можно по номеру 1424 — Call-центр Агентства по противодействию коррупции.</p><Docs data={data} sec="anticorr" fallback={["Антикоррупционный стандарт организации"]} /></>;
    case "vacancies": return o.vacancies ? <p className="pre">{o.vacancies}</p> : <Empty>Открытых вакансий нет.</Empty>;
    case "contacts": return <dl className="kv"><dt>{u.ad}</dt><dd>{o.address}</dd><dt>{u.ph}</dt><dd>{o.phone}</dd></dl>;
  }
  return null;
}

function Blog({ data }: { data: any; reload: () => void }) {
  const [f, setF] = useState({ name: "", contact: "", text: "", consent: false });
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState(""), [found, setFound] = useState<any>(null);
  const { busy, run } = useAction();
  return (<>
    <p className="muted">Руководитель отвечает в течение {data.appealDays} рабочих дней. Ответ можно посмотреть по номеру обращения.</p>
    {sent && <Banner kind="info" title="Отправлено">Номер обращения <span className="mono">{sent}</span>. Сохраните его, чтобы проверить ответ.</Banner>}
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); await run(async () => { const r = await api.post(`/public/orgs/${data.org.id}/appeals`, f); setSent(r.code); setF({ name: "", contact: "", text: "", consent: false }); }); }}>
      <div className="g2"><label className="field"><span>Ваше имя</span><input className="in" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Телефон или e-mail</span><input className="in" required value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label></div>
      <label className="field"><span>Вопрос</span><textarea className="in" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
      <label className="check" style={{ border: 0 }}><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /><span>Согласен на обработку персональных данных</span></label>
      <div><button className="btn pri" disabled={busy}>Отправить руководителю</button></div>
    </form>
    <form className="row" onSubmit={async (e) => { e.preventDefault(); try { setFound(await api.get(`/public/appeals/${encodeURIComponent(code.trim())}`)); } catch (er: any) { setFound({ error: er.message }); } }}>
      <input className="in" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Номер обращения, например A-K7Q2M8" style={{ maxWidth: 320 }} aria-label="Номер обращения" />
      <button className="btn">Проверить ответ</button>
    </form>
    {found && (found.error ? <Empty>{found.error}</Empty> : <div className="item"><div className="spread"><b className="mono">{found.id}</b><AppealPill a={found} /></div><p className="pre">{found.text}</p>{found.answer && <p><b>Ответ:</b> {found.answer}</p>}</div>)}
    {data.appeals.length > 0 && <><h3>Ответы руководителя</h3><div className="news">{data.appeals.map((a: any) => <article key={a.id}><span className="lbl">{fd(a.answered_at)}</span><p><b>Вопрос:</b> {a.text}</p><p><b>Ответ:</b> {a.answer}</p></article>)}</div></>}
  </>);
}
