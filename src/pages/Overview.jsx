import { useNavigate } from "react-router-dom";
import { daysBetween, fmtDate, fmtDateY, n0, n1, num, periodLabel } from "../lib/format";
import { buildHistory } from "../lib/history";
import { can, roleLabel, seesFactory, seesPage } from "../lib/roles";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import DayChart from "../components/DayChart";
import HistoryList from "../components/HistoryList";
import { DataTable, Empty, PageHead, Panel, PeriodSwitch, Pill, SampleTag } from "../components/ui";
import useActions from "./useActions";

export default function Overview() {
  const { state, me } = useStore();
  const L = useLookup();
  const { period } = useUI();
  const F = useFigures();
  const act = useActions();
  const nav = useNavigate();
  const t = F.tot;
  const pl = periodLabel(period);
  const factoryView = seesFactory(me);
  const T = F.T;

  /* ---- things that need attention, for this person ---- */
  const alerts = [];
  const add = (sev, title, detail, btn, go) => alerts.push({ sev, title, detail, btn, go, k: alerts.length });
  if (can(me, "receive") || me.role === "management") {
    state.outlets.forEach((o) => {
      const pend = state.dispatches.filter((d) => d.outletId === o.id && d.status === "in_transit");
      if (!pend.length) return;
      const oldest = pend.reduce((a, d) => (d.date < a ? d.date : a), pend[0].date);
      const age = daysBetween(oldest, T);
      add(age >= 2 ? "bad" : "warn", `${pend.length} deliver${pend.length > 1 ? "ies" : "y"} to confirm at ${o.name}`,
        `${n0(pend.reduce((a, d) => a + num(d.qty), 0))} packs sent ${age === 0 ? "today" : age + " day" + (age > 1 ? "s" : "") + " ago"}.`,
        can(me, "receive") ? "Confirm" : null, () => act.shop(o.id));
    });
  }
  if (me.role !== "production_manager") {
    state.outlets.forEach((o) => {
      const x = F.out[o.id];
      if (x.status[0] === "Out of stock") add("bad", `${o.name} is out of stock`, `Last delivery ${fmtDate(x.lastDel)}.`, can(me, "dispatch") ? "Send stock" : "Open", () => (can(me, "dispatch") ? act.dispatch(o.id) : act.shop(o.id)));
      else if (x.status[0] === "Restock soon") add("warn", `${o.name} runs out in about ${Math.max(1, Math.round(x.daysLeft))} days`, `${n0(x.inShop)} packs left, selling about ${n1(x.rate)} a day.`, can(me, "dispatch") ? "Send stock" : "Open", () => (can(me, "dispatch") ? act.dispatch(o.id) : act.shop(o.id)));
      else if (x.status[0] === "No sales recorded") add("warn", `No sales recorded at ${o.name} for ${x.quiet} days`, `${n0(x.inShop)} packs on the shelf.`, can(me, "sale") ? "Record sales" : "Open", () => (can(me, "sale") ? act.sale(o.id) : act.shop(o.id)));
      if (x.outstanding > 0 && (can(me, "payment") || me.role === "management") && (!x.lastPay || daysBetween(x.lastPay, T) > 21)) {
        add("warn", `${o.name} owes ${L.money(x.outstanding)}`, x.lastPay ? `Last payment ${fmtDate(x.lastPay)}.` : "No payment recorded yet.", can(me, "payment") ? "Record payment" : null, () => act.payment(o.id));
      }
    });
  }
  if (can(me, "setup")) {
    state.outlets.filter((o) => !o.regionId).forEach((o) => add("warn", `${o.name} isn't in a region`, "No regional manager can see it until it is.", "Fix", () => act.open("shopForm", { id: o.id })));
    state.regions.forEach((r) => {
      if (!state.users.some((u) => u.role === "regional_manager" && u.active !== false && (u.regionIds || []).includes(r.id)))
        add("warn", `${r.name} has no regional manager`, "Assign one under Setup → People.", "Open", () => nav("/setup#people"));
    });
  }
  if (can(me, "materials") || me.role === "management") {
    state.materials.forEach((m) => {
      const x = F.mat[m.id];
      if (num(m.reorder) > 0 && x.onHand <= num(m.reorder))
        add(x.onHand <= 0 ? "bad" : "warn", `${m.name} is low`, `${n0(x.onHand)} ${m.unit} left, reorder level ${n0(m.reorder)}.`, can(me, "materials") ? "Record purchase" : null, () => act.purchase(m.id));
    });
  }

  const ranked = state.outlets.slice().sort((a, b) => F.out[b.id].revP - F.out[a.id].revP).slice(0, 6);
  const feed = buildHistory(state, L).slice(0, 8);
  const empty = !state.products.length && !state.outlets.length;
  const seesShops = me.role !== "production_manager";

  return (
    <>
      <PageHead
        eyebrow={`${me.role === "store_user" && state.outlets.length === 1 ? state.outlets[0].name : state.settings.company} · ${fmtDateY(T)}`}
        title={`${greeting()}, ${me.name.split(" ")[0]}`}>
        <PeriodSwitch />
      </PageHead>

      {empty && can(me, "setup") && <GettingStarted />}
      {empty && !can(me, "setup") && <Empty>Nothing to show yet. Your administrator is still setting things up.</Empty>}
      {me.role === "regional_manager" && !state.regions.length && <Empty>You haven't been given a region yet. Ask your administrator to assign one.</Empty>}

      {factoryView ? (
        <section className="flow six" aria-label="Stock flow">
          <Stage label="Materials bought" v={L.money(t.matCostP)} u={`${n0(t.matInP)} kg & units`} when={pl} sm />
          <Stage label="Produced" v={n0(t.producedP)} u="packs" when={pl} />
          <Stage label="In the factory" v={n0(t.factory)} u="packs" when="now" />
          <Stage label="In transit" v={n0(t.inTransit)} u={t.pending === 1 ? "1 delivery to confirm" : `${t.pending} deliveries to confirm`} when="now" />
          <Stage label="In supermarkets" v={n0(t.inShops)} u={`${t.shopsStocked} of ${state.outlets.length} stocked`} when="now" />
          <Stage label="Sold" v={n0(t.soldP)} u={L.money(t.revP)} when={pl} hl />
        </section>
      ) : (
        <section className="flow" aria-label="Stock and money">
          <Stage label="Deliveries to confirm" v={n0(t.pending)} u={`${n0(t.inTransit)} packs in transit`} when="now" />
          <Stage label="On the shelves" v={n0(t.inShops)} u="packs" when="now" />
          <Stage label="Sold" v={n0(t.soldP)} u="packs" when={pl} />
          <Stage label="Sales value" v={L.money(t.revP)} u={`paid ${L.money(t.paidP)}`} when={pl} sm hl />
          <Stage label="Still owed" v={L.money(t.outstanding)} u="all time" when="now" sm />
        </section>
      )}

      <div className="grid2">
        {seesShops ? (
          <Panel eyebrow="Sales value per day" title={<>{L.money(t.revP)} <span className="h-note">{pl}</span></>}>
            <DayChart daily={F.daily} days={period || 30} />
          </Panel>
        ) : (
          <Panel eyebrow="Production" title="Packs in the factory">
            <DataTable rows={state.products} empty="No products yet."
              columns={[
                { label: "Product", render: (p) => L.pName(p.id) },
                { label: "Made", num: true, render: (p) => n0(F.prod[p.id].producedP) },
                { label: "In factory", num: true, render: (p) => <b>{n0(F.prod[p.id].factory)}</b> },
              ]} />
          </Panel>
        )}
        <Panel eyebrow="Needs attention" title={alerts.length ? `${alerts.length} item${alerts.length > 1 ? "s" : ""}` : "All clear"}>
          {alerts.length ? (
            <>
              <ul className="alerts">
                {alerts.slice(0, 7).map((a) => (
                  <li key={a.k} className={a.sev}>
                    <div><div className="t">{a.title}</div><div className="d">{a.detail}</div></div>
                    {a.btn ? <button className="btn small" onClick={a.go}>{a.btn}</button> : <span />}
                  </li>
                ))}
              </ul>
              {alerts.length > 7 && <div className="muted small">+{alerts.length - 7} more</div>}
            </>
          ) : <Empty>Nothing needs your attention right now.</Empty>}
        </Panel>
      </div>

      <div className="grid2 wide">
        {me.role === "store_user" && state.outlets.length === 1 ? (
          <Panel eyebrow="Your supermarket" title="What would you like to record?">
            <div className="quick">
              {state.dispatches.some((d) => d.status === "in_transit") && <button className="btn primary" onClick={() => act.shop(state.outlets[0].id)}>Confirm a delivery</button>}
              <button className="btn primary" onClick={() => act.sale(state.outlets[0].id)}>Sales</button>
              <button className="btn" onClick={() => act.adjust(state.outlets[0].id)}>Returns & losses</button>
              <button className="btn" onClick={() => act.count(state.outlets[0].id)}>Stock count</button>
              <button className="btn ghost" onClick={() => act.shop(state.outlets[0].id)}>See stock by product</button>
            </div>
          </Panel>
        ) : seesShops ? (
          <Panel eyebrow={`By sales value, ${pl}`} title={me.role === "store_user" ? "Your supermarket" : "Supermarkets"}
            right={seesPage(me, "shops") && <button className="btn small ghost" onClick={() => nav("/shops")}>All supermarkets →</button>}>
            <DataTable rows={ranked} onRowClick={(o) => act.shop(o.id)} empty="No supermarkets yet."
              columns={[
                { label: "Supermarket", render: (o) => <><div className="name">{o.name}<SampleTag rec={o} /></div><div className="sub">{L.regionName(o.regionId)}</div></> },
                { label: "Sold", num: true, render: (o) => n0(F.out[o.id].soldP) },
                { label: "Sales value", num: true, render: (o) => L.money(F.out[o.id].revP) },
                { label: "Owed", num: true, render: (o) => L.money(F.out[o.id].outstanding) },
                { label: "Status", render: (o) => <Pill status={F.out[o.id].status} /> },
              ]} />
          </Panel>
        ) : <span />}
        <Panel eyebrow="Latest entries" title="Activity" right={<button className="btn small ghost" onClick={() => nav("/history")}>Full history →</button>}>
          {feed.length ? <HistoryList rows={feed} /> : <Empty>Entries appear here as they're recorded.</Empty>}
        </Panel>
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Stage({ label, v, u, when, hl, sm }) {
  return (
    <div className={"stage" + (hl ? " hl" : "")}>
      <span className="eyebrow">{label}</span>
      <span className={"v" + (sm ? " v-sm" : "")}>{v}</span>
      <span className="u">{u}</span>
      <span className="sub">{when}</span>
    </div>
  );
}

function GettingStarted() {
  const nav = useNavigate();
  return (
    <Panel eyebrow="Getting started" title="Set up the factory">
      <ol className="steps">
        <li><b>Regions and supermarkets</b><span>Group your supermarkets by region.</span></li>
        <li><b>People</b><span>Add regional managers, supermarket users and factory staff, with what each can see.</span></li>
        <li><b>Products, raw materials and recipes</b><span>What you make and what goes into each pack.</span></li>
      </ol>
      <button className="btn primary self-start" onClick={() => nav("/setup")}>Go to Setup</button>
    </Panel>
  );
}
