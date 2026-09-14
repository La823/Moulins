"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 20;

// For each PO, lets staff assign a product type (defined in Product
// Specifications) and fill in that type's fields — stored as a JSON blob
// keyed by field id on purchase_order_master.specifications.
export default function POSpecificationsPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [types, setTypes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // Pending, unsaved edits per row — { [rowId]: { pms_type_id, values: { [fieldId]: value } } }
  const [drafts, setDrafts] = useState({});
  const [savingFor, setSavingFor] = useState(null);

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
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    apiFetch(`/admin/purchase-order-master/specifications?${params.toString()}`)
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
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function typeById(id) {
    return types.find((t) => t.id === id) || null;
  }

  function draftFor(row) {
    if (drafts[row.id]) return drafts[row.id];
    const values = {};
    if (row.specifications) {
      try {
        Object.assign(values, JSON.parse(row.specifications));
      } catch {
        // ignore malformed stored blob, start fresh
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

  function toggleRow(row) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  async function saveRow(row) {
    const draft = draftFor(row);
    setSavingFor(row.id);
    setError("");
    try {
      await apiFetch(`/admin/purchase-order-master/${row.id}/specifications`, {
        method: "PATCH",
        body: JSON.stringify({
          pms_type_id: draft.pms_type_id,
          specifications: draft.pms_type_id ? draft.values : null,
        }),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                pms_type_id: draft.pms_type_id,
                specifications: draft.pms_type_id ? JSON.stringify(draft.values) : null,
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
          <h2 className="text-lg font-semibold text-gray-900">PO Specifications</h2>
          <p className="text-sm text-gray-500">
            {total.toLocaleString()} entries. Assign a product type per PO, then fill in that type's specification
            fields — defined under Product Specifications.
          </p>
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search product name…"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
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
                  <span className="font-medium text-gray-900 text-sm">{row.po_number}</span>
                  <span className="text-sm text-gray-600">{row.product_name}</span>
                  <span className="text-xs text-gray-400">{row.company}</span>
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
                      {type.fields.map((f) => (
                        <div key={f.id}>
                          <label className="block text-xs text-gray-500 mb-1">{f.field_name}</label>
                          {f.field_type === "text" && (
                            <input
                              type="text"
                              value={draft.values[f.id] ?? ""}
                              onChange={(e) => setFieldValue(row, f.id, e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                          )}
                          {f.field_type === "boolean" && (
                            <select
                              value={draft.values[f.id] === true ? "true" : draft.values[f.id] === false ? "false" : ""}
                              onChange={(e) =>
                                setFieldValue(row, f.id, e.target.value === "" ? null : e.target.value === "true")
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                            >
                              <option value="">—</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          )}
                          {f.field_type === "dropdown" && (
                            <select
                              value={draft.values[f.id] ?? ""}
                              onChange={(e) => setFieldValue(row, f.id, e.target.value || null)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                            >
                              <option value="">—</option>
                              {f.options.map((o) => (
                                <option key={o.id} value={o.option_value}>
                                  {o.option_value}
                                </option>
                              ))}
                            </select>
                          )}
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
        {!loading && rows.length === 0 && <p className="text-sm text-gray-500 px-2 py-6">No entries.</p>}
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
