"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "boolean", label: "Boolean (yes/no)" },
  { value: "dropdown", label: "Dropdown" },
];

// Config UI for Product Manufacturer Specifications (PMS): define product
// types (capsule, tablet, syrup, ...), each with its own set of
// specification fields (text/boolean/dropdown), and for dropdown fields the
// persisted list of options. This only defines the shape — per-PO values
// are entered/stored elsewhere.
export default function ProductSpecificationsPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTypeId, setExpandedTypeId] = useState(null);

  const [newTypeName, setNewTypeName] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  const [newField, setNewField] = useState({}); // { [typeId]: { field_name, field_type } }
  const [creatingFieldFor, setCreatingFieldFor] = useState(null);

  const [newOption, setNewOption] = useState({}); // { [fieldId]: value }
  const [creatingOptionFor, setCreatingOptionFor] = useState(null);

  function loadTypes() {
    setLoading(true);
    setError("");
    apiFetch("/admin/product-specs/types")
      .then((data) => setTypes(data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function createType() {
    const name = newTypeName.trim();
    if (!name) return;
    setCreatingType(true);
    setError("");
    try {
      await apiFetch("/admin/product-specs/types", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewTypeName("");
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingType(false);
    }
  }

  async function deleteType(id) {
    if (!confirm("Delete this product type and all of its specification fields?")) return;
    setError("");
    try {
      await apiFetch(`/admin/product-specs/types/${id}`, { method: "DELETE" });
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createField(typeId) {
    const draft = newField[typeId] || {};
    const fieldName = (draft.field_name || "").trim();
    const fieldType = draft.field_type || "text";
    if (!fieldName) return;
    setCreatingFieldFor(typeId);
    setError("");
    try {
      await apiFetch(`/admin/product-specs/types/${typeId}/fields`, {
        method: "POST",
        body: JSON.stringify({ field_name: fieldName, field_type: fieldType, sort_order: 0 }),
      });
      setNewField((prev) => ({ ...prev, [typeId]: { field_name: "", field_type: "text" } }));
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingFieldFor(null);
    }
  }

  async function deleteField(id) {
    if (!confirm("Delete this specification field and any dropdown options on it?")) return;
    setError("");
    try {
      await apiFetch(`/admin/product-specs/fields/${id}`, { method: "DELETE" });
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createOption(fieldId) {
    const value = (newOption[fieldId] || "").trim();
    if (!value) return;
    setCreatingOptionFor(fieldId);
    setError("");
    try {
      await apiFetch(`/admin/product-specs/fields/${fieldId}/options`, {
        method: "POST",
        body: JSON.stringify({ option_value: value, sort_order: 0 }),
      });
      setNewOption((prev) => ({ ...prev, [fieldId]: "" }));
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingOptionFor(null);
    }
  }

  async function deleteOption(id) {
    setError("");
    try {
      await apiFetch(`/admin/product-specs/options/${id}`, { method: "DELETE" });
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Product Specifications</h2>
        <p className="text-sm text-gray-500">
          Define a set of specification fields per product type (capsule, tablet, syrup, ...) — each field can be
          text, a yes/no boolean, or a dropdown with its own persisted options.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-2">
        <input
          type="text"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createType();
          }}
          placeholder="New product type name, e.g. Capsule"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          onClick={createType}
          disabled={creatingType || !newTypeName.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {creatingType ? "Adding…" : "Add Type"}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && types.length === 0 && (
        <p className="text-sm text-gray-500">No product types defined yet.</p>
      )}

      <div className="space-y-3">
        {types.map((t) => {
          const isExpanded = expandedTypeId === t.id;
          const draft = newField[t.id] || { field_name: "", field_type: "text" };
          return (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedTypeId(isExpanded ? null : t.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                  <span className="font-medium text-gray-900 text-sm">{t.name}</span>
                  <span className="text-xs text-gray-400">
                    {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteType(t.id);
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete type
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {t.fields.length === 0 && (
                    <p className="text-xs text-gray-400">No specification fields yet.</p>
                  )}
                  {t.fields.map((f) => (
                    <div key={f.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 font-medium">{f.field_name}</span>
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {f.field_type}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteField(f.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete field
                        </button>
                      </div>

                      {f.field_type === "dropdown" && (
                        <div className="mt-2 pl-1">
                          <ul className="space-y-1 mb-2">
                            {f.options.map((o) => (
                              <li key={o.id} className="flex items-center justify-between text-xs text-gray-700">
                                <span>{o.option_value}</span>
                                <button
                                  onClick={() => deleteOption(o.id)}
                                  className="text-gray-400 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                            {f.options.length === 0 && (
                              <li className="text-xs text-gray-400">No options yet.</li>
                            )}
                          </ul>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newOption[f.id] || ""}
                              onChange={(e) => setNewOption((prev) => ({ ...prev, [f.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") createOption(f.id);
                              }}
                              placeholder="New option value"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                            <button
                              onClick={() => createOption(f.id)}
                              disabled={creatingOptionFor === f.id || !(newOption[f.id] || "").trim()}
                              className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={draft.field_name}
                      onChange={(e) =>
                        setNewField((prev) => ({ ...prev, [t.id]: { ...draft, field_name: e.target.value } }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createField(t.id);
                      }}
                      placeholder="New field name"
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    <select
                      value={draft.field_type}
                      onChange={(e) =>
                        setNewField((prev) => ({ ...prev, [t.id]: { ...draft, field_type: e.target.value } }))
                      }
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {ft.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => createField(t.id)}
                      disabled={creatingFieldFor === t.id || !draft.field_name.trim()}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      {creatingFieldFor === t.id ? "Adding…" : "Add Field"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
