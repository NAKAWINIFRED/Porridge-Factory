// Small reusable building blocks.
import { useEffect, useState } from "react";
import { initials } from "../lib/format";
import { useLookup } from "../state/store";
import { useUI } from "../state/ui";

export function Pill({ status }) {
  return <span className={`pill ${status[1]}`}>{status[0]}</span>;
}

export function SampleTag({ rec }) {
  return rec && rec.sample ? <span className="tag-sample">Sample</span> : null;
}

export function Stamp({ children }) {
  return <span className="stamp">{children || "—"}</span>;
}

/** A person's name with initials. `empty` is shown when there's no one. */
export function PersonChip({ id, empty = "—" }) {
  const { U } = useLookup();
  const s = U(id);
  if (!s) return id ? <span className="chip"><span className="av">?</span>Former user</span> : <span className="muted">{empty}</span>;
  return (
    <span className="chip">
      <span className="av">{initials(s.name)}</span>
      {s.name}
    </span>
  );
}

/** Tabs inside a page (a segmented control). */
export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="seg wrap" role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

/** Small horizontal bar for comparing values in a table. */
export function Meter({ value, max, tone }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className={"bar-meter" + (tone ? " " + tone : "")}><span style={{ width: pct + "%" }} /></div>;
}

export function PeriodSwitch() {
  const { period, setPeriod } = useUI();
  const opts = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]];
  return (
    <div className="seg" role="group" aria-label="Period">
      {opts.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={period === v} onClick={() => setPeriod(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }) {
  return (
    <div className="head">
      <div className="head-l">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Panel({ eyebrow, title, right, children }) {
  return (
    <section className="panel">
      {(eyebrow || title || right) && (
        <div className="panel-h">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/**
 * columns: [{ label, num?, render(row) }]
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRowClick, empty, footer }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.num ? "n" : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? "click" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(r)) : undefined}
            >
              {columns.map((c, i) => (
                <td key={i} className={c.num ? "n" : undefined}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {columns.map((c, i) => (
                <td key={i} className={c.num ? "n" : undefined}>{c.foot ? c.foot(footer) : i === 0 ? "Total" : ""}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** A button that asks for a second click before doing something destructive. */
export function ConfirmButton({ onConfirm, children, confirmText = "Confirm", className = "btn small ghost danger" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className + (armed ? " confirm" : "")}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) { setArmed(false); onConfirm(); } else setArmed(true);
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}

export function Toast() {
  const { toastMsg } = useUI();
  return (
    <div aria-live="polite">
      {toastMsg && (
        <div className={`toast ${toastMsg.kind}`} key={toastMsg.msg + toastMsg.kind}>
          <span className="toast-ic" aria-hidden="true">{toastMsg.kind === "bad" ? "!" : "✓"}</span>
          <span>{toastMsg.msg}</span>
        </div>
      )}
    </div>
  );
}
