"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { SortHeader, fmtMoney, fmtDate, fmtQty } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";
import { PeriodBar, WindowNote, fmtMonth } from "@/components/admin/MargPeriod";
import { PRODUCT_COMPANIES } from "@/components/admin/MargDemand";

// Reports over this financial year's Marg bills (backend
// internal/margede/analysis.go), as Marg bill totals (incl. GST and freight;
// products: goods before GST, from lines). Sales = sale invoices, cancelled bills and
// unbilled challans left out. The rankings cover a chosen period (the year
// so far or the last 1-12 months) and "Avg / month" divides by its months;
// the running month is left out unless ticked.

const REPORTS = [
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers & manufacturers" },
  { key: "products", label: "Products" },
  { key: "monthly", label: "Monthly trend" },
  { key: "best", label: "Best months" },
  { key: "slipping", label: "Slipping customers" },
];

const money0 = (v) => fmtMoney(v).replace(/\.\d\d$/, "");

const RANKING_REPORTS = ["customers", "suppliers", "products"];

export default function MargAnalysisPage() {
  const [report, setReport] = useState("customers");
  const [period, setPeriod] = useState(0);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Analysis</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Reports on this financial year&apos;s Marg bills. Amounts are Marg bill totals, incl. GST and freight; the Products report is goods before GST.
          Sales are sale invoices, without cancelled bills or unbilled challans; returns are shown apart, not subtracted.
        </p>
      </div>
      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReport(r.key)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${
              report === r.key ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {RANKING_REPORTS.includes(report) && (
        <PeriodBar period={period} setPeriod={setPeriod} includeCurrent={includeCurrent} setIncludeCurrent={setIncludeCurrent} />
      )}
      {report === "customers" && <PartyRanking key={`sales-${period}-${includeCurrent}`} mode="sales" period={period} includeCurrent={includeCurrent} />}
      {report === "suppliers" && <PartyRanking key={`purchases-${period}-${includeCurrent}`} mode="purchases" period={period} includeCurrent={includeCurrent} />}
      {report === "products" && <ProductRanking key={`products-${period}-${includeCurrent}`} period={period} includeCurrent={includeCurrent} />}
      {report === "monthly" && <MonthlyTrend />}
      {report === "best" && <BestMonths />}
      {report === "slipping" && <Slipping />}
    </>
  );
}

// ---- shared bits ------------------------------------------------------------

function useSort(defaultKey) {
  const [sort, setSort] = useState({ key: defaultKey, dir: "desc" });
  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  return [sort, sortBy];
}

function SearchBox({ value, onSearch, placeholder }) {
  const [input, setInput] = useState(value);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(input.trim()); }} className="flex gap-2 w-full sm:w-auto">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-64"
      />
      <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Search</button>
    </form>
  );
}

function Pager({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-gray-400">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
        <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}

function PartyCell({ code, name, city, partnerId }) {
  return (
    <td className="px-4 py-3">
      <Link href={`/panel/marg-ledger/${encodeURIComponent(code)}`} className="text-gray-900 hover:underline">{name || code}</Link>
      <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
        {code}{city ? ` · ${city}` : ""}
        {partnerId && (
          <Link href={`/panel/users/${partnerId}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 hover:underline">Partner</Link>
        )}
      </div>
    </td>
  );
}

// Trend: last 3 months vs the 3 before, with an arrow and a word so it never
// relies on colour alone.
function Trend({ last3, prev3 }) {
  if (!prev3 && !last3) return <span className="text-gray-300">—</span>;
  if (!prev3) return <span className="text-xs text-gray-500">New</span>;
  const pct = ((last3 - prev3) / prev3) * 100;
  const up = pct >= 0;
  return (
    <span
      title={`Last 3 months ${money0(last3)} vs the 3 before ${money0(prev3)} (the current month is still running)`}
      className={`text-xs whitespace-nowrap ${up ? "text-green-700" : "text-red-600"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% {up ? "up" : "down"}
    </span>
  );
}

function Empty({ text }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">{text}</div>;
}

// ---- customers / suppliers -------------------------------------------------

function PartyRanking({ mode, period, includeCurrent }) {
  const [sort, sortBy] = useSort("avg");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ mode, sort: sort.key, dir: sort.dir, page: String(page), period: String(period) });
    if (includeCurrent) p.set("current", "1");
    if (search) p.set("search", search);
    apiFetch(`/admin/marg-analysis/parties?${p}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [mode, sort, search, page, period, includeCurrent]);

  const onSort = (k) => { setPage(1); sortBy(k); };
  const noun = mode === "sales" ? "Sales" : "Purchases";
  const offset = data ? (data.page - 1) * data.page_size : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          {data && (
            <>
              <span className="font-semibold text-gray-900">{data.total}</span> {mode === "sales" ? "customers" : "suppliers & manufacturers"} ·{" "}
              <span className="font-semibold text-gray-900">{money0(data.sum_total)}</span> {noun.toLowerCase()} ·{" "}
              <WindowNote window={data.window} requested={period} />
            </>
          )}
        </p>
        <SearchBox value={search} onSearch={(v) => { setPage(1); setSearch(v); }} placeholder="Party name, code or city..." />
      </div>
      {loading && !data ? <Loader /> : !data || !data.rows.length ? <Empty text="No parties" /> : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">#</th>
                  <SortHeader label="Party" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Avg / month" k="avg" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label={noun} k="total" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Highest month" k="best" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Months" k="months" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Bills" k="bills" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Returns" k="returns" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Trend" k="trend" sort={sort} onSort={onSort} />
                  <SortHeader label="Last bill" k="last" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r, i) => (
                  <tr key={r.party_code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400">{offset + i + 1}</td>
                    <PartyCell code={r.party_code} name={r.name} city={r.city} partnerId={r.partner_id} />
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.avg_monthly)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{money0(r.total)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="text-gray-900">{money0(r.best_amount)}</div>
                      <div className="text-xs text-gray-400">{fmtMonth(r.best_month)}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.active_months}/{data.months}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{r.returns ? money0(r.returns) : "—"}</td>
                    <td className="px-4 py-3"><Trend last3={r.last3} prev3={r.prev3} /></td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.last_bill)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ---- products ---------------------------------------------------------------

function ProductRanking({ period, includeCurrent }) {
  const [sort, sortBy] = useSort("avg");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ sort: sort.key, dir: sort.dir, page: String(page), period: String(period) });
    if (includeCurrent) p.set("current", "1");
    if (search) p.set("search", search);
    if (company) p.set("company", company);
    apiFetch(`/admin/marg-analysis/products?${p}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [sort, search, company, page, period, includeCurrent]);

  const onSort = (k) => { setPage(1); sortBy(k); };
  const offset = data ? (data.page - 1) * data.page_size : 0;

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-3">
        {PRODUCT_COMPANIES.map((c) => {
          const counts = data?.company_counts || {};
          const n = c.code ? counts[c.code] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <button
              key={c.code}
              onClick={() => { setPage(1); setCompany(c.code); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {c.label}
              {data && <span className={company === c.code ? "text-gray-300" : "text-gray-400"}> {n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          {data && (
            <>
              <span className="font-semibold text-gray-900">{data.total}</span> products sold · amounts before GST ·{" "}
              <WindowNote window={data.window} requested={period} />
            </>
          )}
        </p>
        <SearchBox value={search} onSearch={(v) => { setPage(1); setSearch(v); }} placeholder="Product name, code or PID..." />
      </div>
      {loading && !data ? <Loader /> : !data || !data.rows.length ? <Empty text="No products" /> : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">#</th>
                  <SortHeader label="Product" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Avg / month" k="avg" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Sales" k="amount" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Qty" k="qty" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Highest month" k="best" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Customers" k="customers" sort={sort} onSort={onSort} align="right" />
                  <th className="px-4 py-3">Top buyer</th>
                  <SortHeader label="Bills" k="bills" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Last sold" k="last" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r, i) => (
                  <tr key={r.product_pid} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400">{offset + i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">
                        {r.name || `Product ${r.product_pid}`}
                      </Link>
                      <div className="text-xs text-gray-400">{[r.code, r.product_pid, r.company].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.avg_monthly)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{money0(r.amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                      {fmtQty(r.qty)}{r.free > 0 && <span className="text-green-700"> +{fmtQty(r.free)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="text-gray-900">{money0(r.best_amount)}</div>
                      <div className="text-xs text-gray-400">{fmtMonth(r.best_month)}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.customers}</td>
                    <td className="px-4 py-3">
                      {r.top_buyer_code ? (
                        <>
                          <Link href={`/panel/marg-ledger/${encodeURIComponent(r.top_buyer_code)}`} className="text-gray-800 hover:underline">
                            {r.top_buyer_name || r.top_buyer_code}
                          </Link>
                          <div className="text-xs text-gray-400 whitespace-nowrap">
                            {money0(r.top_buyer_amount)} · {r.amount ? Math.round((100 * r.top_buyer_amount) / r.amount) : 0}% of sales
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.last_sold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ---- monthly trend ----------------------------------------------------------

function MonthlyTrend() {
  const [raw, setRaw] = useState(null);
  const [netOfCredit, setNetOfCredit] = useState(false);
  useEffect(() => {
    apiFetch("/admin/marg-analysis/monthly").then((d) => setRaw(d.months || [])).catch(() => setRaw([]));
  }, []);
  if (!raw) return <Loader />;
  if (!raw.length) return <Empty text="No bills yet" />;

  // Net of credit notes: each month's credit notes come off its sales.
  const months = netOfCredit ? raw.map((m) => ({ ...m, sales: m.sales - m.returns })) : raw;

  const best = months.reduce((a, m) => (m.sales > a.sales ? m : a), months[0]);
  const current = new Date().toISOString().slice(0, 7);
  const totals = months.reduce((t, m) => ({ sales: t.sales + m.sales, returns: t.returns + m.returns, purchases: t.purchases + m.purchases }), { sales: 0, returns: 0, purchases: 0 });

  return (
    <>
      <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer select-none mb-3">
        <input type="checkbox" checked={netOfCredit} onChange={(e) => setNetOfCredit(e.target.checked)} />
        Show sales net of credit notes
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Tile label={netOfCredit ? "Net sales this year" : "Sales this year"} value={money0(totals.sales)} />
        <Tile label="Average per month" value={money0(totals.sales / months.length)} sub={`over ${months.length} months`} />
        <Tile label="Highest sales month" value={money0(best.sales)} sub={fmtMonth(best.month, true)} />
        <Tile label="Purchases this year" value={money0(totals.purchases)} sub={`returns ${money0(totals.returns)}`} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <MonthlyChart monthly={months} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">{netOfCredit ? "Net sales" : "Sales"}</th>
              <th className="px-4 py-3 text-right">Sale bills</th>
              <th className="px-4 py-3 text-right">Avg bill</th>
              <th className="px-4 py-3 text-right">Customers billed</th>
              <th className="px-4 py-3 text-right">New this year</th>
              <th className="px-4 py-3 text-right">Returns</th>
              <th className="px-4 py-3 text-right">Purchases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
                  {fmtMonth(m.month, true)}
                  {m.month === best.month && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-900 text-white">Highest</span>}
                  {m.month === current && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">So far</span>}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(m.sales)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.bills}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.avg_bill)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.active_customers}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.new_customers}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.returns)}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.purchases)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {netOfCredit && "Net sales = sale invoices minus that month's credit notes (Returns); Avg bill stays on invoices alone. "}
        &quot;New this year&quot; counts customers whose first sale invoice of the year was that month (April counts everyone billed in April).</p>
    </>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ---- best months ------------------------------------------------------------

function BestMonths() {
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    apiFetch(`/admin/marg-analysis/best-months?limit=50${all ? "&all=1" : ""}`).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [all]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">The biggest single months for one customer this year.</p>
        <select value={all ? "all" : "one"} onChange={(e) => { setRows(null); setAll(e.target.value === "all"); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          <option value="one">Each customer&apos;s best month</option>
          <option value="all">All months</option>
        </select>
      </div>
      {!rows ? <Loader /> : !rows.length ? <Empty text="No sales yet" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Bills</th>
                <th className="px-4 py-3 text-right">Their other months</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={`${r.party_code}-${r.month}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                  <PartyCell code={r.party_code} name={r.name} city={r.city} partnerId={r.partner_id} />
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtMonth(r.month, true)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.amount)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {r.avg_other ? (
                      <>
                        {money0(r.avg_other)} avg
                        <span className="text-xs text-gray-400"> · {(r.amount / r.avg_other).toFixed(1)}×</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">only month</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- slipping customers -----------------------------------------------------

function Slipping() {
  const [days, setDays] = useState(45);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    apiFetch(`/admin/marg-analysis/slipping?days=${days}`).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [days]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          Customers who bought in at least 2 months this year but have no sale bill in the last {days} days, biggest buyers first.
          {rows && <> <span className="font-semibold text-gray-900">{rows.length}</span> customers.</>}
        </p>
        <select value={days} onChange={(e) => { setRows(null); setDays(Number(e.target.value)); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          {[30, 45, 60, 90].map((d) => <option key={d} value={d}>No bill in {d}+ days</option>)}
        </select>
      </div>
      {!rows ? <Loader /> : !rows.length ? <Empty text="No slipping customers" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Last bill</th>
                <th className="px-4 py-3 text-right">Days since</th>
                <th className="px-4 py-3 text-right">Avg in months they bought</th>
                <th className="px-4 py-3 text-right">Months bought</th>
                <th className="px-4 py-3 text-right">Sales this year</th>
                <th className="px-4 py-3 text-right">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.party_code} className="hover:bg-gray-50">
                  <PartyCell code={r.party_code} name={r.name} city={r.city} partnerId={r.partner_id} />
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(r.last_bill)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{r.days_since}</td>
                  <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{money0(r.avg_active)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.active_months}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(r.total)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
