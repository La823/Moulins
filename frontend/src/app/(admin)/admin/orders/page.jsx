"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  transferred: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-purple-50 text-purple-700 border-purple-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-orange-50 text-orange-700 border-orange-200",
};

const STATUSES = [
  "pending",
  "confirmed",
  "transferred",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "transferred", label: "Transferred" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("newest");

  const limit = 20;

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (sort) params.set("sort", sort);

    apiFetch(`/admin/orders?${params}`)
      .then((data) => {
        setOrders(data.orders || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, statusFilter, search, sort]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, sort]);

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingStatus(orderId);
    try {
      await apiFetch(`/admin/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      alert("Failed to update status: " + err.message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Orders</h2>
        {!loading && (
          <span className="text-sm text-gray-400">
            {total} {statusFilter ? statusFilter : "total"}
          </span>
        )}
      </div>

      {/* Filters bar */}
      <div className="space-y-4 mb-6">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by customer name or phone..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder:text-gray-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </form>

          {/* Sort toggle */}
          <button
            onClick={() =>
              setSort((s) => (s === "newest" ? "oldest" : "newest"))
            }
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${
                sort === "oldest" ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"
              />
            </svg>
            {sort === "newest" ? "Newest first" : "Oldest first"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg
            className="w-10 h-10 text-gray-300 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-sm text-gray-400">
            {search || statusFilter
              ? "No orders match your filters"
              : "No orders yet"}
          </p>
          {(search || statusFilter) && (
            <button
              onClick={() => {
                setStatusFilter("");
                setSearch("");
                setSearchInput("");
              }}
              className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">
                    {order.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">
                      {order.user_name || "No name"}
                    </p>
                    <p className="text-xs text-gray-400">{order.user_phone}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {order.item_count}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={order.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleStatusChange(order.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      disabled={updatingStatus === order.id}
                      className={`text-[11px] px-2 py-1 rounded-full font-medium capitalize border-0 outline-none cursor-pointer disabled:opacity-50 ${
                        STATUS_STYLES[order.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
                {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
