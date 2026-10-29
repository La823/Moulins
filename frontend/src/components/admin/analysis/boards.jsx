"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useBreadcrumbTitle } from "@/components/admin/Breadcrumbs";
import MonthlyChart from "@/components/admin/MargMonthlyChart";
import { fmtMonth } from "@/components/admin/MargPeriod";
import { PRODUCT_COMPANIES } from "@/components/admin/MargDemand";
import Loader from "@/components/Loader";
import {
  useAnalysisSettings, withSettings, apiSettings, AnalysisHeader, gstNote, BoardCard, useFetch, CardLoading, CardEmpty,
  Stat, BarList, Sparkline, MonthDelta, SplitBar, SPLIT_COLORS, shortMoney, fmtCount, Empty, Trend,
} from "./common";
import {
  PartyRanking, ProductRanking, SalesTrend, PurchasesTrend, ProductsTrend, BestMonths, Slipping, Cities, RisingFalling, NotSelling,
  useMonthly, useCities, useMovers, useNotSelling,
} from "./reports";
import { YearsLink } from "./years";

// The Analysis home (three blocks + the company trend), each block's board
// of cards, and the full report page behind each card. Pages under
// app/(admin)/panel/marg-analysis render these.

const BASE = "/panel/marg-analysis";

// Every full report: which block it belongs to, its title and note, and
// whether the period setting applies (monthly trends always show the year).
export const REPORTS = {
  customers: {
    title: "Customers",
    note: "Sales are sale invoices, without cancelled bills or unbilled challans; credit notes are shown apart, not subtracted.",
    reports: {
      ranking: { title: "All customers", C: (p) => <PartyRanking mode="sales" prefix="c" {...p} /> },
      "best-months": { title: "Best months", period: false, C: BestMonths },
      slipping: { title: "Slipping customers", period: false, C: Slipping },
      cities: { title: "Sales by city", C: Cities },
    },
  },
  suppliers: {
    title: "Suppliers & purchases",
    note: "Purchases are purchase bills from suppliers and manufacturers; debit notes (purchase returns) are shown apart.",
    reports: {
      trend: { title: "Purchases month by month", period: false, C: PurchasesTrend },
      ranking: { title: "All suppliers & manufacturers", C: (p) => <PartyRanking mode="purchases" prefix="s" {...p} /> },
    },
  },
  products: {
    title: "Products",
    note: "Products are the goods lines of sale invoices (no freight or charges).",
    reports: {
      trend: { title: "Units & value month by month", period: false, C: ProductsTrend },
      ranking: { title: "All products", C: ProductRanking },
      rising: { title: "Rising & falling", C: RisingFalling },
      "not-selling": { title: "Not selling", period: false, C: NotSelling },
    },
  },
};

function Frame({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

// ---- report page ------------------------------------------------------------

export function ReportPage({ block, report }) {
  return <Frame><Report block={block} report={report} /></Frame>;
}

function Report({ block, report }) {
  const s = useAnalysisSettings();
  const b = REPORTS[block];
  const r = b?.reports[report];
  useBreadcrumbTitle(r?.title || null);
  if (!r) return <Empty text="No such report" />;
  return (
    <>
      <AnalysisHeader
        title={r.title}
        note={`${b.note} ${gstNote(s.withGST)}${r.period === false ? " Shows the whole financial year, whatever the period." : ""}`}
        s={s}
        period={r.period !== false}
      />
      <OtherReports block={block} current={report} s={s} />
      <r.C s={s} />
    </>
  );
}

// The block's other reports as tabs, so one report leads to the next
// without going back to the board.
function OtherReports({ block, current, s }) {
  const b = REPORTS[block];
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
      <Link href={withSettings(`${BASE}/${block}`, s.settingsQuery)} className="px-3 py-2 text-sm -mb-px border-b-2 border-transparent text-gray-500 hover:text-gray-800 whitespace-nowrap">
        ← {b.title} board
      </Link>
      {Object.entries(b.reports).map(([k, r]) => (
        <Link
          key={k}
          href={withSettings(`${BASE}/${block}/${k}`, s.settingsQuery)}
          data-crumb="replace"
          className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${
            k === current ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          {r.title}
        </Link>
      ))}
    </div>
  );
}

// ---- net sales --------------------------------------------------------------

// Sales month by month for the whole company, net of credit notes unless
// unticked. A page of its own, opened from the home page's Net sales box.
export function NetSalesPage() {
  return <Frame><NetSales /></Frame>;
}

function NetSales() {
  const s = useAnalysisSettings();
  useBreadcrumbTitle("Net sales");
  return (
    <>
      <AnalysisHeader
        title="Net sales"
        note={`Sale invoices less credit notes, month by month, without cancelled bills or unbilled challans. ${gstNote(s.withGST)} Shows the whole financial year.`}
        s={s}
        period={false}
      />
      <SalesTrend s={s} netDefault />
    </>
  );
}

// ---- home -------------------------------------------------------------------

export function AnalysisHome() {
  return <Frame><Home /></Frame>;
}

function Home() {
  const s = useAnalysisSettings();
  const months = useMonthly(s);
  const cust = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "sales", sort: "total" })}`, {});
  const supp = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "purchases", sort: "total" })}`, {});
  const prod = useFetch(`/admin/marg-analysis/products?${apiSettings(s, { sort: "amount" })}`, {});
  const link = (block) => withSettings(`${BASE}/${block}`, s.settingsQuery);
  const share = (code) => {
    const a = prod?.company_amounts || {};
    const t = Object.values(a).reduce((x, y) => x + y, 0);
    return t ? Math.round((100 * (a[code] || 0)) / t) : 0;
  };

  return (
    <>
      <AnalysisHeader
        title="Analysis"
        note={`This financial year's Marg bills. Pick a block for its board of reports. ${gstNote(s.withGST)}`}
        s={s}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-5">
        <Block title="Net sales" href={link("net-sales")} loading={!months}>
          <NetSalesBlock months={months} />
        </Block>
        <Block title="Customers" href={link("customers")} loading={!cust}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat label="Sales in the period" value={shortMoney(cust?.sum_total)} />
            <Stat label="Customers billed" value={fmtCount(cust?.total)} sub={cust?.total ? `${shortMoney(cust.sum_total / cust.total)} each` : null} />
          </div>
          <Sparkline months={months} field="sales" />
          <MonthDelta months={months} field="sales" />
        </Block>
        <Block title="Suppliers & purchases" href={link("suppliers")} loading={!supp}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat label="Purchases in the period" value={shortMoney(supp?.sum_total)} />
            <Stat label="Suppliers & manufacturers" value={fmtCount(supp?.total)} />
          </div>
          <Sparkline months={months} field="purchases" />
          <MonthDelta months={months} field="purchases" />
        </Block>
        <Block title="Products" href={link("products")} loading={!prod}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat label="Products sold" value={fmtCount(prod?.total)} sub={`Moulins ${share("IB")}% of value`} />
            <Stat label="Top product" value={prod?.rows?.[0] ? shortMoney(prod.rows[0].amount) : "—"} sub={prod?.rows?.[0]?.name} />
          </div>
          <Sparkline months={months} field="units" fmt={(v) => `${fmtCount(v)} units`} />
          <MonthDelta months={months} field="units" />
        </Block>
      </div>
      <YearsLink s={s} />
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {!months ? <Loader /> : (
          <MonthlyChart
            monthly={months}
            series={[{ key: "sales", label: "Sales", color: SPLIT_COLORS[0] }, { key: "purchases", label: "Purchases", color: SPLIT_COLORS[1] }]}
            title="Sales vs purchases, month by month"
            note={s.withGST ? "incl. GST · whole year" : "without GST · whole year"}
          />
        )}
      </div>
    </>
  );
}

// This year's sales less credit notes, with the month-by-month line.
function NetSalesBlock({ months }) {
  const net = (months || []).map((m) => ({ ...m, net: m.sales - m.returns }));
  const t = net.reduce((a, m) => ({ net: a.net + m.net, ret: a.ret + m.returns, p: a.p + m.net_profit, goods: a.goods + m.sale_goods - m.return_goods }), { net: 0, ret: 0, p: 0, goods: 0 });
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat label="Net sales this year" value={shortMoney(t.net)} />
        <Stat label="Net profit" value={shortMoney(t.p)} sub={t.goods ? `${((100 * t.p) / t.goods).toFixed(1)}% margin · credit notes ${shortMoney(t.ret)}` : null} />
      </div>
      <Sparkline months={net} field="net" />
      <MonthDelta months={net} field="net" />
    </>
  );
}

function Block({ title, href, loading, children }) {
  return (
    <Link href={href} className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 hover:shadow-sm transition flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 group-hover:text-gray-900">Open board →</span>
      </div>
      {loading ? <CardLoading /> : children}
    </Link>
  );
}

// ---- boards -----------------------------------------------------------------

export function Board({ block }) {
  return <Frame><BoardInner block={block} /></Frame>;
}

function BoardInner({ block }) {
  const s = useAnalysisSettings();
  const b = REPORTS[block];
  useBreadcrumbTitle(b.title);
  const href = (report, extra) => withSettings(`${BASE}/${block}/${report}`, s.settingsQuery, extra);
  return (
    <>
      <AnalysisHeader title={b.title} note={`${b.note} ${gstNote(s.withGST)}`} s={s} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {block === "customers" && <CustomerCards s={s} href={href} />}
        {block === "suppliers" && <SupplierCards s={s} href={href} />}
        {block === "products" && <ProductCards s={s} href={href} />}
      </div>
    </>
  );
}

// The block's complete list, as a wide card: how many there are, the
// sorts on offer, and the first few rows.
function AllListCard({ title, sub, href, data, noun, rows }) {
  return (
    <BoardCard title={title} sub={sub} href={href} wide>
      {!data ? <CardLoading /> : !rows.length ? <CardEmpty /> : (
        <>
          <div className="text-2xl font-semibold text-gray-900 mb-3">
            {fmtCount(data.total)} <span className="text-sm font-normal text-gray-500">{noun} in the period</span>
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-gray-400">
              <tr>
                <th className="py-1 font-normal">Highest average per month</th>
                <th className="py-1 font-normal text-right">Avg / month</th>
                <th className="py-1 font-normal text-right hidden sm:table-cell">Total</th>
                <th className="py-1 font-normal text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5 pr-3 text-gray-700 max-w-0 w-full truncate">{r.label}</td>
                  <td className="py-1.5 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">{shortMoney(r.avg)}</td>
                  <td className="py-1.5 pl-3 text-right text-gray-600 tabular-nums whitespace-nowrap hidden sm:table-cell">{shortMoney(r.total)}</td>
                  <td className="py-1.5 pl-3 text-right"><Trend last3={r.last3} prev3={r.prev3} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </BoardCard>
  );
}

const partyBars = (rows, field = "total") =>
  (rows || []).map((r) => ({ key: r.party_code, label: r.name || r.party_code, value: r[field] || 0 }));

function TrendCard({ title, href, months, field, extra, fmt }) {
  const done = (months || []).filter((m) => m.month < new Date().toISOString().slice(0, 7));
  const year = (months || []).reduce((t, m) => t + (m[field] || 0), 0);
  return (
    <BoardCard title={title} sub="This financial year, month by month" href={href} wide>
      {!months ? <CardLoading /> : !months.length ? <CardEmpty /> : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="This year" value={(fmt || shortMoney)(year)} />
            <Stat label="Per month" value={(fmt || shortMoney)(year / months.length)} />
            <Stat label={done.length ? fmtMonth(done[done.length - 1].month) : "Last month"} value={(fmt || shortMoney)(done.length ? done[done.length - 1][field] : 0)} sub={extra} />
          </div>
          <Sparkline months={months} field={field} fmt={fmt} height={64} />
          <MonthDelta months={months} field={field} />
        </>
      )}
    </BoardCard>
  );
}

function CustomerCards({ s, href }) {
  const months = useMonthly(s);
  const top = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "sales", sort: "total" })}`, { rows: [] });
  const all = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "sales", sort: "avg" })}`, { rows: [] });
  const credit = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "sales", sort: "returns" })}`, { rows: [] });
  const best = useFetch(`/admin/marg-analysis/best-months?limit=5${s.withGST ? "" : "&gst=0"}`, { rows: [] });
  const slip = useFetch(`/admin/marg-analysis/slipping?days=45${s.withGST ? "" : "&gst=0"}`, { rows: [] });
  const cities = useCities(s);
  const last = months?.filter((m) => m.month < new Date().toISOString().slice(0, 7)).slice(-1)[0];

  return (
    <>
      <AllListCard title="All customers" href={href("ranking")} data={all} noun="customers billed"
        sub="Every customer, sortable by average, total sales, months bought, bills, credit notes or trend"
        rows={(all?.rows || []).slice(0, 5).map((r) => ({ key: r.party_code, label: r.name || r.party_code, avg: r.avg_monthly, total: r.total, last3: r.last3, prev3: r.prev3 }))} />
      <BoardCard title="Customers billed" sub="Active and new each month" href={withSettings(`${BASE}/net-sales`, s.settingsQuery)}>
        {!months ? <CardLoading /> : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Stat label={last ? `Billed in ${fmtMonth(last.month)}` : "Billed"} value={fmtCount(last?.active_customers)} />
              <Stat label="New that month" value={fmtCount(last?.new_customers)} sub="first bill of the year" />
            </div>
            <Sparkline months={months} field="active_customers" fmt={(v) => `${fmtCount(v)} customers`} />
          </>
        )}
      </BoardCard>
      <BoardCard title="Top customers" sub="By sales in the period" href={href("ranking", { c_sort: "total.desc" })}>
        {!top ? <CardLoading /> : <BarList rows={partyBars(top.rows?.slice(0, 8))} />}
      </BoardCard>
      <BoardCard title="Sales by city" sub="Where the period's sales went" href={href("cities")}>
        {!cities ? <CardLoading /> : <BarList rows={cities.rows.slice(0, 8).map((r) => ({ key: r.city || "-", label: r.city || "No city in Marg", value: r.sales }))} />}
      </BoardCard>
      <BoardCard title="Best months" sub="Biggest single customer-months this year" href={href("best-months")}>
        {!best ? <CardLoading /> : (
          <BarList rows={(best.rows || []).map((r) => ({ key: `${r.party_code}-${r.month}`, label: `${r.name || r.party_code} · ${fmtMonth(r.month)}`, value: r.amount }))} />
        )}
      </BoardCard>
      <BoardCard title="Slipping customers" sub="Regular buyers with no bill in 45+ days" href={href("slipping")}>
        {!slip ? <CardLoading /> : !slip.rows?.length ? <CardEmpty text="None slipping" /> : (
          <>
            <div className="text-2xl font-semibold text-gray-900 mb-2">{slip.rows.length} <span className="text-sm font-normal text-gray-500">customers</span></div>
            <ul className="flex flex-col gap-1 text-xs">
              {slip.rows.slice(0, 5).map((r) => (
                <li key={r.party_code} className="flex justify-between gap-3">
                  <span className="truncate text-gray-700">{r.name || r.party_code}</span>
                  <span className="text-gray-500 whitespace-nowrap tabular-nums">{r.days_since} days · {shortMoney(r.avg_active)}/mo</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </BoardCard>
      <BoardCard title="Credit notes" sub="Customers with the most returns in the period" href={href("ranking", { c_sort: "returns.desc" })}>
        {!credit ? <CardLoading /> : <BarList rows={partyBars((credit.rows || []).filter((r) => r.returns > 0).slice(0, 6), "returns")} />}
      </BoardCard>
    </>
  );
}

function SupplierCards({ s, href }) {
  const months = useMonthly(s);
  const top = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "purchases", sort: "total" })}`, { rows: [] });
  const all = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "purchases", sort: "avg" })}`, { rows: [] });
  const rising = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "purchases", sort: "trend" })}`, { rows: [] });
  const debit = useFetch(`/admin/marg-analysis/parties?${apiSettings(s, { mode: "purchases", sort: "returns" })}`, { rows: [] });
  const last = months?.filter((m) => m.month < new Date().toISOString().slice(0, 7)).slice(-1)[0];
  return (
    <>
      <TrendCard title="Purchases trend" href={href("trend")} months={months} field="purchases"
        extra={last ? `${last.purchase_bills} bills · ${last.suppliers} suppliers` : null} />
      <AllListCard title="All suppliers & manufacturers" href={href("ranking")} data={all} noun="suppliers & manufacturers"
        sub="Every supplier and manufacturer, sortable by average, total, best month, bills, debit notes, trend or last bill"
        rows={(all?.rows || []).slice(0, 5).map((r) => ({ key: r.party_code, label: r.name || r.party_code, avg: r.avg_monthly, total: r.total, last3: r.last3, prev3: r.prev3 }))} />
      <BoardCard title="Top suppliers & manufacturers" sub="By purchases in the period" href={href("ranking", { s_sort: "total.desc" })}>
        {!top ? <CardLoading /> : <BarList rows={partyBars(top.rows?.slice(0, 8))} />}
      </BoardCard>
      <BoardCard title="Buying more from" sub="Last 3 months vs the 3 before" href={href("ranking", { s_sort: "trend.desc" })}>
        {!rising ? <CardLoading /> : (
          <BarList rows={(rising.rows || []).filter((r) => r.last3 > r.prev3).slice(0, 6).map((r) => ({ key: r.party_code, label: r.name || r.party_code, value: r.last3 - r.prev3 }))}
            fmt={(v) => `+${shortMoney(v)}`} />
        )}
      </BoardCard>
      <BoardCard title="Debit notes" sub="Purchase returns in the period" href={href("ranking", { s_sort: "returns.desc" })}>
        {!debit ? <CardLoading /> : <BarList rows={partyBars((debit.rows || []).filter((r) => r.returns > 0).slice(0, 6), "returns")} />}
      </BoardCard>
    </>
  );
}

function ProductCards({ s, href }) {
  const months = useMonthly(s);
  const top = useFetch(`/admin/marg-analysis/products?${apiSettings(s, { sort: "amount" })}`, { rows: [] });
  const all = useFetch(`/admin/marg-analysis/products?${apiSettings(s, { sort: "avg" })}`, { rows: [] });
  const up = useMovers(s, "desc");
  const down = useMovers(s, "asc");
  const ns = useNotSelling(s, 30);
  const amounts = top?.company_amounts || {};
  const slow = (ns?.rows || []).filter((r) => r.sell_through < 0.5).map((r) => ({ ...r, stuck: r.bought_amount * (1 - r.sell_through) })).sort((a, b) => b.stuck - a.stuck);
  const prodBars = (rows, field) => (rows || []).map((r) => ({ key: r.product_pid, label: r.name || `Product ${r.product_pid}`, value: field(r) }));

  return (
    <>
      <TrendCard title="Units sold" href={href("trend")} months={months} field="units" fmt={(v) => fmtCount(v)} extra="qty + free" />
      <AllListCard title="All products" href={href("ranking")} data={all} noun="products sold"
        sub="Every product sold, sortable by average, sales, qty, best month, customers, bills, trend or last sold; filter by company"
        rows={(all?.rows || []).slice(0, 5).map((r) => ({ key: r.product_pid, label: r.name || `Product ${r.product_pid}`, avg: r.avg_monthly, total: r.amount, last3: r.last3, prev3: r.prev3 }))} />
      <BoardCard title="Top products" sub="By sales in the period" href={href("ranking", { p_sort: "amount.desc" })}>
        {!top ? <CardLoading /> : <BarList rows={prodBars(top.rows?.slice(0, 8), (r) => r.amount)} />}
      </BoardCard>
      <BoardCard title="By company" sub="Share of the period's product sales" href={href("ranking")}>
        {!top ? <CardLoading /> : (
          <SplitBar parts={PRODUCT_COMPANIES.filter((c) => c.code).map((c, i) => ({ key: c.code, label: c.label, value: amounts[c.code] || 0, color: SPLIT_COLORS[i] }))} />
        )}
      </BoardCard>
      <BoardCard title="Rising" sub="Last 3 months vs the 3 before" href={href("rising")}>
        {!up ? <CardLoading /> : <BarList rows={prodBars((up.rows || []).filter((r) => r.last3 > r.prev3).slice(0, 6), (r) => r.last3 - r.prev3)} fmt={(v) => `+${shortMoney(v)}`} />}
      </BoardCard>
      <BoardCard title="Falling" sub="Last 3 months vs the 3 before" href={href("rising")}>
        {!down ? <CardLoading /> : <BarList rows={prodBars((down.rows || []).filter((r) => r.last3 < r.prev3).slice(0, 6), (r) => r.prev3 - r.last3)} fmt={(v) => `−${shortMoney(v)}`} />}
      </BoardCard>
      <BoardCard title="Not selling" sub="Bought in this year, under half sold since" href={href("not-selling")}>
        {!ns ? <CardLoading /> : !slow.length ? <CardEmpty text="Everything is moving" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Stat label="Products" value={fmtCount(slow.length)} />
              <Stat label="Unsold purchase value" value={shortMoney(slow.reduce((t, r) => t + r.stuck, 0))} />
            </div>
            <BarList rows={prodBars(slow.slice(0, 5), (r) => r.stuck)} />
          </>
        )}
      </BoardCard>
    </>
  );
}
