"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { SortHeader, fmtMoney, fmtDate, fmtQty } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";
import { PeriodBar, WindowNote, fmtMonth } from "@/components/admin/MargPeriod";
import { ProductExpiry } from "@/components/admin/MargDemand";
import { useBreadcrumbTitle, BackLink } from "@/components/admin/Breadcrumbs";

// One product: its sales, who buys it and how much, month by month. Sales are
// lines on sale invoices before GST, cancelled bills left out. The tiles,
// buyers and share chart follow the period; the monthly charts show the year.

const money0 = (v) => fmtMoney(v).replace(/\.\d\d$/, "");
const BAR = "#2a78d6"; // categorical slot 1, single series

const VALUE_SERIES = [
  { key: "sales", label: "Sold", color: "#2a78d6" },
  { key: "purchases", label: "Bought in", color: "#1baf7a" },
  { key: "returns", label: "Returned", color: "#eb6834" },
];
const QTY_SERIES = [{ key: "qty", label: "Units sold", color: "#2a78d6" }];

export default function MargProductPage() {
  const { pid } = useParams();
  const [period, setPeriod] = useState(0);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [data, setData] = useState(null);
  useBreadcrumbTitle(data ? data.name || `Product ${data.product_pid}` : null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ period: String(period) });
    if (includeCurrent) p.set("current", "1");
    apiFetch(`/admin/marg-analysis/products/${pid}?${p}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e.message?.includes("not found") ? "No sales or stock found for this product." : e.message || "Could not load product"))
      .finally(() => setLoading(false));
  }, [pid, period, includeCurrent]);

  const back = <BackLink fallback="/panel/marg-analysis/products" fallbackLabel="Products" />;

  if (error) return <>{back}<div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div></>;
  if (!data) return <>{back}<Loader /></>;

  const details = [data.code, data.product_pid, data.company, data.form, data.hsn && `HSN ${data.hsn}`, data.gst_percent != null && `GST ${data.gst_percent}%`]
    .filter(Boolean).join(" · ");
  const top = data.buyers[0];

  return (
    <>
      {back}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{data.name || `Product ${data.product_pid}`}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{details}</p>
      </div>

      <PeriodBar period={period} setPeriod={setPeriod} includeCurrent={includeCurrent} setIncludeCurrent={setIncludeCurrent} />

      <p className="text-sm text-gray-600 mb-3">
        Sale invoices, before GST · <WindowNote window={data.window} requested={period} />
      </p>

      <div className={`grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-5 ${loading ? "opacity-60" : ""}`}>
        <Tile label="Sales" value={money0(data.amount)} sub={`${data.bills} bills`} />
        <Tile label="Units sold" value={fmtQty(data.qty)} sub={data.free > 0 ? `+${fmtQty(data.free)} free` : " "} />
        <Tile label="Average per month" value={money0(data.avg_monthly)} sub={`over ${data.window.months} month${data.window.months !== 1 ? "s" : ""}`} />
        <Tile label="Highest month" value={data.best_amount ? money0(data.best_amount) : "—"} sub={data.best_month ? fmtMonth(data.best_month, true) : " "} />
        <Tile
          label="Customers"
          value={data.customers}
          sub={top ? `top: ${top.name || top.party_code} (${Math.round(top.share * 100)}%)` : " "}
        />
        <Tile
          label="Avg selling rate"
          value={data.avg_rate ? fmtMoney(data.avg_rate) : "—"}
          sub={data.min_rate != null && data.max_rate != null ? `${fmtMoney(data.min_rate)} – ${fmtMoney(data.max_rate)}` : " "}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={data.monthly} series={VALUE_SERIES} title="Monthly value — whole year" note="before GST" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={data.monthly} series={QTY_SERIES} unit="qty" title="Units sold per month — whole year" note={null} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 lg:col-span-2">
          <ShareBars buyers={data.buyers} total={data.amount} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
          <div className="text-xs font-medium text-gray-700 mb-3">Stock now</div>
          <div className="text-xl font-semibold text-gray-900">{fmtQty(data.stock)} <span className="text-sm font-normal text-gray-500">units</span></div>
          <div className="text-xs text-gray-500 mt-1">
            in {data.stock_batches} batch{data.stock_batches !== 1 ? "es" : ""}
            {data.next_expiry && <> · next expiry {fmtMonth(data.next_expiry)}</>}
          </div>
          {data.stock < 0 && <p className="text-xs text-red-600 mt-2">Negative in Marg — billed before stock was entered.</p>}
          {data.avg_monthly > 0 && data.stock > 0 && data.avg_rate > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              About {Math.max(0, Math.round((data.stock * data.avg_rate) / data.avg_monthly * 10) / 10)} months of sales at the current pace.
            </p>
          )}
          <Link href="/panel/marg-stock" className="inline-block text-xs text-gray-500 hover:text-gray-900 underline mt-3">Batches on Marg Stock →</Link>
        </div>
      </div>

      <section className="mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Stock and expiry outlook</h3>
        <p className="text-xs text-gray-500 mb-3">
          Each batch in stock, sold earliest expiry first at the 3-month average: when it sells out, and whether that is in time.
        </p>
        <ProductExpiry pid={pid} />
      </section>

      <BuyersTable buyers={data.buyers} />
    </>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-1">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5 truncate" title={typeof sub === "string" ? sub : ""}>{sub}</div>
    </div>
  );
}

// Share of the product's sales by buyer: top 10 bars plus "Everyone else".
// One series, so one colour; names and values are in text colours.
function ShareBars({ buyers, total }) {
  if (!buyers.length || !total) {
    return <p className="text-sm text-gray-400">No sales in this period.</p>;
  }
  const top = buyers.slice(0, 10);
  const rest = buyers.slice(10);
  const rows = [
    ...top.map((b) => ({ key: b.party_code, label: b.name || b.party_code, code: b.party_code, amount: b.amount, share: b.share })),
    ...(rest.length
      ? [{ key: "_rest", label: `Everyone else (${rest.length})`, amount: rest.reduce((s, b) => s + b.amount, 0), share: rest.reduce((s, b) => s + b.share, 0) }]
      : []),
  ];
  const max = Math.max(...rows.map((r) => r.share));

  return (
    <div>
      <div className="text-xs font-medium text-gray-700 mb-3">Who buys it — share of sales</div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${money0(r.amount)} (${(r.share * 100).toFixed(1)}%)`}>
            {r.code ? (
              <Link href={`/panel/marg-ledger/${encodeURIComponent(r.code)}`} className="truncate text-gray-800 hover:underline">{r.label}</Link>
            ) : (
              <span className="truncate text-gray-500">{r.label}</span>
            )}
            <div className="h-3 bg-gray-50 rounded">
              <div
                className="h-3 rounded-r"
                style={{ width: `${Math.max(1, (r.share / max) * 100)}%`, background: r.code ? BAR : "#9ca3af" }}
              />
            </div>
            <span className="text-xs text-gray-700 whitespace-nowrap w-28 text-right">
              {money0(r.amount)} · {(r.share * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuyersTable({ buyers }) {
  const [sort, setSort] = useState({ key: "amount", dir: "desc" });
  if (!buyers.length) return null;
  const rows = [...buyers].sort((a, b) => {
    const k = sort.key;
    const av = k === "name" ? (a.name || a.party_code) : a[k];
    const bv = k === "name" ? (b.name || b.party_code) : b[k];
    const c = typeof av === "string" || typeof bv === "string" ? String(av || "").localeCompare(String(bv || "")) : (av || 0) - (bv || 0);
    return sort.dir === "desc" ? -c : c;
  });
  const by = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="px-4 pt-4 pb-2 text-xs font-medium text-gray-700">All buyers in this period ({buyers.length})</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 w-10">#</th>
            <SortHeader label="Party" k="name" sort={sort} onSort={by} />
            <SortHeader label="Sales" k="amount" sort={sort} onSort={by} align="right" />
            <SortHeader label="Units" k="qty" sort={sort} onSort={by} align="right" />
            <SortHeader label="Share" k="share" sort={sort} onSort={by} align="right" />
            <SortHeader label="Bills" k="bills" sort={sort} onSort={by} align="right" />
            <SortHeader label="Avg rate" k="avg_rate" sort={sort} onSort={by} align="right" />
            <SortHeader label="Last bought" k="last_buy" sort={sort} onSort={by} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((b, i) => (
            <tr key={b.party_code} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
              <td className="px-4 py-3">
                <Link href={`/panel/marg-ledger/${encodeURIComponent(b.party_code)}`} className="text-gray-900 hover:underline">{b.name || b.party_code}</Link>
                <div className="text-xs text-gray-400 flex items-center gap-1.5">
                  {b.party_code}{b.city ? ` · ${b.city}` : ""}
                  {b.partner_id && (
                    <Link href={`/panel/users/${b.partner_id}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 hover:underline">Partner</Link>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(b.amount)}</td>
              <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                {fmtQty(b.qty)}{b.free > 0 && <span className="text-green-700"> +{fmtQty(b.free)}</span>}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{(b.share * 100).toFixed(1)}%</td>
              <td className="px-4 py-3 text-right text-gray-600">{b.bills}</td>
              <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtMoney(b.avg_rate)}</td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(b.last_buy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
