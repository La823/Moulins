"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function CreateProductFromMargProductModal({ product, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: product.name?.trim() || "",
    price: product.rate && product.rate > 0 ? String(product.rate) : "",
    mrp: product.mrp != null ? String(product.mrp) : "",
    stock: product.total_stock != null ? String(Math.max(0, Math.floor(product.total_stock))) : "0",
    brand_name: product.company?.trim() || "",
    key_ingredients: product.salt?.trim() || "",
    moq: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.name.trim() || !(price > 0)) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/admin/marg-products/${encodeURIComponent(product.base_code)}/create-product`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          price,
          mrp: form.mrp ? parseFloat(form.mrp) : undefined,
          stock: parseInt(form.stock, 10) || 0,
          moq: parseInt(form.moq, 10) || 1,
          brand_name: form.brand_name.trim() || undefined,
          key_ingredients: form.key_ingredients.trim() || undefined,
        }),
      });
      onCreated?.();
    } catch (err) {
      setError(err.message || "Could not create product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Create Product</h3>
            <p className="text-xs text-gray-400 mt-0.5">From Marg product code {product.base_code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.price}
                onChange={set("price")}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                placeholder="Required — not always on the Marg record"
              />
              {!(product.rate > 0) && (
                <p className="text-[11px] text-amber-600 mt-1">Not on the Marg record — enter manually.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MRP</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.mrp}
                onChange={set("mrp")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={set("stock")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MOQ</label>
              <input
                type="number"
                min="1"
                value={form.moq}
                onChange={set("moq")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand / Manufacturer</label>
            <input
              type="text"
              value={form.brand_name}
              onChange={set("brand_name")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key Ingredients / Salt</label>
            <input
              type="text"
              value={form.key_ingredients}
              onChange={set("key_ingredients")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <p className="text-[11px] text-gray-400">
            Categories, images, and other details can be added after creation from the product&apos;s own edit page.
          </p>

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
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
