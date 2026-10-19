"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";

// Bills synced from Marg's Corporate EDE API every 15 minutes (backend
// internal/margede). Party names and groups come from the Marg ledger;
// product names from Marg Products, so ### charge lines show codes only.

const fmtMoney = (v) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));

// DATE columns arrive as "2026-10-17T00:00:00Z"; read the date part as-is so
// the viewer's timezone can't shift it a day.
function fmtDate(v) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtExpiry(v) {
  if (!v) return "—";
  const [y, m] = String(v).slice(0, 7).split("-");
  return `${m}/${y.slice(2)}`;
}
function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

const TYPE_STYLES = {
  S: "bg-green-50 text-green-700",
  CH: "bg-teal-50 text-teal-700",
  P: "bg-blue-50 text-blue-700",
  R: "bg-amber-50 text-amber-700",
  B: "bg-purple-50 text-purple-700",
};

const STATUS_OPTIONS = [
  { value: "", label: "All bills" },
  { value: "active", label: "Active only" },
  { value: "cancelled", label: "Cancelled only" },
  { value: "incomplete", label: "Lines don't match total" },
];

export default function MargBillsPage() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [expanded, setExpanded] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), sort: sort.key, dir: sort.dir });
    if (type) params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    if (kind) params.set("kind", kind);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-bills?${params.toString()}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load bills"))
      .finally(() => setLoading(false));
  }, [type, from, to, status, kind, search, page, sort, refreshKey]);

  // Click a header to sort by it; click again to flip the direction.
  const sortBy = (key) => {
    setPage(1);
    setExpanded(null);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "party" ? "asc" : "desc" }));
  };

  const resetPage = (setter) => (value) => {
    setPage(1);
    setExpanded(null);
    setter(value);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    resetPage(setSearch)(searchInput.trim());
  };

  const clearFilters = () => {
    setPage(1);
    setExpanded(null);
    setType("");
    setFrom("");
    setTo("");
    setStatus("");
    setKind("");
    setSearch("");
    setSearchInput("");
  };

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.page_size)) : 1;
  const filtered = type || from || to || status || kind || search;

  return (
    <>
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Marg Bills</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Every bill and bill line from Marg for this financial year: sales, purchases, credit and debit notes.
          </p>
        </div>
        <SyncBar onSynced={() => setRefreshKey((k) => k + 1)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <TypeChip active={type === ""} onClick={() => resetPage(setType)("")} label="All types" />
          {(list?.types || []).map((t) => (
            <TypeChip
              key={t.code}
              active={type === t.code}
              onClick={() => resetPage(setType)(t.code)}
              label={t.name || t.code}
              count={t.count}
            />
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => resetPage(setFrom)(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => resetPage(setTo)(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </label>
          <select
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => resetPage(setKind)(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">All parties</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Bill no, party code or name..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-64"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
          {filtered && (
            <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-800 underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {list && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> bill{list.total !== 1 ? "s" : ""}
          {list.cancelled > 0 && status !== "cancelled" && (
            <span className="text-gray-400"> ({list.cancelled.toLocaleString("en-IN")} cancelled)</span>
          )}
          {" · "}
          <span className="font-semibold text-gray-900">{fmtMoney(list.sum_total)}</span> total
          {list.cancelled > 0 && <span className="text-gray-400"> excluding cancelled</span>}
        </p>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : loading && !list ? (
        <Loader />
      ) : !list || list.bills.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No bills match these filters</p>
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <SortHeader label="Date" k="date" sort={sort} onSort={sortBy} />
                  <SortHeader label="Bill no" k="bill_no" sort={sort} onSort={sortBy} />
                  <th className="px-4 py-3">Type</th>
                  <SortHeader label="Party" k="party" sort={sort} onSort={sortBy} />
                  <th className="px-4 py-3 text-right">Lines</th>
                  <SortHeader label="Total" k="total" sort={sort} onSort={sortBy} align="right" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.bills.map((b) => (
                  <BillRow
                    key={b.voucher}
                    b={b}
                    open={expanded === b.voucher}
                    onToggle={() => setExpanded((v) => (v === b.voucher ? null : b.voucher))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setExpanded(null); setPage((p) => Math.max(1, p - 1)); }}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => { setExpanded(null); setPage((p) => Math.min(totalPages, p + 1)); }}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SortHeader({ label, k, sort, onSort, align }) {
  const active = sort.key === k;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800 ${active ? "text-gray-800" : ""}`}
      >
        {label}
        <span className="text-[10px]">{active ? (sort.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

function TypeChip({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
      }`}
    >
      {label}
      {count != null && <span className={active ? "text-gray-300" : "text-gray-400"}> {count.toLocaleString("en-IN")}</span>}
    </button>
  );
}

function BillRow({ b, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-gray-50 transition-colors ${b.is_cancelled ? "opacity-50" : ""}`}>
        <td className="px-4 py-3 text-gray-400">
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        </td>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(b.bill_date)}</td>
        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{b.bill_no}</td>
        <td className="px-4 py-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_STYLES[b.bill_type] || "bg-gray-100 text-gray-600"}`}>
            {b.bill_type_name || b.bill_type}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="text-gray-900">{b.party_name || <span className="text-gray-400">Unknown party</span>}</div>
          <div className="text-xs text-gray-400">
            {b.party_code || "—"}
            {b.party_group && ` · ${b.party_group}`}
          </div>
        </td>
        <td className="px-4 py-3 text-right text-gray-500">{b.lines_count}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtMoney(b.total)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1 flex-wrap">
            {b.is_cancelled && <Badge className="bg-red-50 text-red-600">Cancelled</Badge>}
            {!b.lines_complete && !b.is_cancelled && (
              <Badge className="bg-amber-50 text-amber-700" title={`Lines add up to ${fmtMoney(b.lines_total)}`}>
                Lines ≠ total
              </Badge>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-4 pb-4 pt-0 bg-gray-50">
            <BillDetail voucher={b.voucher} />
          </td>
        </tr>
      )}
    </>
  );
}

function Badge({ className, title, children }) {
  return (
    <span title={title} className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function BillDetail({ voucher }) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/marg-bills/${voucher}`)
      .then(setBill)
      .catch((e) => setError(e.message || "Could not load bill"));
  }, [voucher]);

  if (error) return <p className="text-sm text-red-600 py-3">{error}</p>;
  if (!bill) return <p className="text-sm text-gray-400 py-3">Loading lines...</p>;

  const facts = [
    bill.is_cancelled && ["Cancelled", fmtTime(bill.cancelled_at)],
    bill.ref_bill_no && ["Against bill", `${bill.ref_bill_no}${bill.ref_bill_date ? ` (${fmtDate(bill.ref_bill_date)})` : ""}${bill.ref_amount ? ` · ${fmtMoney(bill.ref_amount)}` : ""}`],
    bill.reason && ["Reason", bill.reason],
    bill.adjusted_against && ["Adjusted against", `${bill.adjusted_against}${bill.adjusted_amount ? ` · ${fmtMoney(bill.adjusted_amount)}` : ""}`],
    bill.order_refs && ["App orders", bill.order_refs],
    bill.salesman && ["Salesman", bill.salesman],
    bill.area && ["Area", bill.area],
    bill.from_challans?.length > 0 && ["From challan", bill.from_challans.join(", ")],
    bill.bill_type === "CH" && ["Status", bill.is_cancelled ? "Cancelled challan" : "Not billed yet"],
    ["First seen", fmtTime(bill.first_seen_at)],
  ].filter(Boolean);

  const goods = bill.items.filter((i) => i.line_kind !== "charge");
  const qtyTotal = goods.reduce((s, i) => s + i.qty, 0);
  const gstTotal = bill.items.reduce((s, i) => s + i.gst_amount, 0);

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex gap-x-6 gap-y-1 flex-wrap text-xs text-gray-500">
        {facts.map(([k, v]) => (
          <span key={k}>
            {k}: <span className="text-gray-800">{v}</span>
          </span>
        ))}
      </div>

      {!bill.lines_complete && !bill.is_cancelled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The lines Marg sent add up to {fmtMoney(bill.lines_total)}, but the bill total is {fmtMoney(bill.total)}.
          Some lines of this bill are missing from Marg&apos;s data.
        </p>
      )}

      <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-left text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">MRP</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Disc</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">GST</th>
              <th className="px-3 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bill.items.map((i) => (
              <tr key={i.marg_line_id}>
                <td className="px-3 py-2">
                  <div className="text-gray-900">
                    {i.product_name || <span className="text-gray-500">Product {i.product_pid}</span>}
                    {i.line_kind === "charge" && <Badge className="ml-2 bg-gray-100 text-gray-600">Charge</Badge>}
                  </div>
                  <div className="text-gray-400">{i.product_pid}{i.line_bill_no && i.line_bill_no !== bill.bill_no ? ` · supplier bill ${i.line_bill_no}` : ""}</div>
                </td>
                <td className="px-3 py-2 text-gray-600">{i.batch || "—"}</td>
                <td className="px-3 py-2 text-gray-600">{fmtExpiry(i.expiry)}</td>
                <td className="px-3 py-2 text-right text-gray-800">
                  {fmtQty(i.qty)}
                  {i.free > 0 && <span className="text-green-700"> +{fmtQty(i.free)}</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">{i.mrp ? fmtMoney(i.mrp) : "—"}</td>
                <td className="px-3 py-2 text-right text-gray-800">{fmtMoney(i.rate)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{i.discount ? fmtMoney(i.discount) : "—"}</td>
                <td className="px-3 py-2 text-right text-gray-800">{fmtMoney(i.amount)}</td>
                <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                  {fmtMoney(i.gst_amount)} <span className="text-gray-400">({i.gst_percent ?? 0}%)</span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtMoney(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 text-gray-700">
            <tr>
              <td className="px-3 py-2 font-medium" colSpan={3}>{bill.items.length} line{bill.items.length !== 1 ? "s" : ""}</td>
              <td className="px-3 py-2 text-right font-medium">{fmtQty(qtyTotal)}</td>
              <td colSpan={4}></td>
              <td className="px-3 py-2 text-right">{fmtMoney(gstTotal)}</td>
              <td className="px-3 py-2 text-right font-semibold">{fmtMoney(bill.lines_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Sync status + "Sync now". The backend syncs on its own every 15 minutes;
// this shows when it last did and lets an admin run one immediately.
function SyncBar({ onSynced }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [showRuns, setShowRuns] = useState(false);
  const lastSuccessId = useRef(null);
  const syncedRef = useRef(onSynced);
  useEffect(() => {
    syncedRef.current = onSynced;
  }, [onSynced]);

  const load = useCallback(async () => {
    try {
      const o = await apiFetch("/admin/marg-bills-sync/status");
      setOverview(o);
      // A run finished since the last poll (ours or the schedule's) —
      // refresh the list so new bills appear.
      const id = o.last_success?.id ?? null;
      if (lastSuccessId.current !== null && id !== lastSuccessId.current) syncedRef.current?.();
      lastSuccessId.current = id;
      return o;
    } catch {
      return null;
    }
  }, []);

  // Poll fast while a run is in flight, slowly otherwise (so the page picks
  // up the scheduled sync without a reload).
  const running = !!overview?.active_run;
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setInterval(load, running ? 2000 : 60000);
    return () => clearInterval(t);
  }, [load, running]);

  const syncNow = async () => {
    setStarting(true);
    setMessage(null);
    try {
      await apiFetch("/admin/marg-bills-sync/trigger", { method: "POST", body: "{}" });
    } catch (err) {
      let alreadyRunning = false;
      try {
        alreadyRunning = !!JSON.parse(err.message)?.already_running;
      } catch {
        /* not a JSON conflict body */
      }
      if (!alreadyRunning) setMessage({ type: "error", text: err.message || "Could not start sync" });
    } finally {
      await load();
      setStarting(false);
    }
  };

  const last = overview?.last_success;
  const lastRun = overview?.recent_runs?.[0];
  const lastFailed = lastRun && lastRun.status === "failed";

  return (
    <div className="flex flex-col items-end gap-1.5 text-right">
      <div className="flex items-center gap-3">
        <div className="text-xs text-gray-500">
          {running ? (
            <span className="text-gray-800 font-medium">Syncing from Marg...</span>
          ) : last ? (
            <>
              Last synced <span className="text-gray-800 font-medium">{fmtTime(last.finished_at)}</span>
              {(last.bills_new > 0 || last.bills_changed > 0 || last.items_deleted > 0) && (
                <span className="text-gray-400">
                  {" "}({[
                    last.bills_new > 0 && `${last.bills_new} new`,
                    last.bills_changed > 0 && `${last.bills_changed} changed`,
                    last.bills_deleted > 0 && `${last.bills_deleted} removed`,
                  ].filter(Boolean).join(", ") || "lines updated"})
                </span>
              )}
            </>
          ) : (
            "Never synced"
          )}
          <div className="text-gray-400">
            {overview?.schedule_enabled
              ? `Auto-sync every ${overview.interval_minutes} min · next ${new Date(overview.next_run_at).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" })}`
              : "Auto-sync is off on this server"}
            {overview && ` · ${overview.bills.toLocaleString("en-IN")} bills, ${overview.items.toLocaleString("en-IN")} lines`}
          </div>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={syncNow}
            disabled={running || starting}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${running || starting ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {running || starting ? "Syncing..." : "Sync now"}
          </button>
        )}
      </div>
      {lastFailed && !running && (
        <p className="text-xs text-red-600 max-w-md">Last sync failed: {lastRun.error}</p>
      )}
      {message && <p className={`text-xs ${message.type === "error" ? "text-red-600" : "text-gray-600"}`}>{message.text}</p>}
      {overview?.recent_runs?.length > 0 && (
        <button onClick={() => setShowRuns((s) => !s)} className="text-xs text-gray-400 hover:text-gray-700 underline">
          {showRuns ? "Hide sync history" : "Sync history"}
        </button>
      )}
      {showRuns && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden text-xs text-left">
          <table>
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-1.5">Started</th>
                <th className="px-3 py-1.5">By</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5 text-right">Bills new / changed / removed</th>
                <th className="px-3 py-1.5 text-right">Lines new / changed / removed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overview.recent_runs.map((r) => (
                <tr key={r.id} title={r.error || r.warning || ""}>
                  <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{r.trigger_source}</td>
                  <td className={`px-3 py-1.5 ${r.status === "failed" ? "text-red-600" : r.status === "running" ? "text-blue-600" : "text-green-700"}`}>
                    {r.status}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{r.bills_new} / {r.bills_changed} / {r.bills_deleted}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{r.items_new} / {r.items_changed} / {r.items_deleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
