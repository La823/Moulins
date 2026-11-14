"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Customer ratings: every customer this financial year scored 0-100 from two
// h-indices (loyalty: h products each bought on at least h bills; value: h
// products each bought for at least h x Rs 1,000), with their profit and how
// much of what they buy is Moulins products vs third party.
// Backend: internal/margede/customer_rating.go.

const inr = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
const lakh = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
};
const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—");

const MIX = [
  ["all", "All customers"],
  ["moulins", "Mostly Moulins (80%+)"],
  ["mixed", "Mixed"],
  ["third", "Mostly third party (20% or less)"],
];
const mixOf = (c) => (c.moulins_share >= 80 ? "moulins" : c.moulins_share <= 20 ? "third" : "mixed");

const COLS = [
  ["rating", "Rating", "right"],
  ["h_loyalty", "Loyalty h", "right"],
  ["h_value", "Value h", "right"],
  ["net", "Net sales", "right"],
  ["profit", "Profit", "right"],
  ["margin", "Margin", "right"],
  ["moulins_share", "Moulins / 3rd party", "left"],
  ["products", "Products", "right"],
  ["last_bill", "Last bill", "right"],
];

export default function CustomerRatingsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mix, setMix] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "rating", dir: -1 });
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    let off = false;
    apiFetch("/admin/marg-analysis/customer-ratings")
      .then((d) => !off && setData(d))
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const list = data.customers
      .map((c) => ({ ...c, net: c.sales - c.returns - c.other_credit }))
      .filter((c) => (mix === "all" || mixOf(c) === mix) && (!s || `${c.name} ${c.city} ${c.party_code}`.toLowerCase().includes(s)));
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key] ?? "";
      const y = b[key] ?? "";
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [data, mix, q, sort]);

  const totals = useMemo(() => {
    const t = { n: rows.length, net: 0, profit: 0, mSales: 0, oSales: 0, mProfit: 0, oProfit: 0 };
    for (const c of rows) {
      t.net += c.net;
      t.profit += c.profit;
      t.mSales += c.moulins_sales;
      t.oSales += c.other_sales;
      t.mProfit += c.moulins_profit;
      t.oProfit += c.other_profit;
    }
    return t;
  }, [rows]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader />;

  const counts = { all: data.customers.length, moulins: 0, mixed: 0, third: 0 };
  for (const c of data.customers) counts[mixOf(c)]++;
  const pct = (a, b) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : "—");

  return (
    <div className="max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Customer Ratings</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Every customer since {fmtDate(data.from)} {data.from?.slice(0, 4)}, rated 0–100 from how many of our products they buy, how
            often and for how much. Profit is before GST, at each batch&apos;s purchase rate.{" "}
            <button type="button" className="text-teal-700 hover:underline" onClick={() => setShowHow((v) => !v)}>
              {showHow ? "Hide how it works" : "How the rating works"}
            </button>
          </p>
        </div>
      </div>

      {showHow && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-700 space-y-1.5">
          <p>
            <b>Loyalty h</b>: the largest number <i>h</i> where the customer bought <i>h</i> different products, each on at least <i>h</i>{" "}
            separate bills. Best this year: {data.best_loyalty}.
          </p>
          <p>
            <b>Value h</b>: the largest <i>h</i> where they bought <i>h</i> different products, each for at least <i>h</i> × ₹
            {data.value_step.toLocaleString("en-IN")} (before GST). Best this year: {data.best_value}.
          </p>
          <p>
            <b>Rating</b> = {data.loyalty_weight}% of loyalty + {data.value_weight}% of value, each as a share of the best customer&apos;s
            (best = 100).
          </p>
          <p className="text-gray-500">
            Profit: goods sold less their cost (qty + free × the batch&apos;s Marg purchase rate), less goods returned and rate-difference
            credit notes, plus freight charged. Moulins products are Marg company IB; everything else is third party.
          </p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Customers" value={totals.n} />
        <Card label="Net sales" value={lakh(totals.net)} />
        <Card label="Profit" value={lakh(totals.profit)} sub={`margin ${pct(totals.profit, totals.net)}`} />
        <Card
          label="Profit: Moulins / 3rd party"
          value={`${lakh(totals.mProfit)} / ${lakh(totals.oProfit)}`}
          sub={`margin ${pct(totals.mProfit, totals.mSales)} / ${pct(totals.oProfit, totals.oSales)}`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap border border-gray-200 rounded-lg overflow-hidden bg-white">
          {MIX.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMix(k)}
              className={`px-3 py-1.5 text-sm ${mix === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {l} <span className={mix === k ? "text-gray-300" : "text-gray-400"}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customer or city…"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-60"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 bg-gray-50">
            <tr>
              <th className="text-left font-medium px-3 py-2">#</th>
              <th className="text-left font-medium px-3 py-2">Customer</th>
              {COLS.map(([k, l, align]) => (
                <th key={k} className={`font-medium px-3 py-2 whitespace-nowrap text-${align}`}>
                  <button
                    type="button"
                    className="hover:text-gray-900"
                    onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))}
                  >
                    {l}
                    {sort.key === k ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((c, i) => (
              <tr key={c.party_code} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 min-w-56">
                  <Link href={`/panel/marg-ledger/${encodeURIComponent(c.party_code)}`} className="text-gray-900 hover:underline">
                    {c.name}
                  </Link>
                  {c.city && <span className="block text-[11px] text-gray-400">{c.city}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600" style={{ width: `${c.rating}%` }} />
                    </div>
                    <span className="tabular-nums font-semibold text-gray-900 w-9">{c.rating.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.h_loyalty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.h_value}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900 whitespace-nowrap">{inr(c.net)}</td>
                <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${c.profit < 0 ? "text-red-700" : "text-gray-900"}`}>
                  {inr(c.profit)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.margin < 15 ? "text-amber-700" : "text-gray-700"}`}>{c.margin.toFixed(1)}%</td>
                <td className="px-3 py-2 min-w-40">
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100" title={`Moulins ${inr(c.moulins_sales)} · third party ${inr(c.other_sales)}`}>
                    <div className="bg-teal-600" style={{ width: `${c.moulins_share}%` }} />
                    <div className="bg-amber-400" style={{ width: `${100 - c.moulins_share}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500">
                    {c.moulins_share.toFixed(0)}% Moulins · {(100 - c.moulins_share).toFixed(0)}% 3rd party
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.products}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">{fmtDate(c.last_bill)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2} className="px-3 py-8 text-center text-gray-400">
                  No customers match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
