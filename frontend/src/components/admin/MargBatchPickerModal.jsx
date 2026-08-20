"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function MargBatchPickerModal({ orderId, onClose, onPushed }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({}); // order_item_id -> batch_code
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/orders/${orderId}/marg-batch-options`)
      .then((data) => {
        const list = Array.isArray(data.items) ? data.items : [];
        setItems(list);
        const initial = {};
        list.forEach((it) => {
          if (it.default_code) initial[it.order_item_id] = it.default_code;
        });
        setSelected(initial);
      })
      .catch((err) => setError(err.message || "Could not load batch options"))
      .finally(() => setLoading(false));
  }, [orderId]);

  const allBlocked = items.length > 0 && items.every((it) => !it.marg_linked);
  const canSubmit =
    items.length > 0 &&
    items.every((it) => it.marg_linked && selected[it.order_item_id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const body = {
        items: items.map((it) => ({
          order_item_id: it.order_item_id,
          batch_code: selected[it.order_item_id],
        })),
      };
      const result = await apiFetch(`/admin/orders/${orderId}/push-to-marg`, {
        method: "POST",
        body: JSON.stringify(body),
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
            <p className="text-xs text-gray-400 mt-0.5">Pick a batch for each line — earliest expiry pre-selected</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Loading batch options...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400">No items on this order</p>
          ) : (
            <div className="space-y-4">
              {items.map((it) => (
                <div key={it.order_item_id} className="border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">{it.product_name}</p>
                  {!it.marg_linked ? (
                    <p className="text-xs text-amber-600">
                      Not linked to a Marg product — link it on the product&apos;s edit page first.
                    </p>
                  ) : it.batches.length === 0 ? (
                    <p className="text-xs text-amber-600">No live Marg batches found for this product.</p>
                  ) : (
                    <select
                      value={selected[it.order_item_id] || ""}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [it.order_item_id]: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    >
                      {it.batches.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.curbatch || "—"} — exp {b.exp?.trim() || "unknown"}, stock {Number(b.stock).toLocaleString("en-IN")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {allBlocked && (
            <p className="text-sm text-red-600">
              None of this order&apos;s products are linked to Marg — nothing can be pushed.
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
