"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import MargSyncButton from "@/components/admin/MargSyncButton";
import CreatePartnerFromMargPartyModal from "@/components/admin/CreatePartnerFromMargPartyModal";

const PAGE_SIZE = 50;

const fmtMoney = (v) => (v == null ? "—" : `₹${Number(v).toFixed(2)}`);
// report figures: Indian grouping, e.g. ₹1,89,14,089.34
const fmtTotal = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_KEYS = ["active", "inactive", "duplicate"];
const EMPTY_TOTALS = { parties: 0, net: 0, receivable: 0, credit: 0, zero_balance: 0 };

// adds up the per-status ledger totals the server returns
const sumTotals = (list) =>
  list.reduce(
    (a, t) => ({
      parties: a.parties + (t?.parties || 0),
      net: a.net + (t?.net || 0),
      receivable: a.receivable + (t?.receivable || 0),
      credit: a.credit + (t?.credit || 0),
      zero_balance: a.zero_balance + (t?.zero_balance || 0),
    }),
    { ...EMPTY_TOTALS }
  );

export default function MargPartiesPage() {
  const [parties, setParties] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [creatingFor, setCreatingFor] = useState(null); // party object, or null
  const [savingStatusId, setSavingStatusId] = useState(null);
  // filter: "" = all, or one status; counts come back with each page
  const [statusFilter, setStatusFilter] = useState("");
  const [statusCounts, setStatusCounts] = useState({ active: 0, inactive: 0, duplicate: 0 });
  // filter: "" = all, "yes" = has a partner account, "no" = no account yet
  const [accountFilter, setAccountFilter] = useState("");
  const [accountCounts, setAccountCounts] = useState({ yes: 0, no: 0 });
  // order: "name" (A–Z), or by ledger balance "balance_desc" / "balance_asc"
  const [sort, setSort] = useState("name");
  const changeSort = (v) => {
    setSort(v);
    setPage(1);
  };
  // the Balance heading cycles: high→low, low→high, back to name
  const cycleBalanceSort = () =>
    changeSort(sort === "balance_desc" ? "balance_asc" : sort === "balance_asc" ? "name" : "balance_desc");
  // ledger report per status — worked out by the server on every load, never stored
  const [statusTotals, setStatusTotals] = useState({});
  // the ledger report is admin-only (the server only sends it to admins)
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [statusError, setStatusError] = useState("");

  // Our own status against a synced party — "active" or "duplicate". Written
  // straight through on change: it is one small write per row, not a form, so
  // there is nothing to batch.
  const handleStatusChange = async (party, status) => {
    const previous = party.status || "active";
    if (status === previous) return;
    setSavingStatusId(party.id);
    setStatusError("");
    // Shown immediately, reverted below if the write fails, so the dropdown
    // never sits on a value the database does not hold.
    setParties((prev) => prev.map((x) => (x.id === party.id ? { ...x, status } : x)));
    setStatusCounts((c) => ({ ...c, [previous]: Math.max(0, (c[previous] || 0) - 1), [status]: (c[status] || 0) + 1 }));
    try {
      await apiFetch(`/admin/marg-parties/${party.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      setParties((prev) => prev.map((x) => (x.id === party.id ? { ...x, status: previous } : x)));
      setStatusCounts((c) => ({ ...c, [status]: Math.max(0, (c[status] || 0) - 1), [previous]: (c[previous] || 0) + 1 }));
      setStatusError(err.message || "Could not update status");
    } finally {
      setSavingStatusId(null);
    }
  };
  const [createdMessage, setCreatedMessage] = useState("");

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (accountFilter) params.set("account", accountFilter);
    if (sort !== "name") params.set("sort", sort);
    apiFetch(`/admin/marg-parties?${params.toString()}`)
      .then((data) => {
        setParties(Array.isArray(data.parties) ? data.parties : []);
        setTotal(data.total || 0);
        if (data.status_counts) setStatusCounts(data.status_counts);
        if (data.account_counts) setAccountCounts(data.account_counts);
        if (data.status_totals) setStatusTotals(data.status_totals);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, statusFilter, accountFilter, sort, page, refreshKey]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Marg Parties</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Ledger accounts synced from Marg ERP — {total} record{total !== 1 ? "s" : ""}.
          </p>
          {statusError && (
            <p className="text-xs text-red-600 mt-1">{statusError}</p>
          )}
          {createdMessage && (
            <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {createdMessage}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <MargSyncButton onDone={() => setRefreshKey((k) => k + 1)} />
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
            aria-label="Sort parties"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
          >
            <option value="name">Sort: Name (A–Z)</option>
            <option value="balance_desc">Sort: Balance, high to low</option>
            <option value="balance_asc">Sort: Balance, low to high</option>
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, code, area, RID..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-64"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Filter by our status */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-400 w-16">Status</span>
        {[
          ["", "All", "border-gray-300 text-gray-700", "bg-gray-900 text-white border-gray-900"],
          ["active", "Active", "border-green-200 text-green-700 bg-green-50", "bg-green-600 text-white border-green-600"],
          ["inactive", "Inactive", "border-amber-200 text-amber-800 bg-amber-50", "bg-amber-500 text-white border-amber-500"],
          ["duplicate", "Duplicate", "border-red-200 text-red-700 bg-red-50", "bg-red-600 text-white border-red-600"],
        ].map(([key, label, idle, on]) => {
          const n = key ? statusCounts[key] || 0 : (statusCounts.active || 0) + (statusCounts.inactive || 0) + (statusCounts.duplicate || 0);
          return (
            <button
              key={key || "all"}
              onClick={() => {
                setStatusFilter(key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${statusFilter === key ? on : idle + " hover:opacity-80"}`}
            >
              {label} <span className="opacity-75">({n})</span>
            </button>
          );
        })}
      </div>

      {/* Filter by whether a partner account exists for the party */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-medium text-gray-400 w-16">Account</span>
        {[
          ["", "All", (accountCounts.yes || 0) + (accountCounts.no || 0)],
          ["yes", "Has account", accountCounts.yes || 0],
          ["no", "No account", accountCounts.no || 0],
        ].map(([key, label, n]) => (
          <button
            key={key || "all"}
            onClick={() => {
              setAccountFilter(key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
              accountFilter === key
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 text-gray-700 bg-white hover:border-gray-400"
            }`}
          >
            {label} <span className="opacity-75">({n})</span>
          </button>
        ))}
      </div>

      {/* Ledger report for what's filtered (status + search) — admins only */}
      {isAdmin && (() => {
        const t = statusFilter ? statusTotals[statusFilter] || EMPTY_TOTALS : sumTotals(STATUS_KEYS.map((k) => statusTotals[k]));
        const label = statusFilter ? statusFilter[0].toUpperCase() + statusFilter.slice(1) : "All";
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Ledger report — {label} parties
              {accountFilter === "yes" ? " with an account" : accountFilter === "no" ? " without an account" : ""}
              {search ? ` matching "${search}"` : ""}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ReportFigure label="Ledgers" value={t.parties.toLocaleString("en-IN")} />
              <ReportFigure label="Net balance" value={fmtTotal(t.net)} strong />
              <ReportFigure label="Receivable (positive)" value={fmtTotal(t.receivable)} tone="text-green-700" />
              <ReportFigure label="Credit (negative)" value={fmtTotal(t.credit)} tone="text-red-600" />
              <ReportFigure label="Zero balance" value={t.zero_balance.toLocaleString("en-IN")} />
            </div>
            {!statusFilter && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                {STATUS_KEYS.map((k) => (
                  <span key={k}>
                    <span className="font-medium capitalize">{k}</span>: {(statusTotals[k]?.parties || 0).toLocaleString("en-IN")} ledgers ·{" "}
                    {fmtTotal(statusTotals[k]?.net)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        <Loader />
      ) : parties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No Marg parties found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">RID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={cycleBalanceSort}
                      title="Sort by balance"
                      className={`inline-flex items-center gap-1 uppercase tracking-wide ${sort !== "name" ? "text-gray-900" : "hover:text-gray-700"}`}
                    >
                      Balance
                      <span aria-hidden="true">{sort === "balance_desc" ? "↓" : sort === "balance_asc" ? "↑" : "↕"}</span>
                    </button>
                  </th>
                  {/* Two different things: what Marg says about the record,
                      and the status we keep against it. */}
                  <th className="px-4 py-3">Marg Status</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Partner Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.map((p) => (
                  <PartyRow
                    key={p.id}
                    p={p}
                    open={expanded.has(p.id)}
                    onToggle={() => toggle(p.id)}
                    onCreateClick={() => setCreatingFor(p)}
                    onStatusChange={(status) => handleStatusChange(p, status)}
                    saving={savingStatusId === p.id}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Page {page} of {totalPages} — {total} record{total !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {creatingFor && (
        <CreatePartnerFromMargPartyModal
          party={creatingFor}
          onClose={() => setCreatingFor(null)}
          onCreated={() => {
            setCreatingFor(null);
            setCreatedMessage(`Partner account created for ${creatingFor.name || creatingFor.rid}.`);
            setTimeout(() => setCreatedMessage(""), 6000);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function ReportFigure({ label, value, strong = false, tone = "text-gray-900" }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`tabular-nums ${strong ? "text-lg font-semibold" : "text-base font-medium"} ${tone}`}>{value}</p>
    </div>
  );
}

// Our status colours: green Active, yellow Inactive, red Duplicate — a light
// tint on the row, a stronger one on the dropdown.
const STATUS_ROW = {
  active: "bg-green-50/40 hover:bg-green-50",
  inactive: "bg-amber-50/60 hover:bg-amber-50",
  duplicate: "bg-red-50/60 hover:bg-red-50",
};
const STATUS_SELECT = {
  active: "border-green-300 text-green-800 bg-green-100",
  inactive: "border-amber-300 text-amber-900 bg-amber-100",
  duplicate: "border-red-300 text-red-800 bg-red-100",
};

function PartyRow({ p, open, onToggle, onCreateClick, onStatusChange, saving }) {
  return (
    <>
      <tr className={`transition-colors ${STATUS_ROW[p.status || "active"]} ${p.is_deleted ? "opacity-40" : ""}`}>
        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.rid}</td>
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 font-medium text-gray-900 hover:text-red-600 transition-colors text-left"
          >
            <svg
              className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
            {p.name || "—"}
          </button>
        </td>
        <td className="px-4 py-3 text-gray-500">{p.code?.trim() || "—"}</td>
        <td className="px-4 py-3 text-gray-500">{p.area?.trim() || "—"}</td>
        <td className="px-4 py-3 text-gray-500">{p.phone1 || "—"}</td>
        <td className="px-4 py-3 text-gray-500">{p.gstin || "—"}</td>
        <td className="px-4 py-3 text-right text-gray-700">{fmtMoney(p.balance)}</td>
        <td className="px-4 py-3">
          {p.is_deleted ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">Inactive</span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
          )}
        </td>
        <td className="px-4 py-3">
          <select
            value={p.status || "active"}
            disabled={saving}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`text-xs font-medium px-2 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 ${
              STATUS_SELECT[p.status || "active"]
            }`}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="duplicate">Duplicate</option>
          </select>
        </td>
        <td className="px-4 py-3">
          {p.linked_partner_id ? (
            <Link
              href={`/panel/users/${p.linked_partner_id}`}
              className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Account Created →
            </Link>
          ) : (
            <button
              onClick={onCreateClick}
              className="text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Create Partner
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} className="px-4 pb-4 pt-0 bg-gray-50">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Address</p>
              <p className="text-sm text-gray-700">{p.address?.trim() || "No address on file"}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
