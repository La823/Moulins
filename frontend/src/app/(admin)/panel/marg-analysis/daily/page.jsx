"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// Day to day: one day's sales (Marg sale invoices) and orders (app and staff
// orders) beside the day before and the same weekday last week, the day's
// top customers and products and every order placed, plus a chart and a row
// for every day of its month. Click a day in the chart or the table to see
// it. Backend: internal/margede/daily.go.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const count = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const short = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return inr(n);
};
const asDate = (s) => new Date(`${s}T00:00:00`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (s, days) => {
  const d = asDate(s);
  d.setDate(d.getDate() + days);
  return iso(d);
};
const longDate = (s) => asDate(s).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function DailyAnalysisPage() {
  const [date, setDate] = useState(() => {
    try {
      const d = new URLSearchParams(window.location.search).get("date");
      return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : todayIST();
    } catch {
      return todayIST();
    }
  });
  const [data, setData] = useState(null); // {for, report}
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const today = todayIST();

  useEffect(() => {
    let off = false;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("date", date);
      window.history.replaceState(null, "", u);
    } catch {}
    apiFetch(`/admin/marg-analysis/daily?date=${date}${reload ? "&fresh=1" : ""}`)
      .then((r) => {
        if (off) return;
        setData({ for: date, report: r });
        setError("");
      })
      .catch((e) => !off && setError(e.message || "Could not load the day"));
    return () => {
      off = true;
    };
  }, [date, reload]);

  const r = data?.report;
  const loading = !data || data.for !== date;
  const go = (d) => setDate(d > today ? today : d);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/panel/marg-analysis" className="text-xs text-gray-400 hover:text-gray-700">
            ← Analysis
          </Link>
          <h2 className="text-lg font-semibold text-gray-800">Day to Day</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Sales are Marg sale invoices (challans not yet billed are left out); orders are app and staff orders, by the day they were placed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => go(shift(date, -1))} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50" title="Day before">
            ◀
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
          <button
            onClick={() => go(shift(date, 1))}
            disabled={date >= today}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            title="Day after"
          >
            ▶
          </button>
          {date !== today && (
            <button onClick={() => go(today)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Today
            </button>
          )}
          <button onClick={() => setReload((n) => n + 1)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800" title="Reload from the database now">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!r ? (
        <p className="p-8 text-center text-sm text-gray-400 animate-pulse">Loading…</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{longDate(r.date)}</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
            <Card label="Sales" sub="GST incl." v={r.day.sales} y={r.yesterday.sales} w={r.last_week.sales} fmt={short} />
            <Card label="Bills" v={r.day.bills} y={r.yesterday.bills} w={r.last_week.bills} />
            <Card label="Customers billed" v={r.day.customers} y={r.yesterday.customers} w={r.last_week.customers} />
            <Card label="Units sold" v={r.day.units} y={r.yesterday.units} w={r.last_week.units} />
            <Card label="Orders" v={r.day.orders} y={r.yesterday.orders} w={r.last_week.orders} />
            <Card label="Placed by staff" v={r.day.staff_orders} y={r.yesterday.staff_orders} w={r.last_week.staff_orders} />
            <Card label="Order value" sub="priced lines" v={r.day.order_value} y={r.yesterday.order_value} w={r.last_week.order_value} fmt={short} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-700">Sales each day</h4>
              <p className="text-xs text-gray-400 mb-3">Bill totals, GST included · click a day to open it</p>
              <DayBars rows={r.month} field="sales" fmt={short} selected={r.date} onPick={go} />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-700">Orders each day</h4>
              <p className="text-xs text-gray-400 mb-3">App and staff orders placed · click a day to open it</p>
              <DayBars rows={r.month} field="orders" fmt={count} selected={r.date} onPick={go} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl">
              <h4 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Top customers billed</h4>
              {r.customers.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-gray-400">No sale bills this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {r.customers.map((c, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">
                          <div className="text-gray-900 truncate max-w-56">{c.name}</div>
                          {c.city && <div className="text-xs text-gray-400">{c.city}</div>}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                          {c.bills} bill{c.bills === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-900 whitespace-nowrap">{inr(c.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl">
              <h4 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Top products sold</h4>
              {r.products.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-gray-400">Nothing sold this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {r.products.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-gray-900 truncate max-w-56">{p.name}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">{count(p.units)} units</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-900 whitespace-nowrap">{inr(p.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {r.products.length > 0 && <p className="px-4 py-2 text-[11px] text-gray-400">Amounts before GST.</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl">
              <h4 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Orders placed ({r.orders.length})</h4>
              {r.orders.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-gray-400">No orders this day.</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {r.orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/panel/orders/${o.id}`} className="flex items-start gap-3 px-4 py-2 hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-900 truncate">{o.customer || "—"}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {o.items} item{o.items === 1 ? "" : "s"} ·{" "}
                            {o.placed_by ? `by ${o.placed_by}` : "by the customer"}
                            {o.marg_order_no ? ` · Marg ${o.marg_order_no}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-600 capitalize">{o.status}</div>
                          <div className="text-xs tabular-nums text-gray-900">{o.value != null ? inr(o.value) : "—"}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl">
            <h4 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">
              Every day of {asDate(r.date).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </h4>
            <MonthTable rows={r.month} selected={r.date} onPick={go} />
          </div>
        </div>
      )}
    </>
  );
}

// A figure for the day with how it compares to the day before and the same
// weekday last week. The arrows say which way it moved; the ink stays neutral.
function Card({ label, sub, v, y, w, fmt = count }) {
  const delta = (prev) => {
    if (!prev && !v) return "same";
    if (!prev) return "new";
    const pct = Math.round(((v - prev) / prev) * 100);
    return `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(pct)}%`;
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500">
        {label}
        {sub && <span className="text-gray-400"> · {sub}</span>}
      </div>
      <div className="text-xl font-semibold text-gray-900 tabular-nums mt-0.5">{fmt(v)}</div>
      <div className="mt-1 space-y-0.5 text-[11px] text-gray-500 tabular-nums">
        <div title={`Day before: ${fmt(y)}`}>
          {delta(y)} <span className="text-gray-400">vs day before ({fmt(y)})</span>
        </div>
        <div title={`Same day last week: ${fmt(w)}`}>
          {delta(w)} <span className="text-gray-400">vs last week ({fmt(w)})</span>
        </div>
      </div>
    </div>
  );
}

// One bar per day of the month — a single series, so one colour and no
// legend (the heading names it). The selected day is darker, the best day
// is labelled, and hovering a bar reads its figure out below.
function DayBars({ rows, field, fmt, selected, onPick }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((d) => d[field] || 0));
  const best = rows.reduce((b, d) => ((d[field] || 0) > (b?.[field] || 0) ? d : b), null);
  const shown = hover || rows.find((d) => d.date === selected);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-32 border-b border-gray-200" onMouseLeave={() => setHover(null)}>
        {rows.map((d) => {
          const v = d[field] || 0;
          const h = v ? Math.max(2, (v / max) * 100) : 0;
          const on = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              onMouseEnter={() => setHover(d)}
              className="relative flex-1 h-full flex flex-col justify-end group"
              aria-label={`${d.date}: ${fmt(v)}`}
            >
              {best && d.date === best.date && v > 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-600 tabular-nums whitespace-nowrap" style={{ bottom: `calc(${h}% + 2px)` }}>
                  {fmt(v)}
                </span>
              )}
              <div className={`mx-px rounded-t ${on ? "bg-blue-800" : hover === d ? "bg-blue-600" : "bg-blue-400"}`} style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="flex gap-0.5 mt-1">
        {rows.map((d, i) => (
          <span key={d.date} className={`flex-1 text-center text-[10px] ${d.date === selected ? "text-gray-900 font-medium" : "text-gray-400"}`}>
            {i % 5 === 0 || d.date === selected ? asDate(d.date).getDate() : ""}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-600 h-4 tabular-nums">
        {shown ? `${WEEKDAYS[asDate(shown.date).getDay()]} ${asDate(shown.date).getDate()} · ${fmt(shown[field] || 0)}` : ""}
      </p>
    </div>
  );
}

// A row per day of the month, latest first, with the month's totals.
function MonthTable({ rows, selected, onPick }) {
  const sum = (f) => rows.reduce((s, d) => s + (d[f] || 0), 0);
  const cols = [
    ["bills", "Bills", count],
    ["customers", "Customers", count],
    ["sales", "Sales (GST incl.)", inr],
    ["sales_ex_gst", "Sales ex GST", inr],
    ["units", "Units", count],
    ["orders", "Orders", count],
    ["staff_orders", "By staff", count],
    ["cancelled", "Cancelled", count],
    ["order_value", "Order value", inr],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 bg-gray-50">
          <tr>
            <th className="text-left font-medium px-4 py-2">Day</th>
            {cols.map(([k, l]) => (
              <th key={k} className="text-right font-medium px-3 py-2 whitespace-nowrap">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...rows].reverse().map((d) => (
            <tr
              key={d.date}
              onClick={() => onPick(d.date)}
              className={`cursor-pointer ${d.date === selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <td className="px-4 py-2 whitespace-nowrap text-gray-900">
                {WEEKDAYS[asDate(d.date).getDay()]} {asDate(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </td>
              {cols.map(([k, , fmt]) => (
                <td key={k} className={`px-3 py-2 text-right tabular-nums ${d[k] ? "text-gray-800" : "text-gray-300"}`}>
                  {d[k] ? fmt(d[k]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
          <tr>
            <td className="px-4 py-2 text-gray-700">Month</td>
            {cols.map(([k, , fmt]) => (
              <td key={k} className="px-3 py-2 text-right tabular-nums text-gray-900">
                {k === "customers" ? "" : fmt(sum(k))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <p className="px-4 py-2 text-[11px] text-gray-400">Customers aren&apos;t added up for the month — the same customer is billed on many days.</p>
    </div>
  );
}
