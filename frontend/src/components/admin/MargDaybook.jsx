"use client";

import Link from "next/link";
import { KIND_LABELS } from "@/lib/margLedger";
import { fmtMoney, fmtDate } from "@/components/admin/MargBills";

// Shared by the Day Book pages (panel/marg-daybook) and the party bills page.

// marg_daybook_vouchers.kind (data-files/exports/daybook-<fy>/load_daybook.py)
export const VOUCHER_KINDS = {
  sale: { label: "Sale bill", cls: "bg-blue-50 text-blue-700" },
  purchase: { label: "Purchase bill", cls: "bg-violet-50 text-violet-700" },
  receipt: { label: "Receipt", cls: "bg-green-50 text-green-700" },
  payment: { label: "Payment", cls: "bg-amber-50 text-amber-700" },
  credit_note: { label: "Credit note", cls: "bg-rose-50 text-rose-700" },
  debit_note: { label: "Debit note", cls: "bg-orange-50 text-orange-700" },
  journal: { label: "Journal", cls: "bg-gray-100 text-gray-700" },
  contra: { label: "Contra", cls: "bg-gray-100 text-gray-700" },
  tds: { label: "TDS", cls: "bg-gray-100 text-gray-700" },
};

export function Pager({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-gray-400">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

const daybookLedgerHref = (code) => `/panel/marg-daybook/${encodeURIComponent(code)}`;

// One voucher with its debit/credit lines underneath when open. partyAmount
// shows what the voucher charged its party instead of the voucher total.
export function VoucherRow({ v, open, onToggle, linkParty = true, partyAmount = false, partyHref = daybookLedgerHref }) {
  const k = VOUCHER_KINDS[v.kind] || { label: v.kind, cls: "bg-gray-100 text-gray-600" };
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-3 text-gray-400">{open ? "▾" : "▸"}</td>
        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(v.date)}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${k.cls}`}>{k.label}</span>
        </td>
        <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
          {v.ref_no || (v.against_bills.length > 0 ? <span className="text-gray-500">Ag. {v.against_bills.join(", ")}</span> : <span className="text-gray-300">—</span>)}
        </td>
        <td className="px-4 py-3 text-gray-800">
          {v.party_code && linkParty ? (
            <Link href={partyHref(v.party_code)} onClick={(e) => e.stopPropagation()} className="hover:underline">
              {v.party_name}
            </Link>
          ) : (
            <span className="text-gray-500">{v.party_name}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtMoney(partyAmount && v.party_amount ? v.party_amount : v.total)}</td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td></td>
          <td colSpan={5} className="px-4 py-3">
            {v.narration && <p className="text-xs text-gray-500 mb-2 break-all">{v.narration}</p>}
            <p className="text-xs text-gray-400 mb-2">
              {v.entry_no && <>Entry {v.entry_no} · </>}
              {v.ref_date && <>Supplier bill dated {fmtDate(v.ref_date)} · </>}
              Excel row {v.source_row}
            </p>
            <table className="w-full text-xs">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="py-1 pr-4 font-medium">Account</th>
                  <th className="py-1 pr-4 font-medium">Type</th>
                  <th className="py-1 pr-4 font-medium text-right">Debit</th>
                  <th className="py-1 font-medium text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l) => (
                  <tr key={l.line_no} className="border-t border-gray-200">
                    <td className="py-1.5 pr-4 text-gray-800">
                      {l.account}
                      {l.party_code && <span className="text-gray-400"> · {l.party_code}</span>}
                      {!l.party_code && (
                        <span className="ml-1.5 text-amber-600" title={l.match === "ambiguous" ? "Two Marg accounts have this name" : "No Marg account with this name"}>
                          not linked
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-500">{(l.account_kind && KIND_LABELS[l.account_kind]) || "—"}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-900">{l.debit ? fmtMoney(l.debit) : ""}</td>
                    <td className="py-1.5 text-right text-gray-900">{l.credit ? fmtMoney(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
