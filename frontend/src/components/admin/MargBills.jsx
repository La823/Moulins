"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// Shared pieces of the Marg bills tables (Marg Bills page, party pages):
// formatting, sortable headers, and a bill row that expands into its lines.

export const fmtMoney = (v) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtQty = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));

// DATE columns arrive as "2026-10-17T00:00:00Z"; read the date part as-is so
// the viewer's timezone can't shift it a day.
export function fmtDate(v) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtExpiry(v) {
  if (!v) return "—";
  const [y, m] = String(v).slice(0, 7).split("-");
  return `${m}/${y.slice(2)}`;
}
export function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

export const TYPE_STYLES = {
  S: "bg-green-50 text-green-700",
  CH: "bg-teal-50 text-teal-700",
  P: "bg-blue-50 text-blue-700",
  R: "bg-amber-50 text-amber-700",
  B: "bg-purple-50 text-purple-700",
};

export function SortHeader({ label, k, sort, onSort, align }) {
  const active = sort.key === k;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800 ${active ? "text-gray-800" : ""}`}
      >
        {label}
        {/* A faint ↕ marks a header as sortable before it's picked. */}
        <span className={`text-[10px] ${active ? "" : "text-gray-300"}`}>{active ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

export function BillRow({ b, open, onToggle, linkParty = true }) {
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
          <div className="text-gray-900">
            {b.party_code && linkParty ? (
              <Link
                href={`/panel/marg-ledger/${encodeURIComponent(b.party_code)}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline"
              >
                {b.party_name || b.party_code}
              </Link>
            ) : (
              b.party_name || <span className="text-gray-400">Unknown party</span>
            )}
          </div>
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

export function Badge({ className, title, children }) {
  return (
    <span title={title} className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function BillDetail({ voucher }) {
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
