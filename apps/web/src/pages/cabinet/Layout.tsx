import { useEffect, type ComponentType } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth, type Role } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import * as C from "./control";
import * as O from "./org";
import * as K from "./class";
import * as F from "./family";
import { Feed } from "./feed";

/** Меню кабинета: у каждой роли свой набор разделов */
export const NAV: Record<Role, [string, string][]> = {
  operator: [["platform", "Состояние платформы"], ["feed", "Лента новостей"], ["log", "Журнал действий"]],
  region: [["area", "Мониторинг области"], ["feed", "Лента новостей"], ["orgs", "Организации"], ["remarks", "Замечания"], ["requirements", "Требования к сайтам"], ["announcements", "Объявления на сайтах"], ["users", "Администраторы"], ["log", "Журнал действий"]],
  observer: [["area", "Мониторинг области"], ["feed", "Лента новостей"], ["orgs", "Организации"]],
  district: [["area", "Мониторинг района"], ["feed", "Лента новостей"], ["orgs", "Организации района"], ["remarks", "Замечания"], ["appeals", "Обращения"], ["announcements", "Объявления на сайтах"], ["users", "Руководители"], ["log", "Журнал действий"]],
  head: [["home", "Обзор"], ["feed", "Лента новостей"], ["posts", "Публикации"], ["site", "Разделы сайта"], ["documents", "Документы"], ["remarks", "Замечания"], ["appeals", "Обращения"], ["classes", "Классы и группы"], ["staffroom", "Персонал и поручения"], ["users", "Сотрудники"], ["log", "Журнал действий"]],
  editor: [["home", "Обзор"], ["feed", "Лента новостей"], ["posts", "Публикации"], ["site", "Разделы сайта"], ["documents", "Документы"], ["remarks", "Замечания"], ["appeals", "Обращения"], ["staffroom", "Для сотрудников"], ["users", "Авторы"]],
  author: [["posts", "Мои материалы"], ["feed", "Лента новостей"], ["staffroom", "Для сотрудников"]],
  teacher: [["overview", "Обзор"], ["feed", "Лента новостей"], ["class", "Мой класс"], ["classposts", "Объявления и задания"], ["messages", "Сообщения родителей"], ["posts", "Мои материалы"], ["staffroom", "Для сотрудников"]],
  personnel: [["tasks", "Мои задачи"], ["feed", "Лента новостей"], ["staffroom", "Для сотрудников"], ["colleagues", "Коллеги"]],
  parent: [["kids", "Мои дети"], ["feed", "Лента новостей"], ["family-news", "Объявления"], ["diary", "Задания"], ["chat", "Сообщения педагогу"]],
  student: [["me", "Обзор"], ["feed", "Лента новостей"], ["diary", "Задания"], ["family-news", "Объявления класса"], ["school-news", "Новости школы"]],
};

const PAGES: Record<string, ComponentType> = {
  platform: C.Platform, area: C.Area, orgs: C.Orgs, remarks: C.Remarks, appeals: C.Appeals, announcements: C.Announcements,
  requirements: C.Requirements, users: C.Users, log: C.AuditLog, feed: Feed,
  home: O.OrgHome, posts: O.Posts, site: O.SiteInfo, documents: O.Documents, classes: O.Classes, staffroom: O.Staffroom, colleagues: O.Colleagues, tasks: O.MyTasks,
  overview: K.TeacherOverview, class: K.MyClass, classposts: K.ClassPosts, messages: K.Messages,
  kids: F.Kids, "family-news": F.FamilyNews, diary: F.Diary, chat: F.ParentChat, me: F.StudentOverview, "school-news": F.SchoolNews,
};
/** Какой счётчик API показывать у пункта меню */
const BADGE: Record<string, string> = { posts: "posts", remarks: "remarks", appeals: "appeals", messages: "messages", chat: "chat", tasks: "tasks", staffroom: "tasks" };

export function Cabinet() {
  const { me } = useAuth();
  const { page } = useParams();
  const loc = useLocation();
  const counters = useApi<Record<string, number>>("/counters");
  useEffect(() => { counters.reload(); window.scrollTo(0, 0); }, [loc.pathname]); // eslint-disable-line
  if (!me) return null;
  const nav = NAV[me.role];
  if (!page) return <Navigate to={`/cabinet/${nav[0][0]}`} replace />;
  if (!nav.some(([k]) => k === page)) return <Navigate to={`/cabinet/${nav[0][0]}`} replace />;
  const Page = PAGES[page];
  const scope = me.org?.name ?? (me.role === "district" ? me.note : "Область");
  const badgeFor = (k: string) => {
    if (k === "posts" && ["author", "teacher"].includes(me.role)) return counters.data?.mine;
    if (k === "staffroom" && me.role !== "personnel" && me.role !== "author" && me.role !== "teacher" && me.role !== "editor") return undefined;
    return counters.data?.[BADGE[k]];
  };
  return (
    <div className="shell">
      <nav className="side" aria-label="Разделы кабинета">
        <span className="lbl">{scope}</span>
        {nav.map(([k, l]) => { const b = badgeFor(k); return (
          <Link key={k} to={`/cabinet/${k}`} aria-current={page === k ? "page" : undefined}><span>{me.role === "teacher" && k === "class" && me.org_kind === "kg" ? "Моя группа" : l}</span>{b ? <span className="badge">{b}</span> : null}</Link>); })}
      </nav>
      <div className="main"><Page key={page} /></div>
    </div>
  );
}
