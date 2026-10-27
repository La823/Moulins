"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { BillDetail, fmtMoney, fmtDate, fmtQty, TYPE_STYLES } from "@/components/admin/MargBills";
import { BatchSummary, BatchMovements } from "@/components/admin/MargBatchHistory";
import { useBreadcrumbTitle, BackLink } from "@/components/admin/Breadcrumbs";

// One stock batch: who it was sold to and when (sale invoices and challans),
// then every movement in and out with a running balance, against Marg's own
// stock. Opened from a batch number on the Marg Stock page.

export default function MargBatchPage() {
  const { id } = useParams();
  const [h, setH] = useState(null);
  useBreadcrumbTitle(h ? `Batch ${h.batch || "(no batch)"}` : null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/marg-stock/batches/${id}`)
      .then(setH)
      .catch((e) => setError(e.message?.includes("not found") ? "This batch isn't in Marg's stock any more." : e.message || "Could not load batch"));
  }, [id]);

  const back = <BackLink fallback="/panel/marg-stock" fallbackLabel="Marg Stock" />;

  if (error) return <>{back}<div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div></>;
  if (!h) return <>{back}<Loader /></>;

  const sales = h.movements.filter((m) => m.bill_type === "S" || m.bill_type === "CH");
  const customers = new Set(sales.map((m) => m.party_code)).size;
  const facts = [
    h.expiry && `Expiry ${String(h.expiry).slice(5, 7)}/${String(h.expiry).slice(0, 4)}`,
    h.mrp && `MRP ${fmtMoney(h.mrp)}`,
    h.purchase_rate && `Purchase rate ${fmtMoney(h.purchase_rate)}`,
    h.supplier_invoice && `Supplier invoice ${h.supplier_invoice}${h.supplier_invoice_date ? ` (${fmtDate(h.supplier_invoice_date)})` : ""}`,
  ].filter(Boolean);

  return (
    <>
      {back}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Batch {h.batch || "(no batch)"} ·{" "}
          <Link href={`/panel/marg-analysis/products/${h.product_pid}`} className="hover:underline">
            {h.product_name || `Product ${h.product_pid}`}
          </Link>
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">{facts.join(" · ")}</p>
      </div>

      <div className="mb-6">
        <BatchSummary h={h} />
      </div>

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Sold to</h3>
        <p className="text-xs text-gray-500 mb-3">
          {sales.length
            ? `${sales.length} sale bill${sales.length !== 1 ? "s" : ""} to ${customers} customer${customers !== 1 ? "s" : ""} this year · ${fmtQty(h.sold_qty)} units · ${fmtMoney(h.sold_value)} before GST`
            : "This batch hasn't been sold this year."}
        </p>
        {sales.length > 0 && <SalesTable sales={sales} />}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">All movements</h3>
        <p className="text-xs text-gray-500 mb-3">Opening stock, then every bill that moved this batch in or out, with the balance after each.</p>
        <BatchMovements h={h} />
      </section>
    </>
  );
}

// Sale invoices and challans of the batch, newest first.
function SalesTable({ sales }) {
  const [open, setOpen] = useState(null);
  const rows = [...sales].reverse();
  const qty = sales.reduce((s, m) => s + m.qty, 0);
  const free = sales.reduce((s, m) => s + m.free, 0);
  const value = sales.reduce((s, m) => s + m.amount, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Bill</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Rate</th>
            <th className="px-4 py-3 text-right">Value (before GST)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((m, i) => {
            const key = `${m.voucher}-${i}`;
            return (
              <SaleRow key={key} m={m} open={open === key} onToggle={() => setOpen((v) => (v === key ? null : key))} />
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 text-gray-700">
          <tr>
            <td className="px-4 py-3 font-medium" colSpan={3}>{sales.length} bill{sales.length !== 1 ? "s" : ""}</td>
            <td className="px-4 py-3 text-right font-medium">
              {fmtQty(qty)}{free > 0 && <span className="text-green-700"> +{fmtQty(free)}</span>}
            </td>
            <td></td>
            <td className="px-4 py-3 text-right font-semibold">{fmtMoney(value)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SaleRow({ m, open, onToggle }) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(m.date)}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <button onClick={onToggle} className="font-medium text-gray-900 hover:underline">{m.bill_no}</button>
          {m.bill_type === "CH" && (
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${TYPE_STYLES.CH}`}>Challan</span>
          )}
        </td>
        <td className="px-4 py-3">
          {m.party_code ? (
            <Link href={`/panel/marg-ledger/${encodeURIComponent(m.party_code)}`} className="text-gray-900 hover:underline">
              {m.party_name || m.party_code}
            </Link>
          ) : "—"}
          <div className="text-xs text-gray-400">{m.party_code}</div>
        </td>
        <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
          {fmtQty(m.qty)}{m.free > 0 && <span className="text-green-700"> +{fmtQty(m.free)}</span>}
        </td>
        <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{m.rate ? fmtMoney(m.rate) : "—"}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtMoney(m.amount)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 pb-4 bg-gray-50">
            <BillDetail voucher={m.voucher} />
          </td>
        </tr>
      )}
    </>
  );
}
