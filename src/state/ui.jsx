// UI state shared across pages: the reporting period, toasts and the side drawer.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { compute } from "../lib/calc";
import { useStore } from "./store";

const UICtx = createContext(null);

function readPeriod() {
  try {
    const v = localStorage.getItem("pfl-period");
    if (v !== null) return +v;
  } catch { /* ignore */ }
  return 30;
}

export function UIProvider({ children }) {
  const [period, setPeriodRaw] = useState(readPeriod);
  const [toastMsg, setToastMsg] = useState(null);
  const [drawer, setDrawer] = useState(null); // { kind, props, back }
  const timer = useRef();

  const setPeriod = useCallback((p) => {
    setPeriodRaw(p);
    try { localStorage.setItem("pfl-period", String(p)); } catch { /* ignore */ }
  }, []);

  const toast = useCallback((msg, kind = "") => {
    setToastMsg({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), kind === "bad" ? 5000 : 2600);
  }, []);

  /** Open a drawer. If one is already showing a shop/person, remember it so forms return there. */
  const open = useCallback((kind, props = {}) => {
    setDrawer((cur) => ({
      kind,
      props,
      back: cur && (cur.kind === "shop" || cur.kind === "staff") ? { kind: cur.kind, props: cur.props } : null,
    }));
  }, []);

  const close = useCallback(() => setDrawer(null), []);

  /** Call after a form saves: shows a toast and goes back to the detail it came from. */
  const done = useCallback(
    (msg) => {
      toast(msg);
      setDrawer((cur) => (cur && cur.back ? { ...cur.back, back: null } : null));
    },
    [toast]
  );

  const value = useMemo(
    () => ({ period, setPeriod, toast, toastMsg, drawer, open, close, done }),
    [period, setPeriod, toast, toastMsg, drawer, open, close, done]
  );
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

export const useUI = () => useContext(UICtx);

/** All computed figures for the current period. */
export function useFigures() {
  const { state } = useStore();
  const { period } = useUI();
  return useMemo(() => compute(state, period), [state, period]);
}
