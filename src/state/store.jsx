// The data store. Records live in PostgreSQL; this keeps a copy of what the signed-in person may see.
// Every change goes to the API, then the copy reloads. It also refreshes every 30 seconds and when
// you come back to the tab, so you see what others on the team have entered.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "../lib/api";
import { n0 } from "../lib/format";
import { useAuth } from "./auth";
import { useUI } from "./ui";

export const COLLECTIONS = ["regions", "outlets", "products", "materials", "purchases", "batches", "dispatches",
                            "sales", "payments", "adjustments", "submissions", "users", "bom"];
export const DEFAULT_SETTINGS = { company: "Porridge Factory", currency: "UGX", lowDays: 5, quietDays: 7 };

function normalise(raw) {
  const s = Object.fromEntries(COLLECTIONS.map((c) => [c, Array.isArray(raw?.[c]) ? raw[c] : []]));
  s.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) };
  s.me = raw?.me || null;
  return s;
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const { toast } = useUI();
  const { signOut } = useAuth();
  const [state, setState] = useState(() => normalise({}));
  const [status, setStatus] = useReducer((s, v) => ({ ...s, ...v }), { ready: false, error: null });
  const busy = useRef(0);

  const reload = useCallback(async () => {
    const data = await api.get("/api/state");
    setState(normalise(data));
    setStatus({ ready: true, error: null });
  }, []);

  useEffect(() => {
    reload().catch((e) => (e.status === 401 ? signOut(true) : setStatus({ error: e.message })));
    const refresh = () => {
      if (document.visibilityState === "visible" && busy.current === 0) {
        reload().catch((e) => e.status === 401 && signOut(true));
      }
    };
    const t = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [reload, signOut]);

  const actions = useMemo(() => {
    /** Send a change, then reload. Shows the error and returns false if it fails; otherwise the API's reply (or true). */
    const send = async (method, url, body) => {
      busy.current++;
      try {
        const r = await api[method](url, body);
        await reload();
        return r ?? true;
      } catch (e) {
        if (e.status === 401) signOut(true);
        else toast(e.message, "bad");
        return false;
      } finally {
        busy.current--;
      }
    };
    return {
      reload: () => send("get", "/api/state"),
      post: (url, body) => send("post", url, body),
      patch: (url, body) => send("patch", url, body),
      put: (url, body) => send("put", url, body),
      del: (url) => send("del", url),
    };
  }, [reload, toast, signOut]);

  const value = useMemo(() => ({ state, me: state.me, ...actions }), [state, actions]);

  if (!status.ready) {
    return (
      <div className="start">
        {status.error ? (
          <div className="panel start-card">
            <span className="eyebrow">Can't open the records</span>
            <h2>Something is stopping the app</h2>
            <p className="muted">{status.error}</p>
            <button className="btn primary self-start" onClick={() => { setStatus({ error: null }); reload().catch((e) => setStatus({ error: e.message })); }}>
              Try again
            </button>
          </div>
        ) : (
          <p className="muted">Opening your factory records…</p>
        )}
      </div>
    );
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);

/** Quick lookups by id plus money formatting in the company currency. */
export function useLookup() {
  const { state } = useStore();
  return useMemo(() => {
    const idx = (c) => Object.fromEntries(state[c].map((x) => [x.id, x]));
    const p = idx("products"), m = idx("materials"), o = idx("outlets"), r = idx("regions"), u = idx("users");
    const cur = state.settings.currency;
    return {
      P: (id) => p[id],
      M: (id) => m[id],
      O: (id) => o[id],
      R: (id) => r[id],
      U: (id) => u[id],
      who: (id) => (id ? u[id]?.name || "Former user" : ""),
      pName: (id) => (p[id] ? p[id].name + (p[id].size ? " · " + p[id].size : "") : "Removed product"),
      regionName: (id) => r[id]?.name || "No region",
      money: (v) => `${cur} ${n0(v)}`,
    };
  }, [state]);
}
