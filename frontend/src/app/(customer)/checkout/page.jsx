"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { apiFetch } from "@/lib/api";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, itemCount, clearCart } = useCart();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((i) => ({
            product_id: i.product.id,
            product_name: i.product.name,
            quantity: i.quantity,
          })),
          notes: notes.trim() || undefined,
        }),
      });
      clearCart();
      router.push(`/orders/${res.order_id}`);
    } catch (err) {
      setError(err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-20 text-center">
        <p className="text-gray-400 text-sm">Your cart is empty</p>
        <Link
          href="/products"
          className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-2">Checkout</h1>
      <p className="text-sm text-gray-400 mb-10">
        {itemCount} item{itemCount !== 1 ? "s" : ""} in your order
      </p>

      {/* Order items */}
      <div className="divide-y divide-gray-100 mb-8">
        {items.map(({ product, quantity }) => (
          <div key={product.id} className="flex gap-4 py-5">
            <div className="w-16 h-16 rounded-md bg-gray-50 flex-shrink-0 overflow-hidden">
              {product.images && product.images.length > 0 ? (
                <img
                  src={product.images[0].image_url}
                  alt={product.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900">{product.name}</h3>
              {(product.pack_size || product.product_form) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {[product.pack_size, product.product_form].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="text-sm text-gray-500 flex-shrink-0">
              Qty: {quantity}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Order notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special instructions or notes for this order..."
          rows={3}
          className="w-full px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <Link
          href="/products"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          &larr; Continue browsing
        </Link>
        <button
          onClick={handlePlaceOrder}
          disabled={submitting}
          className="px-8 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Placing order..." : "Place Order"}
        </button>
      </div>
    </div>
  );
}
