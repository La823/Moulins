"use client";

import { useState, useEffect, useMemo } from "react";
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

const STATUS_LABELS = {
  mail_done: "Mail Done",
  rate_ok: "Rate OK",
  mock_up_received: "Mock Up Received",
  design_ok: "Design OK",
  received: "Received",
  hold: "Hold",
  cancelled: "Cancelled",
  repeat: "Repeat",
};

const PAGE_SIZE = 50;

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiFetch("/admin/purchase-orders")
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this purchase order?")) return;
    try {
      await apiFetch(`/admin/purchase-orders/${id}`, { method: "DELETE" });
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const categories = useMemo(
    () => [...new Set(orders.map((o) => o.category).filter(Boolean))].sort(),
    [orders]
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (categoryFilter && o.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [o.po_number, o.product_name, o.manufacturer_name].filter(Boolean);
        if (!fields.some((f) => f.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, categoryFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

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

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO#, product, manufacturer..."
          className="flex-1 max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-400"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-400"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No purchase orders found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">PO #</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Manufacturer</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Estimate</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((po) => (
                  <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/purchase-orders/${po.id}`} className="font-mono text-xs text-gray-900 font-medium hover:text-blue-600">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-gray-900 max-w-xs truncate">{po.product_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate">{po.manufacturer_name}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{po.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {po.rate != null ? `\u20B9${Number(po.rate).toFixed(2)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {po.estimate != null ? `\u20B9${Number(po.estimate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{po.category || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[po.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[po.status] || po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {po.document_url && (
                          <a href={po.document_url} target="_blank" rel="noopener noreferrer"
                             onClick={(e) => e.stopPropagation()}
                             className="text-[11px] font-medium text-blue-600 hover:underline">
                            PDF
                          </a>
                        )}
                        <button onClick={(e) => handleDelete(po.id, e)}
                          className="text-[11px] text-red-500 hover:text-red-700">
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between border-t border-gray-100">
            <div className="text-xs text-gray-400">
              Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
              >
                « First
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ‹ Prev
              </button>
              <span className="px-2 py-1 text-xs text-gray-700 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
