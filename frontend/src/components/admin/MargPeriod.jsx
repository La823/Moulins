"use client";

// The Analysis period controls (this year so far / last 1-12 months, and
// whether the running month counts) and how a report states its window.
// Shared by the Analysis page and the product page.

export function fmtMonth(v, long = false) {
  if (!v) return "—";
  const [y, m] = String(v).slice(0, 7).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", long ? { month: "long", year: "numeric" } : { month: "short", year: "numeric" });
}

// Label for a period option, with the months it covers, e.g. "Last 3
// months (Jul – Sep 2026)". Mirrors windowCTEs on the backend; the backend's
// window (which also stops at the first month with bills) is what the
// report then shows.
export function periodLabel(n, includeCurrent) {
  if (n === 0) return "This year so far";
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() - (includeCurrent ? 0 : 1), 1);
  const start = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
  const f = (d, y) => d.toLocaleDateString("en-IN", y ? { month: "short", year: "numeric" } : { month: "short" });
  const range = n === 1 ? f(end, true) : `${f(start, start.getFullYear() !== end.getFullYear())} – ${f(end, true)}`;
  return `Last ${n} month${n > 1 ? "s" : ""} (${range})`;
}

export function WindowNote({ window: w, requested }) {
  if (!w) return null;
  const from = fmtMonth(w.from);
  const lastDay = new Date(w.to);
  lastDay.setDate(lastDay.getDate() - 1);
  const to = fmtMonth(lastDay.toISOString());
  const capped = requested > 0 && w.months < requested;
  return (
    <>
      averages over {w.months} month{w.months !== 1 ? "s" : ""} ({from === to ? from : `${from} – ${to}`})
      {capped && <span className="text-amber-700"> — Marg only has bills from {from}</span>}
    </>
  );
}

export function PeriodBar({ period, setPeriod, includeCurrent, setIncludeCurrent }) {
  const currentMonth = new Date().toLocaleDateString("en-IN", { month: "long" });
  return (
    <div className="flex items-center gap-4 flex-wrap mb-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <label className="text-sm text-gray-600 flex items-center gap-2">
        Period
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
            <option key={n} value={n}>{periodLabel(n, includeCurrent)}</option>
          ))}
        </select>
      </label>
      <label className="text-sm text-gray-600 flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={includeCurrent} onChange={(e) => setIncludeCurrent(e.target.checked)} />
        Include {currentMonth} so far
      </label>
      <span className="text-xs text-gray-400">
        {includeCurrent ? `${currentMonth} is still running, so it pulls averages down.` : `${currentMonth} is left out while it's still running.`}
      </span>
    </div>
  );
}
