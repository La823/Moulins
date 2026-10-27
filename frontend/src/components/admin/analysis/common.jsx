"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { fmtMoney } from "@/components/admin/MargBills";
import { PeriodBar, fmtMonth } from "@/components/admin/MargPeriod";
import { rememberQuery } from "@/components/admin/Breadcrumbs";

// Shared pieces of the Analysis pages: the home page (three blocks), each
// block's board of cards, and each card's full report page. Every setting
// is kept in the URL, so Back and the breadcrumbs return to the same view;
// the three page-wide ones (period, running month, GST) travel with every
// link between the pages (withSettings).

export const money0 = (v) => fmtMoney(v).replace(/\.\d\d$/, "");

export function shortMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (Math.abs(n) >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}

export const fmtCount = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ---- settings in the URL ----------------------------------------------------

// setUrlParam writes one setting into the URL, dropping it at its default.
// history.replaceState (which Next keeps useSearchParams in step with) makes
// each change take effect at once, so several in one click all land, and
// Back still goes to the previous page rather than undoing clicks.
export function setUrlParam(name, value, def) {
  const p = new URLSearchParams(window.location.search);
  if (value === def) p.delete(name);
  else p.set(name, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

// useUrlState is useState kept in the URL; the default's type (string,
// number or boolean) says how to read it back.
export function useUrlState(name, def) {
  const raw = useSearchParams().get(name);
  const value = raw == null ? def : typeof def === "number" ? Number(raw) : typeof def === "boolean" ? raw === "1" : raw;
  return [value, (v) => setUrlParam(name, v, def)];
}

export function useSort(prefix, defaultKey, defaultDir = "desc") {
  const [raw, setRaw] = useUrlState(`${prefix}_sort`, `${defaultKey}.${defaultDir}`);
  const [key, dir] = raw.split(".");
  const sort = { key, dir: dir === "asc" ? "asc" : "desc" };
  const sortBy = (k) => setRaw(sort.key === k ? `${k}.${sort.dir === "desc" ? "asc" : "desc"}` : `${k}.${k === "name" ? "asc" : "desc"}`);
  const setSort = (k, d) => setRaw(`${k}.${d === "asc" ? "asc" : "desc"}`);
  return [sort, sortBy, setSort];
}

export const SETTING_KEYS = ["period", "current", "gst"];
// Page-number params a new period sends back to page 1.
const PAGE_KEYS = ["c_page", "s_page", "p_page"];

// The page-wide settings, plus `settingsQuery` to pass them on in links.
// Also remembers this page's whole URL so the breadcrumbs come back to it.
export function useAnalysisSettings() {
  const params = useSearchParams();
  const pathname = usePathname();
  const query = params.toString();
  useEffect(() => rememberQuery(pathname, query), [pathname, query]);

  const [period, setPeriodRaw] = useUrlState("period", 0);
  const [includeCurrent, setIncludeCurrentRaw] = useUrlState("current", false);
  const [withGST, setWithGST] = useUrlState("gst", true);
  const resetPages = () => PAGE_KEYS.forEach((k) => setUrlParam(k, 1, 1));
  const carry = new URLSearchParams();
  SETTING_KEYS.forEach((k) => params.get(k) != null && carry.set(k, params.get(k)));
  return {
    period, includeCurrent, withGST, setWithGST,
    setPeriod: (v) => { resetPages(); setPeriodRaw(v); },
    setIncludeCurrent: (v) => { resetPages(); setIncludeCurrentRaw(v); },
    settingsQuery: carry.toString(),
  };
}

// withSettings: a link to another Analysis page carrying the page-wide
// settings and any of its own params ({ c_sort: "total.desc" }).
export function withSettings(path, settingsQuery, extra = {}) {
  const p = new URLSearchParams(settingsQuery);
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

// Query params the report fetches send for the page-wide settings.
export function apiSettings(s, base = {}) {
  const p = new URLSearchParams(base);
  p.set("period", String(s.period));
  if (s.includeCurrent) p.set("current", "1");
  if (!s.withGST) p.set("gst", "0");
  return p;
}

// ---- page frame -------------------------------------------------------------

export function GSTToggle({ withGST, setWithGST }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs shrink-0">
      {[[true, "With GST"], [false, "Without GST"]].map(([v, label]) => (
        <button
          key={label}
          onClick={() => setWithGST(v)}
          className={`px-3 py-1.5 ${withGST === v ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Title, a line of explanation, the GST switch and (unless the page only
// shows whole-year monthly figures) the period bar.
export function AnalysisHeader({ title, note, s, period = true }) {
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          {note && <p className="text-xs text-gray-400 mt-0.5 max-w-3xl">{note}</p>}
        </div>
        <GSTToggle withGST={s.withGST} setWithGST={s.setWithGST} />
      </div>
      {period && (
        <PeriodBar period={s.period} setPeriod={s.setPeriod} includeCurrent={s.includeCurrent} setIncludeCurrent={s.setIncludeCurrent} />
      )}
    </>
  );
}

export function gstNote(withGST) {
  return withGST
    ? "Amounts are Marg bill totals incl. GST and freight; product figures are goods incl. their GST."
    : "Amounts are without GST (bill totals less the GST on their lines; freight stays in); product figures are goods before GST.";
}

// ---- board cards ------------------------------------------------------------

// One analysis on a board: a title, a short preview, and a link to its full
// page. The whole card is the link, so the preview mustn't hold other links.
export function BoardCard({ title, sub, href, children, wide = false }) {
  return (
    <Link
      href={href}
      className={`group bg-white rounded-xl border border-gray-200 p-4 flex flex-col hover:border-gray-400 hover:shadow-sm transition ${wide ? "lg:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <span className="text-xs text-gray-400 group-hover:text-gray-900 whitespace-nowrap">Open →</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </Link>
  );
}

// Fetch helper for previews and reports: null while loading, [] / {} on
// failure, so a refused or failed report shows as empty rather than hanging.
export function useFetch(url, fallback) {
  const [state, setState] = useState({ url: null, data: null });
  useEffect(() => {
    let live = true;
    apiFetch(url)
      .then((d) => live && setState({ url, data: d }))
      .catch(() => live && setState({ url, data: fallback }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state.url === url ? state.data : null;
}

export function CardLoading() {
  return <div className="h-24 flex items-center justify-center text-xs text-gray-300">Loading…</div>;
}

export function CardEmpty({ text = "Nothing yet" }) {
  return <div className="h-24 flex items-center justify-center text-xs text-gray-400">{text}</div>;
}

// Headline figures in a row (inside cards and blocks).
export function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500 truncate">{label}</div>
      <div className="text-lg font-semibold text-gray-900 leading-tight truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
    </div>
  );
}

// ---- small charts -----------------------------------------------------------

const BLUE = "#2a78d6"; // categorical slot 1: one series = one hue

// Ranked values as horizontal bars (magnitude by length, one hue), names
// and values in text ink. Hover shows the exact value.
export function BarList({ rows, max, fmt = shortMoney }) {
  if (!rows.length) return <CardEmpty />;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${fmtMoney(r.value)}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center text-xs">
          <span className="truncate text-gray-700">{r.label}</span>
          <span className="text-gray-900 font-medium tabular-nums">{fmt(r.value)}</span>
          <span className="col-span-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (100 * r.value) / top)}%`, background: BLUE }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// A small line of monthly values with the last value labelled; hover a
// month for its figure.
export function Sparkline({ months, field, fmt = shortMoney, height = 48 }) {
  const [hover, setHover] = useState(null);
  if (!months?.length) return null;
  const W = 240, H = height, P = 4;
  const vals = months.map((m) => Number(m[field]) || 0);
  const max = Math.max(1, ...vals);
  const x = (i) => (months.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (months.length - 1));
  const y = (v) => H - P - (H - 2 * P) * (v / max);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const h = hover ?? vals.length - 1;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke={BLUE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {months.map((m, i) => (
          <rect key={m.month} x={x(i) - W / months.length / 2} y={0} width={W / months.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="text-[11px] text-gray-500 mt-1 tabular-nums">
        {fmtMonth(months[h].month)}: <span className="text-gray-900 font-medium">{fmt(vals[h])}</span>
      </div>
    </div>
  );
}

// Change of the last complete month against the one before, as an arrow,
// a word and a percentage (never colour alone).
export function MonthDelta({ months, field }) {
  const current = new Date().toISOString().slice(0, 7);
  const done = (months || []).filter((m) => m.month < current);
  if (done.length < 2) return null;
  const a = Number(done[done.length - 1][field]) || 0;
  const b = Number(done[done.length - 2][field]) || 0;
  if (!b) return null;
  const pct = ((a - b) / b) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs whitespace-nowrap ${up ? "text-green-700" : "text-red-600"}`} title={`${fmtMonth(done[done.length - 1].month)} vs ${fmtMonth(done[done.length - 2].month)}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% {up ? "up" : "down"} in {fmtMonth(done[done.length - 1].month).split(" ")[0]}
    </span>
  );
}

// Part-to-whole as one stacked bar (categorical slots 1-3, 2px gaps) with
// a legend that names each part, so identity is never colour alone.
export const SPLIT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
export function SplitBar({ parts, fmt = shortMoney }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (!total) return <CardEmpty />;
  return (
    <div>
      <div className="flex h-3 gap-0.5 rounded-full overflow-hidden">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span
            key={p.key}
            title={`${p.label}: ${fmtMoney(p.value)} (${Math.round((100 * p.value) / total)}%)`}
            style={{ width: `${(100 * p.value) / total}%`, background: p.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-gray-700 flex-1 truncate">{p.label}</span>
            <span className="text-gray-900 font-medium tabular-nums">{fmt(p.value)}</span>
            <span className="text-gray-400 tabular-nums w-9 text-right">{Math.round((100 * p.value) / total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- table bits -------------------------------------------------------------

export function SearchBox({ value, onSearch, placeholder }) {
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

export function Pager({ page, total, pageSize, onPage }) {
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

export function PartyCell({ code, name, city, partnerId }) {
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
export function Trend({ last3, prev3 }) {
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

export function Empty({ text }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">{text}</div>;
}

export function Tile({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
