"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";
import { fmtMoney, fmtDate } from "@/components/admin/MargBills";
import { VOUCHER_KINDS, VoucherRow, Pager } from "@/components/admin/MargDaybook";

// Marg's Day Book for FY 2025-26, loaded once from the Excel export
// (data-files/exports/daybook-2025-26). Separate from Marg Bills, which is
// this year's live sync — nothing here is merged with it.

export default function MargDaybookPage() {
  const [tab, setTab] = useState("vouchers");
  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Day Book 2025-26</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Every voucher from Marg&apos;s Day Book, 1 Apr 2025 – 31 Mar 2026, loaded from the Excel export. Kept separate
          from Marg Bills (this year&apos;s live data). Opening balances are zero.
        </p>
      </div>
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          ["vouchers", "Vouchers"],
          ["parties", "Parties"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "vouchers" ? <Vouchers /> : <Parties />}
    </>
  );
}

function Vouchers() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (kind) params.set("kind", kind);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-daybook?${params}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load the day book"))
      .finally(() => setLoading(false));
  }, [kind, from, to, search, page]);

  const reset = (setter) => (value) => {
    setPage(1);
    setExpanded(null);
    setter(value);
  };
  const filtered = kind || from || to || search;
  // Bills are counted at what they charged their party, as on Analysis and
  // the bills pages; their voucher totals also carry the round-off.
  const billKinds = ["sale", "purchase", "credit_note", "debit_note"].includes(kind);
  const allCount = (list?.kinds || []).reduce((n, k) => n + k.count, 0);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <Chip active={kind === ""} onClick={() => reset(setKind)("")} label="All" count={list ? allCount : null} />
          {(list?.kinds || []).map((k) => (
            <Chip
              key={k.code}
              active={kind === k.code}
              onClick={() => reset(setKind)(k.code)}
              label={VOUCHER_KINDS[k.code]?.label || k.code}
              count={k.count}
            />
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            From
            <input type="date" value={from} min="2025-04-01" max="2026-03-31" onChange={(e) => reset(setFrom)(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900" />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            To
            <input type="date" value={to} min="2025-04-01" max="2026-03-31" onChange={(e) => reset(setTo)(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900" />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset(setSearch)(searchInput.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Bill no, party, UTR or narration..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-72"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
          {filtered && (
            <button
              onClick={() => {
                setPage(1);
                setExpanded(null);
                setKind("");
                setFrom("");
                setTo("");
                setSearch("");
                setSearchInput("");
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {list && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> voucher{list.total !== 1 ? "s" : ""}
          {" · "}
          <span className="font-semibold text-gray-900">{fmtMoney(billKinds ? list.party_sum : list.sum_total)}</span> total
          {billKinds && Math.abs(list.sum_total - list.party_sum) >= 0.01 && (
            <span className="text-gray-400"> · {fmtMoney(list.sum_total)} with round-off</span>
          )}
        </p>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : loading && !list ? (
        <Loader />
      ) : !list || list.vouchers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No vouchers match these filters</p>
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Ref / bill no</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.vouchers.map((v) => (
                  <VoucherRow key={v.id} v={v} partyAmount open={expanded === v.id} onToggle={() => setExpanded((x) => (x === v.id ? null : v.id))} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={list.total} pageSize={list.page_size} onPage={(p) => { setExpanded(null); setPage(p); }} />
        </>
      )}
    </>
  );
}

function Parties() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("customer");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (kind) params.set("kind", kind);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-daybook/parties?${params}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load parties"))
      .finally(() => setLoading(false));
  }, [kind, search, page]);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-2 flex-wrap items-center">
        <select
          value={kind}
          onChange={(e) => {
            setPage(1);
            setKind(e.target.value);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        >
          <option value="">All accounts</option>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Party name or code..."
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-64"
          />
          <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            Search
          </button>
        </form>
      </div>

      {list && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> part{list.total !== 1 ? "ies" : "y"}
          <span className="text-gray-400"> · balance = debit − credit; positive means the party owes Moulins</span>
        </p>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : loading && !list ? (
        <Loader />
      ) : !list || list.parties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No parties match</p>
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Credit notes</th>
                  <th className="px-4 py-3 text-right">Purchases</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Closing balance</th>
                  <th className="px-4 py-3">Last entry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.parties.map((p) => (
                  <tr key={p.party_code} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/panel/marg-daybook/${encodeURIComponent(p.party_code)}`} className="text-gray-900 hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-gray-400">
                        {p.party_code}
                        {p.kind && ` · ${KIND_LABELS[p.kind] || p.kind}`}
                        {" · "}
                        <Link href={`/panel/party-bills/${encodeURIComponent(p.party_code)}`} className="text-gray-600 hover:text-gray-900 underline">
                          bills by year
                        </Link>
                      </span>
                    </td>
                    <Money v={p.sales} />
                    <Money v={p.received} />
                    <Money v={p.notes} />
                    <Money v={p.purchases} />
                    <Money v={p.paid} />
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${p.closing < 0 ? "text-green-700" : "text-gray-900"}`}>
                      {fmtMoney(p.closing)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.last_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={list.total} pageSize={list.page_size} onPage={setPage} />
        </>
      )}
    </>
  );
}

function Money({ v }) {
  return <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{v ? fmtMoney(v) : <span className="text-gray-300">—</span>}</td>;
}

function Chip({ active, onClick, label, count }) {
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
