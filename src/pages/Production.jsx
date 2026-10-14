import { useState } from "react";
import { byKey, fmtDate, n0, n1, num, periodLabel } from "../lib/format";
import { batchCost, recipeCost } from "../lib/costing";
import { can, canDelete } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { ConfirmButton, DataTable, Empty, Meter, PageHead, Panel, PeriodSwitch, Pill, SampleTag, Stamp, Tabs } from "../components/ui";
import useActions from "./useActions";

export default function Production() {
  const { state, me, del } = useStore();
  const L = useLookup();
  const { period, open } = useUI();
  const F = useFigures();
  const act = useActions();
  const [tab, setTab] = useState("batches");

  const batches = state.batches.filter((b) => F.inP(b.date)).sort(byKey("date", -1)).map((b) => ({ ...b, c: batchCost(state, F, b) }));
  const sumBy = (k) => batches.reduce((a, b) => a + (b.c[k] || 0), 0);
  const made = sumBy("units"), planned = batches.reduce((a, b) => a + (b.c.planned || 0), 0);
  const totalCost = sumBy("total");

  return (
    <>
      <PageHead eyebrow="Raw materials → packs" title="Production">
        <PeriodSwitch />
        {can(me, "materials") && <button className="btn" onClick={() => act.purchase()}>Raw material bought</button>}
        {can(me, "batches") && <button className="btn primary" onClick={act.batch}>Record batch</button>}
      </PageHead>

      <div className="kv four">
        <div><b>{n0(made)}</b><span>packs made, {periodLabel(period)}</span></div>
        <div><b>{planned ? n1((made / planned) * 100) + "%" : "—"}</b><span>of planned output ({n0(planned)} planned)</span></div>
        <div><b className="sm">{L.money(totalCost)}</b><span>production cost (materials + other)</span></div>
        <div><b className="sm">{made ? L.money(totalCost / made) : "—"}</b><span>average cost per pack</span></div>
      </div>

      <Panel>
        <Tabs value={tab} onChange={setTab} label="Show" options={[["batches", "Batches"], ["materials", "Raw materials"], ["recipes", "Recipes & costs"]]} />

        {tab === "batches" && (
          <DataTable rows={batches} empty="No batches in this period."
            columns={[
              { label: "Date", render: (b) => fmtDate(b.date) },
              { label: "Batch", render: (b) => <><Stamp>{b.code}</Stamp><SampleTag rec={b} /></> },
              { label: "Product", render: (b) => L.pName(b.productId) },
              { label: "Planned", num: true, render: (b) => (b.c.planned === null ? "—" : n0(b.c.planned)) },
              { label: "Made", num: true, render: (b) => <b>{n0(b.units)}</b> },
              { label: "Output", render: (b) => (b.c.yieldPct === null ? "—" : <Pill status={[`${n1(b.c.yieldPct)}%`, b.c.yieldPct >= 98 ? "good" : b.c.yieldPct >= 93 ? "warn" : "bad"]} />) },
              { label: "Batch cost", num: true, render: (b) => L.money(b.c.total) },
              { label: "Per pack", num: true, render: (b) => (b.c.perPack === null ? "—" : <b>{L.money(b.c.perPack)}</b>) },
              { label: "Expected / pack", num: true, render: (b) => (b.c.expectedPerPack === null ? "—" : L.money(b.c.expectedPerPack)) },
              { label: "", render: (b) => canDelete(me, b) && <ConfirmButton onConfirm={() => del(`/api/batches/${b.id}`)}>Delete</ConfirmButton> },
            ]} />
        )}

        {tab === "materials" && (
          <>
            <div className="actions">
              {can(me, "materials") && <button className="btn small" onClick={() => open("materialForm")}>Add material</button>}
              {can(me, "materials") && <button className="btn small" onClick={() => act.wastage()}>Record wastage</button>}
            </div>
            <DataTable rows={state.materials.slice().sort(byKey("name"))} empty="No raw materials yet."
              columns={[
                { label: "Material", render: (m) => <><div className="name">{m.name}<SampleTag rec={m} /></div><div className="sub">{m.description}</div></> },
                { label: "Bought", num: true, render: (m) => n0(F.mat[m.id].purchasedP) },
                { label: "Used", num: true, render: (m) => n0(F.mat[m.id].usedP) },
                { label: "Wasted", num: true, render: (m) => (F.mat[m.id].wastedP ? n0(F.mat[m.id].wastedP) : "—") },
                { label: "On hand", num: true, render: (m) => <><b>{n0(F.mat[m.id].onHand)}</b> {m.unit}</> },
                { label: "Avg cost", num: true, render: (m) => (F.mat[m.id].avgCost == null ? "—" : `${L.money(F.mat[m.id].avgCost)}/${m.unit}`) },
                { label: "Stock", render: (m) => { const x = F.mat[m.id]; const low = num(m.reorder) > 0 && x.onHand <= num(m.reorder);
                    return <span className="inline-meta"><Meter value={x.onHand} max={Math.max(x.onHand, num(m.reorder) * 3, 1)} tone={low ? "low" : ""} />{low && <Pill status={["Reorder", "bad"]} />}</span>; } },
                { label: "", render: (m) => can(me, "materials") && <span className="row-actions">
                    <button className="btn small ghost" onClick={() => act.purchase(m.id)}>Bought</button>
                    <button className="btn small ghost" onClick={() => open("materialForm", { id: m.id })}>Edit</button></span> },
              ]} />
            <span className="muted small">Bought, used and wasted are for {periodLabel(period)}. Average cost is total paid ÷ total bought.</span>
          </>
        )}

        {tab === "recipes" && (
          state.products.length ? (
            <div className="recipes">
              {state.products.map((p) => {
                const r = recipeCost(state, F, p.id);
                const margin = num(p.price) - r.perPack;
                const recent = state.batches.filter((b) => b.productId === p.id).slice(-5).map((b) => batchCost(state, F, b)).filter((c) => c.perPack !== null);
                const actual = recent.length ? recent.reduce((a, c) => a + c.perPack, 0) / recent.length : null;
                return (
                  <section key={p.id} className="recipe">
                    <div className="panel-h">
                      <div><h3>{L.pName(p.id)}</h3><span className="muted small">Sells to supermarkets at {L.money(p.price)}</span></div>
                      {can(me, "recipes") && <button className="btn small" onClick={() => open("recipe", { productId: p.id })}>{r.hasRecipe ? "Edit recipe" : "Add recipe"}</button>}
                    </div>
                    {r.hasRecipe ? (
                      <>
                        <DataTable rows={r.lines} rowKey={(l) => l.materialId}
                          columns={[
                            { label: "Ingredient", render: (l) => l.name },
                            { label: "Per pack", num: true, render: (l) => `${l.qtyPerUnit} ${l.unit}` },
                            { label: "Cost per unit", num: true, render: (l) => (l.unitCost == null ? "—" : L.money(l.unitCost)) },
                            { label: "Cost per pack", num: true, render: (l) => (l.costPerPack == null ? "—" : L.money(l.costPerPack)) },
                          ]} />
                        <div className="cost-box">
                          <div><span>Materials per pack (recipe)</span><b>{L.money(r.perPack)}</b></div>
                          <div><span>Actual per pack, last {recent.length || 0} batches</span><b>{actual === null ? "—" : L.money(actual)}</b></div>
                          <div><span>Price minus materials</span><b className={margin < 0 ? "bad-text" : ""}>{L.money(margin)}</b></div>
                        </div>
                        {!r.priced && <p className="hint bad">Some ingredients have no purchases yet, so their cost isn't known.</p>}
                      </>
                    ) : <Empty>No recipe yet. Add one to see the cost of each pack and compare batches against it.</Empty>}
                  </section>
                );
              })}
              <p className="muted small">Actual cost per pack includes the other batch costs (labour, energy and so on). Transport and selling costs aren't included yet.</p>
            </div>
          ) : <Empty>Add products first (Setup → Products).</Empty>
        )}
      </Panel>
    </>
  );
}
