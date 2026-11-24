"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SortHeader, fmtMoney, fmtDate, fmtQty } from "@/components/admin/MargBills";
import { PRODUCT_COMPANIES } from "@/components/admin/MargDemand";

// Every product a partner bought this year (backend margede.PartyProducts):
// qty, value before GST, bills, rates, profit and goods returned, sortable
// and searchable. A tab of the partner page's "Bills & reports".

const money0 = (v) => fmtMoney(v).replace(/\.\d\d$/, "");

// Column sort keys -> how to read the row.
const SORTS = {
  name: (r) => (r.name || "").toLowerCase(),
  qty: (r) => r.qty + r.free,
  amount: (r) => r.amount,
  bills: (r) => r.bills,
  months: (r) => r.months,
  avg_rate: (r) => r.avg_rate,
  last_rate: (r) => r.last_rate || 0,
  profit: (r) => r.profit,
  margin: (r) => (r.amount ? r.profit / r.amount : 0),
  returned: (r) => r.returned_amount,
  last: (r) => r.last_bought,
};

export default function MargPartnerProducts({ url }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [sort, setSort] = useState({ key: "amount", dir: "desc" });

  useEffect(() => {
    apiFetch(url)
      .then((d) => setRows(d.rows || []))
      .catch((e) => setError(e.message || "Could not load products"));
  }, [url]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-gray-400">Loading...</p>;
  if (!rows.length) return <p className="text-sm text-gray-400">No products on this year&apos;s sale bills.</p>;

  const onSort = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: k === "name" ? "asc" : "desc" }));
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => !company || r.company_code === company)
    .filter((r) => !needle || [r.name, r.code, String(r.product_pid)].some((v) => (v || "").toLowerCase().includes(needle)))
    .sort((a, b) => {
      const x = SORTS[sort.key](a), y = SORTS[sort.key](b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
  const t = shown.reduce((a, r) => ({ amount: a.amount + r.amount, profit: a.profit + r.profit, units: a.units + r.qty + r.free }), { amount: 0, profit: 0, units: 0 });
  const counts = rows.reduce((a, r) => ({ ...a, [r.company_code || ""]: (a[r.company_code || ""] || 0) + 1 }), {});

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {PRODUCT_COMPANIES.map((c) => (
          <button
            key={c.code}
            onClick={() => setCompany(c.code)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {c.label}
            <span className={company === c.code ? "text-gray-300" : "text-gray-400"}> {c.code ? counts[c.code] || 0 : rows.length}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{shown.length}</span> products ·{" "}
          <span className="font-semibold text-gray-900">{money0(t.amount)}</span> goods ·{" "}
          {fmtQty(t.units)} units · profit <span className="font-semibold text-gray-900">{money0(t.profit)}</span>
          {t.amount ? ` (${((100 * t.profit) / t.amount).toFixed(1)}%)` : ""}
          <span className="text-gray-400"> · this year&apos;s sale bills, before GST</span>
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-60" />
      </div>
      <div className="rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <SortHeader label="Product" k="name" sort={sort} onSort={onSort} />
              <SortHeader label="Qty" k="qty" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Value" k="amount" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Bills" k="bills" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Months" k="months" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Avg rate" k="avg_rate" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Last rate" k="last_rate" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Profit" k="profit" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Margin" k="margin" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Returned" k="returned" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Last bought" k="last" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => (
              <tr key={r.product_pid} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">
                    {r.name || `Product ${r.product_pid}`}
                  </Link>
                  <div className="text-xs text-gray-400">{[r.code, r.company].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-800 whitespace-nowrap">
                  {fmtQty(r.qty)}{r.free > 0 && <span className="text-green-700"> +{fmtQty(r.free)}</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.amount)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{r.bills}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{r.months}</td>
                <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">{fmtMoney(r.avg_rate)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap" title={r.last_bill_no ? `${r.last_bill_no} · ${fmtDate(r.last_bill_date)}` : ""}>
                  {r.last_rate != null ? fmtMoney(r.last_rate) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-900 whitespace-nowrap">{money0(r.profit)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{r.amount ? `${((100 * r.profit) / r.amount).toFixed(1)}%` : "—"}</td>
                <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">
                  {r.returned_qty ? <>{fmtQty(r.returned_qty)} <span className="text-xs text-gray-400">({money0(r.returned_amount)})</span></> : "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                  {fmtDate(r.last_bought)}
                  <div className="text-xs text-gray-400">{r.days_since === 0 ? "today" : `${r.days_since} days ago`}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Profit = value less (qty + free) at the purchase rate Marg holds for each batch sold; gross, before GST. Returned = goods sent back on credit notes.
      </p>
    </div>
  );
}
