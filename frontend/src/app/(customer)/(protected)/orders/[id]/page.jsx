"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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

const STATUS_STEPS = ["pending", "confirmed", "transferred", "shipped", "delivered"];

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/orders/${id}`)
      .then(setOrder)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
          <div className="h-px bg-gray-100 my-6" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-20 text-center">
        <p className="text-sm text-gray-400">Order not found</p>
        <Link href="/orders" className="inline-block mt-4 text-sm text-red-600 hover:text-red-700">
          Back to orders
        </Link>
      </div>
    );
  }

  const currentStep = STATUS_STEPS.indexOf(order.status);

  // Build a map of status -> timestamp from events
  const stepTimestamps = {};
  if (order.events) {
    // "order.created" maps to "pending"
    for (const event of order.events) {
      if (event.event_type === "order.created") {
        stepTimestamps["pending"] = event.created_at;
      } else if (event.event_type.startsWith("status.")) {
        const status = event.event_type.replace("status.", "");
        stepTimestamps[status] = event.created_at;
      }
    }
  }
  // Fallback: pending always has the order created_at
  if (!stepTimestamps["pending"]) {
    stepTimestamps["pending"] = order.created_at;
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <Link href="/orders" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
        &larr; All orders
      </Link>

      <div className="mt-6 mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-light text-gray-900">Order placed</h1>
          <span
            className={`text-xs px-3 py-1 rounded-full font-medium capitalize border ${
              STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            {order.status}
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          {new Date(order.created_at).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Status timeline */}
      {order.status !== "cancelled" && order.status !== "refunded" && (
        <div className="flex items-center gap-0 mb-10">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full ${
                    i <= currentStep ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
                <span className={`text-[10px] mt-1.5 capitalize ${
                  i <= currentStep ? "text-gray-900 font-medium" : "text-gray-300"
                }`}>
                  {step}
                </span>
                {stepTimestamps[step] ? (
                  <span className="text-[9px] text-gray-400 mt-0.5">
                    {new Date(stepTimestamps[step]).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}{", "}
                    {new Date(stepTimestamps[step]).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  i <= currentStep && (
                    <span className="text-[9px] text-gray-300 mt-0.5">&mdash;</span>
                  )
                )}
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${
                  i < currentStep ? "bg-gray-900" : "bg-gray-200"
                }`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Refunded notice */}
      {order.status === "refunded" && (
        <div className="mb-10 flex items-center gap-3 px-5 py-4 bg-orange-50 border border-orange-200 rounded-lg">
          <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
          <div>
            <p className="text-sm font-medium text-orange-800">Order Refunded</p>
            <p className="text-xs text-orange-600 mt-0.5">
              This order has been refunded.
              {order.updated_at && (
                <> Processed on {new Date(order.updated_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "long", year: "numeric",
                })}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Cancelled notice */}
      {order.status === "cancelled" && (
        <div className="mb-10 flex items-center gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-lg">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">Order Cancelled</p>
            <p className="text-xs text-red-600 mt-0.5">
              This order has been cancelled.
            </p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Items ({order.items?.length || 0})
        </h2>
        <div className="divide-y divide-gray-100">
          {order.items?.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm text-gray-900">{item.product_name}</p>
              </div>
              <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Details */}
      {(order.delivery_person || order.tracking_number || order.expected_delivery) && (
        <div className="border-t border-gray-200 pt-6 mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Delivery Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {order.delivery_person && (
              <div>
                <span className="text-xs text-gray-400">Delivery Person</span>
                <p className="text-gray-900">{order.delivery_person}</p>
              </div>
            )}
            {order.tracking_number && (
              <div>
                <span className="text-xs text-gray-400">Tracking Number</span>
                <p className="text-gray-900 font-mono">{order.tracking_number}</p>
              </div>
            )}
            {order.expected_delivery && (
              <div>
                <span className="text-xs text-gray-400">Expected Delivery</span>
                <p className="text-gray-900">
                  {new Date(order.expected_delivery).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
            {order.delivery_notes && (
              <div className="col-span-2">
                <span className="text-xs text-gray-400">Delivery Notes</span>
                <p className="text-gray-700">{order.delivery_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      {order.events?.length > 0 && (
        <div className="border-t border-gray-200 pt-6 mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Activity</h2>
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />
            <div className="space-y-4">
              {order.events.map((event, i) => (
                <div key={event.id} className="relative flex gap-3">
                  {/* Dot */}
                  <div className={`absolute -left-6 top-1 w-[9px] h-[9px] rounded-full border-2 ${
                    i === order.events.length - 1
                      ? "bg-gray-900 border-gray-900"
                      : "bg-white border-gray-300"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{event.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(event.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="border-t border-gray-200 pt-6 mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Notes</h2>
          <p className="text-sm text-gray-500">{order.notes}</p>
        </div>
      )}

      {/* Order ID */}
      <div className="border-t border-gray-200 pt-6 mt-6">
        <p className="text-xs text-gray-400">
          Order ID: <span className="font-mono">{order.id}</span>
        </p>
      </div>
    </div>
  );
}
