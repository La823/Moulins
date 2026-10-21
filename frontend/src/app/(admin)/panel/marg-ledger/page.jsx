"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";

// The whole Marg ledger (chart of accounts) from the Corporate EDE API —
// customers, suppliers, expense vendors, banks, tax accounts — synced with
// the bills every 15 minutes. "Marg Parties" marks which accounts also exist
// (matched on party code) in the Marg Parties list from the other Marg API.

const fmtMoney = (v) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function fmtDate(v) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MargLedgerPage() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [matched, setMatched] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (kind) params.set("kind", kind);
    if (matched) params.set("matched", matched);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-ledger?${params.toString()}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load the ledger"))
      .finally(() => setLoading(false));
  }, [kind, matched, search, page]);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.page_size)) : 1;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Marg Accounts</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Every party and ledger account in Marg: customers, suppliers, manufacturers, expense vendors, banks and tax accounts.
          Open one to see all its bills. Synced every 15 minutes.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <Chip active={kind === ""} onClick={() => { setPage(1); setKind(""); }} label="All accounts" />
          {(list?.kinds || []).map((k) => (
            <Chip
              key={k.code}
              active={kind === k.code}
              onClick={() => { setPage(1); setKind(k.code); }}
              label={KIND_LABELS[k.code] || k.code}
              count={k.count}
            />
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={matched}
            onChange={(e) => { setPage(1); setMatched(e.target.value); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">In Marg Parties or not</option>
            <option value="yes">In Marg Parties (matched)</option>
            <option value="no">Not in Marg Parties</option>
          </select>
          <form
            onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Code, name, city or GSTIN..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-64"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
        </div>
      </div>

      {list && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> account{list.total !== 1 ? "s" : ""}
          {" · "}
          <span className="font-semibold text-green-700">{list.matched.toLocaleString("en-IN")}</span> in Marg Parties
          {" · "}
          <span className="font-semibold text-gray-900">{(list.total - list.matched).toLocaleString("en-IN")}</span> not
        </p>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : loading && !list ? (
        <Loader />
      ) : !list || list.accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No ledger accounts match these filters</p>
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">GSTIN / DL</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Bills</th>
                  <th className="px-4 py-3">Marg Parties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.accounts.map((a) => (
                  <tr key={a.marg_id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{a.party_code || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">
                        {a.party_code ? (
                          <Link href={`/panel/marg-ledger/${encodeURIComponent(a.party_code)}`} className="hover:underline">
                            {a.short_name || a.name}
                          </Link>
                        ) : (
                          a.short_name || a.name
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {[a.city, a.pin].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{a.group_name || "—"}</div>
                      <div className="text-xs text-gray-400">{a.group_code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>{a.gstin || "—"}</div>
                      <div className="text-gray-400" title={a.marg_party_dl_no || ""}>{a.marg_party_dl_no || a.dl_no || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{a.phones?.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {a.bills > 0 ? (
                        <>
                          <div className="text-gray-900">{a.bills.toLocaleString("en-IN")}</div>
                          <div className="text-xs text-gray-400">{fmtMoney(a.bills_total)} · last {fmtDate(a.last_bill_date)}</div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.in_marg_parties ? (
                        <span
                          title={a.marg_party_name ? `Marg Parties: ${a.marg_party_name}${a.marg_party_status ? ` (${a.marg_party_status})` : ""}` : ""}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 whitespace-nowrap"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          Matched
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                          Not matched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
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
    </>
  );
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
