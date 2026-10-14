import { useState } from "react";
import { byKey, n0, periodLabel } from "../lib/format";
import { can } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { DataTable, PageHead, Panel, PeriodSwitch, Pill, SampleTag } from "../components/ui";
import useActions from "./useActions";

const RANK = { "Delivery to confirm": 0, "Out of stock": 1, "Restock soon": 2, "No sales recorded": 3, Stocked: 4, New: 5 };

export default function Shops() {
  const { state, me } = useStore();
  const L = useLookup();
  const { period, open } = useUI();
  const F = useFigures();
  const act = useActions();
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");

  const ql = q.toLowerCase();
  const shops = state.outlets
    .filter((o) => !region || (o.regionId || "none") === region)
    .filter((o) => !ql || `${o.name} ${o.area || ""} ${L.regionName(o.regionId)}`.toLowerCase().includes(ql));

  // Group by region, regions alphabetically, "No region" last
  const groups = {};
  shops.forEach((o) => (groups[o.regionId || "none"] ||= []).push(o));
  const keys = Object.keys(groups).sort((a, b) => (a === "none" ? 1 : b === "none" ? -1 : L.regionName(a).localeCompare(L.regionName(b))));

  const cols = [
    { label: "Supermarket", render: (o) => <><div className="name">{o.name}<SampleTag rec={o} /></div><div className="sub">{[o.type, o.area].filter(Boolean).join(" · ")}</div></> },
    { label: "On shelf", num: true, render: (o) => <b>{n0(F.out[o.id].inShop)}</b> },
    { label: "In transit", num: true, render: (o) => (F.out[o.id].inTransit ? n0(F.out[o.id].inTransit) : "—") },
    { label: "Sold", num: true, render: (o) => n0(F.out[o.id].soldP) },
    { label: "Sales value", num: true, render: (o) => L.money(F.out[o.id].revP) },
    { label: "Owed", num: true, render: (o) => L.money(F.out[o.id].outstanding) },
    { label: "Days left", num: true, render: (o) => (F.out[o.id].daysLeft === null ? "—" : n0(F.out[o.id].daysLeft)) },
    { label: "Status", render: (o) => <Pill status={F.out[o.id].status} /> },
  ];

  return (
    <>
      <PageHead eyebrow="Grouped by region" title="Supermarkets">
        <PeriodSwitch />
        {can(me, "setup") && <button className="btn primary" onClick={() => open("shopForm")}>Add supermarket</button>}
      </PageHead>
      <div className="toolbar">
        <input type="search" className="grow" placeholder="Search supermarket or area" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search supermarkets" />
        {state.regions.length > 1 && (
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
            <option value="">All regions</option>
            {state.regions.slice().sort(byKey("name")).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {state.outlets.some((o) => !o.regionId) && <option value="none">No region</option>}
          </select>
        )}
        <span className="muted small">Sold and sales value: {periodLabel(period)}. Owed: all time.</span>
      </div>
      {keys.length ? keys.map((k) => {
        const list = groups[k].sort((a, b) => RANK[F.out[a.id].status[0]] - RANK[F.out[b.id].status[0]] || F.out[b.id].revP - F.out[a.id].revP);
        const rev = list.reduce((a, o) => a + F.out[o.id].revP, 0);
        const managers = state.users.filter((u) => u.role === "regional_manager" && (u.regionIds || []).includes(k)).map((u) => u.name);
        return (
          <Panel key={k} eyebrow={k === "none" ? "Not in a region" : managers.length ? `Managed by ${managers.join(", ")}` : "No regional manager"}
            title={<>{L.regionName(k === "none" ? null : k)} <span className="h-note">{list.length} supermarket{list.length === 1 ? "" : "s"} · {L.money(rev)}</span></>}>
            <DataTable rows={list} onRowClick={(o) => act.shop(o.id)} columns={cols} />
          </Panel>
        );
      }) : <Panel><p className="muted">{state.outlets.length ? "No supermarkets match." : "No supermarkets yet."}</p></Panel>}
    </>
  );
}
