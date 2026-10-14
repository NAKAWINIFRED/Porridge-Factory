import { useState } from "react";
import { byKey, fmtDate, n0, num, periodLabel } from "../lib/format";
import { can, canDelete, seesFactory } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { ConfirmButton, DataTable, PageHead, Panel, PeriodSwitch, Pill, SampleTag, Stamp, Tabs } from "../components/ui";
import useActions from "./useActions";

export default function Deliveries() {
  const { state, me, del } = useStore();
  const L = useLookup();
  const { period } = useUI();
  const F = useFigures();
  const act = useActions();
  const [tab, setTab] = useState("in_transit");
  const [shop, setShop] = useState("");

  const transit = state.dispatches.filter((d) => d.status === "in_transit");
  let rows = tab === "in_transit" ? transit : state.dispatches.filter((d) => F.inP(d.date));
  if (tab === "short") rows = rows.filter((d) => d.status === "received" && num(d.receivedQty) < num(d.qty));
  if (shop) rows = rows.filter((d) => d.outletId === shop);
  rows = rows.slice().sort(byKey("date", -1));

  const sent = rows.reduce((a, d) => a + num(d.qty), 0);
  const shortTotal = state.dispatches.filter((d) => F.inP(d.date) && d.status === "received").reduce((a, d) => a + num(d.qty) - num(d.receivedQty), 0);

  return (
    <>
      <PageHead eyebrow="Factory → supermarket" title="Deliveries">
        <PeriodSwitch />
        {can(me, "dispatch") && <button className="btn primary" onClick={() => act.dispatch()}>Send stock</button>}
      </PageHead>

      {seesFactory(me) && (
        <Panel eyebrow="Finished packs" title="Factory stock"
          right={<div className="actions">
            {can(me, "batches") && <button className="btn small" onClick={act.batch}>Record production</button>}
            {can(me, "factoryAdjust") && <button className="btn small" onClick={act.factoryCount}>Factory stock count</button>}
            {can(me, "factoryAdjust") && <button className="btn small ghost" onClick={act.factoryLoss}>Damage / loss</button>}
          </div>}>
          <DataTable rows={state.products} empty="No products yet. Add them under Setup → Products."
            columns={[
              { label: "Product", render: (p) => <span className="name">{L.pName(p.id)}</span> },
              { label: "In the factory", num: true, render: (p) => <b className={F.prod[p.id].factory <= 0 ? "bad-text" : ""}>{n0(Math.max(0, F.prod[p.id].factory))}</b> },
              { label: "On the way", num: true, render: (p) => n0(F.prod[p.id].inTransit) },
              { label: `Produced, ${periodLabel(period)}`, num: true, render: (p) => n0(F.prod[p.id].producedP) },
              { label: `Sent out, ${periodLabel(period)}`, num: true, render: (p) => n0(F.prod[p.id].dispatchedP) },
            ]} />
          <span className="muted small">Packs come into the factory from <b>Record production</b>. Use <b>Factory stock count</b> for packs you already had, or to correct the figure after checking the store.</span>
        </Panel>
      )}

      <Panel>
        <div className="group-bar">
          <Tabs value={tab} onChange={setTab} label="Show" options={[
            ["in_transit", `To confirm (${transit.length})`], ["all", `All, ${periodLabel(period)}`], ["short", "Arrived short"],
          ]} />
          {state.outlets.length > 1 && (
            <select value={shop} onChange={(e) => setShop(e.target.value)} aria-label="Supermarket" className="toolbar-select">
              <option value="">All supermarkets</option>
              {state.outlets.slice().sort(byKey("name")).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
        <span className="muted small">
          {tab === "in_transit"
            ? "Sent from the factory but not yet confirmed by the supermarket. Packs only count as the supermarket's stock once confirmed."
            : `${n0(rows.length)} deliveries · ${n0(sent)} packs sent${shortTotal > 0 ? ` · ${n0(shortTotal)} packs missing on arrival in this period` : ""}`}
        </span>
        <DataTable rows={rows}
          empty={tab === "in_transit" ? "Nothing waiting. Every delivery has been confirmed." : "No deliveries match."}
          columns={[
            { label: "Sent", render: (d) => fmtDate(d.date) },
            { label: "Note", render: (d) => <><Stamp>{d.note}</Stamp><SampleTag rec={d} /></> },
            { label: "Supermarket", render: (d) => <button className="link" onClick={() => act.shop(d.outletId)}>{L.O(d.outletId)?.name || "Removed"}</button> },
            { label: "Product", render: (d) => L.pName(d.productId) },
            { label: "Sent", num: true, render: (d) => n0(d.qty) },
            { label: "Received", num: true, render: (d) => (d.status === "received" ? <b>{n0(d.receivedQty)}</b> : "—") },
            { label: "Status", render: (d) => d.status === "in_transit" ? <Pill status={["In transit", "warn"]} />
                : num(d.receivedQty) < num(d.qty) ? <Pill status={[`${n0(num(d.qty) - num(d.receivedQty))} short`, "bad"]} />
                : <Pill status={[`Received ${fmtDate(d.receivedDate)}`, "good"]} /> },
            { label: "", render: (d) => (
              <span className="row-actions">
                {d.status === "in_transit" && can(me, "receive") && <button className="btn small primary" onClick={() => act.receive(d.id)}>Confirm</button>}
                {canDelete(me, d) && <ConfirmButton onConfirm={() => del(`/api/dispatches/${d.id}`)}>Delete</ConfirmButton>}
              </span>
            ) },
          ]} />
      </Panel>
    </>
  );
}
