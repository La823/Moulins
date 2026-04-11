"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/orders")
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-10">My Orders</h1>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-gray-100 rounded-lg p-5">
              <div className="h-4 bg-gray-100 rounded w-1/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-400">No orders yet</p>
          <Link
            href="/products"
            className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-mono">
                  {order.id.slice(0, 8)}
                </span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium capitalize ${
                    STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-900">
                  {order.item_count} item{order.item_count !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              {order.notes && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-1">
                  {order.notes}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
