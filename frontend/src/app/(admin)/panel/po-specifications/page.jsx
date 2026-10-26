"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import SpecFieldInput, { SpecFieldLabel, missingRequired, visibleFieldIds, withoutHidden } from "@/components/admin/SpecFieldInput";

const PAGE_SIZE = 20;

// For each catalog product, lets staff assign a product type (defined under
// Product Specifications) and fill in that type's fields — stored as a JSON
// blob keyed by field id on products.pms_specifications.
export default function ProductSpecAssignmentPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [hasSpec, setHasSpec] = useState(""); // "", "true", "false"
  const [sortDir, setSortDir] = useState("desc"); // "desc" (newest serial first) | "asc"

  const [types, setTypes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // Pending, unsaved edits per row — { [rowId]: { pms_type_id, values: { [fieldId]: value } } }
  const [drafts, setDrafts] = useState({});
  const [savingFor, setSavingFor] = useState(null);
  const [uploadingFieldId, setUploadingFieldId] = useState(null);

  useEffect(() => {
    apiFetch("/admin/product-specs/types")
      .then((data) => setTypes(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sortDir });
    if (search) params.set("search", search);
    if (hasSpec) params.set("hasSpec", hasSpec);
    apiFetch(`/admin/product-specs/products?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows || []);
        setTotal(data.total || 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, search, hasSpec, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function typeById(id) {
    return types.find((t) => t.id === id) || null;
  }

  function draftFor(row) {
    if (drafts[row.id]) return drafts[row.id];
    let values = {};
    if (row.specifications) {
      // The API returns specifications as a JSON object already (it's
      // json.RawMessage server-side, embedded directly into the response,
      // not a JSON-encoded string) — only parse it if it somehow does come
      // back as a string, otherwise use it as-is.
      try {
        values = typeof row.specifications === "string" ? JSON.parse(row.specifications) : row.specifications;
      } catch {
        values = {};
      }
    }
    return { pms_type_id: row.pms_type_id ?? null, values };
  }

  function setDraft(rowId, updater) {
    setDrafts((prev) => {
      const base = prev[rowId] || draftFor(rows.find((r) => r.id === rowId));
      return { ...prev, [rowId]: updater(base) };
    });
  }

  function selectType(row, typeId) {
    setDraft(row.id, (d) => ({ ...d, pms_type_id: typeId, values: {} }));
  }

  function setFieldValue(row, fieldId, value) {
    setDraft(row.id, (d) => ({ ...d, values: { ...d.values, [fieldId]: value } }));
  }

  // uploads an image field's file and returns its URL (SpecFieldInput sets it)
  async function uploadFieldImage(fieldId, file) {
    setUploadingFieldId(fieldId);
    setError("");
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
  }

  function toggleRow(row) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  async function saveRow(row) {
    const draft = draftFor(row);
    const missing = missingRequired(typeById(draft.pms_type_id)?.fields, draft.values);
    if (missing.length) {
      setError(`${row.name}: please fill in the required fields: ${missing.join(", ")}`);
      return;
    }
    setSavingFor(row.id);
    setError("");
    try {
      await apiFetch(`/admin/product-specs/products/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          pms_type_id: draft.pms_type_id,
          specifications: draft.pms_type_id ? withoutHidden(typeById(draft.pms_type_id)?.fields, draft.values) : null,
        }),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                pms_type_id: draft.pms_type_id,
                specifications: draft.pms_type_id ? withoutHidden(typeById(draft.pms_type_id)?.fields, draft.values) : null,
              }
            : r
        )
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingFor(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Set Product Specifications</h2>
          <p className="text-sm text-gray-500">
            {total.toLocaleString()} products. Assign a product type per product, then fill in that type's
            specification fields — defined under Product Specifications.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search product name…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <select
            value={hasSpec}
            onChange={(e) => {
              setHasSpec(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All products</option>
            <option value="true">Has specs assigned</option>
            <option value="false">No specs assigned</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => {
              setSortDir(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="desc">Serial ID: High to Low</option>
            <option value="asc">Serial ID: Low to High</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-500 mb-4">Loading…</p>}

      <div className="space-y-2">
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const draft = draftFor(row);
          const type = typeById(draft.pms_type_id);
          const isDirty = !!drafts[row.id];
          return (
            <div key={row.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleRow(row)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                  <span className="text-xs text-gray-400 font-mono">#{row.product_id}</span>
                  <span className="font-medium text-gray-900 text-sm">{row.name}</span>
                  {row.marg_code && <span className="text-xs text-gray-400">{row.marg_code}</span>}
                </div>
                <span className="text-xs text-gray-400">
                  {type ? type.name : row.pms_type_id ? "Unknown type" : "No type assigned"}
                </span>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Product type</label>
                    <select
                      value={draft.pms_type_id ?? ""}
                      onChange={(e) => selectType(row, e.target.value ? Number(e.target.value) : null)}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value="">— None —</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {type && type.fields.length === 0 && (
                    <p className="text-xs text-gray-400">This type has no specification fields defined yet.</p>
                  )}

                  {type && type.fields.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {type.fields.filter((f) => visibleFieldIds(type.fields, draft.values).has(f.id)).map((f) => (
                        <div key={f.id}>
                          <SpecFieldLabel field={f} className="block text-xs text-gray-500 mb-1" />
                          <SpecFieldInput
                            field={f}
                            value={draft.values[f.id]}
                            onChange={(v) => setFieldValue(row, f.id, v)}
                            onUpload={(file) => uploadFieldImage(f.id, file)}
                            uploading={uploadingFieldId === f.id}
                            size="xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={!isDirty || savingFor === row.id}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      {savingFor === row.id ? "Saving…" : "Save"}
                    </button>
                    {isDirty && (
                      <button
                        onClick={() =>
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[row.id];
                            return next;
                          })
                        }
                        disabled={savingFor === row.id}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && rows.length === 0 && <p className="text-sm text-gray-500 px-2 py-6">No products found.</p>}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-500">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500 px-1">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
