"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import SpecFieldInput, {
  SpecFieldLabel,
  SpecFieldComment,
  commentKey,
  missingRequired,
  visibleFieldIds,
  withoutHidden,
  hiddenWithValues,
} from "@/components/admin/SpecFieldInput";

const CATEGORIES = ["Ortho", "Neuro", "Gastro", "Respiratory", "Dema", "Gynae", "General", "Misc", "Cardio", "Diabetic"];
const TYPES = ["TABLET", "CAPSULE", "SOFTGEL CAPSULE", "SACHET", "DRY SYRUP", "SYRUP", "OINTMENT", "SPRAY", "ROLL ON", "INJECTION", "DROPS"];

// The product is now picked from the product catalog (not the PO master
// list's names), and its specifications are brought onto the PO. The older
// name-search / spec-preview code below is kept, switched off by this flag,
// until the new flow has settled.
const USE_CATALOG = true;

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  // ?blank=1 — a brand-new product with no PO history: skip every lookup
  // (last PO, name suggestions, spec preview) and just leave every field
  // for manual entry. Nothing to prefill from, so nothing to fetch.
  const isBlank = useSearchParams().get("blank") === "1";
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

  // Product Specifications preview — whatever spec type/values are already
  // assigned to the matching catalog product (set on the "Set Product
  // Specifications" page). Read-only here: it's shown so staff know what
  // will get snapshotted onto the PO on submit, nothing to edit from here.
  const [productSpecPreview, setProductSpecPreview] = useState(null);
  const [pmsTypes, setPmsTypes] = useState([]);

  // Catalog flow: search results, the picked product, and its
  // specifications (its form's fields + the product's default values),
  // which can be changed for this PO — and optionally saved back as the
  // product's defaults.
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productSpecs, setProductSpecs] = useState(null); // { product_form, type: {fields}, ... }
  const [specValues, setSpecValues] = useState({});
  const [specsLoading, setSpecsLoading] = useState(false);
  const [saveSpecsAsDefault, setSaveSpecsAsDefault] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState(null);
  const [composition, setComposition] = useState("");
  // "Save as product's default" — straight from the specifications box
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState(null); // { ok, text }

  useEffect(() => {
    apiFetch("/admin/manufacturers")
      .then((mfrs) => setManufacturers(Array.isArray(mfrs) ? mfrs : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/admin/product-specs/types")
      .then((data) => setPmsTypes(data || []))
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
    if (isBlank || USE_CATALOG) return;
    const name = form.product_name.trim();
    if (!name) {
      setLastPoPreview(null);
      setMasterProductNames([]);
      setProductSpecPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      Promise.all([
        apiFetch(`/admin/purchase-orders/last-by-product?product_name=${encodeURIComponent(name)}`).catch(() => null),
        apiFetch(`/admin/purchase-order-master/product-names?search=${encodeURIComponent(name)}&limit=15`).catch(() => []),
        apiFetch(`/admin/product-specs/products/by-name?name=${encodeURIComponent(name)}`).catch(() => null),
        // The spec preview (and the snapshot copied onto the PO at creation)
        // only match on the *exact* catalog product name — mix in real
        // catalog names here so picking a suggestion actually lands on a
        // name that matches, instead of staff free-typing something close
        // that silently never matches anything.
        apiFetch(`/admin/products?search=${encodeURIComponent(name)}&limit=10`).catch(() => null),
      ]).then(([lastPo, masterNames, spec, catalogRes]) => {
        setLastPoPreview(lastPo || null);
        const catalogNames = (catalogRes?.products || []).map((p) => p.name);
        const merged = [...catalogNames, ...(Array.isArray(masterNames) ? masterNames : [])];
        setMasterProductNames([...new Set(merged)]);
        setProductSpecPreview(spec || null);
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

  // Catalog search, debounced. Only while nothing is picked — picking a
  // product fills the box with its name.
  useEffect(() => {
    if (isBlank || !USE_CATALOG || selectedProduct) return;
    const q = form.product_name.trim();
    if (!q) {
      setCatalogResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setCatalogSearching(true);
      apiFetch(`/admin/purchase-order-master/catalog-products?search=${encodeURIComponent(q)}&limit=20`)
        .then((list) => !cancelled && setCatalogResults(Array.isArray(list) ? list : []))
        .catch(() => !cancelled && setCatalogResults([]))
        .finally(() => !cancelled && setCatalogSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.product_name, selectedProduct, isBlank]);

  // Picking a catalog product: name, Type (its form), Packing, MRP and
  // Composition from the catalog; Quantity, Rate, Manufacturer and Category
  // from the last PO for it; and its specifications, ready to edit.
  const selectCatalogProduct = async (p) => {
    setSelectedProduct(p);
    setShowProductDropdown(false);
    setCatalogResults([]);
    setPrefillNotice("");
    setComposition(p.key_ingredients || "");
    setSaveSpecsAsDefault(false);
    // A new pick starts clean: nothing left over from the previous product.
    // The catalog fills type / packing / MRP; the last PO (below), if there
    // is one, fills quantity / rate / manufacturer / category.
    setDefaultMsg(null);
    setForm((prev) => ({
      ...prev,
      product_id: p.id,
      product_name: p.name,
      quantity: 0,
      rate: "",
      manufacturer_id: "",
      category: "",
      remarks: "",
      type: p.product_form || "",
      specifications: p.pack_size || "",
      mrp: p.mrp != null ? String(p.mrp) : "",
    }));

    setSpecsLoading(true);
    setProductSpecs(null);
    setSpecValues({});
    apiFetch(`/admin/purchase-order-master/catalog-products/${p.id}`)
      .then((d) => {
        const specs = d?.specs || null;
        setProductSpecs(specs);
        let v = specs?.specifications || {};
        if (typeof v === "string") {
          try {
            v = JSON.parse(v);
          } catch {
            v = {};
          }
        }
        // defaults saved under a different form's type don't apply
        setSpecValues(specs?.type && specs.saved_pms_type_id === specs.type.id ? v || {} : {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setSpecsLoading(false));

    try {
      const last = await apiFetch(`/admin/purchase-orders/last-by-product?product_name=${encodeURIComponent(p.name)}`);
      setLastPoPreview(last || null);
      if (last) {
        setForm((prev) => ({
          ...prev,
          quantity: last.quantity != null ? String(last.quantity) : prev.quantity,
          rate: last.rate != null ? String(last.rate) : prev.rate,
          manufacturer_id: resolveManufacturerId(last) || prev.manufacturer_id,
          category: last.category || prev.category,
        }));
        setPrefillNotice(
          `po:Quantity, rate and manufacturer from ${last.po_number} (${new Date(last.po_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})`
        );
      } else {
        setPrefillNotice("none:No previous PO for this product");
      }
    } catch {
      setLastPoPreview(null);
      setPrefillNotice("none:No previous PO for this product");
    }
  };

  const clearSelectedProduct = () => {
    setSelectedProduct(null);
    setProductSpecs(null);
    setSpecValues({});
    setLastPoPreview(null);
    setComposition("");
    setPrefillNotice("");
  };

  const uploadSpecImage = async (fieldId, file) => {
    setUploadingFieldId(fieldId);
    try {
      const { upload_url, image_url } = await apiFetch("/admin/product-specs/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      return image_url;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setUploadingFieldId(null);
    }
  };

  // Saves what's in the specifications box as the product's own defaults,
  // right away — no PO needed. Same rules as the product page.
  const saveAsProductDefault = async () => {
    const missing = missingRequired(specFields, specValues);
    if (missing.length) {
      setDefaultMsg({ ok: false, text: `Fill in the required fields first: ${missing.join(", ")}` });
      return;
    }
    setSavingDefault(true);
    setDefaultMsg(null);
    try {
      const updated = await apiFetch(`/admin/purchase-order-master/catalog-products/${selectedProduct.id}/specifications`, {
        method: "PUT",
        body: JSON.stringify({ specifications: withoutHidden(specFields, specValues) }),
      });
      if (updated) setProductSpecs(updated);
      setDefaultMsg({ ok: true, text: `Saved as ${selectedProduct.name}'s default specifications` });
    } catch (err) {
      setDefaultMsg({ ok: false, text: err.message });
    } finally {
      setSavingDefault(false);
    }
  };

  const specFields = productSpecs?.type?.fields || [];
  const shownSpecIds = visibleFieldIds(specFields, specValues);

  const estimate = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.manufacturer_id || !form.product_name.trim()) {
      setError("Manufacturer and product name are required");
      return;
    }
    if (USE_CATALOG && !isBlank && !selectedProduct) {
      setError("Pick the product from the catalog list");
      return;
    }
    const missing = missingRequired(specFields, specValues);
    if (missing.length) {
      setError(`Please fill in the required specifications: ${missing.join(", ")}`);
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
          // catalog flow: the product by id, its composition, and the
          // specifications as set on this page
          ...(selectedProduct
            ? {
                catalog_product_id: selectedProduct.id,
                composition: composition.trim() || null,
                pms_specifications: productSpecs?.type ? withoutHidden(specFields, specValues) : null,
                save_specs_as_default: saveSpecsAsDefault,
              }
            : {}),
        }),
      });
      if (res.default_specs_saved === false) {
        alert(`${res.po_number} was created, but the product's default specifications weren't updated: ${res.default_specs_error}`);
      }
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
        {isBlank && (
          <p className="text-xs text-gray-400 mt-0.5">
            New product — all fields start blank, nothing gets looked up or prefilled.
          </p>
        )}
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
                if (USE_CATALOG && selectedProduct) clearSelectedProduct();
                if (!isBlank) setShowProductDropdown(true);
                setPrefillNotice("");
              }}
              onFocus={() => !isBlank && setShowProductDropdown(true)}
              placeholder={
                isBlank
                  ? "Enter the new product's name..."
                  : USE_CATALOG
                  ? "Search the product catalog by name or code..."
                  : "Search or type product name..."
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            {/* catalog products — the only choices under the catalog flow */}
            {USE_CATALOG && !isBlank && showProductDropdown && !selectedProduct && form.product_name.trim() && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                {catalogSearching && catalogResults.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">Searching the catalog…</p>
                )}
                {!catalogSearching && catalogResults.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">
                    No catalog product matches. A brand-new product goes through{" "}
                    <a href="/panel/purchase-orders/new?blank=1" className="text-blue-600 hover:underline">
                      New product PO
                    </a>
                    .
                  </p>
                )}
                {catalogResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectCatalogProduct(p)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span className={`block text-sm truncate ${p.is_active ? "text-gray-900" : "text-gray-400"}`}>
                      {p.name}
                      {!p.is_active && " (inactive)"}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {[p.product_form, p.pack_size, p.inventory_code || p.marg_code].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!USE_CATALOG && !isBlank && showProductDropdown && masterProductNames.length > 0 && (
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
            {isBlank ? (
              <p className="text-[11px] text-gray-400 mt-1">
                New product \u2014 nothing to prefill, fill in every field below manually.
              </p>
            ) : USE_CATALOG ? (
              <p className="text-[11px] text-gray-400 mt-1">
                {selectedProduct ? (
                  <>
                    Catalog product{selectedProduct.product_form ? ` · ${selectedProduct.product_form}` : ""}
                    {selectedProduct.inventory_code ? ` · ${selectedProduct.inventory_code}` : ""} —{" "}
                    <button type="button" onClick={() => { clearSelectedProduct(); setForm((f) => ({ ...f, product_name: "", product_id: null })); }} className="text-blue-600 hover:underline">
                      change
                    </button>
                  </>
                ) : (
                  "Pick the product from the catalog — its type, packing, MRP, composition and specifications fill in"
                )}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-1">
                Pick a name from the list to prefill from its last PO, or type a new product name
              </p>
            )}
            {!isBlank && prefillNotice && (() => {
              const [type, ...rest] = prefillNotice.split(":");
              const msg = rest.join(":");
              if (type === "po") return <p className="text-[11px] mt-1 text-green-600">{"\u2713 "}{msg}</p>;
              if (type === "catalog") return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
              return <p className="text-[11px] mt-1 text-gray-400">{msg}</p>;
            })()}

            {/* Live preview: last PO for this exact name (searched only against past POs) */}
            {!isBlank && form.product_name.trim() && (!USE_CATALOG || selectedProduct) && (
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

                {!USE_CATALOG && !previewLoading && !lastPoPreview && (
                  <p className="text-[11px] text-gray-400">No previous PO found for this name.</p>
                )}

                {!USE_CATALOG && !previewLoading && productSpecPreview && (() => {
                  const pmsType = pmsTypes.find((t) => t.id === productSpecPreview.pms_type_id);
                  const specs = productSpecPreview.specifications || {};
                  return (
                    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                      <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wider mb-2">
                        Product Specifications{pmsType ? ` — ${pmsType.name}` : ""}
                      </p>
                      {pmsType && pmsType.fields.length > 0 ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                          {pmsType.fields.map((f) => {
                            const raw = specs[f.id];
                            if (f.field_type === "image") {
                              return (
                                <span key={f.id} className="flex items-center gap-1.5">
                                  {f.field_name}:{" "}
                                  {raw ? (
                                    <img src={raw} alt={f.field_name} className="h-8 w-8 object-cover rounded border border-blue-200" />
                                  ) : (
                                    <span className="font-medium">—</span>
                                  )}
                                </span>
                              );
                            }
                            const value =
                              f.field_type === "boolean"
                                ? raw === true
                                  ? "Yes"
                                  : raw === false
                                  ? "No"
                                  : "—"
                                : raw ?? "—";
                            return (
                              <span key={f.id}>
                                {f.field_name}: <span className="font-medium">{value}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          This product&apos;s assigned type has no specification fields defined.
                        </p>
                      )}
                      <p className="text-[10px] text-blue-600 mt-2">
                        This will be copied onto the PO automatically when created.
                      </p>
                    </div>
                  );
                })()}
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
                {/* the picked product's form, when it isn't one of the fixed names */}
                {form.type && !TYPES.includes(form.type) && <option value={form.type}>{form.type}</option>}
              </select>
            </div>
          </div>

          {USE_CATALOG && selectedProduct && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Composition</label>
              <input
                type="text"
                value={composition}
                onChange={(e) => setComposition(e.target.value)}
                placeholder="e.g. Rifaximin 200 mg + Ornidazole 400 mg"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <p className="text-[11px] text-gray-400 mt-1">From the catalog — printed on the PO PDF.</p>
            </div>
          )}

          {/* The product's specifications, from its form's fields — filled
              with the product's defaults, changeable for this PO */}
          {USE_CATALOG && selectedProduct && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                  Product specifications{productSpecs?.type ? ` — ${productSpecs.type.name}` : ""}
                </p>
                {specsLoading && <span className="text-[11px] text-gray-400">Loading…</span>}
              </div>
              {!specsLoading && !productSpecs?.product_form_id && (
                <p className="text-xs text-gray-500">This product has no form set, so it has no specification fields.</p>
              )}
              {!specsLoading && productSpecs?.product_form_id && !productSpecs?.type?.fields?.length && (
                <p className="text-xs text-gray-500">
                  No specification fields are set up for {productSpecs.product_form} yet.
                </p>
              )}
              {!specsLoading && specFields.length > 0 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {specFields
                      .filter((f) => shownSpecIds.has(f.id))
                      .map((f) => (
                        <div key={f.id}>
                          <SpecFieldLabel field={f} />
                          <SpecFieldInput
                            field={f}
                            value={specValues[f.id]}
                            onChange={(v) => setSpecValues((prev) => ({ ...prev, [f.id]: v }))}
                            onUpload={(file) => uploadSpecImage(f.id, file)}
                            uploading={uploadingFieldId === f.id}
                          />
                          <SpecFieldComment
                            value={specValues[commentKey(f.id)]}
                            onChange={(v) => setSpecValues((prev) => ({ ...prev, [commentKey(f.id)]: v }))}
                          />
                        </div>
                      ))}
                  </div>
                  {hiddenWithValues(specFields, specValues).length > 0 && (
                    <p className="text-[11px] text-gray-500">
                      Answers in hidden fields ({hiddenWithValues(specFields, specValues).map((f) => f.field_name).join(", ")}) won&apos;t be saved.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={saveAsProductDefault}
                      disabled={savingDefault}
                      className="px-3 py-1.5 border border-blue-300 bg-white text-blue-700 rounded-md text-xs font-medium hover:bg-blue-50 disabled:opacity-50"
                    >
                      {savingDefault ? "Saving…" : "Save as product's default"}
                    </button>
                    {defaultMsg && (
                      <span className={`text-xs ${defaultMsg.ok ? "text-green-700" : "text-red-600"}`}>
                        {defaultMsg.ok ? "✓ " : ""}
                        {defaultMsg.text}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Filled from {selectedProduct.name}&apos;s default specifications (empty fields are ones not set yet).
                    Changes here go on this PO; press &quot;Save as product&apos;s default&quot; to also keep them as the
                    product&apos;s defaults.
                  </p>
                </>
              )}
            </div>
          )}

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
