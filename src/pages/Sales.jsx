import { useState } from "react";
import { byKey, fmtDate, n0, num, periodLabel } from "../lib/format";
import { LOSS_REASONS } from "../lib/calc";
import { can, canDelete } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { ConfirmButton, DataTable, Meter, PageHead, Panel, PeriodSwitch, PersonChip, Pill, SampleTag, Tabs } from "../components/ui";
import useActions from "./useActions";

export default function Sales() {
  const { state, me, del } = useStore();
  const L = useLookup();
  const { period } = useUI();
  const F = useFigures();
  const act = useActions();
  const [tab, setTab] = useState("sales");
  const [shop, setShop] = useState("");
  const inShop = (r) => !shop || r.outletId === shop;

  const sales = state.sales.filter((s) => F.inP(s.date) && inShop(s)).sort(byKey("date", -1));
  const pays = state.payments.filter((p) => F.inP(p.date) && inShop(p)).sort(byKey("date", -1));
  const adj = state.adjustments.filter((a) => a.item === "product" && a.outletId && F.inP(a.date) && inShop(a)).sort(byKey("date", -1));
  const value = sales.reduce((a, s) => a + num(s.amount), 0);
  const discount = sales.reduce((a, s) => a + num(s.discount), 0);
  const paid = pays.reduce((a, p) => a + num(p.amount), 0);
  const owed = state.outlets.filter((o) => !shop || o.id === shop).reduce((a, o) => a + F.out[o.id].outstanding, 0);
  const maxOwed = Math.max(1, ...state.outlets.map((o) => F.out[o.id].outstanding));
  const delBtn = (kind, r) => canDelete(me, r) && <ConfirmButton onConfirm={() => del(`/api/${kind}/${r.id}`)}>Delete</ConfirmButton>;

  return (
    <>
      <PageHead eyebrow="Supermarket revenue" title="Sales & payments">
        <PeriodSwitch />
        {can(me, "shopAdjust") && <button className="btn" onClick={() => act.adjust()}>Returns & losses</button>}
        {can(me, "payment") && <button className="btn" onClick={() => act.payment()}>Record payment</button>}
        {can(me, "sale") && <button className="btn primary" onClick={() => act.sale()}>Record sales</button>}
      </PageHead>

      <div className="kv four">
        <div><b className="sm">{L.money(value)}</b><span>sales value, {periodLabel(period)}</span></div>
        <div><b className="sm">{L.money(discount)}</b><span>discounts given</span></div>
        <div><b className="sm">{L.money(paid)}</b><span>payments received</span></div>
        <div><b className={"sm" + (owed > 0 ? " warn-text" : "")}>{L.money(owed)}</b><span>still owed (all time)</span></div>
      </div>

      <Panel>
        <div className="group-bar">
          <Tabs value={tab} onChange={setTab} label="Show" options={[
            ["sales", `Sales (${sales.length})`], ["payments", `Payments (${pays.length})`], ["balances", "Balances"], ["adjust", `Returns & losses (${adj.length})`],
          ]} />
          {state.outlets.length > 1 && tab !== "balances" && (
            <select value={shop} onChange={(e) => setShop(e.target.value)} aria-label="Supermarket">
              <option value="">All supermarkets</option>
              {state.outlets.slice().sort(byKey("name")).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        {tab === "sales" && (
          <DataTable rows={sales} empty="No sales recorded in this period."
            columns={[
              { label: "Date", render: (s) => fmtDate(s.date) },
              { label: "Supermarket", render: (s) => <><button className="link" onClick={() => act.shop(s.outletId)}>{L.O(s.outletId)?.name || "Removed"}</button><SampleTag rec={s} /></> },
              { label: "Product", render: (s) => L.pName(s.productId) },
              { label: "Packs", num: true, render: (s) => n0(s.qty) },
              { label: "Price", num: true, render: (s) => n0(s.unitPrice) },
              { label: "Discount", num: true, render: (s) => (num(s.discount) ? n0(s.discount) : "—") },
              { label: "Value", num: true, render: (s) => <b>{L.money(s.amount)}</b> },
              { label: "Recorded by", render: (s) => <PersonChip id={s.recordedBy} /> },
              { label: "", render: (s) => delBtn("sales", s) },
            ]} />
        )}

        {tab === "payments" && (
          <DataTable rows={pays} empty="No payments in this period."
            columns={[
              { label: "Date", render: (p) => fmtDate(p.date) },
              { label: "Supermarket", render: (p) => <><button className="link" onClick={() => act.shop(p.outletId)}>{L.O(p.outletId)?.name || "Removed"}</button><SampleTag rec={p} /></> },
              { label: "Paid by", render: (p) => p.method || "—" },
              { label: "Reference", render: (p) => <span className="mono">{p.reference || "—"}</span> },
              { label: "Amount", num: true, render: (p) => <b>{L.money(p.amount)}</b> },
              { label: "Recorded by", render: (p) => <PersonChip id={p.recordedBy} /> },
              { label: "", render: (p) => delBtn("payments", p) },
            ]} />
        )}

        {tab === "balances" && (
          <>
            <span className="muted small">All time: everything sold, everything paid, and what's left to pay.</span>
            <DataTable rows={state.outlets.slice().sort((a, b) => F.out[b.id].outstanding - F.out[a.id].outstanding)} onRowClick={(o) => act.shop(o.id)}
              empty="No supermarkets yet."
              columns={[
                { label: "Supermarket", render: (o) => <><div className="name">{o.name}</div><div className="sub">{L.regionName(o.regionId)}</div></> },
                { label: "Sales value", num: true, render: (o) => L.money(F.out[o.id].rev) },
                { label: "Paid", num: true, render: (o) => L.money(F.out[o.id].paid) },
                { label: "Owed", num: true, render: (o) => <b>{L.money(F.out[o.id].outstanding)}</b> },
                { label: "", render: (o) => <Meter value={F.out[o.id].outstanding} max={maxOwed} tone="warm" /> },
                { label: "Last payment", render: (o) => (F.out[o.id].lastPay ? fmtDate(F.out[o.id].lastPay) : <span className="muted">None yet</span>) },
              ]} />
          </>
        )}

        {tab === "adjust" && (
          <DataTable rows={adj} empty="No returns, damage, losses or count differences in this period."
            columns={[
              { label: "Date", render: (a) => fmtDate(a.date) },
              { label: "Supermarket", render: (a) => <><button className="link" onClick={() => act.shop(a.outletId)}>{L.O(a.outletId)?.name || "Removed"}</button><SampleTag rec={a} /></> },
              { label: "Product", render: (a) => L.pName(a.productId) },
              { label: "What happened", render: (a) => <Pill status={[a.reason === "count" ? (a.qty > 0 ? "Count: missing" : "Count: extra") : LOSS_REASONS[a.reason], a.reason === "returned" ? "mute" : "bad"]} /> },
              { label: "Packs", num: true, render: (a) => n0(Math.abs(a.qty)) },
              { label: "Note", render: (a) => <span className="sub">{a.note}</span> },
              { label: "Recorded by", render: (a) => <PersonChip id={a.recordedBy} /> },
              { label: "", render: (a) => delBtn("adjustments", a) },
            ]} />
        )}
      </Panel>
    </>
  );
}
