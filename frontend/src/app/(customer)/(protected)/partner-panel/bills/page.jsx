"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

// The partner's own invoices from Marg: final sale bills (no challans or
// cancelled bills) with the total including GST. Click one to see its lines.

const money = (v) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const day = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const expiry = (v) => (v ? `${String(v).slice(5, 7)}/${String(v).slice(2, 4)}` : "—");

export default function PartnerBillsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    apiFetch("/my/marg-bills")
      .then(setData)
      .catch((e) => setError(e.message || "Could not load your bills"));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-1">Bills</h1>
      <p className="text-sm text-gray-400 mb-8">Your invoices this financial year, with GST</p>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      ) : !data.linked ? (
        <p className="text-sm text-gray-500 border border-gray-200 rounded-lg px-5 py-4">
          Your bills will show here once your account is linked to our billing. Please contact us if you
          expected to see them.
        </p>
      ) : data.bills.length === 0 ? (
        <p className="text-sm text-gray-400">No invoices this financial year yet.</p>
      ) : (
        <>
          <div className="mb-6 border border-gray-200 rounded-lg px-5 py-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Billed this year</p>
              <p className="text-3xl font-light text-gray-900">{money(data.total)}</p>
            </div>
            <p className="text-sm text-gray-500">
              {data.count} invoice{data.count !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.bills.map((b) => (
                  <BillRow
                    key={b.voucher}
                    b={b}
                    open={open === b.voucher}
                    onToggle={() => setOpen((v) => (v === b.voucher ? null : b.voucher))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BillRow({ b, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer ${open ? "bg-gray-50" : "hover:bg-gray-50"}`}>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{day(b.date)}</td>
        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
            {b.bill_no}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-gray-600">{b.items}</td>
        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money(b.amount)}</td>
        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{money(b.gst)}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{money(b.total)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 pb-4 bg-gray-50">
            <BillLines voucher={b.voucher} total={b.total} />
          </td>
        </tr>
      )}
    </>
  );
}

function BillLines({ voucher, total }) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`/my/marg-bills/${voucher}`)
      .then(setBill)
      .catch((e) => setError(e.message || "Could not load the invoice"));
  }, [voucher]);

  if (error) return <p className="text-sm text-red-600 py-3">{error}</p>;
  if (!bill) return <p className="text-sm text-gray-400 py-3">Loading invoice...</p>;

  const lineSum = bill.lines.reduce((s, l) => s + l.line_total, 0);
  const roundOff = total - lineSum;

  return (
    <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white mt-1">
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
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bill.lines.map((l, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-gray-900">{l.product || "—"}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.kind === "item" ? l.batch || "—" : ""}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.kind === "item" ? expiry(l.expiry) : ""}</td>
              <td className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">
                {l.kind === "item" ? (
                  <>
                    {qty(l.qty)}
                    {l.free > 0 && <span className="text-green-700"> +{qty(l.free)} free</span>}
                  </>
                ) : ""}
              </td>
              <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{l.kind === "item" ? money(l.mrp) : ""}</td>
              <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{l.kind === "item" ? money(l.rate) : ""}</td>
              <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{l.discount ? money(l.discount) : "—"}</td>
              <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{money(l.amount)}</td>
              <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                {money(l.gst_amount)}
                {l.gst_percent != null && <span className="text-gray-400"> ({qty(l.gst_percent)}%)</span>}
              </td>
              <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{money(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 text-gray-700">
          {Math.abs(roundOff) >= 0.01 && (
            <tr>
              <td colSpan={9} className="px-3 py-1.5 text-right text-gray-500">Round off / other</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">{money(roundOff)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={9} className="px-3 py-2 text-right font-medium">Invoice total</td>
            <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
