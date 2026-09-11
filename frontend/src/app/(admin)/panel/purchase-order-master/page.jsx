"use client";

import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 40;

// sortKey mirrors the backend's SortableColumns map — only these columns
// are sortable server-side; the rest render as plain (non-clickable) headers.
const COLUMNS = [
  { key: "sr_no", label: "SR NO", sortKey: "sr_no" },
  { key: "po_date", label: "P-O Date", sortKey: "po_date" },
  { key: "po_number", label: "P-O Number", sortKey: "po_number" },
  { key: "product_name", label: "Product Name", sortKey: "product_name" },
  { key: "product_code", label: "Product Code" },
  { key: "composition", label: "Composition" },
  { key: "quantity", label: "Quantity", sortKey: "quantity" },
  { key: "mrp", label: "MRP" },
  { key: "mrp_unit_id", label: "MRP Unit" },
  { key: "rate", label: "Rate", sortKey: "rate" },
  { key: "estimate", label: "Estimate", sortKey: "estimate" },
  { key: "specifications", label: "Specifications" },
  { key: "type", label: "Type", sortKey: "type" },
  { key: "company", label: "Company", sortKey: "company" },
  { key: "qty_received", label: "Qty Received", sortKey: "qty_received" },
  { key: "remarks", label: "Remarks" },
  { key: "category", label: "Category", sortKey: "category" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "time_stamp_date", label: "Time Stamp Date", sortKey: "time_stamp_date" },
  { key: "time_stamp_time", label: "Time Stamp Time" },
  { key: "days_diff", label: "Days Diff" },
  { key: "bill_number", label: "Bill Number", sortKey: "bill_number" },
];

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value) {
  if (!value) return "";
  return value.slice(0, 5);
}

function cellValue(row, key) {
  if (key === "po_date" || key === "time_stamp_date") return formatDate(row[key]);
  if (key === "time_stamp_time") return formatTime(row[key]);
  return row[key] ?? "";
}

// Plain raw-data viewer for the one-off import of the old "Moulins" PO
// tracking sheet (migration 108) — read-only, no editing, just a paginated
// table so the master list is browsable without opening the spreadsheet.
export default function PurchaseOrderMasterPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight") ? Number(searchParams.get("highlight")) : null;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [missingProductCode, setMissingProductCode] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Default to sr_no-descending (latest first) — also means a newly-created
  // PO (always the highest sr_no) lands on page 1 when arriving with ?highlight=.
  const [sortBy, setSortBy] = useState("sr_no");
  const [sortDir, setSortDir] = useState("desc");
  const [units, setUnits] = useState([]);
  // Pending, unsaved edits per row — { [rowId]: { product_name?, product_code?, mrp_unit_id? } }.
  // Nothing here is pushed to the server until the row's Save button is clicked;
  // navigating away / re-fetching the list just discards it.
  const [edits, setEdits] = useState({});
  const [savingRowFor, setSavingRowFor] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => (highlightId ? new Set([highlightId]) : new Set()));
  const [logsById, setLogsById] = useState({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [poNumberInput, setPoNumberInput] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [hasProductCode, setHasProductCode] = useState(""); // "", "true", "false"

  useEffect(() => {
    apiFetch("/products/units")
      .then((data) => setUnits(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    apiFetch(`/admin/purchase-order-master/${highlightId}/logs`)
      .then((data) => setLogsById((p) => ({ ...p, [highlightId]: data || [] })))
      .catch(() => setLogsById((p) => ({ ...p, [highlightId]: [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing only fetches name suggestions for the dropdown — the PO list
  // itself is only fetched once the user clicks a suggestion.
  useEffect(() => {
    const q = searchInput.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/admin/purchase-order-master/product-names?search=${encodeURIComponent(q)}`)
        .then((data) => setSuggestions(data || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  function selectSuggestion(name) {
    setSearchInput(name);
    setShowSuggestions(false);
    setSearch(name);
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setSuggestions([]);
    setSearch("");
    setPage(1);
  }

  // PO number search filters directly as you type (debounced) — no
  // suggestion picker needed, unlike the product-name search above.
  useEffect(() => {
    const t = setTimeout(() => {
      setPoNumber(poNumberInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [poNumberInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortBy,
      sortDir,
    });
    if (search) params.set("search", search);
    if (poNumber) params.set("poNumber", poNumber);
    if (hasProductCode) params.set("hasProductCode", hasProductCode);
    apiFetch(`/admin/purchase-order-master?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows || []);
        setTotal(data.total || 0);
        setMissingProductCode(data.missingProductCode || 0);
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
  }, [page, sortBy, sortDir, search, poNumber, hasProductCode]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function setDraft(rowId, field, value) {
    setEdits((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }));
  }

  // What the cell should display: the pending edit if there is one, else the
  // last-saved value from `rows`.
  function draftValue(row, field) {
    const e = edits[row.id];
    if (e && field in e) return e[field];
    return row[field] ?? "";
  }

  function isDirty(rowId) {
    const e = edits[rowId];
    return !!e && Object.keys(e).length > 0;
  }

  function cancelEdits(rowId) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  async function saveRow(rowId) {
    const row = rows.find((r) => r.id === rowId);
    const draft = edits[rowId];
    if (!row || !draft) return;

    setSavingRowFor(rowId);
    try {
      const updates = {};

      // product_code goes first — if it matches a catalog product, the
      // backend auto-fills product_name/composition from that product and
      // that takes priority over any manual edits to those two fields made
      // in the same save.
      let codeMatched = false;
      if ("product_code" in draft) {
        const trimmed = draft.product_code.trim();
        if (trimmed !== (row.product_code || "")) {
          const res = await apiFetch(`/admin/purchase-order-master/${rowId}/product-code`, {
            method: "PATCH",
            body: JSON.stringify({ product_code: trimmed || null }),
          });
          updates.product_code = trimmed || null;
          if (res && "product_name" in res) {
            updates.product_name = res.product_name;
            updates.composition = res.composition ?? null;
            codeMatched = true;
          }
        }
      }

      if (!codeMatched && "product_name" in draft) {
        const trimmed = draft.product_name.trim();
        if (!trimmed) throw new Error("Product name cannot be empty");
        if (trimmed !== (row.product_name || "")) {
          await apiFetch(`/admin/purchase-order-master/${rowId}/product-name`, {
            method: "PATCH",
            body: JSON.stringify({ product_name: trimmed }),
          });
          updates.product_name = trimmed;
        }
      }

      if (!codeMatched && "composition" in draft) {
        const trimmed = draft.composition.trim();
        if (trimmed !== (row.composition || "")) {
          await apiFetch(`/admin/purchase-order-master/${rowId}/composition`, {
            method: "PATCH",
            body: JSON.stringify({ composition: trimmed || null }),
          });
          updates.composition = trimmed || null;
        }
      }

      if ("mrp_unit_id" in draft) {
        if (draft.mrp_unit_id !== (row.mrp_unit_id || "")) {
          await apiFetch(`/admin/purchase-order-master/${rowId}/mrp-unit`, {
            method: "PATCH",
            body: JSON.stringify({ mrp_unit_id: draft.mrp_unit_id || null }),
          });
          updates.mrp_unit_id = draft.mrp_unit_id || null;
        }
      }

      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...updates } : r)));
      cancelEdits(rowId);
      setLogsById((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      if (expandedIds.has(rowId)) {
        apiFetch(`/admin/purchase-order-master/${rowId}/logs`)
          .then((data) => setLogsById((p) => ({ ...p, [rowId]: data || [] })))
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRowFor(null);
    }
  }

  function toggleRow(rowId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
        if (!logsById[rowId]) {
          apiFetch(`/admin/purchase-order-master/${rowId}/logs`)
            .then((data) => setLogsById((p) => ({ ...p, [rowId]: data || [] })))
            .catch(() => setLogsById((p) => ({ ...p, [rowId]: [] })));
        }
      }
      return next;
    });
  }

  function handleSort(sortKey) {
    if (!sortKey) return;
    setPage(1);
    if (sortBy === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(sortKey);
      setSortDir("asc");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Purchase Orders</h2>
            <p className="text-sm text-gray-500">
              {total.toLocaleString()} entries — includes the imported PO history and every new PO created going forward.
            </p>
            {missingProductCode > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                {missingProductCode.toLocaleString()} {missingProductCode === 1 ? "entry is" : "entries are"} missing a product code
              </p>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search product name…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                {suggestions.map((name) => (
                  <li
                    key={name}
                    onMouseDown={() => selectSuggestion(name)}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-800"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={poNumberInput}
              onChange={(e) => setPoNumberInput(e.target.value)}
              placeholder="Search P-O number…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {poNumber && (
              <button
                onClick={() => setPoNumberInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={hasProductCode}
            onChange={(e) => {
              setHasProductCode(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All product codes</option>
            <option value="true">With product code</option>
            <option value="false">Without product code</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/panel/purchase-orders/new"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Create PO
          </Link>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-500 mb-4">Loading…</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 w-6"></th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.sortKey)}
                  className={`px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap ${
                    c.sortKey ? "cursor-pointer select-none hover:text-gray-900" : ""
                  }`}
                >
                  {c.label}
                  {c.sortKey && sortBy === c.sortKey && (
                    <span className="ml-1 text-gray-400">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const isExpanded = expandedIds.has(r.id);
              const rowLogs = logsById[r.id];
              const isHighlighted = r.id === highlightId;
              const hasCode = !!(r.product_code && r.product_code.trim());
              const rowBg = isHighlighted ? "bg-green-50" : hasCode ? "bg-blue-50" : "";
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => toggleRow(r.id)}
                    className={`hover:bg-gray-100 cursor-pointer ${rowBg}`}
                  >
                    <td className="px-2 py-2 text-gray-400 text-center select-none">
                      {isExpanded ? "▾" : "▸"}
                    </td>
                    {COLUMNS.map((c) =>
                      c.key === "product_name" ? (
                        <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          <input
                            type="text"
                            value={draftValue(r, "product_name")}
                            disabled={savingRowFor === r.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft(r.id, "product_name", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRow(r.id);
                            }}
                            className="border border-gray-300 rounded-md text-xs px-1.5 py-1 w-40 bg-white disabled:opacity-50"
                          />
                        </td>
                      ) : c.key === "product_code" ? (
                        <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          <input
                            type="text"
                            value={draftValue(r, "product_code")}
                            disabled={savingRowFor === r.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft(r.id, "product_code", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRow(r.id);
                            }}
                            placeholder="—"
                            className="border border-gray-300 rounded-md text-xs px-1.5 py-1 w-24 bg-white disabled:opacity-50"
                          />
                        </td>
                      ) : c.key === "composition" ? (
                        <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          <input
                            type="text"
                            value={draftValue(r, "composition")}
                            disabled={savingRowFor === r.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft(r.id, "composition", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRow(r.id);
                            }}
                            placeholder="—"
                            className="border border-gray-300 rounded-md text-xs px-1.5 py-1 w-36 bg-white disabled:opacity-50"
                          />
                        </td>
                      ) : c.key === "mrp_unit_id" ? (
                        <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          <select
                            value={draftValue(r, "mrp_unit_id")}
                            disabled={savingRowFor === r.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft(r.id, "mrp_unit_id", e.target.value)}
                            className="border border-gray-300 rounded-md text-xs px-1.5 py-1 bg-white disabled:opacity-50"
                          >
                            <option value="">—</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : (
                        <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          {cellValue(r, c.key)}
                          {c.key === "po_number" && isHighlighted && (
                            <span className="ml-1.5 text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                              New
                            </span>
                          )}
                        </td>
                      )
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isDirty(r.id) && (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => saveRow(r.id)}
                            disabled={savingRowFor === r.id}
                            className="px-2 py-1 bg-gray-900 text-white rounded-md text-[11px] font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {savingRowFor === r.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => cancelEdits(r.id)}
                            disabled={savingRowFor === r.id}
                            className="px-2 py-1 border border-gray-300 rounded-md text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={COLUMNS.length + 2} className="px-6 py-3">
                        {!rowLogs && <p className="text-xs text-gray-400">Loading history…</p>}
                        {rowLogs && rowLogs.length === 0 && (
                          <p className="text-xs text-gray-400">No changes recorded for this row yet.</p>
                        )}
                        {rowLogs && rowLogs.length > 0 && (
                          <ul className="space-y-2">
                            {rowLogs.map((entry) => (
                              <li key={entry.id} className="text-xs border-l-2 border-gray-300 pl-2">
                                <span className="text-gray-800">
                                  <span className="font-medium">{entry.actor_name || entry.actor_phone || "Someone"}</span>{" "}
                                  changed <span className="font-medium">{entry.field_name}</span> from{" "}
                                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                                    {entry.old_value ?? "—"}
                                  </span>{" "}
                                  to{" "}
                                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                                    {entry.new_value ?? "—"}
                                  </span>
                                </span>
                                <span className="text-gray-400 ml-2">
                                  {new Date(entry.created_at).toLocaleString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                                  })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center text-gray-500">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-500">
          Page {page} of {totalPages}
        </p>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        ← Prev
      </button>
      <span className="text-xs text-gray-500 px-1">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange((p) => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next →
      </button>
    </div>
  );
}
