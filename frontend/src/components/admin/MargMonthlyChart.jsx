"use client";

import { useState } from "react";
import { fmtMoney } from "@/components/admin/MargBills";

// Monthly line chart (sales, returns, purchases — whichever have data) for the
// party page, the partner page's Bills & reports tab, and Analysis. Pass
// `series` to chart other fields (e.g. quantity), `unit="qty"` for counts.

// Chart colours: reference categorical slots 1-3 (validated light-mode set;
// the aqua slot is below 3:1 on white, so every line carries a direct end
// label and the chart has a table view).
const SERIES = {
  sales: { label: "Sales", color: "#2a78d6" },
  returns: { label: "Returns", color: "#eb6834" },
  purchases: { label: "Purchases", color: "#1baf7a" },
};

function shortMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}
const fmtUnits = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
function shortUnits(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

function monthLabel(m, withYear = false) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}

// Monthly sales (and returns, when there are any) as a line chart: one ₹
// axis, crosshair tooltip on hover, legend + direct end labels, table view.
export default function MonthlyChart({ monthly, series, unit = "money", title, note = "before GST" }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);

  if (!monthly.length) return null;
  const S = series ? Object.fromEntries(series.map((x) => [x.key, x])) : SERIES;
  const fmtVal = unit === "qty" ? fmtUnits : fmtMoney;
  const fmtAxis = unit === "qty" ? shortUnits : shortMoney;
  // Only the series with data: a customer gets sales (and returns), a
  // supplier or manufacturer gets purchases.
  const all = Object.keys(S);
  let keys = all.filter((k) => monthly.some((m) => m[k] > 0));
  if (!keys.length) keys = [all[0]];

  const W = 720, H = 240, L = 56, R = 64, T = 16, B = 32;
  const max = Math.max(1, ...monthly.flatMap((m) => keys.map((k) => m[k])));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i) => (monthly.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (monthly.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const path = (k) => monthly.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[k]).toFixed(1)}`).join(" ");
  const band = (W - L - R) / Math.max(1, monthly.length - 1);
  const hm = hover != null ? monthly[hover] : null;

  // End labels sit at each line's last value; push apart any that would
  // overlap (e.g. two series ending at 0).
  const endY = {};
  keys
    .map((k) => [k, y(monthly[monthly.length - 1][k])])
    .sort((p, q) => p[1] - q[1])
    .forEach(([k, v], i, arr) => {
      endY[k] = i === 0 ? v : Math.max(v, endY[arr[i - 1][0]] + 13);
    });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="text-xs font-medium text-gray-700">
          {title || `Monthly ${keys.map((k) => S[k].label.toLowerCase()).join(", ")}`}
          {note && <span className="text-gray-400 font-normal"> ({note})</span>}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          {keys.length > 1 &&
            keys.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 rounded" style={{ background: S[k].color }} />
                {S[k].label}
              </span>
            ))}
          <button onClick={() => setAsTable((v) => !v)} className="text-gray-500 hover:text-gray-900 underline">
            {asTable ? "Show chart" : "View as table"}
          </button>
        </div>
      </div>

      {asTable ? (
        <table className="w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1.5">Month</th>
              <th className="py-1.5 text-right">Bills</th>
              {keys.map((k) => (
                <th key={k} className="py-1.5 text-right">{S[k].label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {monthly.map((m) => (
              <tr key={m.month}>
                <td className="py-1.5 text-gray-700">{monthLabel(m.month, true)}</td>
                <td className="py-1.5 text-right text-gray-600">{m.bills}</td>
                {keys.map((k) => (
                  <td key={k} className="py-1.5 text-right text-gray-900">{fmtVal(m[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Monthly sales line chart">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eceae6" strokeWidth={1} />
                <text x={L - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                  {fmtAxis(t)}
                </text>
              </g>
            ))}
            {monthly.map((m, i) => (
              <text key={m.month} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#6b7280">
                {monthLabel(m.month)}
              </text>
            ))}
            {hm && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9ca3af" strokeWidth={1} />}
            {keys.map((k) => (
              <g key={k}>
                <path d={path(k)} fill="none" stroke={S[k].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {monthly.map((m, i) => (
                  <circle
                    key={m.month}
                    cx={x(i)}
                    cy={y(m[k])}
                    r={hover === i ? 5 : 4}
                    fill={S[k].color}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}
                <text
                  x={x(monthly.length - 1) + 10}
                  y={endY[k]}
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="#52514e"
                >
                  {S[k].label}
                </text>
              </g>
            ))}
            {monthly.map((m, i) => (
              <rect
                key={m.month}
                x={x(i) - band / 2}
                y={T}
                width={band}
                height={H - T - B}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
          {hm && (
            <div
              className="absolute top-2 pointer-events-none bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs"
              style={{
                left: `${(x(hover) / W) * 100}%`,
                transform: x(hover) > W * 0.6 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              }}
            >
              <div className="font-medium text-gray-900 mb-1">{monthLabel(hm.month, true)}</div>
              {keys.map((k) => (
                <div key={k} className="flex items-center gap-2 text-gray-700 whitespace-nowrap">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: S[k].color }} />
                  {S[k].label}: <span className="text-gray-900 font-medium">{fmtVal(hm[k])}</span>
                </div>
              ))}
              <div className="text-gray-500 mt-0.5">{hm.bills} bill{hm.bills !== 1 ? "s" : ""}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

