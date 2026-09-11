"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const CATEGORIES = ["Ortho", "Neuro", "Gastro", "Respiratory", "Dema", "Gynae", "General", "Misc", "Cardio", "Diabetic"];
const TYPES = ["TABLET", "CAPSULE", "SOFTGEL CAPSULE", "SACHET", "DRY SYRUP", "SYRUP", "OINTMENT", "SPRAY", "ROLL ON", "INJECTION", "DROPS"];

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState([]);
  const [masterProductNames, setMasterProductNames] = useState([]); // matches from the PO master list
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
    remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [prefillNotice, setPrefillNotice] = useState("");

  // Live preview of the last PO for the typed product name — searched only
  // against past purchase orders, never the product catalog. Read-only:
  // nothing here touches the form automatically, the user copies values in
  // with a button.
  const [lastPoPreview, setLastPoPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    apiFetch("/admin/manufacturers")
      .then((mfrs) => setManufacturers(Array.isArray(mfrs) ? mfrs : []))
      .catch(() => {});
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

  // Debounced: the last PO for this exact name (exact match only), plus
  // name matches from the PO master list (searched server-side — it's
  // 1800+ rows, too many to load client-side — a name suggestion list,
  // not autofill of other fields).
  useEffect(() => {
    const name = form.product_name.trim();
    if (!name) {
      setLastPoPreview(null);
      setMasterProductNames([]);
      return;
    }
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      Promise.all([
        apiFetch(`/admin/purchase-orders/last-by-product?product_name=${encodeURIComponent(name)}`).catch(() => null),
        apiFetch(`/admin/purchase-order-master/product-names?search=${encodeURIComponent(name)}&limit=15`).catch(() => []),
      ]).then(([lastPo, masterNames]) => {
        setLastPoPreview(lastPo || null);
        setMasterProductNames(Array.isArray(masterNames) ? masterNames : []);
      }).finally(() => setPreviewLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [form.product_name]);

  // The master list stores manufacturer as a plain `company` name (no FK) —
  // resolve it to an id the <select> can use.
  const resolveManufacturerId = (last) => {
    if (last.company) {
      const match = manufacturers.find((m) => m.name.toLowerCase() === last.company.toLowerCase());
      if (match) return match.id;
    }
    return null;
  };

  const buildPrefillPatch = (last, prev) => ({
    quantity: last.quantity != null ? String(last.quantity) : prev.quantity,
    mrp: last.mrp != null ? String(last.mrp) : prev.mrp,
    rate: last.rate != null ? String(last.rate) : prev.rate,
    specifications: last.specifications || prev.specifications,
    type: last.type || prev.type,
    manufacturer_id: resolveManufacturerId(last) || prev.manufacturer_id,
    category: last.category || prev.category,
  });

  const applyLastPoValues = () => {
    if (!lastPoPreview) return;
    setForm((prev) => ({ ...prev, ...buildPrefillPatch(lastPoPreview, prev) }));
    setPrefillNotice(`po:Copied values from ${lastPoPreview.po_number}`);
  };

  // Prefill only fires when the user explicitly picks a name from the
  // dropdown — never on free-typed text, and only on an exact product_id or
  // exact-name match server-side. A fuzzy/partial match used to run on
  // every blur and could silently pull in fields from an unrelated,
  // similarly-named product.
  const selectProduct = async (name) => {
    setForm((prev) => ({ ...prev, product_id: null, product_name: name }));
    setShowProductDropdown(false);
    setPrefillNotice("");

    try {
      const last = await apiFetch(`/admin/purchase-orders/last-by-product?product_name=${encodeURIComponent(name)}`);
      if (last) {
        setForm((prev) => ({ ...prev, product_name: name, ...buildPrefillPatch(last, prev) }));
        setPrefillNotice(`po:Prefilled from ${last.po_number} (${new Date(last.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`);
      } else {
        setPrefillNotice("none:No previous PO found for this product");
      }
    } catch {
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
      // Goes straight into the PO master list now (not a separate
      // purchase_orders table) — see purchaseOrderMasterModel.go.
      const res = await apiFetch("/admin/purchase-order-master", {
        method: "POST",
        body: JSON.stringify({
          po_date: form.po_date,
          product_name: form.product_name.trim(),
          quantity: parseInt(form.quantity) || 0,
          mrp: form.mrp ? parseFloat(form.mrp) : null,
          rate: form.rate ? parseFloat(form.rate) : null,
          specifications: form.specifications.trim() || null,
          type: form.type || null,
          manufacturer_id: form.manufacturer_id,
          category: form.category || null,
          remarks: form.remarks.trim() || null,
        }),
      });
      router.push(`/panel/purchase-order-master?highlight=${res.id}`);
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
              value={form.product_name}
              onChange={(e) => {
                setForm({ ...form, product_name: e.target.value, product_id: null });
                setShowProductDropdown(true);
                setPrefillNotice("");
              }}
              onFocus={() => setShowProductDropdown(true)}
              placeholder="Search or type product name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            {showProductDropdown && masterProductNames.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {masterProductNames.map((name) => (
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
            <p className="text-[11px] text-gray-400 mt-1">
              Pick a name from the list to prefill from its last PO, or type a new product name
            </p>
            {prefillNotice && (() => {
              const [type, ...rest] = prefillNotice.split(":");
              const msg = rest.join(":");
              if (type === "po") return <p className="text-[11px] mt-1 text-green-600">{"\u2713 "}{msg}</p>;
              if (type === "catalog") return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
              return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
            })()}

            {/* Live preview: last PO for this exact name (searched only against past POs) */}
            {form.product_name.trim() && (
              <div className="mt-3 space-y-2">
                {previewLoading && <p className="text-[11px] text-gray-400">Searching...</p>}

                {!previewLoading && lastPoPreview && (
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                        Last PO for &quot;{form.product_name.trim()}&quot;
                      </p>
                      <button
                        type="button"
                        onClick={applyLastPoValues}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Use these values
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                      <span>{lastPoPreview.po_number} &middot; {new Date(lastPoPreview.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      <span>{lastPoPreview.manufacturer_name || lastPoPreview.company || "\u2014"}</span>
                      <span>Qty: {lastPoPreview.quantity}</span>
                      <span>Rate: {lastPoPreview.rate != null ? `\u20b9${Number(lastPoPreview.rate).toFixed(2)}` : "\u2014"}</span>
                      <span>MRP: {lastPoPreview.mrp != null && Number.isFinite(Number(lastPoPreview.mrp)) ? `\u20b9${Number(lastPoPreview.mrp).toFixed(2)}` : (lastPoPreview.mrp || "\u2014")}</span>
                      <span>Status: {lastPoPreview.status}</span>
                    </div>
                  </div>
                )}

                {!previewLoading && !lastPoPreview && (
                  <p className="text-[11px] text-gray-400">No previous PO found for this name.</p>
                )}
              </div>
            )}
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

          {/* Category */}
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
            onClick={() => router.push("/panel/purchase-orders")}
            className="px-6 py-2.5 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
