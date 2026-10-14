import { useMemo, useState } from "react";
import { byKey, fmtDate, fmtDateY, n0 } from "../lib/format";
import { METRICS, buildReport, presetPeriod, toCSV } from "../lib/report";
import { can, isScoped, seesFactory } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useUI } from "../state/ui";
import { DataTable, Meter, PageHead, Panel, PersonChip, SampleTag, Tabs } from "../components/ui";

const PRESETS = [["month", "This month"], ["lastMonth", "Last month"], ["30", "Last 30 days"], ["7", "Last 7 days"], ["year", "This year"], ["custom", "Custom"]];
const STOCK = METRICS.slice(0, 7);
const MONEY = METRICS.slice(7);

export default function Reports() {
  const { state, me } = useStore();
  const L = useLookup();
  const { open, toast } = useUI();
  const [preset, setPreset] = useState("month");
  const [view, setView] = useState("stock");
  const [range, setRange] = useState(presetPeriod("month"));
  const report = useMemo(() => buildReport(state, range.from, range.to), [state, range]);

  // Where the report starts for this person
  const myRegions = state.regions;
  const startRegion = me.role === "regional_manager" && myRegions.length === 1 ? myRegions[0].id : null;
  const startShop = me.role === "store_user" && state.outlets.length === 1 ? state.outlets[0].id : null;
  const [region, setRegion] = useState(startRegion);
  const [shop, setShop] = useState(startShop);

  const level = shop ? "shop" : region ? "region" : "business";
  const regionKeys = [...state.regions.map((r) => r.id).sort((a, b) => L.regionName(a).localeCompare(L.regionName(b))),
                      ...(state.outlets.some((o) => !o.regionId) ? ["none"] : [])];

  let rows, totals, rowLabel, onRow;
  if (level === "business") {
    rows = (me.role === "store_user" ? [] : regionKeys).map((k) => ({ id: k, name: k === "none" ? "No region" : L.regionName(k), ...report.regions[k] }));
    if (me.role === "store_user") rows = state.outlets.map((o) => ({ id: o.id, name: o.name, ...report.shops[o.id].totals }));
    totals = report.total;
    rowLabel = me.role === "store_user" ? "Supermarket" : "Region";
    onRow = me.role === "store_user" ? (r) => setShop(r.id) : (r) => setRegion(r.id);
  } else if (level === "region") {
    rows = state.outlets.filter((o) => (o.regionId || "none") === region).sort(byKey("name"))
      .map((o) => ({ id: o.id, name: o.name, sample: o.sample, ...report.shops[o.id].totals }));
    totals = report.regions[region] || report.total;
    rowLabel = "Supermarket";
    onRow = (r) => setShop(r.id);
  } else {
    const s = report.shops[shop];
    rows = Object.entries(s?.byProduct || {}).map(([pid, v]) => ({ id: pid, name: L.pName(pid), ...v, paid: null, outstanding: null, discount: null }));
    totals = s?.totals;
    rowLabel = "Product";
    onRow = null;
  }
  rows = rows.filter((r) => r);
  const maxSales = Math.max(1, ...rows.map((r) => r.salesValue || 0));
  const title = level === "shop" ? L.O(shop)?.name : level === "region" ? (region === "none" ? "No region" : L.regionName(region)) : (isScoped(me) ? "Your supermarkets" : "Whole business");
  const canSubmit = level === "region" && region !== "none" && can(me, "submitReport");

  const setPresetKey = (k) => { setPreset(k); if (k !== "custom") setRange(presetPeriod(k)); };

  const downloadCSV = () => {
    const head = [rowLabel, ...STOCK.map((m) => m[1]), ...MONEY.map((m) => m[1])];
    const line = (r) => [r.name, ...STOCK.map(([k]) => r[k] ?? ""), ...MONEY.map(([k]) => (r[k] == null ? "" : Math.round(r[k])))];
    const csv = toCSV([
      [`${state.settings.company}: ${title}`], [`Period: ${range.from} to ${range.to}`], [],
      head, ...rows.map(line), totals ? ["Total", ...line({ ...totals, name: "" }).slice(1)] : [],
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `report-${title.replace(/\W+/g, "-").toLowerCase()}-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Report downloaded");
  };

  const cell = (k) => (r) => (r[k] == null ? "—" : MONEY.some((m) => m[0] === k) ? L.money(r[k]) : n0(r[k]));
  const foot = (k) => (t) => (MONEY.some((m) => m[0] === k) ? L.money(t[k]) : n0(t[k]));
  const shown = view === "stock" ? STOCK : MONEY;
  const maxSold = Math.max(1, ...rows.map((r) => r.sold || 0));
  const cols = [
    { label: rowLabel, render: (r) => <><span className="name">{r.name}</span><SampleTag rec={r} /></> },
    ...shown.map(([k, label]) => ({
      label, num: true, foot: foot(k),
      render: k === "closing" ? (r) => <b>{n0(r.closing)}</b> : k === "salesValue" ? (r) => <b>{L.money(r.salesValue)}</b> : cell(k),
    })),
  ];
  if (level !== "shop") {
    cols.push(view === "stock"
      ? { label: "Share of packs sold", render: (r) => <Meter value={r.sold} max={maxSold} /> }
      : { label: "Share of sales", render: (r) => <Meter value={r.salesValue} max={maxSales} /> });
  }

  return (
    <>
      <PageHead eyebrow={`${fmtDateY(range.from)} – ${fmtDateY(range.to)}`} title="Reports">
        <select value={preset} onChange={(e) => setPresetKey(e.target.value)} aria-label="Reporting period">
          {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {preset === "custom" && (
          <span className="dates">
            <input type="date" aria-label="From" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <span className="muted">to</span>
            <input type="date" aria-label="To" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </span>
        )}
      </PageHead>

      <nav className="crumbs" aria-label="Report level">
        {!startShop && !(startRegion && me.role === "regional_manager") && (
          <button className="link" disabled={level === "business"} onClick={() => { setRegion(null); setShop(null); }}>{isScoped(me) ? "Your supermarkets" : "All regions"}</button>
        )}
        {region && !startShop && <><span aria-hidden="true">›</span><button className="link" disabled={level === "region"} onClick={() => setShop(null)}>{region === "none" ? "No region" : L.regionName(region)}</button></>}
        {shop && <><span aria-hidden="true">›</span><span>{L.O(shop)?.name}</span></>}
      </nav>

      {totals && (
        <div className="kv four">
          <div><b>{n0(totals.sold)}</b><span>packs sold</span></div>
          <div><b className="sm">{L.money(totals.salesValue)}</b><span>sales value{totals.discount ? ` · ${L.money(totals.discount)} discounts` : ""}</span></div>
          <div><b className="sm">{L.money(totals.paid)}</b><span>paid in this period</span></div>
          <div><b className={"sm" + (totals.outstanding > 0 ? " warn-text" : "")}>{L.money(totals.outstanding)}</b><span>owed at {fmtDate(range.to)}</span></div>
          <div><b>{n0(totals.closing)}</b><span>packs in stock at the end (opening {n0(totals.opening)})</span></div>
          <div><b>{n0(totals.returned)}</b><span>returned</span></div>
          <div><b className={totals.losses + totals.countDiff > 0 ? "bad-text" : ""}>{n0(totals.losses + totals.countDiff)}</b><span>damaged, expired, lost & count differences</span></div>
          <div><b className={totals.shortOnArrival > 0 ? "bad-text" : ""}>{n0(totals.shortOnArrival)}</b><span>missing on arrival · {n0(totals.inTransit)} in transit at the end</span></div>
        </div>
      )}

      <Panel eyebrow={level === "shop" ? "By product" : level === "region" ? "Supermarkets compared" : isScoped(me) ? "By region" : "Regions compared"}
        title={title}
        right={<div className="actions">
          {canSubmit && <button className="btn primary" onClick={() => open("submitReport", { regionId: region, from: range.from, to: range.to, summary: totals })}>Submit to management</button>}
          <button className="btn" onClick={downloadCSV}>Download CSV</button>
        </div>}>
        <Tabs value={view} onChange={setView} label="Figures" options={[["stock", "Stock movement"], ["money", "Money"]]} />
        <DataTable rows={rows} onRowClick={onRow} empty="Nothing to report for this selection."
          columns={cols} footer={totals && rows.length > 1 ? totals : null} />
        <p className="muted small">
          {view === "stock"
            ? "Closing stock = opening + received − sold − returned − damaged/expired/lost − count differences. Packs only count as received once the supermarket confirms the delivery."
            : "Sales value is after discounts. Outstanding is what was still owed at the end of the period."}
          {onRow && " Click a row to see more detail."}
        </p>
      </Panel>

      {level === "business" && seesFactory(me) && (
        <Panel eyebrow="Factory, same period" title="Production and dispatch">
          <div className="kv four">
            <div><b>{n0(report.factory.produced)}</b><span>packs produced</span></div>
            <div><b>{n0(report.factory.dispatched)}</b><span>packs sent to supermarkets</span></div>
            <div><b>{n0(report.factory.factoryLosses)}</b><span>packs damaged or lost at the factory</span></div>
            <div><b className="sm">{L.money(report.factory.materialsBought)}</b><span>spent on raw materials</span></div>
          </div>
        </Panel>
      )}

      {state.submissions.length > 0 && level !== "shop" && <Submissions />}
    </>
  );
}

function Submissions() {
  const { state } = useStore();
  const L = useLookup();
  const [openId, setOpenId] = useState(null);
  const rows = state.submissions.slice().sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return (
    <Panel eyebrow="From regional managers" title="Submitted reports">
      <DataTable rows={rows} onRowClick={(r) => setOpenId(openId === r.id ? null : r.id)}
        columns={[
          { label: "Region", render: (r) => <><span className="name">{r.regionName}</span><SampleTag rec={r} /></> },
          { label: "Period", render: (r) => `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}` },
          { label: "Sold", num: true, render: (r) => n0(r.summary?.sold) },
          { label: "Sales value", num: true, render: (r) => L.money(r.summary?.salesValue) },
          { label: "Owed", num: true, render: (r) => L.money(r.summary?.outstanding) },
          { label: "Submitted by", render: (r) => <PersonChip id={r.submittedBy} /> },
          { label: "On", render: (r) => fmtDate(r.createdAt?.slice(0, 10)) },
          { label: "Comments", render: (r) => (openId === r.id ? <span className="note-full">{r.note || "No comments."}</span> : <span className="sub clamp">{r.note || "—"}</span>) },
        ]} />
    </Panel>
  );
}
