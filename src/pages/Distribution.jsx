import { useState } from "react";
import { byKey, fmtDate, n0, num, periodLabel } from "../lib/format";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { ConfirmButton, DataTable, PageHead, Panel, PeriodSwitch, RepChip, SampleTag, Stamp } from "../components/ui";
import useActions from "./useActions";

export default function Distribution() {
  const { state, remove } = useStore();
  const { O, pName, money } = useLookup();
  const { period } = useUI();
  const F = useFigures();
  const act = useActions();
  const [shop, setShop] = useState("");

  let ds = state.dispatches.filter((d) => F.inP(d.date));
  if (shop) ds = ds.filter((d) => d.outletId === shop);
  ds.sort(byKey("date", -1));
  const totQ = ds.reduce((a, d) => a + num(d.qty), 0);
  const totV = ds.reduce((a, d) => a + num(d.qty) * num(d.price), 0);

  return (
    <>
      <PageHead eyebrow="What goes out" title="Distribution">
        <PeriodSwitch />
        <button className="btn primary" onClick={() => act.dispatch()}>Send stock to a shop</button>
      </PageHead>

      {state.products.length > 0 && (
        <div className="kv">
          {state.products.map((p) => (
            <div key={p.id}>
              <b>{n0(F.prod[p.id].factory)}</b>
              <span>{p.name}{p.size ? " · " + p.size : ""} in factory</span>
            </div>
          ))}
        </div>
      )}

      <Panel
        eyebrow={`Deliveries, ${periodLabel(period)}`}
        title={`${n0(totQ)} packs · ${money(totV)}`}
        right={
          <div className="toolbar">
            <select value={shop} onChange={(e) => setShop(e.target.value)} aria-label="Filter by shop">
              <option value="">All shops</option>
              {state.outlets.slice().sort(byKey("name")).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        }
      >
        <DataTable
          rows={ds}
          empty="No deliveries in this period."
          columns={[
            { label: "Date", render: (d) => fmtDate(d.date) },
            { label: "Note", render: (d) => <><Stamp>{d.note}</Stamp><SampleTag rec={d} /></> },
            { label: "Shop", render: (d) => <button className="link" onClick={() => act.shop(d.outletId)}>{O(d.outletId)?.name || "Removed shop"}</button> },
            { label: "Product", render: (d) => pName(d.productId) },
            { label: "Packs", num: true, render: (d) => <b>{n0(d.qty)}</b> },
            { label: "Value", num: true, render: (d) => money(num(d.qty) * num(d.price)) },
            { label: "Delivered by", render: (d) => (d.repId ? <RepChip id={d.repId} /> : <span className="muted">—</span>) },
            { label: "", render: (d) => <ConfirmButton onConfirm={() => remove("dispatches", d.id)}>Delete</ConfirmButton> },
          ]}
        />
      </Panel>
    </>
  );
}
