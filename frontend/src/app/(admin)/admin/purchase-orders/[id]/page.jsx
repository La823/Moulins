"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-50 text-blue-700",
  confirmed: "bg-green-50 text-green-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const STATUSES = ["draft", "sent", "confirmed", "received", "cancelled"];

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchPO = () => {
    apiFetch(`/admin/purchase-orders/${id}`)
      .then(setPo)
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

  if (loading) return <p className="text-sm text-gray-400 p-6">Loading...</p>;
  if (!po) return <p className="text-sm text-gray-400 p-6">Purchase order not found</p>;

  const totalAmount = (po.items || []).reduce((sum, item) => sum + item.quantity * item.rate, 0);

  return (
    <>
      <div className="mb-6">
        <Link href="/admin/purchase-orders" className="text-xs text-gray-400 hover:text-gray-600">
          &larr; Back to purchase orders
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-gray-900 font-mono">{po.po_number}</h2>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_STYLES[po.status]}`}>
                {po.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{po.manufacturer_name}</p>
            <p className="text-xs text-gray-400 mt-1">
              Date: {new Date(po.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            {po.notes && <p className="text-sm text-gray-500 mt-2">{po.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            {po.document_url && (
              <a
                href={po.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Download PDF
              </a>
            )}
          </div>
        </div>

        {/* Status updater */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Update Status</p>
          <div className="flex items-center gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updatingStatus || po.status === s}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  po.status === s
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Items ({po.items?.length || 0})</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-8">Sr.</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Packing</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Qty</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">MRP</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Rate</th>
                <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(po.items || []).map((item, i) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-3 text-gray-500">{i + 1}</td>
                  <td className="py-3 text-gray-900 font-medium">{item.product_name}</td>
                  <td className="py-3 text-gray-600">{item.packing || "-"}</td>
                  <td className="py-3 text-gray-900 text-center">{item.quantity}</td>
                  <td className="py-3 text-gray-600 text-right">&#8377;{Number(item.mrp).toFixed(2)}</td>
                  <td className="py-3 text-gray-900 text-right">&#8377;{Number(item.rate).toFixed(2)}</td>
                  <td className="py-3 text-gray-900 text-right font-medium">
                    &#8377;{(item.quantity * item.rate).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={6} className="py-3 text-right font-semibold text-gray-700">Total</td>
                <td className="py-3 text-right font-semibold text-gray-900">
                  &#8377;{totalAmount.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
