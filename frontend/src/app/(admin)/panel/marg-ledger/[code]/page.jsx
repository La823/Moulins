"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";
import { BillRow, SortHeader, fmtMoney, fmtDate, fmtQty, TYPE_STYLES } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";

// One Marg party (any ledger account): its details, totals per bill type,
// the products on its bills, and every bill made out to it.

const STATUS_OPTIONS = [
  { value: "", label: "All bills" },
  { value: "active", label: "Active only" },
  { value: "cancelled", label: "Cancelled only" },
];

export default function MargPartyPage() {
  const { code: rawCode } = useParams();
  const code = safeDecode(rawCode);

  const [party, setParty] = useState(null);
  const [partyError, setPartyError] = useState("");

  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    apiFetch(`/admin/marg-ledger/${encodeURIComponent(code)}`)
      .then(setParty)
      .catch((e) => setPartyError(e.message?.includes("not found") ? "No Marg account or bills found for this party code." : e.message));
  }, [code]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ party: code, page: String(page), sort: sort.key, dir: sort.dir });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    apiFetch(`/admin/marg-bills?${params.toString()}`)
      .then(setList)
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  }, [code, type, status, page, sort]);

  const sortBy = (key) => {
    setPage(1);
    setExpanded(null);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  };

  if (partyError) {
    return (
      <>
        <BackLink />
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{partyError}</div>
      </>
    );
  }
  if (!party) return <Loader />;

  const a = party.account;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.page_size)) : 1;

  return (
    <>
      <BackLink />

      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{a ? a.short_name || a.name : code}</h2>
          <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{code}</span>
            {a?.city && <span>· {a.city}</span>}
            {a && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {KIND_LABELS[a.kind] || a.kind}
                {a.group_name && a.group_name !== KIND_LABELS[a.kind] ? ` · ${a.group_name}` : ""}
              </span>
            )}
            {a &&
              (a.in_marg_parties ? (
                <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">In Marg Parties</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Not in Marg Parties</span>
              ))}
            {!a && <span className="text-amber-700">Not in the Marg ledger — seen on bills only</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-5">
        {a && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <Fact label="Name">{a.name}</Fact>
              <Fact label="Address">{[a.address, a.pin].filter(Boolean).join(" · ")}</Fact>
              <Fact label="GSTIN">{a.gstin}</Fact>
              <Fact label="Drug licence">{a.marg_party_dl_no || a.dl_no}</Fact>
              <Fact label="Phone">{a.phones?.join(", ")}</Fact>
              <Fact label="Group">{a.group_name ? `${a.group_name} (${a.group_code})` : a.group_code}</Fact>
            </dl>
          </div>
        )}

        <div className={`bg-white rounded-xl border border-gray-200 p-4 text-sm ${a ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            This financial year <span className="normal-case font-normal text-gray-400">· bill totals incl. GST</span>
            {party.cancelled > 0 && <span className="normal-case font-normal text-gray-400"> · {party.cancelled} cancelled bill{party.cancelled !== 1 ? "s" : ""} not counted</span>}
          </h3>
          {party.totals.length === 0 ? (
            <p className="text-gray-400">No bills this year.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {party.totals.map((t) => (
                <button
                  key={t.code}
                  onClick={() => { setPage(1); setExpanded(null); setType(type === t.code ? "" : t.code); }}
                  className={`text-left rounded-lg border p-3 transition-colors ${type === t.code ? "border-gray-900" : "border-gray-200 hover:border-gray-400"}`}
                >
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${TYPE_STYLES[t.code] || "bg-gray-100 text-gray-600"}`}>{t.name || t.code}</span>
                  <div className="mt-2 text-lg font-semibold text-gray-900">{fmtMoney(t.total)}</div>
                  <div className="text-xs text-gray-500">
                    {t.bills.toLocaleString("en-IN")} bill{t.bills !== 1 ? "s" : ""} · {fmtDate(t.first_date)} – {fmtDate(t.last_date)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {party.monthly?.some((m) => m.sales || m.returns || m.purchases) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <MonthlyChart monthly={party.monthly} />
        </div>
      )}

      {party.top_products.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 mb-5 overflow-x-auto">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Top products on these bills</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Amount (before GST)</th>
                <th className="px-4 py-2 text-right">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {party.top_products.map((p) => (
                <tr key={p.product_pid}>
                  <td className="px-4 py-2">
                    <div className="text-gray-900">{p.name || `Product ${p.product_pid}`}</div>
                    <div className="text-xs text-gray-400">{p.product_pid}</div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {fmtQty(p.qty)}
                    {p.free > 0 && <span className="text-green-700"> +{fmtQty(p.free)}</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-900">{fmtMoney(p.amount)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{p.bills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          {list ? (
            <>
              <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> bill{list.total !== 1 ? "s" : ""}
              {type && party.totals.find((t) => t.code === type) && <> · {party.totals.find((t) => t.code === type).name}</>}
              {" · "}
              <span className="font-semibold text-gray-900">{fmtMoney(list.sum_total)}</span>
              {list.cancelled > 0 && <span className="text-gray-400"> excluding cancelled</span>}
            </>
          ) : (
            "Bills"
          )}
        </p>
        <div className="flex gap-2 items-center">
          {type && (
            <button onClick={() => { setPage(1); setType(""); }} className="text-xs text-gray-500 hover:text-gray-800 underline">
              All bill types
            </button>
          )}
          <select
            value={status}
            onChange={(e) => { setPage(1); setExpanded(null); setStatus(e.target.value); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && !list ? (
        <Loader />
      ) : !list || list.bills.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No bills</p>
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
                  <th className="px-4 py-3">Party</th>
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
                    linkParty={false}
                    open={expanded === b.voucher}
                    onToggle={() => setExpanded((v) => (v === b.voucher ? null : b.voucher))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setExpanded(null); setPage((x) => Math.max(1, x - 1)); }}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => { setExpanded(null); setPage((x) => Math.min(totalPages, x + 1)); }}
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

function BackLink() {
  return (
    <Link href="/panel/marg-ledger" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
      </svg>
      Marg Accounts
    </Link>
  );
}

function Fact({ label, children }) {
  return (
    <>
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-800 break-words">{children || "—"}</dd>
    </>
  );
}

// Next may hand the segment over still encoded; codes can contain "%"
// (e.g. STcA%-), which decodeURIComponent would throw on if already decoded.
function safeDecode(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
