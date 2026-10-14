// Signing in. Shows the first-run "create administrator" screen, the sign-in screen, or the app.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { BowlMark } from "../components/Icons";

const AuthCtx = createContext(null);

export function AuthGate({ children }) {
  const [st, setSt] = useState({ loading: true });

  const check = useCallback(async () => {
    try {
      const s = await api.get("/api/auth/status");
      setSt({ loading: false, needsSetup: s.needsSetup, user: s.user });
    } catch (e) {
      setSt({ loading: false, error: e.message, setup: e.setup });
    }
  }, []);
  useEffect(() => { check(); }, [check]);

  const signOut = useCallback(async (expired) => {
    if (!expired) await api.post("/api/auth/logout").catch(() => {});
    setSt((s) => ({ ...s, user: null, expired: !!expired }));
  }, []);

  if (st.loading) return <div className="start"><p className="muted">Opening…</p></div>;
  if (st.error) {
    return (
      <Shell eyebrow={st.setup ? "Database not set up" : "Can't open the records"} title={st.setup ? "One step left in pgAdmin" : "The app can't reach the database"}>
        <p className="muted">{st.error}</p>
        {!st.setup && (
          <ol className="muted small">
            <li>Make sure PostgreSQL is running (you can check in pgAdmin).</li>
            <li>Make sure the server is running: <code>npm run dev</code> in the project folder.</li>
            <li>Check the database name, user and password in the <code>.env</code> file.</li>
          </ol>
        )}
        <button className="btn primary self-start" onClick={() => { setSt({ loading: true }); check(); }}>Try again</button>
      </Shell>
    );
  }
  if (st.needsSetup) return <CreateAdmin onDone={(user) => setSt({ loading: false, user })} />;
  if (!st.user) return <SignIn expired={st.expired} onDone={(user) => setSt({ loading: false, user })} />;
  return <AuthCtx.Provider value={{ user: st.user, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

function Shell({ eyebrow, title, children }) {
  return (
    <div className="start">
      <div className="panel start-card">
        <div className="brand"><div className="brand-mark"><BowlMark /></div><div className="brand-name">Porridge Factory</div></div>
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        {children}
      </div>
    </div>
  );
}

function SignIn({ onDone, expired }) {
  const [v, setV] = useState({ username: "", password: "" });
  const [err, setErr] = useState(expired ? "You were signed out. Please sign in again." : "");
  const [busy, setBusy] = useState(false);
  return (
    <Shell eyebrow="Welcome back" title="Sign in">
      <form className="f" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { onDone((await api.post("/api/auth/login", v)).user); } catch (x) { setErr(x.message); setBusy(false); }
      }}>
        <div className="field"><label htmlFor="username">Username</label>
          <input id="username" autoComplete="username" autoFocus value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} /></div>
        <div className="field"><label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></div>
        {err && <div className="form-err" role="alert">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <span className="muted small">Forgot your password? Ask your administrator to set a new one.</span>
      </form>
    </Shell>
  );
}

function CreateAdmin({ onDone }) {
  const [v, setV] = useState({ name: "", username: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Shell eyebrow="First time setup" title="Create the administrator account">
      <p className="muted small">This account manages people, regions, shops and products. You can add everyone else after signing in.</p>
      <form className="f" onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        if (v.password !== v.confirm) return setErr("The two passwords don't match.");
        setBusy(true);
        try { onDone((await api.post("/api/auth/setup", v)).user); } catch (x) { setErr(x.message); setBusy(false); }
      }}>
        <div className="field"><label htmlFor="name">Your name</label><input id="name" autoFocus value={v.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={v.username} onChange={set("username")} /></div>
        <div className="row2">
          <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" value={v.password} onChange={set("password")} /><div className="hint">At least 8 characters.</div></div>
          <div className="field"><label htmlFor="confirm">Type it again</label><input id="confirm" type="password" autoComplete="new-password" value={v.confirm} onChange={set("confirm")} /></div>
        </div>
        {err && <div className="form-err" role="alert">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account and sign in"}</button>
      </form>
    </Shell>
  );
}
