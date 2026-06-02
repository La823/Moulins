"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const CATEGORIES = ["Ortho", "Neuro", "Gastro", "Respiratory", "Dema", "Gynae", "General", "Misc", "Cardio", "Diabetic"];
const TYPES = ["TABLET", "CAPSULE", "SOFTGEL CAPSULE", "SACHET", "DRY SYRUP", "SYRUP", "OINTMENT", "SPRAY", "ROLL ON", "INJECTION", "DROPS"];
const STATUSES = [
  { v: "mail_done", l: "Mail Done" },
  { v: "rate_ok", l: "Rate OK" },
  { v: "mock_up_received", l: "Mock Up Received" },
  { v: "design_ok", l: "Design OK" },
  { v: "received", l: "Received" },
  { v: "hold", l: "Hold" },
  { v: "cancelled", l: "Cancelled" },
  { v: "repeat", l: "Repeat" },
];

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState([]);
  const [poProductNames, setPoProductNames] = useState([]); // unique names from previous POs
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const [form, setForm] = useState({
    po_date: new Date().toISOString().split("T")[0],
    product_id: null,
    product_name: "",
    quantity: 0,
    mrp: "",
    rate: "",
    specifications: "",
    type: "",
    manufacturer_id: "",
    category: "",
    status: "mail_done",
    remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [prefillNotice, setPrefillNotice] = useState("");
  const skipPrefillByName = useRef(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/admin/manufacturers"),
      apiFetch("/admin/purchase-orders"),
    ]).then(([mfrs, pos]) => {
      setManufacturers(Array.isArray(mfrs) ? mfrs : []);
      const list = Array.isArray(pos) ? pos : [];
      // Unique product names from all previous POs, preserving most-recent-first order
      const seen = new Set();
      const names = [];
      for (const po of list) {
        const name = po.product_name?.trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          names.push(name);
        }
      }
      setPoProductNames(names);
    });
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredProducts = productSearch.trim()
    ? poProductNames.filter((name) => name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 15)
    : [];

  const prefillFromLastPO = async (productID, productName) => {
    setPrefillNotice("");
    try {
      const params = new URLSearchParams();
      if (productID) params.set("product_id", productID);
      if (productName) params.set("product_name", productName);
      const last = await apiFetch(`/admin/purchase-orders/last-by-product?${params.toString()}`);
      if (!last) return null;
      return last;
    } catch {
      return null;
    }
  };

  const selectProduct = async (name) => {
    skipPrefillByName.current = true;
    setForm({ ...form, product_id: null, product_name: name });
    setProductSearch(name);
    setShowProductDropdown(false);
    setPrefillNotice("");

    const last = await prefillFromLastPO(null, name);
    if (last) {
      setForm((prev) => ({
        ...prev,
        product_name: name,
        quantity: last.quantity != null ? String(last.quantity) : prev.quantity,
        mrp: last.mrp != null ? String(last.mrp) : prev.mrp,
        rate: last.rate != null ? String(last.rate) : prev.rate,
        specifications: last.specifications || prev.specifications,
        type: last.type || prev.type,
        manufacturer_id: last.manufacturer_id ? last.manufacturer_id.toString() : prev.manufacturer_id,
        category: last.category || prev.category,
      }));
      setPrefillNotice(`po:Prefilled from ${last.po_number} (${new Date(last.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`);
    } else {
      setPrefillNotice("none:No previous PO found for this product");
    }
  };

  // Also try prefill on free-typed product names when the user blurs the field
  const tryPrefillByName = async () => {
    if (skipPrefillByName.current) { skipPrefillByName.current = false; return; }
    if (form.product_id || !form.product_name.trim()) return;
    const last = await prefillFromLastPO(null, form.product_name.trim());
    if (last) {
      setForm((prev) => ({
        ...prev,
        quantity: last.quantity != null ? String(last.quantity) : prev.quantity,
        mrp: last.mrp != null ? String(last.mrp) : prev.mrp,
        rate: last.rate != null ? String(last.rate) : prev.rate,
        specifications: last.specifications || prev.specifications,
        type: last.type || prev.type,
        manufacturer_id: last.manufacturer_id || prev.manufacturer_id,
        category: last.category || prev.category,
      }));
      setPrefillNotice(`po:Prefilled from ${last.po_number} (${new Date(last.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`);
    } else {
      setPrefillNotice("none:No previous PO found for this product");
    }
  };

  const estimate = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.manufacturer_id || !form.product_name.trim()) {
      setError("Manufacturer and product name are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/admin/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          po_date: form.po_date,
          product_id: form.product_id || undefined,
          product_name: form.product_name.trim(),
          quantity: parseInt(form.quantity) || 0,
          mrp: form.mrp ? parseFloat(form.mrp) : null,
          rate: form.rate ? parseFloat(form.rate) : null,
          specifications: form.specifications.trim() || null,
          type: form.type || null,
          manufacturer_id: form.manufacturer_id,
          category: form.category || null,
          status: form.status,
          remarks: form.remarks.trim() || null,
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
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">New Purchase Order</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {/* Date + manufacturer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date" required
                value={form.po_date}
                onChange={(e) => setForm({ ...form, po_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer *</label>
              <select
                required
                value={form.manufacturer_id}
                onChange={(e) => setForm({ ...form, manufacturer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select manufacturer</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Product search */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <input
              type="text" required
              value={form.product_id ? form.product_name : productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setForm({ ...form, product_name: e.target.value, product_id: null });
                setShowProductDropdown(true);
                setPrefillNotice("");
              }}
              onFocus={() => setShowProductDropdown(true)}
              onBlur={() => setTimeout(tryPrefillByName, 200)}
              placeholder="Search or type product name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            {showProductDropdown && filteredProducts.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {filteredProducts.map((name) => (
                  <button
                    key={name} type="button"
                    onClick={() => selectProduct(name)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 truncate text-gray-900"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Search from previous POs or type a custom name</p>
            {prefillNotice && (() => {
              const [type, ...rest] = prefillNotice.split(":");
              const msg = rest.join(":");
              if (type === "po") return <p className="text-[11px] mt-1 text-green-600">{"\u2713 "}{msg}</p>;
              if (type === "catalog") return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
              return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
            })()}
          </div>

          {/* Specs + type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specifications / Packing</label>
              <input
                type="text"
                value={form.specifications}
                onChange={(e) => setForm({ ...form, specifications: e.target.value })}
                placeholder="e.g. 10*10 ALU ALU, 60 ML"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select type</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Qty / MRP / Rate / Estimate */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number" min="0" required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MRP</label>
              <input
                type="number" step="0.01"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
              <input
                type="number" step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimate</label>
              <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
                &#8377;{estimate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Category + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit" disabled={submitting}
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
