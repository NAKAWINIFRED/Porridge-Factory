import { n0, periodLabel } from "../lib/format";
import { useLookup, useStore } from "../state/store";
import { useFigures, useUI } from "../state/ui";
import { DataTable, PageHead, Panel, PeriodSwitch, SampleTag } from "../components/ui";
import useActions from "./useActions";

export default function Team() {
  const { state } = useStore();
  const { O, money } = useLookup();
  const { period, open } = useUI();
  const F = useFigures();
  const act = useActions();
  const rows = state.staff.slice().sort((a, b) => F.rep[b.id].revP - F.rep[a.id].revP);

  return (
    <>
      <PageHead eyebrow="Who is in charge" title="Team">
        <PeriodSwitch />
        <button className="btn primary" onClick={() => open("staffForm")}>Add team member</button>
      </PageHead>
      <Panel>
        <DataTable
          rows={rows}
          onRowClick={(s) => act.staff(s.id)}
          empty="No team members yet. Add the people who deliver to and look after shops."
          columns={[
            { label: "Person", render: (s) => <><div className="name">{s.name}<SampleTag rec={s} /></div><div className="sub">{[s.role, s.phone].filter(Boolean).join(" · ")}</div></> },
            { label: "Shops in charge of", render: (s) => (F.rep[s.id].outlets.length ? F.rep[s.id].outlets.map((id) => O(id).name).join(", ") : <span className="muted">None yet</span>) },
            { label: "Delivered", num: true, render: (s) => n0(F.rep[s.id].deliveredP) },
            { label: "Sold", num: true, render: (s) => n0(F.rep[s.id].soldP) },
            { label: "Sales value", num: true, render: (s) => <b>{money(F.rep[s.id].revP)}</b> },
            { label: "On their shelves", num: true, render: (s) => n0(F.rep[s.id].inShop) },
          ]}
        />
        <span className="muted small">Figures are for {periodLabel(period)}. Open a person to choose the shops they are in charge of.</span>
      </Panel>
    </>
  );
}
