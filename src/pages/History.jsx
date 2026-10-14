import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, byKey, fmtDate, fmtDateY, n0, periodLabel } from "../lib/format";
import { HISTORY_TYPES, buildHistory } from "../lib/history";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import HistoryList from "../components/HistoryList";
import { Empty, PageHead, Panel, PeriodSwitch } from "../components/ui";
import useActions from "./useActions";

const GROUPS_PER_PAGE = 20;

/* ---------- grouping: by day, week (Monday start) or month ---------- */
const mondayOf = (iso) => {
  const d = new Date(iso + "T12:00:00");
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -back);
};
const GROUPINGS = {
  day: {
    label: "Day",
    key: (iso) => iso,
    title: (k) => fmtDateY(k),
  },
  week: {
    label: "Week",
    key: mondayOf,
    title: (k) => `Week of ${fmtDate(k)} – ${fmtDateY(addDays(k, 6))}`,
  },
  month: {
    label: "Month",
    key: (iso) => iso.slice(0, 7),
    title: (k) => new Date(k + "-15T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  },
};

function summarise(rows) {
  const s = { in: 0, make: 0, out: 0, outV: 0, sold: 0, soldV: 0, paid: 0 };
  rows.forEach((h) => {
    if (h.type === "in") s.in += 1;
    if (h.type === "make") s.make += h.qty;
    if (h.type === "out" && !h.id.endsWith("-r")) { s.out += h.qty; s.outV += h.value; }
    if (h.type === "sold") { s.sold += h.qty; s.soldV += h.value; }
    if (h.type === "paid") s.paid += h.value;
  });
  return s;
}

export default function History() {
  const { state } = useStore();
  const L = useLookup();
  const { period } = useUI();
  const F = useFigures();
  const act = useActions();
  const [params, setParams] = useSearchParams();
  const [groupLimit, setGroupLimit] = useState(GROUPS_PER_PAGE);

  // Filters live in the address bar, so links like /history?shop=abc open pre-filtered.
  const f = {
    type: params.get("type") || "",
    shop: params.get("shop") || "",
    person: params.get("person") || "",
    product: params.get("product") || "",
    q: params.get("q") || "",
    group: GROUPINGS[params.get("group")] ? params.get("group") : "day",
  };
  const setF = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setGroupLimit(GROUPS_PER_PAGE);
  };
  const anyFilter = f.type || f.shop || f.person || f.product || f.q;

  const all = useMemo(() => buildHistory(state, L), [state, L]);
  const rows = all.filter((h) => {
    if (!F.inP(h.date)) return false;
    if (f.type && h.type !== f.type) return false;
    if (f.shop && h.shopId !== f.shop) return false;
    if (f.person && h.by !== f.person) return false;
    if (f.product && h.productId !== f.product) return false;
    if (f.q && !`${h.title} ${h.shopName || ""} ${h.detail}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
  const sum = summarise(rows);

  // Build groups (rows are already newest first, so groups are too)
  const G = GROUPINGS[f.group];
  const groups = [];
  rows.forEach((h) => {
    const k = G.key(h.date);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.rows.push(h);
    else groups.push({ key: k, rows: [h] });
  });
  const shownGroups = groups.slice(0, groupLimit);

  // Which groups are open. The newest group starts open; everything else starts closed.
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const firstKey = groups[0]?.key;
  const filterSig = [f.group, f.type, f.shop, f.person, f.product, f.q, period].join("|");
  useEffect(() => {
    setOpenKeys(new Set(firstKey ? [firstKey] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig]);
  const toggle = (k) =>
    setOpenKeys((cur) => {
      const n = new Set(cur);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const allOpen = shownGroups.length > 0 && shownGroups.every((g) => openKeys.has(g.key));
  const setAll = (open) => setOpenKeys(open ? new Set(shownGroups.map((g) => g.key)) : new Set());

  const shopName = f.shop && L.O(f.shop)?.name;
  const personName = f.person && L.U(f.person)?.name;

  return (
    <>
      <PageHead eyebrow="Every entry, newest first" title={shopName ? `History · ${shopName}` : personName ? `History · ${personName}` : "History"}>
        <PeriodSwitch />
      </PageHead>

      <div className="kv four">
        <div><b>{n0(sum.make)}</b><span>packs produced</span></div>
        <div><b>{n0(sum.out)}</b><span>packs sent · {L.money(sum.outV)}</span></div>
        <div><b>{n0(sum.sold)}</b><span>packs sold</span></div>
        <div><b className="sm">{L.money(sum.soldV)}</b><span>sales value</span></div>
      </div>

      <Panel>
        <div className="seg wrap" role="group" aria-label="Type of entry">
          <button type="button" aria-pressed={!f.type} onClick={() => setF("type", "")}>All</button>
          {Object.entries(HISTORY_TYPES).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={f.type === k} onClick={() => setF("type", k)}>{t.label}</button>
          ))}
        </div>
        <div className="toolbar">
          <select value={f.shop} onChange={(e) => setF("shop", e.target.value)} aria-label="Shop">
            <option value="">All shops</option>
            {state.outlets.slice().sort(byKey("name")).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={f.person} onChange={(e) => setF("person", e.target.value)} aria-label="Person">
            <option value="">Recorded by anyone</option>
            {state.users.slice().sort(byKey("name")).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={f.product} onChange={(e) => setF("product", e.target.value)} aria-label="Product">
            <option value="">All products</option>
            {state.products.map((p) => <option key={p.id} value={p.id}>{L.pName(p.id)}</option>)}
          </select>
          <input type="search" className="grow" placeholder="Search entries" value={f.q} onChange={(e) => setF("q", e.target.value)} aria-label="Search entries" />
          {anyFilter && (
            <button className="btn small ghost" onClick={() => { const n = new URLSearchParams(); if (f.group !== "day") n.set("group", f.group); setParams(n, { replace: true }); }}>
              Clear filters
            </button>
          )}
        </div>

        <div className="group-bar">
          <span className="muted small">{n0(rows.length)} entries in {n0(groups.length)} {G.label.toLowerCase()}{groups.length === 1 ? "" : "s"} · {periodLabel(period)}</span>
          <div className="actions">
            <span className="muted small">Group by</span>
            <div className="seg" role="group" aria-label="Group by">
              {Object.entries(GROUPINGS).map(([k, g]) => (
                <button key={k} type="button" aria-pressed={f.group === k} onClick={() => setF("group", k === "day" ? "" : k)}>{g.label}</button>
              ))}
            </div>
            {shownGroups.length > 1 && (
              <button className="btn small ghost" onClick={() => setAll(!allOpen)}>{allOpen ? "Collapse all" : "Expand all"}</button>
            )}
          </div>
        </div>

        {shownGroups.length ? (
          <div className="groups">
            {shownGroups.map((g) => {
              const open = openKeys.has(g.key);
              const s = summarise(g.rows);
              return (
                <section key={g.key} className={"group" + (open ? " open" : "")}>
                  <button className="group-h" aria-expanded={open} onClick={() => toggle(g.key)}>
                    <span className="chev" aria-hidden="true">▸</span>
                    <span className="group-title">{G.title(g.key)}</span>
                    <span className="group-sum">
                      <span className="gs">{g.rows.length} entr{g.rows.length === 1 ? "y" : "ies"}</span>
                      {s.make > 0 && <span className="gs"><i className="ic make">Mk</i>{n0(s.make)} made</span>}
                      {s.out > 0 && <span className="gs"><i className="ic out">Out</i>{n0(s.out)} delivered</span>}
                      {s.sold > 0 && <span className="gs"><i className="ic sold">$</i>{n0(s.sold)} sold · <b>{L.money(s.soldV)}</b></span>}
                      {s.paid > 0 && <span className="gs"><i className="ic paid">Pd</i>{L.money(s.paid)} paid</span>}
                      {s.in > 0 && <span className="gs"><i className="ic in">In</i>{s.in} material purchase{s.in === 1 ? "" : "s"}</span>}
                    </span>
                  </button>
                  {open && (
                    <div className="group-b">
                      <HistoryList rows={g.rows} showDate={f.group !== "day"} showShop={!f.shop} showBy onShop={(id) => act.shop(id)} />
                    </div>
                  )}
                </section>
              );
            })}
            {groups.length > groupLimit && (
              <button className="btn self-start" onClick={() => setGroupLimit(groupLimit + GROUPS_PER_PAGE)}>
                Show older ({n0(groups.length - groupLimit)} more {G.label.toLowerCase()}{groups.length - groupLimit === 1 ? "" : "s"})
              </button>
            )}
          </div>
        ) : (
          <Empty>{anyFilter ? "No entries match these filters." : "No entries in this period."}</Empty>
        )}
      </Panel>
    </>
  );
}
