"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const emptyItem = () => ({
  key: Date.now(),
  product_id: null,
  product_name: "",
  quantity: 1,
  rate: 0,
  mrp: 0,
  packing: "",
  search: "",
});

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState([]);
  const [products, setProducts] = useState([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Product search state
  const [activeSearch, setActiveSearch] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/admin/manufacturers"),
      apiFetch("/products"),
    ]).then(([mfrs, prods]) => {
      setManufacturers(Array.isArray(mfrs) ? mfrs : []);
      const prodList = prods?.products || prods || [];
      setProducts(Array.isArray(prodList) ? prodList : []);
    });
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveSearch(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const selectProduct = (index, product) => {
    updateItem(index, {
      product_id: product.id,
      product_name: product.name,
      mrp: product.mrp || product.price || 0,
      rate: product.price || 0,
      packing: product.pack_size || "",
      search: "",
    });
    setActiveSearch(null);
  };

  const filteredProducts = (search) => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 15);
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!manufacturerId) { setError("Select a manufacturer"); return; }
    if (items.some((item) => !item.product_name.trim())) { setError("All items need a product name"); return; }

    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/admin/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          manufacturer_id: manufacturerId,
          date,
          notes: notes.trim() || null,
          items: items.map((item) => ({
            product_id: item.product_id || undefined,
            product_name: item.product_name,
            quantity: parseInt(item.quantity) || 1,
            rate: parseFloat(item.rate) || 0,
            mrp: parseFloat(item.mrp) || 0,
            packing: item.packing.trim() || null,
          })),
        }),
      });
      router.push(`/admin/purchase-orders/${res.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">New Purchase Order</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* Header fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer *</label>
              <select
                value={manufacturerId}
                onChange={(e) => setManufacturerId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select manufacturer</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Items</h3>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              + Add Item
            </button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 mb-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider px-1">
            <div className="col-span-4">Product</div>
            <div className="col-span-2">Packing</div>
            <div>Qty</div>
            <div>MRP</div>
            <div>Rate</div>
            <div>Amount</div>
            <div className="col-span-1"></div>
          </div>

          <div className="space-y-2" ref={dropdownRef}>
            {items.map((item, index) => (
              <div key={item.key} className="grid grid-cols-12 gap-2 items-start">
                {/* Product search */}
                <div className="col-span-4 relative">
                  {item.product_name && activeSearch !== index ? (
                    <div
                      onClick={() => { updateItem(index, { search: item.product_name }); setActiveSearch(index); }}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 cursor-pointer hover:border-gray-400 truncate"
                    >
                      {item.product_name}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={activeSearch === index ? item.search : item.product_name}
                        onChange={(e) => { updateItem(index, { search: e.target.value, product_name: e.target.value, product_id: null }); setActiveSearch(index); }}
                        onFocus={() => setActiveSearch(index)}
                        placeholder="Search product..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        autoFocus={activeSearch === index}
                      />
                      {activeSearch === index && filteredProducts(item.search).length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredProducts(item.search).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectProduct(index, p)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 truncate"
                            >
                              <span className="text-gray-900">{p.name}</span>
                              {p.price != null && (
                                <span className="text-gray-400 ml-2">&#8377;{Number(p.price).toFixed(2)}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="col-span-2">
                  <input type="text" value={item.packing} onChange={(e) => updateItem(index, { packing: e.target.value })}
                    placeholder="e.g. 10*1*10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                </div>
                <div>
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 text-center" />
                </div>
                <div>
                  <input type="number" step="0.01" value={item.mrp} onChange={(e) => updateItem(index, { mrp: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 text-right" />
                </div>
                <div>
                  <input type="number" step="0.01" value={item.rate} onChange={(e) => updateItem(index, { rate: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 text-right" />
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm text-gray-700 font-medium">
                    &#8377;{(parseFloat(item.quantity || 0) * parseFloat(item.rate || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(index)}
                      className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
              <p className="text-lg font-semibold text-gray-900">&#8377;{totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Purchase Order"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/purchase-orders")}
            className="px-6 py-2.5 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
