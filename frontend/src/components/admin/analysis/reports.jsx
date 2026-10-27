"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { SortHeader, fmtDate, fmtQty } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";
import { WindowNote, fmtMonth } from "@/components/admin/MargPeriod";
import { PRODUCT_COMPANIES } from "@/components/admin/MargDemand";
import {
  money0, fmtCount, useUrlState, useSort, apiSettings, SearchBox, Pager, PartyCell, Trend, Empty, Tile, useFetch,
} from "./common";

// The full reports behind the Analysis board cards (backend
// internal/margede/analysis.go and analysis_boards.go). Each takes the
// page-wide settings `s` from useAnalysisSettings.

const gstWord = (s) => (s.withGST ? "incl. GST" : "without GST");
// Every list here scrolls in its own box (about one screen tall) with the
// header row pinned on top, so the columns stay named however far down.

// The customers list leaves out Highest month and Last bill; the suppliers
// list keeps them.
const PARTY_SORTS = (noun, notes, lean) => [
  ["avg", "Average per month"], ["total", `Total ${noun.toLowerCase()}`], !lean && ["best", "Highest month"], ["months", "Months bought"],
  ["bills", "Bills"], ["products", "Products bought"], lean && ["recent", "Billed recently (last N days)"], lean && ["balance", "Ledger balance"], ["returns", notes], ["trend", "Trend (last 3 months)"], !lean && ["last", "Last bill"], ["name", "Name"],
].filter(Boolean);
const PRODUCT_SORTS = [
  ["avg", "Average per month"], ["amount", "Sales"], ["qty", "Qty"], ["best", "Highest month"], ["customers", "Customers"],
  ["bills", "Bills"], ["trend", "Trend (last 3 months)"], ["last", "Last sold"], ["name", "Name"],
];

// Sort by + direction: the same sort the column headers set.
function SortMenu({ options, sort, onPick }) {
  return (
    <label className="text-xs text-gray-500 flex items-center gap-1.5">
      Sort by
      <select
        value={`${sort.key}.${sort.dir}`}
        onChange={(e) => onPick(...e.target.value.split("."))}
        className="px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
      >
        {options.flatMap(([k, label]) => (k === "name"
          ? [[`${k}.asc`, `${label} A–Z`], [`${k}.desc`, `${label} Z–A`]]
          : [[`${k}.desc`, `${label}, highest first`], [`${k}.asc`, `${label}, lowest first`]]
        )).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </label>
  );
}

// ---- customers / suppliers ranking -----------------------------------------

export function PartyRanking({ mode, prefix, s }) {
  const [sort, sortBy, setSort] = useSort(prefix, "avg");
  const [search, setSearch] = useUrlState(`${prefix}_search`, "");
  const [page, setPage] = useUrlState(`${prefix}_page`, 1);
  // Customers only: count just one company's products (Moulins, third
  // party, others) — amounts then come from the bill lines.
  const [company, setCompany] = useUrlState(`${prefix}_company`, "");
  // Customers only: a column of what each billed in the last N days (from
  // today back), set here; 60 by default.
  const [days, setDays] = useUrlState(`${prefix}_days`, 60);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = apiSettings(s, { mode, sort: sort.key, dir: sort.dir, page: String(page) });
    if (search) p.set("search", search);
    if (company && mode === "sales") p.set("company", company);
    if (mode === "sales") p.set("recent_days", String(days));
    apiFetch(`/admin/marg-analysis/parties?${p}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [mode, sort.key, sort.dir, search, company, days, page, s.period, s.includeCurrent, s.withGST]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSort = (k) => { setPage(1); sortBy(k); };
  const noun = mode === "sales" ? "Sales" : "Purchases";
  const lean = mode === "sales";
  const offset = data ? (data.page - 1) * data.page_size : 0;

  const companyLabel = PRODUCT_COMPANIES.find((c) => c.code === company)?.label;

  return (
    <>
      {mode === "sales" && (
        <div className="flex gap-2 flex-wrap mb-3">
          {PRODUCT_COMPANIES.map((c) => (
            <button
              key={c.code}
              onClick={() => { setPage(1); setCompany(c.code); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          {data && (
            <>
              <span className="font-semibold text-gray-900">{data.total}</span> {mode === "sales" ? "customers" : "suppliers & manufacturers"}
              {company && mode === "sales" && <> buying {companyLabel} products</>} ·{" "}
              <span className="font-semibold text-gray-900">{money0(data.sum_total)}</span> {noun.toLowerCase()}
              {company && mode === "sales" && <span className="text-gray-400"> (goods {gstWord(s)}, from the bill lines)</span>} ·{" "}
              <WindowNote window={data.window} requested={s.period} />
            </>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {lean && <DaysSetting days={days} onChange={(d) => { setPage(1); setDays(d); }} />}
          <SortMenu options={PARTY_SORTS(noun, mode === "sales" ? "Credit notes" : "Debit notes", lean)} sort={sort} onPick={(k, d) => { setPage(1); setSort(k, d); }} />
          <SearchBox value={search} onSearch={(v) => { setPage(1); setSearch(v); }} placeholder="Party name, code or city..." />
        </div>
      </div>
      {loading && !data ? <Loader /> : !data || !data.rows.length ? <Empty text="No parties" /> : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh] ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">#</th>
                  <SortHeader label="Party" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Avg / month" k="avg" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label={`Total ${noun.toLowerCase()}`} k="total" sort={sort} onSort={onSort} align="right" />
                  {!lean && <SortHeader label="Highest month" k="best" sort={sort} onSort={onSort} align="right" />}
                  <SortHeader label="Months" k="months" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Bills" k="bills" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Products" k="products" sort={sort} onSort={onSort} align="right" />
                  {lean && <SortHeader label={`Last ${days} days`} k="recent" sort={sort} onSort={onSort} align="right" />}
                  {lean && <SortHeader label="Ledger balance" k="balance" sort={sort} onSort={onSort} align="right" />}
                  <SortHeader label={mode === "sales" ? "Credit notes" : "Debit notes"} k="returns" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Trend" k="trend" sort={sort} onSort={onSort} />
                  {!lean && <SortHeader label="Last bill" k="last" sort={sort} onSort={onSort} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r, i) => (
                  <tr key={r.party_code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400">{offset + i + 1}</td>
                    <PartyCell code={r.party_code} name={r.name} city={r.city} partnerId={r.partner_id} />
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.avg_monthly)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{money0(r.total)}</td>
                    {!lean && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="text-gray-900">{money0(r.best_amount)}</div>
                        <div className="text-xs text-gray-400">{fmtMonth(r.best_month)}</div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-600">{r.active_months}/{data.months}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                    <td className="px-4 py-3 text-right text-gray-600" title="Different products bought since April (all of this year's bills)">{r.products}</td>
                    {lean && (
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap" title={`Sale bills from today back ${days} days (${gstWord(s)}), whatever the period`}>
                        {r.recent ? money0(r.recent) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {lean && <BalanceCell r={r} />}
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{r.returns ? money0(r.returns) : "—"}</td>
                    <td className="px-4 py-3"><Trend last3={r.last3} prev3={r.prev3} /></td>
                    {!lean && <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.last_bill)}</td>}
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

// How many days back the "billed in the last N days" column counts: a few
// quick choices, or any number typed in (1-366).
function DaysSetting({ days, onChange }) {
  const [text, setText] = useState(String(days));
  const commit = () => {
    const n = Math.round(Number(text));
    if (n >= 1 && n <= 366) onChange(n);
    else setText(String(days));
  };
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      Billed in last
      <input
        type="number" min={1} max={366} value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        aria-label="Days back for the billed column"
      />
      days
      {[30, 60, 90].map((n) => (
        <button key={n} onClick={() => { setText(String(n)); onChange(n); }}
          className={`px-2 py-1 rounded-full border ${days === n ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:border-gray-400"}`}>
          {n}
        </button>
      ))}
    </div>
  );
}

// A customer's current Marg account balance: what they owe, or an
// advance when it's negative, with when Marg last sent it.
function BalanceCell({ r }) {
  if (r.balance == null) return <td className="px-4 py-3 text-right text-gray-300" title="No account in Marg's party list">—</td>;
  const when = r.balance_at ? new Date(r.balance_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : null;
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap" title={[when && `Marg balance as of ${when}`, r.pdc ? `PDC held ${money0(r.pdc)}` : null].filter(Boolean).join(" · ")}>
      {r.balance === 0 ? (
        <span className="text-gray-400">Nil</span>
      ) : r.balance > 0 ? (
        <span className="text-gray-900">{money0(r.balance)} <span className="text-xs text-gray-400">due</span></span>
      ) : (
        <span className="text-gray-700">{money0(-r.balance)} <span className="text-xs text-gray-400">advance</span></span>
      )}
      {r.pdc ? <div className="text-[11px] text-gray-400">PDC {money0(r.pdc)}</div> : null}
    </td>
  );
}

// ---- products ranking -------------------------------------------------------

export function ProductRanking({ s }) {
  const [sort, sortBy, setSort] = useSort("p", "avg");
  const [search, setSearch] = useUrlState("p_search", "");
  const [company, setCompany] = useUrlState("p_company", "");
  const [page, setPage] = useUrlState("p_page", 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = apiSettings(s, { sort: sort.key, dir: sort.dir, page: String(page) });
    if (search) p.set("search", search);
    if (company) p.set("company", company);
    apiFetch(`/admin/marg-analysis/products?${p}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [sort.key, sort.dir, search, company, page, s.period, s.includeCurrent, s.withGST]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <span className="font-semibold text-gray-900">{data.total}</span> products sold · goods {gstWord(s)} ·{" "}
              <WindowNote window={data.window} requested={s.period} />
            </>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <SortMenu options={PRODUCT_SORTS} sort={sort} onPick={(k, d) => { setPage(1); setSort(k, d); }} />
          <SearchBox value={search} onSearch={(v) => { setPage(1); setSearch(v); }} placeholder="Product name, code or PID..." />
        </div>
      </div>
      {loading && !data ? <Loader /> : !data || !data.rows.length ? <Empty text="No products" /> : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh] ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">#</th>
                  <SortHeader label="Product" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Avg / month" k="avg" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Sales" k="amount" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Qty" k="qty" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Highest month" k="best" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Customers" k="customers" sort={sort} onSort={onSort} align="right" />
                  <th className="px-4 py-3">Top buyer</th>
                  <SortHeader label="Trend" k="trend" sort={sort} onSort={onSort} />
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
                    <td className="px-4 py-3"><Trend last3={r.last3} prev3={r.prev3} /></td>
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

// ---- monthly trends (whole year, not the period) -----------------------------

export function useMonthly(s) {
  const d = useFetch(`/admin/marg-analysis/monthly${s.withGST ? "" : "?gst=0"}`, { months: [] });
  return d ? d.months || [] : null;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

function MonthBadges({ m, best }) {
  return (
    <>
      {m.month === best && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-900 text-white">Highest</span>}
      {m.month === currentMonth() && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">So far</span>}
    </>
  );
}

export function SalesTrend({ s, netDefault = false }) {
  const raw = useMonthly(s);
  const [netOfCredit, setNetOfCredit] = useUrlState("net", netDefault);
  if (!raw) return <Loader />;
  if (!raw.length) return <Empty text="No bills yet" />;

  // Net of credit notes: each month's credit notes come off its sales, and
  // the profit on the goods they return comes off its profit. Profit is
  // always before GST (backend MonthlyOverview).
  const months = raw.map((m) => {
    const goods = netOfCredit ? m.sale_goods - m.return_goods : m.sale_goods;
    const profit = netOfCredit ? m.net_profit : m.profit;
    return { ...m, sales: netOfCredit ? m.sales - m.returns : m.sales, goods, p: profit, margin: goods ? (100 * profit) / goods : 0 };
  });
  const best = months.reduce((a, m) => (m.sales > a.sales ? m : a), months[0]);
  const t = months.reduce(
    (a, m) => ({
      sales: a.sales + m.sales, returns: a.returns + m.returns, bills: a.bills + m.bills, fresh: a.fresh + m.new_customers,
      p: a.p + m.p, goods: a.goods + m.goods, missBills: a.missBills + m.missing_bills, missAmt: a.missAmt + m.missing_amount,
      uncosted: a.uncosted + m.uncosted_lines,
    }),
    { sales: 0, returns: 0, bills: 0, fresh: 0, p: 0, goods: 0, missBills: 0, missAmt: 0, uncosted: 0 },
  );
  const pct = (v) => `${v.toFixed(1)}%`;

  return (
    <>
      <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer select-none mb-3">
        <input type="checkbox" checked={netOfCredit} onChange={(e) => setNetOfCredit(e.target.checked)} />
        Show sales and profit net of credit notes
      </label>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 mb-5">
        <Tile label={netOfCredit ? "Net sales this year" : "Sales this year"} value={money0(t.sales)} sub={`credit notes ${money0(t.returns)}`} />
        <Tile label={netOfCredit ? "Net profit this year" : "Profit this year"} value={money0(t.p)} sub={`${pct(t.goods ? (100 * t.p) / t.goods : 0)} of goods sold, before GST`} />
        <Tile label="Profit per month" value={money0(t.p / months.length)} sub={`over ${months.length} months`} />
        <Tile label="Average sales per month" value={money0(t.sales / months.length)} sub={`over ${months.length} months`} />
        <Tile label="Highest sales month" value={money0(best.sales)} sub={fmtMonth(best.month, true)} />
        <Tile label="Sale bills" value={fmtCount(t.bills)} sub={`avg bill ${money0(t.bills ? t.sales / t.bills : 0)}`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={months} series={[{ key: "sales", label: netOfCredit ? "Net sales" : "Sales", color: "#2a78d6" }]} note={gstWord(s)} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={months} series={[{ key: "p", label: netOfCredit ? "Net profit" : "Profit", color: "#2a78d6" }]} note="before GST" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">{netOfCredit ? "Net sales" : "Sales"}</th>
              <th className="px-4 py-3 text-right">{netOfCredit ? "Net profit" : "Profit"}</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Sale bills</th>
              <th className="px-4 py-3 text-right">Avg bill</th>
              <th className="px-4 py-3 text-right">Customers billed</th>
              <th className="px-4 py-3 text-right">New this year</th>
              <th className="px-4 py-3 text-right">Credit notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmtMonth(m.month, true)}<MonthBadges m={m} best={best.month} /></td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(m.sales)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                  {money0(m.p)}
                  {m.missing_bills > 0 && (
                    <div className="text-[11px] font-normal text-amber-700" title="Marg sent these bills with some lines missing, so the profit on those lines isn't counted">
                      {m.missing_bills} bill{m.missing_bills > 1 ? "s" : ""} short {money0(m.missing_amount)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{pct(m.margin)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.bills}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.avg_bill)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.active_customers}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.new_customers}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.returns)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400 mt-2 flex flex-col gap-1">
        <p>
          Profit = goods sold before GST less their cost: qty + free at the purchase rate Marg holds for the batch sold. It is gross profit
          (no freight, overheads or discounts given after the purchase bill), always before GST, whatever the GST setting.
          {netOfCredit && " Net profit also takes off the profit on goods returned by credit notes."}
        </p>
        {t.missBills > 0 && (
          <p className="text-amber-700">
            {t.missBills} sale bills this year came from Marg with lines missing ({money0(t.missAmt)} incl. GST): the profit on those lines can&apos;t be
            counted, so profit is a little low in those months. They are listed on Marg Bills under &quot;Lines don&apos;t match total&quot;.
          </p>
        )}
        {t.uncosted > 0 && <p>{t.uncosted} sale line{t.uncosted > 1 ? "s" : ""} had no purchase rate for their batch and count with no cost.</p>}
        <p>
          {netOfCredit && "Net sales = sale invoices minus that month's credit notes; Avg bill stays on invoices alone. "}
          &quot;New this year&quot; counts customers whose first sale invoice of the year was that month (April counts everyone billed in April).
          {" "}{t.fresh} customers billed this year.
        </p>
      </div>
    </>
  );
}

export function PurchasesTrend({ s }) {
  const months = useMonthly(s);
  if (!months) return <Loader />;
  if (!months.length) return <Empty text="No bills yet" />;
  const best = months.reduce((a, m) => (m.purchases > a.purchases ? m : a), months[0]);
  const t = months.reduce((a, m) => ({ p: a.p + m.purchases, bills: a.bills + m.purchase_bills }), { p: 0, bills: 0 });
  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Tile label="Purchases this year" value={money0(t.p)} />
        <Tile label="Average per month" value={money0(t.p / months.length)} sub={`over ${months.length} months`} />
        <Tile label="Highest purchase month" value={money0(best.purchases)} sub={fmtMonth(best.month, true)} />
        <Tile label="Purchase bills" value={fmtCount(t.bills)} sub={`avg bill ${money0(t.bills ? t.p / t.bills : 0)}`} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <MonthlyChart monthly={months.map((m) => ({ ...m, bills: m.purchase_bills }))} series={[{ key: "purchases", label: "Purchases", color: "#2a78d6" }]} note={gstWord(s)} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Purchases</th>
              <th className="px-4 py-3 text-right">Purchase bills</th>
              <th className="px-4 py-3 text-right">Avg bill</th>
              <th className="px-4 py-3 text-right">Suppliers billed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmtMonth(m.month, true)}<MonthBadges m={{ ...m }} best={best.month} /></td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(m.purchases)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.purchase_bills}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(m.purchase_bills ? m.purchases / m.purchase_bills : 0)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{m.suppliers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ProductsTrend({ s }) {
  const months = useMonthly(s);
  if (!months) return <Loader />;
  if (!months.length) return <Empty text="No bills yet" />;
  const t = months.reduce((a, m) => ({ units: a.units + m.units, goods: a.goods + m.goods_sold }), { units: 0, goods: 0 });
  const best = months.reduce((a, m) => (m.units > a.units ? m : a), months[0]);
  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Tile label="Units sold this year" value={fmtCount(t.units)} sub="qty + free" />
        <Tile label="Goods sold this year" value={money0(t.goods)} sub={gstWord(s)} />
        <Tile label="Units per month" value={fmtCount(t.units / months.length)} sub={`over ${months.length} months`} />
        <Tile label="Most units in a month" value={fmtCount(best.units)} sub={fmtMonth(best.month, true)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={months} series={[{ key: "units", label: "Units sold", color: "#2a78d6" }]} unit="qty" note="qty + free" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyChart monthly={months} series={[{ key: "goods_sold", label: "Goods sold", color: "#2a78d6" }]} note={gstWord(s)} />
        </div>
      </div>
    </>
  );
}

// ---- best months / slipping -------------------------------------------------

export function BestMonths({ s }) {
  const [all, setAll] = useUrlState("best_all", false);
  const d = useFetch(`/admin/marg-analysis/best-months?limit=50${all ? "&all=1" : ""}${s.withGST ? "" : "&gst=0"}`, { rows: [] });
  const rows = d ? d.rows || [] : null;
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">The biggest single months for one customer this year.</p>
        <select value={all ? "all" : "one"} onChange={(e) => setAll(e.target.value === "all")}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          <option value="one">Each customer&apos;s best month</option>
          <option value="all">All months</option>
        </select>
      </div>
      {!rows ? <Loader /> : !rows.length ? <Empty text="No sales yet" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
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

export function Slipping({ s }) {
  const [days, setDays] = useUrlState("days", 45);
  const d = useFetch(`/admin/marg-analysis/slipping?days=${days}${s.withGST ? "" : "&gst=0"}`, { rows: [] });
  const rows = d ? d.rows || [] : null;
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          Customers who bought in at least 2 months this year but have no sale bill in the last {days} days, biggest buyers first.
          {rows && <> <span className="font-semibold text-gray-900">{rows.length}</span> customers.</>}
        </p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          {[30, 45, 60, 90].map((n) => <option key={n} value={n}>No bill in {n}+ days</option>)}
        </select>
      </div>
      {!rows ? <Loader /> : !rows.length ? <Empty text="No slipping customers" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
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

// ---- by city ----------------------------------------------------------------

export function useCities(s) {
  return useFetch(`/admin/marg-analysis/cities?${apiSettings(s)}`, { rows: [] });
}

export function Cities({ s }) {
  const d = useCities(s);
  const [q, setQ] = useState("");
  if (!d) return <Loader />;
  const total = d.rows.reduce((t, r) => t + r.sales, 0);
  const rows = d.rows.filter((r) => !q || (r.city || "").includes(q.toUpperCase()));
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{d.rows.length}</span> cities · <span className="font-semibold text-gray-900">{money0(total)}</span> sales ·{" "}
          <WindowNote window={d.window} requested={s.period} />
          <span className="text-gray-400"> · city from the customer&apos;s Marg account</span>
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a city..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-56" />
      </div>
      {!rows.length ? <Empty text="No cities" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-4 py-3 text-right">Customers</th>
                <th className="px-4 py-3 text-right">Bills</th>
                <th className="px-4 py-3 text-right">Per customer</th>
                <th className="px-4 py-3 text-right">Credit notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={r.city || "-"} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-900">{r.city || <span className="text-gray-400">No city in Marg</span>}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money0(r.sales)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{total ? ((100 * r.sales) / total).toFixed(1) : 0}%</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.customers}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.bills}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money0(r.customers ? r.sales / r.customers : 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{r.returns ? money0(r.returns) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- rising & falling products ----------------------------------------------

export function useMovers(s, dir) {
  return useFetch(`/admin/marg-analysis/products?${apiSettings(s, { sort: "trend", dir })}`, { rows: [] });
}

function MoversTable({ title, data }) {
  if (!data) return <Loader />;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
      <div className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900">{title}</div>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2 text-right">Last 3 months</th>
            <th className="px-4 py-2 text-right">3 before</th>
            <th className="px-4 py-2 text-right">Change</th>
            <th className="px-4 py-2">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.rows.map((r) => (
            <tr key={r.product_pid} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">{r.name || `Product ${r.product_pid}`}</Link>
                <div className="text-xs text-gray-400">{r.company || r.code || r.product_pid}</div>
              </td>
              <td className="px-4 py-2.5 text-right text-gray-900 whitespace-nowrap">{money0(r.last3)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">{money0(r.prev3)}</td>
              <td className="px-4 py-2.5 text-right text-gray-900 font-medium whitespace-nowrap">{r.last3 - r.prev3 >= 0 ? "+" : "−"}{money0(Math.abs(r.last3 - r.prev3))}</td>
              <td className="px-4 py-2.5"><Trend last3={r.last3} prev3={r.prev3} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RisingFalling({ s }) {
  const up = useMovers(s, "desc");
  const down = useMovers(s, "asc");
  return (
    <>
      <p className="text-sm text-gray-600 mb-3">
        Sales in the last 3 months (incl. the running month) against the 3 months before, biggest change in rupees first. Products sold in the chosen period.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <MoversTable title="Rising" data={up} />
        <MoversTable title="Falling" data={down} />
      </div>
    </>
  );
}

// ---- not selling ------------------------------------------------------------

export function useNotSelling(s, days) {
  return useFetch(`/admin/marg-analysis/not-selling?days=${days}${s.withGST ? "" : "&gst=0"}`, { rows: [] });
}

export function NotSelling({ s }) {
  const [days, setDays] = useUrlState("ns_days", 30);
  const [under, setUnder] = useUrlState("ns_under", 50);
  const [order, setOrder] = useUrlState("ns_sort", "stuck");
  const d = useNotSelling(s, days);
  if (!d) return <Loader />;
  const rows = d.rows
    .filter((r) => r.sell_through * 100 < under)
    .map((r) => ({ ...r, stuck: r.bought_amount * Math.max(0, 1 - r.sell_through) }))
    .sort((a, b) => (order === "stuck" ? b.stuck - a.stuck : a.sell_through - b.sell_through || b.bought_amount - a.bought_amount));
  const stuck = rows.reduce((t, r) => t + r.stuck, 0);
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <select value={under} onChange={(e) => setUnder(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          {[10, 25, 50, 75].map((n) => <option key={n} value={n}>Sold under {n}% of what was bought</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          {[30, 60, 90].map((n) => <option key={n} value={n}>First bought {n}+ days ago</option>)}
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900">
          <option value="stuck">Most money unsold first</option>
          <option value="through">Lowest share sold first</option>
        </select>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        <span className="font-semibold text-gray-900">{rows.length}</span> products bought in this year ·{" "}
        about <span className="font-semibold text-gray-900">{money0(stuck)}</span> of their purchase value not yet sold
        <span className="text-gray-400"> (units sold since the first purchase, against units bought; stock from before April isn&apos;t counted)</span>
      </p>
      {!rows.length ? <Empty text="Nothing under that line" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Bought</th>
                <th className="px-4 py-3 text-right">Sold since</th>
                <th className="px-4 py-3 text-right">Share sold</th>
                <th className="px-4 py-3 text-right">Unsold value</th>
                <th className="px-4 py-3">First bought</th>
                <th className="px-4 py-3">Last sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.product_pid} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">{r.name || `Product ${r.product_pid}`}</Link>
                    <div className="text-xs text-gray-400">{[r.code, r.product_pid, r.company].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-gray-900">{fmtCount(r.bought_units)} units</div>
                    <div className="text-xs text-gray-400">{money0(r.bought_amount)}</div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-gray-900">{fmtCount(r.sold_units)} units</div>
                    <div className="text-xs text-gray-400">{money0(r.sold_amount)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{Math.round(r.sell_through * 100)}%</td>
                  <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{money0(r.stuck)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {fmtDate(r.first_purchase)}
                    <div className="text-xs text-gray-400">{r.days_since_first} days ago</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.last_sold ? fmtDate(r.last_sold) : <span className="text-gray-400">not sold</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
