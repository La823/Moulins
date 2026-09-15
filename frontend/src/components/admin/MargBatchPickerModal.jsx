"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

// Read-only preview of what "Send Order to Marg" will actually push — batch
// selection itself now happens inline on the order page (a dropdown per
// item), not here. This just confirms the final picture before sending.
export default function MargBatchPickerModal({ orderId, onClose, onPushed }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/orders/${orderId}/marg-batch-options`)
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => setError(err.message || "Could not load batch options"))
      .finally(() => setLoading(false));
  }, [orderId]);

  // Mirrors the backend's push fallback: prefer the explicitly saved
  // selection, else the earliest-expiry (FEFO) default — same as what the
  // order page's dropdown shows before any pick is ever saved, and exactly
  // what push-to-marg will actually send.
  const selectedBatch = (it) => it.batches.find((b) => b.code === (it.selected_code || it.default_code));

  const allBlocked = items.length > 0 && items.every((it) => !it.marg_linked);
  const missingSelection = items.filter((it) => it.marg_linked && !selectedBatch(it));
  const canSubmit = items.length > 0 && items.every((it) => !it.marg_linked || selectedBatch(it));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch(`/admin/orders/${orderId}/push-to-marg`, {
        method: "POST",
      });
      onPushed?.(result);
    } catch (err) {
      setError(err.message || "Could not push order to Marg");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Send Order to Marg</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Preview of what will be sent — change a batch from the order page if needed
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading preview...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400">No items on this order</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="text-center py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Qty</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Batch</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((it) => {
                  const batch = selectedBatch(it);
                  return (
                    <tr key={it.order_item_id}>
                      <td className="py-2.5 text-gray-900">{it.product_name}</td>
                      <td className="py-2.5 text-center text-gray-700">{it.quantity}</td>
                      {!it.marg_linked ? (
                        <td colSpan={2} className="py-2.5 text-amber-600 text-xs">
                          Not linked to a Marg product
                        </td>
                      ) : !batch ? (
                        <td colSpan={2} className="py-2.5 text-amber-600 text-xs">
                          No live Marg batches available for this product
                        </td>
                      ) : (
                        <>
                          <td className="py-2.5 text-blue-600 font-medium">{batch.curbatch || "—"}</td>
                          <td className="py-2.5 text-red-600 font-medium">{batch.exp?.trim() || "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {allBlocked && (
            <p className="text-sm text-red-600">
              None of this order&apos;s products are linked to Marg — nothing can be pushed.
            </p>
          )}
          {!allBlocked && missingSelection.length > 0 && (
            <p className="text-sm text-amber-600">
              No live Marg batches available for: {missingSelection.map((it) => it.product_name).join(", ")}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Confirm & Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
