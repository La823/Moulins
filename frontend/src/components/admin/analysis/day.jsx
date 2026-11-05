"use client";

import { useFetch, CardLoading, Stat, shortMoney, fmtCount } from "./common";

// The Analysis home's Day to day block: today's sales and orders against
// yesterday's. The block opens the Day to Day page (marg-analysis/daily).

const change = (v, prev) => {
  if (!prev) return v ? "first since yesterday" : "same as yesterday";
  const pct = Math.round(((v - prev) / prev) * 100);
  return `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(pct)}% vs yesterday`;
};

export function DayBlock() {
  const r = useFetch("/admin/marg-analysis/daily", {});
  if (!r) return <CardLoading />;
  if (!r.day) return <p className="text-xs text-gray-400">Could not load today.</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat label="Sales today" value={shortMoney(r.day.sales)} sub={`${fmtCount(r.day.bills)} bills · ${change(r.day.sales, r.yesterday.sales)}`} />
        <Stat
          label="Orders today"
          value={fmtCount(r.day.orders)}
          sub={`${fmtCount(r.day.staff_orders)} by staff · ${change(r.day.orders, r.yesterday.orders)}`}
        />
      </div>
      <p className="text-xs text-gray-400">
        Customers billed {fmtCount(r.day.customers)} · {fmtCount(r.day.units)} units · pick any day, compare and see each day of the month
      </p>
    </>
  );
}
