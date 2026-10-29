"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { BillRow, fmtMoney } from "@/components/admin/MargBills";
import { VoucherRow, Pager } from "@/components/admin/MargDaybook";

// Bills a section per financial year, for one party (party-bills/[code]) or
// everyone (all-bills). From 2026-27 on they come from Marg's live sync
// (marg_ede_bills, with line items); earlier years from the Day Book loaded
// from Excel (marg_daybook_*: bill totals and GST lines, no items). The two
// sources are shown side by side, never merged.

const FIRST_LIVE_FY = 2026; // the Corporate EDE sync starts on 1 Apr 2026

// "2026-27" for the year starting 1 Apr 2026
const fyLabel = (start) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

// Start years of the live financial years, newest first.
export function liveFYStarts() {
  const now = new Date();
  const current = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out = [];
  for (let y = current; y >= FIRST_LIVE_FY; y--) out.push(y);
  return out;
}

// The Day Book's financial years with bills (optionally for one party),
// newest first. null while loading.
export function useDaybookFYs(party) {
  const [fys, setFYs] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams({ kind: "bills" });
    if (party) params.set("party", party);
    apiFetch(`/admin/marg-daybook?${params}`)
      .then((d) => setFYs(d.total > 0 ? [...d.fys].reverse() : []))
      .catch(() => setFYs([]));
  }, [party]);
  return fys;
}

export const BILL_NUMBER_NOTE =
  "Marg starts bill numbers again every April (MPPL00001…), so the same number in two years is two different bills.";

const partyBillsHref = (code) => `/panel/party-bills/${encodeURIComponent(code)}`;

function YearHeader({ fy, source, count, total, note }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-3 pb-2 border-b-2 border-gray-900">
      <div>
        <h3 className="text-base font-semibold text-gray-900">FY {fy}</h3>
        <p className="text-xs text-gray-400">{source}</p>
      </div>
      {count != null && (
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{count.toLocaleString("en-IN")}</span> bill{count !== 1 ? "s" : ""}
          {" · "}
          <span className="font-semibold text-gray-900">{fmtMoney(total)}</span>
          {note && <span className="text-gray-400"> {note}</span>}
        </p>
      )}
    </div>
  );
}

// A live year: Marg's bills with their line items, as on the Marg Bills page.
export function LiveYear({ party, search, start }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page), sort: "date", dir: "desc",
      from: `${start}-04-01`, to: `${start + 1}-03-31`,
    });
    if (party) params.set("party", party);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-bills?${params}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load bills"));
  }, [party, search, start, page]);

  return (
    <section className="mb-10">
      <YearHeader
        fy={fyLabel(start)}
        source="From Marg (live sync) · with line items"
        count={list?.total}
        total={list?.sum_total}
        note={list?.cancelled > 0 ? "excluding cancelled" : null}
      />
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !list ? (
        <Loader />
      ) : list.bills.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No bills this year</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Bill no</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Lines</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.bills.map((b) => (
                  <BillRow key={b.voucher} b={b} linkParty={!party} open={expanded === b.voucher} onToggle={() => setExpanded((v) => (v === b.voucher ? null : b.voucher))} />
                ))}
              </tbody>
            </table>
          </div>
          {list.total > list.page_size && <Pager page={page} total={list.total} pageSize={list.page_size} onPage={(p) => { setExpanded(null); setPage(p); }} />}
        </>
      )}
    </section>
  );
}

// A Day Book year: bill totals and their GST lines, no items.
export function DaybookYear({ party, search, fy }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const start = Number(fy.slice(0, 4));

  useEffect(() => {
    const params = new URLSearchParams({
      kind: "bills", dir: "desc", page: String(page),
      from: `${start}-04-01`, to: `${start + 1}-03-31`,
    });
    if (party) params.set("party", party);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-daybook?${params}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load bills"));
  }, [party, search, start, page]);

  return (
    <section className="mb-10">
      <YearHeader
        fy={fy}
        source="From the Day Book (Excel) · bill totals and GST, no line items"
        count={list?.total}
        total={list?.party_sum}
      />
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !list ? (
        <Loader />
      ) : list.vouchers.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No bills this year</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Bill no</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.vouchers.map((v) => (
                  <VoucherRow
                    key={v.id}
                    v={v}
                    linkParty={!party}
                    partyHref={partyBillsHref}
                    partyAmount
                    open={expanded === v.id}
                    onToggle={() => setExpanded((x) => (x === v.id ? null : v.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {list.total > list.page_size && <Pager page={page} total={list.total} pageSize={list.page_size} onPage={(p) => { setExpanded(null); setPage(p); }} />}
        </>
      )}
    </section>
  );
}
