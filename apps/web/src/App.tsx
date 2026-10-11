import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
        <span className="mark"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2 2 6l8 4 8-4-8-4Z" fill="var(--accent-ink)" /><path d="M5 8.5V13c0 1.4 2.2 3 5 3s5-1.6 5-3V8.5L10 11 5 8.5Z" fill="var(--sun)" /></svg></span>
        <span><b>Білім порталы</b><small>Сайты школ и детсадов области</small></span>
      </Link>
      <Link to="/feed" className="btn sm ghost">Новости</Link>
      {me ? (<>
        <Link to="/cabinet" className="btn sm ghost">Кабинет</Link>
        <div className="who"><span className="avatar">{initials(me.full_name)}</span><span className="t"><b>{me.full_name}</b><span className="muted">{me.role_label}</span></span></div>
        <button className="btn sm" onClick={async () => { await logout(); nav("/"); }}>Выйти</button>
      </>) : <Link to="/login" className="btn pri sm">Войти</Link>}
    </div></header>
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
      <Toast />
    </>
  );
}
