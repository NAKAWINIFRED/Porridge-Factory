// Form building blocks used by every entry form.
import { useEffect, useRef, useState } from "react";
import { useUI } from "../state/ui";

/**
 * Wraps a form: handles submit, shows the error message, Save/Cancel buttons.
 * onSubmit may be async. Return a string to show it as an error under the form.
 */
export function FormShell({ onSubmit, children }) {
  const { close } = useUI();
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fields = [...(ref.current?.querySelectorAll("input:not([type=date]):not([type=checkbox]):not([disabled]), select, textarea") || [])];
    (fields.find((f) => f.value === "") || fields[0])?.focus();
  }, []);
  return (
    <form
      ref={ref}
      className="f"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        setErr("");
        setSaving(true);
        try {
          const r = await onSubmit();
          if (typeof r === "string") setErr(r);
        } finally {
          setSaving(false);
        }
      }}
    >
      {children}
      {err && <div className="form-err" role="alert">{err}</div>}
      <div className="form-foot">
        <button className="btn ghost" type="button" onClick={close}>Cancel</button>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? <><span className="spin" aria-hidden="true" />Saving…</> : "Save"}</button>
      </div>
    </form>
  );
}

export function Field({ id, label, hint, bad, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div className={"hint" + (bad ? " bad" : "")}>{hint}</div>}
    </div>
  );
}

export function Row({ children }) {
  return <div className="row2">{children}</div>;
}

/** Text / number / date input bound to a values object. */
export function Input({ id, v, set, type = "text", money, ...rest }) {
  const isNum = type === "number" || money;
  if (money) {
    const raw = v[id] ?? "";
    const n = parseFloat(String(raw).replace(/,/g, ""));
    return (
      <div className="money-input">
        <span className="money-cur">{money}</span>
        <input id={id} name={id} type="number" inputMode="decimal" min={0} step="any" value={raw}
          onChange={(e) => set(id, e.target.value)} {...rest} />
        {Number.isFinite(n) && n >= 1000 && <span className="money-read" aria-hidden="true">{n.toLocaleString("en-US")}</span>}
      </div>
    );
  }
  return (
    <input
      id={id}
      name={id}
      type={type}
      inputMode={isNum ? "decimal" : undefined}
      min={isNum ? 0 : undefined}
      step={isNum ? "any" : undefined}
      value={v[id] ?? ""}
      onChange={(e) => set(id, e.target.value)}
      {...rest}
    />
  );
}

/** options: [{value,label}] */
export function Select({ id, v, set, options, blank }) {
  return (
    <select id={id} name={id} value={v[id] ?? ""} onChange={(e) => set(id, e.target.value)}>
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** useState for a flat form, with a setter that takes (key, value). */
export function useForm(initial, onChange) {
  const [v, setV] = useState(initial);
  const set = (k, val) =>
    setV((cur) => {
      const next = { ...cur, [k]: val };
      return onChange ? onChange(next, k, cur) : next;
    });
  return [v, set, setV];
}
