import { addDays, compact, fmtDate, today } from "../lib/format";
import { useLookup } from "../state/store";

/** Bar chart of sales value per day. Today's bar is highlighted. */
export default function DayChart({ daily, days }) {
  const { money } = useLookup();
  const T = today();
  const n = Math.min(days || 30, 60);
  const xs = [];
  for (let i = n - 1; i >= 0; i--) xs.push(addDays(T, -i));
  const vals = xs.map((d) => daily[d] || 0);
  const max = Math.max(...vals, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const step = max / mag > 5 ? 2 : 1;
  const top = Math.ceil(max / mag / step) * mag * step;

  const W = 640, H = 200, L = 58, R = 8, Tp = 10, B = 26;
  const cw = (W - L - R) / n, ih = H - Tp - B;
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales value per day">
        {[0, 0.5, 1].map((f) => {
          const y = Tp + ih - ih * f;
          return (
            <g key={f}>
              <line className="grid" x1={L} x2={W - R} y1={y} y2={y} />
              <text x={L - 8} y={y + 4} textAnchor="end">{f === 0 ? "0" : compact(top * f)}</text>
            </g>
          );
        })}
        {vals.map((v, i) => {
          const h = (ih * v) / top;
          return (
            <rect
              key={xs[i]}
              className={"bar" + (xs[i] === T ? " today" : "")}
              x={L + i * cw + cw * 0.15}
              y={Tp + ih - h}
              width={cw * 0.7}
              height={Math.max(h, v > 0 ? 1.5 : 0)}
              rx="2"
            >
              <title>{fmtDate(xs[i]) + ": " + money(v)}</title>
            </rect>
          );
        })}
        {ticks.map((i, k) => (
          <text key={k} x={L + i * cw + cw / 2} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}>
            {fmtDate(xs[i])}
          </text>
        ))}
      </svg>
    </div>
  );
}
