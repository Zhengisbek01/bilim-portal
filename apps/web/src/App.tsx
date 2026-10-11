import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Logo } from "./components/Brand";
import { useAuth } from "./lib/auth";
import { useMeta } from "./lib/meta";
import { initials } from "./lib/format";
import { Banner, Toast } from "./components/ui";
import { Catalog } from "./pages/public/Catalog";
import { OrgSite } from "./pages/public/OrgSite";
import { PublicFeed } from "./pages/public/PublicFeed";
import { Login } from "./pages/Login";
import { Cabinet } from "./pages/cabinet/Layout";

function TopBar() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="bar"><div className="bar-in">
      <Link to="/" className="brand">
        <Logo />
        <span><b>Білім порталы</b><small>Мектептер мен балабақшалар порталы</small></span>
      </Link>
      <nav className="topnav" aria-label="Основное меню">
        <NavLink to="/" end>Школы и сады</NavLink>
        <NavLink to="/feed">Новости</NavLink>
        {me && <NavLink to="/cabinet">Кабинет</NavLink>}
      </nav>
      {me ? (<>
        <div className="who"><span className="avatar">{initials(me.full_name)}</span><span className="t"><b>{me.full_name}</b><span className="muted">{me.role_label}</span></span></div>
        <button className="btn sm" onClick={async () => { await logout(); nav("/"); }}>Выйти</button>
      </>) : <Link to="/login" className="btn pri">Войти</Link>}
    </div></header>
  );
}

function Footer() {
  const { meta } = useMeta();
  return (
    <footer className="footer"><div className="footer-in">
      <div className="col" style={{ maxWidth: 420 }}><b style={{ fontFamily: "var(--f-display)", fontSize: 17 }}>Білім порталы</b>
        <span>Единая платформа сайтов школ и детских садов. {meta?.regionName ? `${meta.regionName[0].toUpperCase()}${meta.regionName.slice(1)}.` : ""} Сервер и поддержка — на стороне области.</span></div>
      <div className="col"><b>Госуслуги</b><a href="https://egov.kz" target="_blank" rel="noopener noreferrer">Приём в 1 класс</a><a href="https://egov.kz" target="_blank" rel="noopener noreferrer">Очередь в детский сад</a></div>
      <div className="col"><b>Полезное</b><Link to="/feed">Новости образования</Link><span>Сообщить о коррупции: 1424</span></div>
    </div></footer>
  );
}

export function App() {
  const { ready, me } = useAuth();
  const { meta } = useMeta();
  return (
    <>
      <TopBar />
      <main className="wrap">
        {meta?.maintenance && <Banner kind="bad" title="Техработы">{meta.maintenance}</Banner>}
        {!ready ? <div className="muted small">Загрузка…</div> : (
          <Routes>
            <Route path="/" element={<Catalog />} />
            <Route path="/feed" element={<PublicFeed />} />
            <Route path="/o/:slug" element={<OrgSite />} />
            <Route path="/o/:slug/:section" element={<OrgSite />} />
            <Route path="/login" element={me ? <Navigate to="/cabinet" replace /> : <Login />} />
            <Route path="/cabinet" element={me ? <Cabinet /> : <Navigate to="/login" replace />} />
            <Route path="/cabinet/:page" element={me ? <Cabinet /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<div className="empty">Страница не найдена. <Link to="/">На главную</Link></div>} />
          </Routes>
        )}
      </main>
      <Footer />
      <Toast />
    </>
  );
}
