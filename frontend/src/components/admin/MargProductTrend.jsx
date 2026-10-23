"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { fmtMoney, fmtDate, fmtQty } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";

const QTY_SERIES = [
  { key: "qty", label: "Bought", color: "#2a78d6" },
  { key: "free", label: "Free", color: "#1baf7a" },
];

// One party's products: what they bought this month against last month and
// their average over the last N months, flagging what to push to them
// (backend internal/margede/party_trend.go). Units charged, free left out.

const MONTH_CHOICES = [2, 3, 6, 12];

const STATUS = {
  down: { label: "Down", className: "bg-red-50 text-red-700", note: "below last month and average" },
  lapsed: { label: "Stopped buying", className: "bg-amber-50 text-amber-800", note: "nothing in the window or this month" },
  new: { label: "New", className: "bg-indigo-50 text-indigo-700", note: "first bought this month" },
  ok: { label: "On track", className: "bg-gray-100 text-gray-600", note: "" },
};

const FILTERS = [
  { key: "push", label: "To push", match: (r) => r.status === "down" || r.status === "lapsed" },
  { key: "down", label: "Down", match: (r) => r.status === "down" },
  { key: "lapsed", label: "Stopped buying", match: (r) => r.status === "lapsed" },
  { key: "new", label: "New", match: (r) => r.status === "new" },
  { key: "all", label: "All products", match: () => true },
];

const monthName = (v, back = 0) => {
  const d = new Date(v);
  d.setMonth(d.getMonth() - back);
  return d.toLocaleDateString("en-IN", { month: "short" });
};

export default function MargProductTrend({ url }) {
  const [months, setMonths] = useState(3);
  const [filter, setFilter] = useState("push");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // product whose monthly chart is shown

  useEffect(() => {
    apiFetch(`${url}?months=${months}`)
      .then(setData)
      .catch((e) => setError(e.message || "Could not load the product trend"));
  }, [url, months]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-400">Loading...</p>;

  const match = FILTERS.find((f) => f.key === filter).match;
  const rows = data.rows.filter(match);
  const thisM = monthName(data.this_month);
  const lastM = monthName(data.this_month, 1);
  const pace = (r) => (data.days_gone > 0 ? (r.this_qty / data.days_gone) * data.days_in_month : 0);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Units they bought (charged; free units left out) on sale invoices and unbilled challans. {thisM} is on day{" "}
        {data.days_gone} of {data.days_in_month}, so it&apos;s compared as it stands; &quot;pace&quot; is where it would end at
        this rate. The average counts full months from when they first bought the product. <b>Down</b> means this month is
        below both {lastM} and the average.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              filter === f.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {f.label}
            <span className={filter === f.key ? "text-gray-300" : "text-gray-400"}> {data.rows.filter(f.match).length}</span>
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <span className="text-xs text-gray-500">Average of last</span>
        <span className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          {MONTH_CHOICES.map((n) => (
            <button
              key={n}
              onClick={() => setMonths(n)}
              className={`px-2.5 py-1 text-xs ${months === n ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {n} mo
            </button>
          ))}
        </span>
      </div>

      {!rows.length ? (
        <p className="text-sm text-gray-400 py-6 text-center border border-gray-100 rounded-lg">Nothing here.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">{thisM} so far</th>
                <th className="px-3 py-2 text-right">Pace</th>
                <th className="px-3 py-2 text-right">{lastM}</th>
                <th className="px-3 py-2 text-right">Avg / month</th>
                <th className="px-3 py-2 text-right">Short of avg</th>
                <th className="px-3 py-2">Last bought</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const st = STATUS[r.status];
                const isOpen = open === r.product_pid;
                return (
                  <Fragment key={r.product_pid}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.product_pid)}
                    className={`cursor-pointer ${isOpen ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    title="Show month by month"
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-start gap-1.5">
                        <svg className={`w-3.5 h-3.5 mt-1 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                        </svg>
                        <span>
                          <Link
                            href={`/panel/marg-analysis/products/${r.product_pid}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-900 hover:underline"
                          >
                            {r.name}
                          </Link>
                          {r.company && <div className="text-[11px] text-gray-400">{r.company}</div>}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className={r.this_qty === 0 ? "text-gray-400" : "font-medium text-gray-900"}>{fmtQty(r.this_qty)}</div>
                      {r.this_value > 0 && <div className="text-[11px] text-gray-400">{fmtMoney(r.this_value)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{r.this_qty > 0 ? fmtQty(Math.round(pace(r))) : "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmtQty(r.last_qty)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.avg_qty == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <>
                          <div className="text-gray-900">{fmtQty(Math.round(r.avg_qty * 10) / 10)}</div>
                          <div className="text-[11px] text-gray-400">
                            over {r.avg_months} mo{r.avg_months < data.months ? " (since first bought)" : ""}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.shortfall > 0 ? <span className="font-semibold text-red-700">{fmtQty(Math.round(r.shortfall))}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.last_bought ? fmtDate(r.last_bought) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.className}`} title={st.note}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="px-3 pb-4 pt-1 bg-blue-50/40">
                        <ProductMonths r={r} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// One product for this party, month by month: units as a chart, and the
// value and bills of each month underneath (a different scale, so not on
// the same chart).
export function ProductMonths({ r }) {
  const months = r.monthly || [];
  if (!months.some((m) => m.qty || m.free)) return <p className="text-xs text-gray-400 py-2">No purchases this year.</p>;
  const total = months.reduce((t, m) => t + m.qty, 0);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <MonthlyChart monthly={months} series={QTY_SERIES} unit="qty" title={`${r.name} — units bought per month`} note={null} />
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-[11px]">
          <thead className="text-gray-400">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Month</th>
              {months.map((m) => (
                <th key={m.month} className="px-2 py-1 text-right font-medium whitespace-nowrap">
                  {new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short" })}
                </th>
              ))}
              <th className="px-2 py-1 text-right font-medium">Year</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr>
              <td className="px-2 py-1 text-gray-500">Units</td>
              {months.map((m) => (
                <td key={m.month} className={`px-2 py-1 text-right whitespace-nowrap ${m.qty ? "" : "text-gray-300"}`}>
                  {fmtQty(m.qty)}
                  {m.free > 0 && <span className="text-green-700"> +{fmtQty(m.free)}</span>}
                </td>
              ))}
              <td className="px-2 py-1 text-right font-medium text-gray-900">{fmtQty(total)}</td>
            </tr>
            <tr>
              <td className="px-2 py-1 text-gray-500">Value</td>
              {months.map((m) => (
                <td key={m.month} className={`px-2 py-1 text-right whitespace-nowrap ${m.value ? "" : "text-gray-300"}`}>
                  {m.value ? fmtMoney(m.value).replace(/\.\d\d$/, "") : "—"}
                </td>
              ))}
              <td className="px-2 py-1 text-right font-medium text-gray-900 whitespace-nowrap">
                {fmtMoney(months.reduce((t, m) => t + m.value, 0)).replace(/\.\d\d$/, "")}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-1 text-gray-500">Bills</td>
              {months.map((m) => (
                <td key={m.month} className={`px-2 py-1 text-right ${m.bills ? "" : "text-gray-300"}`}>{m.bills || "—"}</td>
              ))}
              <td className="px-2 py-1 text-right font-medium text-gray-900">{months.reduce((t, m) => t + m.bills, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Pick any product the partner bought this year and see it month by month.
export function PartnerProductGraph({ url }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [pid, setPid] = useState(null);

  useEffect(() => {
    apiFetch(`${url}?months=3`)
      .then(setData)
      .catch((e) => setError(e.message || "Could not load products"));
  }, [url]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-400">Loading...</p>;
  if (!data.rows.length) return <p className="text-sm text-gray-400">No purchases this year.</p>;

  // Most bought first, so the products that matter are at the top.
  const all = [...data.rows].sort((a, b) => b.year_qty - a.year_qty);
  const needle = q.trim().toLowerCase();
  const list = all.filter((r) => !needle || r.name.toLowerCase().includes(needle));
  const selected = all.find((r) => r.product_pid === pid) || all[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col max-h-[32rem]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${all.length} products...`}
          className="px-3 py-2 text-sm border-b border-gray-200 outline-none"
        />
        <ul className="overflow-y-auto divide-y divide-gray-100">
          {list.map((r) => (
            <li key={r.product_pid}>
              <button
                onClick={() => setPid(r.product_pid)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  selected.product_pid === r.product_pid ? "bg-blue-50 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="truncate">{r.name}</div>
                <div className="text-[11px] text-gray-400 font-normal">
                  {fmtQty(r.year_qty)} units this year · last {r.last_bought ? fmtDate(r.last_bought) : "—"}
                </div>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-3 text-xs text-gray-400">No product matches.</li>}
        </ul>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <Link href={`/panel/marg-analysis/products/${selected.product_pid}`} className="text-sm font-semibold text-gray-900 hover:underline">
            {selected.name}
          </Link>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS[selected.status].className}`} title={STATUS[selected.status].note}>
            {STATUS[selected.status].label}
          </span>
        </div>
        <ProductMonths r={selected} />
      </div>
    </div>
  );
}
