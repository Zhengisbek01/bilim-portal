/** Кабинеты организации: руководитель, редактор, автор, сотрудник */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi, useAction } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { DOC_TYPES, POST_TAGS, SEC, SECTION_KEYS } from "../../lib/meta";
import { addDays, fd, fmtDur, level, levelTxt, today } from "../../lib/format";
import { Banner, ConfirmButton, DueBadge, Empty, Kpi, Loading, PageHead, STATUS_POST, Tabs } from "../../components/ui";
import { ColChart, HBars, SegBar } from "../../components/charts";

/* ---------- обзор организации ---------- */
export function OrgHome() {
  const { me } = useAuth();
  const site = useApi<any>("/org/site");
  const st = useApi<any>("/stats/org");
  const ann = useApi<any[]>("/announcements");
  if (!site.data || !st.data) return <Loading />;
  const s = site.data, d = st.data, isHead = me!.role === "head";
  return (<>
    <PageHead title={s.org.name} sub={me!.role_label} actions={<Link className="btn pri" to={`/o/${s.org.slug}`}>Открыть сайт</Link>} />
    {ann.data?.map((a) => <Banner key={a.id} title={a.scope === "region" ? "Управление образования" : "Отдел образования"}>{a.text}</Banner>)}
    <div className="kpis"><Kpi label="На проверке" value={d.counters.review} sub="материалы авторов" /><Kpi label="Замечания" value={d.counters.openRemarks} sub="от района и области" alert={d.counters.openRemarks > 0} />
      <Kpi label="Обращения" value={d.counters.appealsOpen} sub="без ответа" alert={d.counters.appealsOpen > 0} /><Kpi label="Опубликовано" value={d.counters.published} sub="новостей" /></div>
    <div className="g2">
      <div className="panel" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}><span className="lbl" style={{ color: "var(--on-accent-muted)" }}>Соответствие требованиям</span><div className="score"><b>{s.score}%</b><span className={`pill ${level(s.score)}`}>{levelTxt(s.score)}</span></div>
        <div className="meter"><i style={{ width: `${s.score}%`, background: `var(--${level(s.score)})` }} /></div>
        {s.missing.length ? <div><p className="small" style={{ marginBottom: 6 }}>Не заполнены обязательные разделы:</p><div className="chips">{s.missing.map((k: string) => <Link key={k} className="chip" to={["docs", "food", "budget", "anticorr"].includes(k) ? "/cabinet/documents" : "/cabinet/site"}>{SEC[k].ru}</Link>)}</div></div> : <p className="small">Все обязательные разделы заполнены.</p>}
      </div>
      <div className="panel"><span className="lbl">Автопроверки</span>{s.checks.length ? <div className="list">{s.checks.map((c: string) => <div key={c} className="row small"><span className="dot" style={{ background: "var(--warn)" }} />{c}</div>)}</div> : <p className="small">Замечаний нет.</p>}</div>
    </div>
    <section className="panel"><h2>Статистика {s.org.kind === "school" ? "школы" : "детского сада"}</h2>
      <div className="g2"><ColChart items={d.postsPerWeek} title="Публикации по неделям" unit="новостей на сайте" /><ColChart items={d.activity} title="Действия сотрудников за 14 дней" /></div>
      <div className="g2"><SegBar title="Материалы" parts={[{ label: "Опубликовано", value: d.postsByStatus.published, color: "ok" }, { label: "На проверке", value: d.postsByStatus.review, color: "accent" }, { label: "Черновики и возвраты", value: d.postsByStatus.draft, color: "warn" }]} />
        <SegBar title="Документы" parts={[{ label: "Действуют", value: d.docs.valid, color: "ok" }, { label: "Истекают за 7 дней", value: d.docs.expiring, color: "warn" }, { label: "Истекли", value: d.docs.expired, color: "bad" }]} /></div>
      <HBars title="Материалы по авторам" items={d.byAuthor} />
      {isHead && <>
        <h3>Обращения</h3>
        <div className="kpis"><Kpi label="Обращений" value={d.appeals.total} /><Kpi label="Отвечено" value={d.appeals.answered} /><Kpi label="Средний срок ответа" value={fmtDur(d.appeals.avgDays)} /><Kpi label="Просрочено" value={d.appeals.overdue} alert={d.appeals.overdue > 0} /></div>
        <h3>Классы, семьи, персонал</h3>
        <div className="kpis"><Kpi label={s.org.kind === "school" ? "Классов" : "Групп"} value={d.family.classes} /><Kpi label="Детей в системе" value={d.family.pupils} />
          <Kpi label="Семей подключено" value={`${d.family.pupils ? Math.round((d.family.withParents / d.family.pupils) * 100) : 0}%`} sub={`${d.family.withParents} из ${d.family.pupils}`} /><Kpi label="Сотрудников на платформе" value={d.staff} /></div>
        <div className="g2"><HBars title="Подключение семей по классам" items={d.family.coverage} max={100} unit="%" />
          <SegBar title="Поручения персоналу" parts={[{ label: "В работе", value: d.tasks.open, color: "accent" }, { label: "Просрочено", value: d.tasks.overdue, color: "bad" }, { label: "Выполнено", value: d.tasks.done, color: "ok" }]} /></div>
      </>}
    </section>
  </>);
}

/* ---------- публикации (редактор/руководитель — очередь; автор/педагог — свои) ---------- */
export function Posts() {
  const { me } = useAuth();
  const editor = ["head", "editor"].includes(me!.role);
  const [tab, setTab] = useState<string>(editor ? "review" : "all");
  const [edit, setEdit] = useState<any | null>(null);
  const { data, reload } = useApi<any[]>(`/posts?status=${tab === "new" ? "all" : tab === "drafts" ? "all" : tab}`);
  const { busy, run } = useAction();
  const [ret, setRet] = useState<{ id: string; text: string } | null>(null);
  const list = (data ?? []).filter((p) => tab !== "drafts" || ["draft", "returned"].includes(p.status));
  const act = (url: string, body: any, ok: string) => run(() => api.post(url, body), ok).then((r) => { if (r) { setRet(null); reload(); } });
  const stats = editor ? null : { published: list.filter((p) => p.status === "published").length, review: list.filter((p) => p.status === "review").length, returned: list.filter((p) => p.status === "returned").length, draft: list.filter((p) => p.status === "draft").length };
  return (<>
    <PageHead title={editor ? "Публикации" : "Мои материалы"} sub={me!.org?.name} actions={tab !== "new" && <button className="btn pri" onClick={() => { setEdit(null); setTab("new"); }}>Новый материал</button>} />
    <Tabs value={tab} onChange={(v) => { setTab(v); setEdit(null); }} items={editor ? [["review", "На проверке"], ["published", "Опубликовано"], ["drafts", "Черновики и возвраты"], ["new", edit ? "Редактирование" : "Новая публикация"]] : [["all", "Все мои"], ["new", edit ? "Редактирование" : "Новый материал"]]} />
    {tab === "new" ? <PostForm post={edit} editor={editor} onDone={() => { setEdit(null); setTab(editor ? "published" : "all"); reload(); }} /> : !data ? <Loading /> : <>
      {stats && <div className="panel"><SegBar title="Мои материалы" parts={[{ label: "Опубликовано", value: stats.published, color: "ok" }, { label: "На проверке", value: stats.review, color: "accent" }, { label: "Возвращено", value: stats.returned, color: "warn" }, { label: "Черновики", value: stats.draft, color: "line" }]} /></div>}
      <div className="list">{list.map((p) => {
        const own = p.author_id === me!.id;
        return <div key={p.id} className={`item${p.status === "returned" && own ? " hl" : ""}`}>
          <div className="spread"><div><span className="lbl">{p.tag}</span><h3 style={{ marginTop: 4 }}>{p.title}</h3></div>{STATUS_POST[p.status]}</div>
          <p className="small pre">{p.body}</p>
          <div className="muted small">{p.author_name} · {fd(p.updated_at)}{p.published_at && ` · опубликовано ${fd(p.published_at)}`}</div>
          {p.comment && p.status === "returned" && <p className="small"><b>Комментарий редактора:</b> {p.comment}</p>}
          {editor && p.status === "review" && (ret?.id === p.id
            ? <form className="row" onSubmit={(e) => { e.preventDefault(); act(`/posts/${p.id}/return`, { comment: ret!.text }, "Возвращено автору"); }}><input className="in" required value={ret!.text} onChange={(e) => setRet({ id: p.id, text: e.target.value })} placeholder="Что исправить" style={{ flex: 1, minWidth: 200 }} /><button className="btn sm" disabled={busy}>Вернуть автору</button><button type="button" className="btn sm ghost" onClick={() => setRet(null)}>Отмена</button></form>
            : <div className="row"><button className="btn sm pri" disabled={busy} onClick={() => act(`/posts/${p.id}/approve`, {}, "Опубликовано на сайте")}>Опубликовать</button><button className="btn sm" onClick={() => setRet({ id: p.id, text: "" })}>Вернуть с комментарием</button></div>)}
          {editor && p.status === "published" && <div className="row"><button className="btn sm" disabled={busy} onClick={() => act(`/posts/${p.id}/unpublish`, {}, "Снято с сайта")}>Снять с сайта</button><ConfirmButton onConfirm={() => run(() => api.del(`/posts/${p.id}`), "Удалено").then(reload)} /></div>}
          {(own || editor) && ["draft", "returned"].includes(p.status) && <div className="row">
            <button className="btn sm" onClick={() => { setEdit(p); setTab("new"); }}>Редактировать</button>
            {!editor && <button className="btn sm pri" disabled={busy} onClick={() => act(`/posts/${p.id}/submit`, {}, "Отправлено редактору")}>Отправить на проверку</button>}
            {editor && <button className="btn sm pri" disabled={busy} onClick={() => act(`/posts/${p.id}/approve`, {}, "Опубликовано")}>Опубликовать</button>}
            <ConfirmButton onConfirm={() => run(() => api.del(`/posts/${p.id}`), "Удалено").then(reload)} /></div>}
        </div>;
      })}{!list.length && <Empty>{tab === "review" ? "Нет материалов на проверке. Авторы отправляют их из своего кабинета." : "Пусто."}</Empty>}</div>
    </>}
  </>);
}

function PostForm({ post, editor, onDone }: { post: any | null; editor: boolean; onDone: () => void }) {
  const [f, setF] = useState({ title: post?.title ?? "", body: post?.body ?? "", tag: post?.tag ?? "Новости" });
  const { busy, run } = useAction();
  const save = (action: string) => run(() => post ? api.put(`/posts/${post.id}`, { ...f, action }) : api.post("/posts", { ...f, action }),
    action === "publish" ? "Опубликовано на сайте" : action === "review" ? "Отправлено редактору на проверку" : "Черновик сохранён").then((ok) => ok && onDone());
  return <form className="panel" onSubmit={(e) => { e.preventDefault(); save(editor ? "publish" : "review"); }}>
    <div className="g2"><label className="field"><span>Заголовок</span><input className="in" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Итоги районной олимпиады по математике" /></label>
      <label className="field"><span>Рубрика</span><select className="in" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>{POST_TAGS.map((t) => <option key={t}>{t}</option>)}</select></label></div>
    <label className="field"><span>Текст</span><textarea className="in" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ minHeight: 160 }} /></label>
    <div className="row"><button className="btn pri" disabled={busy}>{editor ? "Опубликовать" : "Отправить на проверку"}</button><button type="button" className="btn" disabled={busy || !f.title || !f.body} onClick={() => save("draft")}>Сохранить черновик</button></div>
  </form>;
}

/* ---------- разделы сайта ---------- */
export function SiteInfo() {
  const { data, reload } = useApi<any>("/org/site");
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) { const o = data.org; setF({ director: o.director, phone: o.phone, address: o.address, reception: o.reception, about: o.about, vacancies: o.vacancies }); } }, [data]);
  const { busy, run } = useAction();
  if (!data || !f) return <Loading />;
  const o = data.org;
  const input = (k: string, label: string, ph = "") => <label className="field"><span>{label}</span><input className="in" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (<>
    <PageHead title="Разделы сайта" sub={o.name} actions={<Link className="btn" to={`/o/${o.slug}`}>Посмотреть сайт</Link>} />
    <div className="g2">
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => api.put("/org/site/info", f), "Сохранено").then(reload); }}>
        <h2>Сведения</h2>
        <div className="g2">{input("director", "Руководитель")}{input("phone", "Телефон")}</div>
        {input("address", "Адрес")}{input("reception", "Приём граждан", "вторник, четверг · 15:00–17:00")}
        <label className="field"><span>Об организации</span><textarea className="in" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Профиль, смены, кружки, достижения" /></label>
        <label className="field"><span>Вакансии (каждая с новой строки)</span><textarea className="in" value={f.vacancies} onChange={(e) => setF({ ...f, vacancies: e.target.value })} placeholder="Учитель математики · 1 ставка" /></label>
        <div><button className="btn pri" disabled={busy}>Сохранить</button></div>
      </form>
      <div className="panel"><h2>Заполненность разделов</h2>
        <p className="muted small">Отметьте раздел, когда материалы на месте. Загруженные документы отмечают свой раздел автоматически.</p>
        <div>{SECTION_KEYS.filter((k) => k !== "blog" && k !== "news").map((k) => <label key={k} className="check">
          <input type="checkbox" checked={!!o.sections[k]} disabled={busy} onChange={(e) => run(() => api.put("/org/site/sections", { key: k, filled: e.target.checked })).then(reload)} />
          <span>{SEC[k].ru}</span>{data.required.includes(k) && <span className="pill t" style={{ marginLeft: "auto" }}>обязательный</span>}</label>)}</div>
      </div>
    </div>
  </>);
}

/* ---------- документы ---------- */
export function Documents() {
  const { data, reload } = useApi<any[]>("/documents");
  const [f, setF] = useState({ type: DOC_TYPES[0], title: "", validUntil: "" });
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  const t = today();
  return (<>
    <PageHead title="Документы" sub="Публикуются в разделах сайта" />
    <form className="panel" onSubmit={async (e) => {
      e.preventDefault();
      const fd_ = new FormData(); Object.entries(f).forEach(([k, v]) => fd_.append(k, v)); if (file) fd_.append("file", file);
      if (await run(() => api.post("/documents", fd_), "Документ загружен, раздел отмечен")) { setF({ ...f, title: "", validUntil: "" }); setFile(null); (e.target as HTMLFormElement).reset(); reload(); }
    }}>
      <h2>Загрузить документ</h2>
      <div className="g3"><label className="field"><span>Тип</span><select className="in" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="field"><span>Название на сайте</span><input className="in" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Меню на 13–17 октября" /></label>
        <label className="field"><span>Действует до</span><input className="in" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></label></div>
      <label className="field"><span>Файл (PDF, Word, Excel, JPG, PNG)</span><input className="in" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <div><button className="btn pri" disabled={busy}>Загрузить</button></div>
    </form>
    {!data ? <Loading /> : <div className="tbl-wrap"><table>
      <thead><tr><th>Документ</th><th>Раздел</th><th>Действует до</th><th>Загружен</th><th /></tr></thead>
      <tbody>{data.map((d) => <tr key={d.id}>
        <td><b>{d.title}</b><div className="muted small">{d.type}{d.file_name && <> · <a href={`/api/public/files/${d.id}`} target="_blank" rel="noopener noreferrer">{d.file_name}</a></>}</div></td>
        <td>{SEC[d.section]?.ru}</td>
        <td>{d.valid_until ? (d.valid_until < t ? <span className="pill bad">{fd(d.valid_until)} · истёк</span> : addDays(t, 7) >= d.valid_until ? <span className="pill warn">{fd(d.valid_until)}</span> : fd(d.valid_until)) : "—"}</td>
        <td className="nw">{fd(d.created_at)}<div className="muted small">{d.uploader}</div></td>
        <td><ConfirmButton onConfirm={() => run(() => api.del(`/documents/${d.id}`), "Удалено").then(reload)} /></td></tr>)}
        {!data.length && <tr><td colSpan={5} className="muted">Документов пока нет.</td></tr>}</tbody></table></div>}
  </>);
}

/* ---------- классы и группы (руководитель) ---------- */
export function Classes() {
  const { me } = useAuth();
  const { data, reload } = useApi<any[]>("/classes");
  const staff = useApi<any[]>("/colleagues");
  const teachers = (staff.data ?? []).filter((s) => s.role === "teacher");
  const sch = me!.org_kind === "school";
  const [f, setF] = useState({ name: "", teacherId: "" });
  const { busy, run } = useAction();
  return (<>
    <PageHead title="Классы и группы" sub={me!.org?.name} />
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/classes", { name: f.name, teacherId: f.teacherId || null }), "Добавлено")) { setF({ name: "", teacherId: "" }); reload(); } }}>
      <h2>Добавить {sch ? "класс" : "группу"}</h2>
      <div className="g3"><label className="field"><span>Название</span><input className="in" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={sch ? "7 «Б»" : "Средняя группа «Балапан»"} /></label>
        <label className="field"><span>{sch ? "Классный руководитель" : "Воспитатель"}</span><select className="in" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}><option value="">не назначен</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
        <div className="field" style={{ alignSelf: "end" }}><button className="btn pri" disabled={busy}>Добавить</button></div></div>
      {!teachers.length && <p className="muted small">Сначала добавьте педагогов в разделе «Сотрудники».</p>}
    </form>
    {!data ? <Loading /> : <div className="tbl-wrap"><table>
      <thead><tr><th>{sch ? "Класс" : "Группа"}</th><th>{sch ? "Классный руководитель" : "Воспитатель"}</th><th className="num">Детей</th><th className="num">Семей подключено</th></tr></thead>
      <tbody>{data.map((c) => <tr key={c.id}><td><b>{c.name}</b></td>
        <td><select className="in" style={{ maxWidth: 260 }} value={c.teacher_id ?? ""} aria-label="Педагог" onChange={(e) => run(() => api.patch(`/classes/${c.id}`, { teacherId: e.target.value || null }), "Педагог назначен").then(reload)}>
          <option value="">не назначен</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></td>
        <td className="num">{c.pupils}</td><td className="num">{c.with_parents}</td></tr>)}
        {!data.length && <tr><td colSpan={4} className="muted">Пока пусто.</td></tr>}</tbody></table></div>}
  </>);
}

/* ---------- персонал: внутренние объявления и поручения ---------- */
export function Staffroom() {
  const { me } = useAuth();
  const isHead = me!.role === "head";
  const inner = useApi<any[]>("/inner");
  const tasks = useApi<any[]>("/tasks");
  const staff = useApi<any[]>(isHead ? "/colleagues" : null);
  const [msg, setMsg] = useState("");
  const [tf, setTf] = useState({ assigneeId: "", title: "", due: addDays(today(), 7) });
  const { busy, run } = useAction();
  const people = (staff.data ?? []).filter((s) => s.role !== "head");
  useEffect(() => { if (people.length && !tf.assigneeId) setTf((x) => ({ ...x, assigneeId: people[0].id })); }, [staff.data]); // eslint-disable-line
  return (<>
    <PageHead title={isHead ? "Персонал и поручения" : "Для сотрудников"} sub={`${me!.org?.name} · видят только сотрудники`} />
    {isHead && <div className="g2">
      <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/inner", { text: msg }), "Отправлено сотрудникам")) { setMsg(""); inner.reload(); } }}>
        <h2>Сообщение персоналу</h2><textarea className="in" required value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Педсовет в пятницу в 15:00 в кабинете 204." aria-label="Сообщение" />
        <div><button className="btn pri" disabled={busy}>Отправить</button></div></form>
      <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post("/tasks", { ...tf, due: tf.due || null }), "Поручение отправлено")) { setTf({ ...tf, title: "" }); tasks.reload(); } }}>
        <h2>Поручение сотруднику</h2>
        <label className="field"><span>Кому</span><select className="in" required value={tf.assigneeId} onChange={(e) => setTf({ ...tf, assigneeId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.note || p.role_label}</option>)}</select></label>
        <label className="field"><span>Задача</span><input className="in" required value={tf.title} onChange={(e) => setTf({ ...tf, title: e.target.value })} placeholder="Провести медосмотр 1–4 классов" /></label>
        <label className="field"><span>Срок</span><input className="in" type="date" value={tf.due} onChange={(e) => setTf({ ...tf, due: e.target.value })} /></label>
        <div><button className="btn pri" disabled={busy || !people.length}>Поручить</button></div></form>
    </div>}
    <h2>{isHead ? "Поручения" : "Мои поручения"}</h2>
    {!tasks.data ? <Loading /> : <TaskList tasks={tasks.data} isHead={isHead} reload={tasks.reload} />}
    <h2>Объявления для сотрудников</h2>
    {!inner.data ? <Loading /> : <div className="list">{inner.data.map((x) => <div key={x.id} className="item"><p className="pre">{x.text}</p>
      <div className="spread"><span className="muted small">{x.author} · {fd(x.created_at)}</span>{isHead && <ConfirmButton onConfirm={() => run(() => api.del(`/inner/${x.id}`)).then(inner.reload)} />}</div></div>)}
      {!inner.data.length && <Empty>Сообщений пока нет.</Empty>}</div>}
  </>);
}

function TaskList({ tasks, isHead, reload }: { tasks: any[]; isHead: boolean; reload: () => void }) {
  const { me } = useAuth();
  const [open, setOpen] = useState<string | null>(null), [rep, setRep] = useState("");
  const { busy, run } = useAction();
  if (!tasks.length) return <Empty>Поручений нет.</Empty>;
  return <div className="list">{tasks.map((x) => {
    const late = x.status === "open" && x.due && x.due < today();
    return <div key={x.id} className={`item${late ? " hl" : ""}`}>
      <div className="spread"><b>{x.title}</b>{x.status === "done" ? <span className="pill ok">Выполнено {fd(x.done_at)}</span> : <DueBadge due={x.due} />}</div>
      <div className="muted small">{isHead ? `Исполнитель: ${x.assignee_name}` : `От: ${x.author}`} · {fd(x.created_at)}</div>
      {x.report && <p className="small"><b>Отчёт:</b> {x.report}</p>}
      {x.assignee_id === me!.id && x.status === "open" && (open === x.id
        ? <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/tasks/${x.id}/done`, { report: rep }), "Отмечено выполненным")) { setOpen(null); setRep(""); reload(); } }}>
            <input className="in" value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Коротко: что сделано (необязательно)" style={{ flex: 1, minWidth: 200 }} /><button className="btn pri sm" disabled={busy}>Отметить выполненным</button></form>
        : <div><button className="btn sm pri" onClick={() => setOpen(x.id)}>Выполнено</button></div>)}
      {isHead && <div className="row">{x.status === "done" && <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/tasks/${x.id}/reopen`)).then(reload)}>Вернуть в работу</button>}
        <ConfirmButton onConfirm={() => run(() => api.del(`/tasks/${x.id}`), "Удалено").then(reload)} /></div>}
    </div>;
  })}</div>;
}

/* ---------- сотрудник: мои задачи ---------- */
export function MyTasks() {
  const { me } = useAuth();
  const st = useApi<any>("/stats/me/tasks");
  const tasks = useApi<any[]>("/tasks");
  const [tab, setTab] = useState<"open" | "done">("open");
  const reload = () => { st.reload(); tasks.reload(); };
  return (<>
    <PageHead title="Мои задачи" sub={`${me!.note || me!.role_label} · ${me!.org?.name}`} />
    {st.data && <><div className="kpis"><Kpi label="В работе" value={st.data.open} /><Kpi label="Просрочено" value={st.data.overdue} alert={st.data.overdue > 0} />
      <Kpi label="Выполнено за 30 дней" value={st.data.done30} /><Kpi label="Объявлений для персонала" value={st.data.inner.n} sub={st.data.inner.last ? `последнее ${fd(st.data.inner.last)}` : undefined} /></div>
      <div className="panel"><SegBar title="Поручения" parts={[{ label: "В работе", value: st.data.open, color: "accent" }, { label: "Просрочено", value: st.data.overdue, color: "bad" }, { label: "Выполнено", value: st.data.doneTotal, color: "ok" }]} /></div></>}
    <Tabs value={tab} onChange={setTab} items={[["open", "В работе"], ["done", "Выполненные"]]} />
    {!tasks.data ? <Loading /> : <TaskList tasks={tasks.data.filter((t) => t.status === tab)} isHead={false} reload={reload} />}
  </>);
}

/* ---------- коллеги ---------- */
export function Colleagues() {
  const { me } = useAuth();
  const { data } = useApi<any[]>("/colleagues");
  return (<>
    <PageHead title="Коллеги" sub={me!.org?.name} />
    {!data ? <Loading /> : <div className="tbl-wrap"><table><thead><tr><th>Сотрудник</th><th>Роль на платформе</th><th>Должность</th></tr></thead>
      <tbody>{data.map((a) => <tr key={a.id}><td><b>{a.full_name}</b></td><td>{a.role_label}</td><td className="muted">{a.note}</td></tr>)}</tbody></table></div>}
  </>);
}
