// Renders history entries. Used by the History page and the supermarket panel.
import { fmtDateY } from "../lib/format";
import { HISTORY_TYPES } from "../lib/history";
import { useLookup } from "../state/store";
import { PersonChip, SampleTag } from "./ui";

export default function HistoryList({ rows, showShop = true, showDate = true, showBy = false, onShop }) {
  const { money } = useLookup();
  return (
    <ul className="feed">
      {rows.map((h) => (
        <li key={h.id}>
          <span className={"ic " + h.type}>{HISTORY_TYPES[h.type].icon}</span>
          <div className="feed-main">
            <div>
              {h.title}
              {showShop && h.shopName && (
                <>
                  {h.type === "out" && h.title.startsWith("Sent") ? " to " : h.shopName === "the factory" ? " at " : h.type === "paid" ? " from " : " at "}
                  {onShop && h.shopId ? <button className="link" onClick={() => onShop(h.shopId)}>{h.shopName}</button> : <b>{h.shopName}</b>}
                </>
              )}
              <SampleTag rec={h.rec} />
            </div>
            <div className="muted small feed-meta">
              {showDate && <span>{fmtDateY(h.date)}</span>}
              {h.detail && <span>{h.detail}</span>}
              {showBy && h.by && <PersonChip id={h.by} />}
            </div>
          </div>
          <span className="w">{h.value ? money(h.value) : ""}</span>
        </li>
      ))}
    </ul>
  );
}
