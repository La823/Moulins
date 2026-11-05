"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// "Split by company" on the net sales charts: Moulins products (Marg company
// IB) against everyone else's (third party ID and others IC), as their own
// lines beside the total. From bill lines, goods only — freight has no
// company, so it is in the total line alone. Backend: margede/company_monthly.go.

export const SPLIT_SERIES_COLORS = { total: "#2a78d6", moulins: "#eb6834", others: "#1baf7a" };

// The split for the year, fetched only while it is switched on.
export function useCompanyMonthly(s, on) {
  const url = on ? `/admin/marg-analysis/monthly-companies${s.withGST ? "" : "?gst=0"}` : null;
  const [state, setState] = useState({ url: null, months: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    apiFetch(url)
      .then((d) => live && setState({ url, months: d.months || [] }))
      .catch(() => live && setState({ url, months: [] }));
    return () => {
      live = false;
    };
  }, [url]);
  return url && state.url === url ? state.months : null;
}

// The chart's months with the split added (net of credit notes when net is on).
export function withCompanies(months, split, net) {
  if (!split) return months;
  const by = Object.fromEntries(split.map((c) => [c.month, c]));
  return months.map((m) => {
    const c = by[m.month];
    if (!c) return { ...m, moulins: 0, others: 0, moulins_p: 0, others_p: 0 };
    return {
      ...m,
      moulins: net ? c.moulins_sales - c.moulins_returns : c.moulins_sales,
      others: net ? c.other_sales - c.other_returns : c.other_sales,
      moulins_p: net ? c.moulins_profit - c.moulins_ret_profit : c.moulins_profit,
      others_p: net ? c.other_profit - c.other_ret_profit : c.other_profit,
    };
  });
}

// The series for a chart: the total alone, or the total with the two sides.
export function splitSeries(totalKey, totalLabel, on, profit) {
  const total = { key: totalKey, label: totalLabel, color: SPLIT_SERIES_COLORS.total };
  if (!on) return [total];
  return [
    total,
    { key: profit ? "moulins_p" : "moulins", label: "Moulins", color: SPLIT_SERIES_COLORS.moulins },
    { key: profit ? "others_p" : "others", label: "Third party & others", color: SPLIT_SERIES_COLORS.others },
  ];
}
