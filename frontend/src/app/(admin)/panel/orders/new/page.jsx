"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

// Lets staff place an order on behalf of a customer (partner) — mirrors the
// customer's own checkout flow (items + notes + transport), but the
// customer is picked explicitly instead of taken from the logged-in user.
export default function NewOrderForStaffPage() {
  const router = useRouter();

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const customerBoxRef = useRef(null);

  // Product picker
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [showProductResults, setShowProductResults] = useState(false);
  const productBoxRef = useRef(null);

  // Order being built
  const [items, setItems] = useState([]); // [{product_id, product_name, quantity}]
  const [notes, setNotes] = useState("");
  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState("");
  const [transports, setTransports] = useState([]);
  const [transportId, setTransportId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onClickOutside(e) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target)) setShowCustomerResults(false);
      if (productBoxRef.current && !productBoxRef.current.contains(e.target)) setShowProductResults(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    apiFetch("/transport-modes")
      .then((data) => setTransportModes(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!transportMode) {
      setTransports([]);
      setTransportId("");
      return;
    }
    apiFetch(`/transports?mode=${encodeURIComponent(transportMode)}`)
      .then((data) => setTransports(data || []))
      .catch(() => setTransports([]));
    setTransportId("");
  }, [transportMode]);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/admin/orders/customers/search?q=${encodeURIComponent(customerQuery.trim())}`)
        .then((data) => setCustomerResults(data || []))
        .catch(() => setCustomerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery]);

  useEffect(() => {
    const q = productQuery.trim();
    if (!q) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/admin/products?search=${encodeURIComponent(q)}&limit=15`)
        .then((data) => setProductResults(data.products || []))
        .catch(() => setProductResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  function pickCustomer(c) {
    setSelectedCustomer(c);
    setCustomerQuery("");
    setCustomerResults([]);
    setShowCustomerResults(false);
  }

  function addItem(product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product_id: product.id, product_name: product.name, quantity: Math.max(1, product.moq || 1) }];
    });
    setProductQuery("");
    setProductResults([]);
    setShowProductResults(false);
  }

  function setItemQuantity(productId, qty) {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i)));
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  async function handleSubmit() {
    setError("");
    if (!selectedCustomer) {
      setError("Pick a customer first.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product.");
      return;
    }
    if (items.some((i) => !i.quantity || i.quantity < 1)) {
      setError("Every item needs a quantity of at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          items,
          notes: notes.trim() || null,
          transport_mode: transportMode || null,
          transport_id: transportId || null,
        }),
      });
      router.push(`/panel/orders/${res.order_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Create Order on Behalf of a Customer</h2>
        <p className="text-sm text-gray-500">Pick a customer, add products, and place the order for them.</p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer</label>
        {selectedCustomer ? (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-sm text-gray-800">
              <span className="font-medium">{selectedCustomer.username || "Unnamed"}</span>{" "}
              <span className="text-gray-500">{selectedCustomer.phone_number}</span>
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative" ref={customerBoxRef}>
            <input
              type="text"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              onFocus={() => setShowCustomerResults(true)}
              placeholder="Search by name or phone number…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {showCustomerResults && customerResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                {customerResults.map((c) => (
                  <li
                    key={c.id}
                    onMouseDown={() => pickCustomer(c)}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-800 flex items-center justify-between"
                  >
                    <span>{c.username || "Unnamed"}</span>
                    <span className="text-gray-400 text-xs">{c.phone_number}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Add products</label>
        <div className="relative" ref={productBoxRef}>
          <input
            type="text"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            onFocus={() => setShowProductResults(true)}
            placeholder="Search product name…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          {showProductResults && productResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
              {productResults.map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => addItem(p)}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-800"
                >
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            {items.map((i) => (
              <div key={i.product_id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-800">{i.product_name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={i.quantity}
                    onChange={(e) => setItemQuantity(i.product_id, parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <button onClick={() => removeItem(i.product_id)} className="text-gray-400 hover:text-red-600 text-xs">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {items.length === 0 && <p className="text-xs text-gray-400 mt-2">No products added yet.</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Transport mode (optional)</label>
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— Use customer's default —</option>
            {transportModes.map((m) => (
              <option key={m.id || m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {transportMode && transports.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Transport (optional)</label>
            <select
              value={transportId}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">— None —</option>
              {transports.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Place Order"}
      </button>
    </div>
  );
}
