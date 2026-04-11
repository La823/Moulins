"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-50 text-blue-700",
  confirmed: "bg-green-50 text-green-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/admin/purchase-orders")
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this purchase order?")) return;
    try {
      await apiFetch(`/admin/purchase-orders/${id}`, { method: "DELETE" });
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Purchase Orders</h2>
        <Link
          href="/admin/purchase-orders/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          Create PO
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No purchase orders yet</p>
          <Link href="/admin/purchase-orders/new" className="text-sm text-blue-600 mt-2 inline-block">
            Create your first PO
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((po) => (
            <div key={po.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <Link href={`/admin/purchase-orders/${po.id}`} className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-medium text-gray-900 font-mono text-sm">{po.po_number}</p>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_STYLES[po.status] || "bg-gray-100 text-gray-600"}`}>
                      {po.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{po.manufacturer_name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(po.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  {po.document_url && (
                    <a
                      href={po.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      PDF
                    </a>
                  )}
                  <Link
                    href={`/admin/purchase-orders/${po.id}`}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(po.id)}
                    className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
