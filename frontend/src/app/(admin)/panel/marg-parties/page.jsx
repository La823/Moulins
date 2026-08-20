"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import MargSyncButton from "@/components/admin/MargSyncButton";
import CreatePartnerFromMargPartyModal from "@/components/admin/CreatePartnerFromMargPartyModal";

const PAGE_SIZE = 50;

const fmtMoney = (v) => (v == null ? "—" : `₹${Number(v).toFixed(2)}`);

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
    apiFetch(`/admin/marg-parties?${params.toString()}`)
      .then((data) => {
        setParties(Array.isArray(data.parties) ? data.parties : []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, page, refreshKey]);

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
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, code, area, RID..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-64"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
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
                  <th className="px-4 py-3 text-right">Balance</th>
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

function PartyRow({ p, open, onToggle, onCreateClick }) {
  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${p.is_deleted ? "opacity-40" : ""}`}>
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
          <td colSpan={9} className="px-4 pb-4 pt-0 bg-gray-50">
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
