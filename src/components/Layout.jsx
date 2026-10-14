import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { roleLabel, seesPage } from "../lib/roles";
import { initials } from "../lib/format";
import { useAuth } from "../state/auth";
import { useStore } from "../state/store";
import { useUI } from "../state/ui";
import NewMenu from "./NewMenu";
import Icon, { BowlMark } from "./Icons";

export const NAV = [
  ["Daily work", [
    ["/", "overview", "Overview", "Home"],
    ["/shops", "shops", "Supermarkets", "Shops"],
    ["/deliveries", "deliveries", "Deliveries", "Deliveries"],
    ["/sales", "sales", "Sales & payments", "Sales"],
    ["/production", "production", "Production", "Production"],
  ]],
  ["Insights", [
    ["/reports", "reports", "Reports", "Reports"],
    ["/history", "history", "History", "History"],
  ]],
  ["Admin", [
    ["/setup", "setup", "Setup", "Setup"],
  ]],
];

export default function Layout() {
  const { state, me } = useStore();
  const { signOut } = useAuth();
  const { open } = useUI();
  const { pathname } = useLocation();
  const navRef = useRef();
  const menuRef = useRef();
  const [menu, setMenu] = useState(false);
  const [theme, setThemeState] = useState(document.documentElement.dataset.theme || "light");
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("pf-theme", t); } catch { /* private window */ }
    setThemeState(t);
  };

  // Keep the open page visible in the phone menu, close the account menu when moving page
  useEffect(() => {
    navRef.current?.querySelector("a.active")?.scrollIntoView({ block: "nearest", inline: "center" });
    setMenu(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  // Close the account menu when clicking elsewhere
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => !menuRef.current?.contains(e.target) && setMenu(false);
    const onKey = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [menu]);

  const pending = state.dispatches.filter((d) => d.status === "in_transit").length;
  const groups = NAV.map(([label, items]) => [label, items.filter(([, page]) => seesPage(me, page))]).filter(([, items]) => items.length);

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-top">
          <div className="brand">
            <div className="brand-mark"><BowlMark /></div>
            <div className="brand-name">{state.settings.company}</div>
          </div>
          <NewMenu />
        </div>

        <nav className="nav" aria-label="Sections" ref={navRef}>
          {groups.map(([label, items]) => (
            <div className="nav-group" key={label}>
              {groups.length > 1 && <span className="nav-label">{label}</span>}
              {items.map(([to, icon, full, short]) => (
                <NavLink key={to} to={to} end={to === "/"}>
                  <Icon name={icon} />
                  <span className="nav-full">{full}</span>
                  <span className="nav-short">{short}</span>
                  {icon === "deliveries" && pending > 0 && <span className="badge" aria-label={`${pending} to confirm`}>{pending}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail-foot" ref={menuRef}>
          <button className="me-btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>
            <span className="av">{initials(me.name)}</span>
            <span className="me-text"><b>{me.name}</b><span>{roleLabel(me.role)}</span></span>
            <svg className="me-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
          </button>
          {menu && (
            <div className="me-menu pop" role="menu">
              <div className="me-head"><b>{me.name}</b><span>{roleLabel(me.role)}{me.username ? ` · ${me.username}` : ""}</span></div>
              <button role="menuitem" onClick={() => { setMenu(false); open("password"); }}>Change password</button>
              <div className="menu-label">Appearance</div>
              <div className="theme-row" role="group" aria-label="Appearance">
                {[["light", "Light"], ["dark", "Dark"], ["system", "Device"]].map(([k, l]) => (
                  <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>
                ))}
              </div>
              <button role="menuitem" className="danger-item" onClick={() => signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </aside>
      <main>
        <div className="page" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
