"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  mail_done: "bg-gray-100 text-gray-700",
  rate_ok: "bg-amber-50 text-amber-700",
  mock_up_received: "bg-cyan-50 text-cyan-700",
  design_ok: "bg-blue-50 text-blue-700",
  received: "bg-green-50 text-green-700",
  hold: "bg-orange-50 text-orange-700",
  cancelled: "bg-red-50 text-red-700",
  repeat: "bg-purple-50 text-purple-700",
};

const STATUSES = [
  { v: "mail_done", l: "Mail Done" },
  { v: "rate_ok", l: "Rate OK" },
  { v: "mock_up_received", l: "Mock Up Received" },
  { v: "design_ok", l: "Design OK" },
  { v: "received", l: "Received" },
  { v: "hold", l: "Hold" },
  { v: "cancelled", l: "Cancelled" },
  { v: "repeat", l: "Repeat" },
];

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Inline edit state for received qty + bill number
  const [qtyReceived, setQtyReceived] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const fetchPO = () => {
    apiFetch(`/admin/purchase-orders/${id}`)
      .then((data) => {
        setPo(data);
        setQtyReceived(String(data.qty_received || 0));
        setBillNumber(data.bill_number || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPO(); }, [id]);

  const updateStatus = async (status) => {
    setUpdatingStatus(true);
    try {
      await apiFetch(`/admin/purchase-orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      setPo((prev) => ({ ...prev, status }));
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await apiFetch(`/admin/purchase-orders/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          qty_received: parseInt(qtyReceived) || 0,
          bill_number: billNumber || null,
        }),
      });
      setPo((prev) => ({ ...prev, qty_received: parseInt(qtyReceived) || 0, bill_number: billNumber }));
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMeta(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 p-6">Loading...</p>;
  if (!po) return <p className="text-sm text-gray-400 p-6">Not found</p>;

  const estimate = po.estimate || (po.quantity * (po.rate || 0));

  return (
    <>
      <div className="mb-6">
        <Link href="/admin/purchase-orders" className="text-xs text-gray-400 hover:text-gray-600">
          &larr; Back to purchase orders
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-gray-900 font-mono">{po.po_number}</h2>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[po.status] || "bg-gray-100 text-gray-600"}`}>
                {STATUSES.find((s) => s.v === po.status)?.l || po.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{po.manufacturer_name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(po.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          {po.document_url && (
            <a href={po.document_url} target="_blank" rel="noopener noreferrer"
               className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
              Download PDF
            </a>
          )}
        </div>

        {/* Status update */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s.v}
                onClick={() => updateStatus(s.v)}
                disabled={updatingStatus || po.status === s.v}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  po.status === s.v
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product details table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Details</h3>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Product Name", po.product_name],
              ["Specifications", po.specifications || "-"],
              ["Type", po.type || "-"],
              ["Category", po.category || "-"],
              ["Quantity", po.quantity],
              ["MRP", po.mrp != null ? `\u20B9${Number(po.mrp).toFixed(2)}` : "-"],
              ["Rate", po.rate != null ? `\u20B9${Number(po.rate).toFixed(2)}` : "-"],
              ["Estimate", `\u20B9${Number(estimate).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
              ["Remarks", po.remarks || "-"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-gray-50">
                <td className="py-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">{label}</td>
                <td className="py-2 text-gray-900">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receiving info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Receiving</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Qty Received</label>
            <input
              type="number" min="0"
              value={qtyReceived}
              onChange={(e) => setQtyReceived(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <p className="text-[11px] text-gray-400 mt-1">Ordered: {po.quantity}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Bill Number</label>
            <input
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
        </div>
        <button
          onClick={saveMeta} disabled={savingMeta}
          className="mt-3 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {savingMeta ? "Saving..." : "Save"}
        </button>
      </div>
    </>
  );
}
