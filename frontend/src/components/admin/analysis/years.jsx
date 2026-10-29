"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useBreadcrumbTitle } from "@/components/admin/Breadcrumbs";
import MonthlyChart from "@/components/admin/MargMonthlyChart";
import { fmtMonth } from "@/components/admin/MargPeriod";
import Loader from "@/components/Loader";
import { fmtDate } from "@/components/admin/MargBills";
import { useAnalysisSettings, withSettings, apiSettings, AnalysisHeader, useFetch, money0, fmtCount, Tile, Empty, SearchBox } from "./common";

// Sales year by year: every financial year on record, month by month and
// per customer (backend internal/margede/analysis_years.go). Years before
// the live Marg sync come from the Day Book loaded from Excel; product
// reports can't use those (no line items) and stay on the live data.

const BASE = "/panel/marg-analysis";
const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// "2025-26" + fiscal month 0 (April) -> "2025-04"; 9 (January) -> "2026-01"
function monthOf(fy, i) {
  const y = Number(fy.slice(0, 4)) + (i >= 9 ? 1 : 0);
  return `${y}-${String(((i + 3) % 12) + 1).padStart(2, "0")}`;
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function Change({ now, before }) {
  if (!before) return <span className="text-gray-300">—</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs whitespace-nowrap ${up ? "text-green-700" : "text-red-600"}`} title={`${money0(now)} vs ${money0(before)}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// The link to this page on the Analysis home.
export function YearsLink({ s }) {
  return (
    <Link
      href={withSettings(`${BASE}/years`, s.settingsQuery)}
      className="group flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-5 py-3 mb-5 hover:border-gray-400 hover:shadow-sm transition"
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Sales year by year</h3>
        <p className="text-xs text-gray-400">2025-26 (from the Day Book) next to this year: month by month and per customer</p>
      </div>
      <span className="text-xs text-gray-400 group-hover:text-gray-900 whitespace-nowrap">Open →</span>
    </Link>
  );
}

export function YearsPage() {
  return (
    <Suspense fallback={null}>
      <Years />
    </Suspense>
  );
}

function Years() {
  const s = useAnalysisSettings();
  useBreadcrumbTitle("Sales year by year");
  const months = useFetch(`/admin/marg-analysis/years/monthly?${apiSettings(s)}`, []);
  const customers = useFetch(`/admin/marg-analysis/years/customers?${apiSettings(s)}`, { fys: [], rows: [] });

  return (
    <>
      <AnalysisHeader
        title="Sales year by year"
        note={`Sale invoices per financial year, without cancelled bills or unbilled challans; credit notes shown apart. 2025-26 comes from Marg's Day Book (loaded from Excel), this year from the live Marg sync. ${
          s.withGST ? "Amounts incl. GST." : "Amounts without GST (the GST lines taken off each bill)."
        }`}
        s={s}
        period={false}
      />
      {!months ? <Loader /> : !months.length ? <Empty text="No bills yet" /> : <MonthsSection months={months} customers={customers} />}
      <h3 className="text-base font-semibold text-gray-900 mt-8 mb-3">Customers, year by year</h3>
      {!customers ? <Loader /> : <CustomersSection data={customers} />}
    </>
  );
}

function MonthsSection({ months, customers }) {
  const byMonth = Object.fromEntries(months.map((m) => [m.month, m]));
  const fys = [...new Set(months.map((m) => m.fy))];
  const latest = fys[fys.length - 1];
  const prev = fys.length > 1 ? fys[fys.length - 2] : null;
  const running = thisMonth();

  const yearTotal = (fy, field) => months.filter((m) => m.fy === fy).reduce((a, m) => a + m[field], 0);
  const buyers = (fy) => (customers?.rows || []).filter((r) => r.years[fy]?.sales > 0).length;
  // This year against the same months last year, finished months only.
  const fiscalIndex = (month) => (Number(month.slice(5, 7)) + 8) % 12; // April 0 … March 11
  const done = months.filter((m) => m.fy === latest && m.month < running).map((m) => fiscalIndex(m.month));
  const sumAt = (fy, idx) => idx.reduce((a, i) => a + (byMonth[monthOf(fy, i)]?.sales || 0), 0);
  const range = done.length ? `${FY_MONTHS[done[0]]}–${FY_MONTHS[done[done.length - 1]]}` : "";

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        {fys.map((fy) => (
          <Tile
            key={fy}
            label={`Sales FY ${fy}${fy === latest ? " so far" : ""}`}
            value={money0(yearTotal(fy, "sales"))}
            sub={`${fmtCount(yearTotal(fy, "bills"))} bills · ${fmtCount(buyers(fy))} customers · credit notes ${money0(yearTotal(fy, "returns"))}`}
          />
        ))}
        {prev && done.length > 0 && (
          <Tile
            label={`${range}: this year vs last year`}
            value={money0(sumAt(latest, done) - sumAt(prev, done))}
            sub={
              <>
                {money0(sumAt(latest, done))} vs {money0(sumAt(prev, done))} <Change now={sumAt(latest, done)} before={sumAt(prev, done)} />
              </>
            }
          />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <MonthlyChart
          monthly={months}
          series={[
            { key: "sales", label: "Sales", color: "#2a78d6" },
            { key: "returns", label: "Credit notes", color: "#eb6834" },
          ]}
          title={`Sales, month by month since ${fmtMonth(months[0].month, true)}`}
          note="hover for the month and year"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Month</th>
              {fys.map((fy) => (
                <th key={fy} className="px-4 py-3 text-right" colSpan={2}>FY {fy}</th>
              ))}
              {prev && <th className="px-4 py-3 text-right">Change</th>}
            </tr>
            <tr className="text-[10px]">
              <th></th>
              {fys.map((fy) => [
                <th key={`${fy}s`} className="px-4 pb-2 text-right font-normal">Sales</th>,
                <th key={`${fy}b`} className="px-4 pb-2 text-right font-normal">Bills · customers</th>,
              ])}
              {prev && <th className="px-4 pb-2 text-right font-normal">vs last year</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {FY_MONTHS.map((label, i) => (
              <tr key={label}>
                <td className="px-4 py-3 text-gray-900">{label}</td>
                {fys.map((fy) => {
                  const m = byMonth[monthOf(fy, i)];
                  return [
                    <td key={`${fy}s`} className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {m ? money0(m.sales) : <span className="text-gray-300">—</span>}
                      {m && m.month === running && <div className="text-[10px] font-normal text-gray-400">month running</div>}
                    </td>,
                    <td key={`${fy}b`} className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                      {m ? `${m.bills} · ${m.customers}` : ""}
                    </td>,
                  ];
                })}
                {prev && (
                  <td className="px-4 py-3 text-right">
                    {byMonth[monthOf(latest, i)] ? (
                      <Change now={byMonth[monthOf(latest, i)].sales} before={byMonth[monthOf(prev, i)]?.sales} />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-3 text-gray-900">Year</td>
              {fys.map((fy) => [
                <td key={`${fy}s`} className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{money0(yearTotal(fy, "sales"))}</td>,
                <td key={`${fy}b`} className="px-4 py-3 text-right text-gray-500 font-normal">{fmtCount(yearTotal(fy, "bills"))} bills</td>,
              ])}
              {prev && <td></td>}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Change compares each month with the same month last year; the running month is still filling up. Customers per month are those with a sale
        invoice that month.
      </p>
    </>
  );
}

function CustomersSection({ data }) {
  const fys = data.fys;
  const latest = fys[fys.length - 1];
  const prev = fys.length > 1 ? fys[fys.length - 2] : null;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "total", dir: "desc" });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const val = (r) =>
      sort.key === "total" ? r.total
        : sort.key === "name" ? (r.name || r.party_code).toLowerCase()
        : sort.key === "change" ? (r.years[latest]?.sales || 0) - (r.years[prev]?.sales || 0)
        : r.years[sort.key]?.sales || 0;
    return data.rows
      .filter((r) => !q || (r.name || "").toLowerCase().includes(q) || r.party_code.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === "asc" ? c : -c;
      });
  }, [data.rows, search, sort, latest, prev]);

  const header = (key, label, align = "right") => (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }))}
        className="uppercase tracking-wide hover:text-gray-900"
      >
        {label}
        {sort.key === key && (sort.dir === "desc" ? " ↓" : " ↑")}
      </button>
    </th>
  );
  const totals = Object.fromEntries(fys.map((fy) => [fy, rows.reduce((a, r) => a + (r.years[fy]?.sales || 0), 0)]));

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{fmtCount(rows.length)}</span> customers
          {prev && (
            <span className="text-gray-400">
              {" "}· {fmtCount(rows.filter((r) => r.years[prev]?.sales > 0 && !(r.years[latest]?.sales > 0)).length)} bought in {prev} but not yet in {latest}
              {" "}· {fmtCount(rows.filter((r) => r.years[latest]?.sales > 0 && !(r.years[prev]?.sales > 0)).length)} new in {latest}
            </span>
          )}
        </p>
        <SearchBox value={search} onSearch={setSearch} placeholder="Customer, code or city..." />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              {header("name", "Customer", "left")}
              {fys.map((fy) => header(fy, `FY ${fy}`))}
              {header("total", "All years")}
              {prev && header("change", "Change")}
              <th className="px-4 py-3">Last bill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.party_code} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/panel/party-bills/${encodeURIComponent(r.party_code)}`} className="text-gray-900 hover:underline">
                    {r.name || r.party_code}
                  </Link>
                  <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                    {r.party_code}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.partner_id && (
                      <Link href={`/panel/users/${r.partner_id}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 hover:underline">
                        Partner
                      </Link>
                    )}
                  </div>
                </td>
                {fys.map((fy) => {
                  const y = r.years[fy];
                  return (
                    <td key={fy} className="px-4 py-3 text-right whitespace-nowrap">
                      {y?.sales ? (
                        <>
                          <span className="font-medium text-gray-900">{money0(y.sales)}</span>
                          <div className="text-[11px] text-gray-400">
                            {y.bills} bill{y.bills !== 1 ? "s" : ""}
                            {y.returns > 0 && ` · CN ${money0(y.returns)}`}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{money0(r.total)}</td>
                {prev && (
                  <td className="px-4 py-3 text-right">
                    {r.years[prev]?.sales ? (
                      <Change now={r.years[latest]?.sales || 0} before={r.years[prev].sales} />
                    ) : r.years[latest]?.sales ? (
                      <span className="text-xs text-gray-500">New</span>
                    ) : null}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.last_bill)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className="px-4 py-3 text-gray-900">Total</td>
              {fys.map((fy) => (
                <td key={fy} className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{money0(totals[fy])}</td>
              ))}
              <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{money0(Object.values(totals).reduce((a, b) => a + b, 0))}</td>
              {prev && <td></td>}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {prev && (
        <p className="text-xs text-gray-400 mt-2">
          Change compares {latest} so far with the whole of {prev}, so it reads low until the year is over. Click a customer for all their bills, year by year.
        </p>
      )}
    </>
  );
}
