"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Manages product_licence_types — the regulatory classification (Drug /
// Food / Cosmetic) each product is sold under. Editable rather than a fixed
// list, since the set is a business classification that can grow, and
// products link by id so a rename never orphans them.
export default function LicenceTypesPage() {
  const [types, setTypes] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", description: "" });

  const load = useCallback(async () => {
    try {
      const [list, bd] = await Promise.all([
        apiFetch("/admin/product-licence-types"),
        apiFetch("/admin/product-licence-types/breakdown").catch(() => []),
      ]);
      setTypes(list || []);
      setBreakdown(bd || []);
    } catch (err) {
      setError(err.message);
      setTypes([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/admin/product-licence-types", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
        }),
      });
      setNewName("");
      setNewDescription("");
      setSuccess("Licence type added");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditDraft({ name: t.name, description: t.description || "" });
  };

  const saveEdit = async (id) => {
    if (!editDraft.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/product-licence-types/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editDraft.name.trim(),
          description: editDraft.description.trim() || null,
        }),
      });
      setEditingId(null);
      setSuccess("Licence type updated");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    // Products are never deleted with the type — the foreign key is
    // ON DELETE SET NULL — but they do become unclassified, so say so.
    const warning =
      t.product_count > 0
        ? `Delete "${t.name}"?\n\n${t.product_count} product${t.product_count !== 1 ? "s" : ""} will become unclassified. The products themselves are not deleted.`
        : `Delete "${t.name}"?`;
    if (!confirm(warning)) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/admin/product-licence-types/${t.id}`, {
        method: "DELETE",
      });
      setSuccess(
        res?.products_unlinked
          ? `Deleted — ${res.products_unlinked} product(s) are now unclassified`
          : "Licence type deleted",
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (types === null) return <Loader />;

  const totalClassified = breakdown
    .filter((b) => b.id !== null)
    .reduce((n, b) => n + b.product_count, 0);
  const unclassified = breakdown.find((b) => b.id === null);

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Product Licence Types
        </h2>
        <p className="text-sm text-gray-500">
          The regulatory classification each product is sold under. Assign one
          per product from the product&apos;s own page.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">
          {success}
        </p>
      )}

      {/* Dashboard summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-gray-500">
            Products by licence type
          </h3>
          <span className="text-xs text-gray-400">
            {totalClassified.toLocaleString("en-IN")} classified
            {unclassified?.product_count
              ? ` · ${unclassified.product_count.toLocaleString("en-IN")} not yet classified`
              : ""}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b border-gray-100">
            <tr>
              <th className="text-left font-medium pb-2">Licence type</th>
              <th className="text-right font-medium pb-2">Products</th>
              <th className="text-right font-medium pb-2">Active</th>
              <th className="text-right font-medium pb-2">Veg</th>
              <th className="text-right font-medium pb-2">Non-Veg</th>
              <th className="text-left font-medium pb-2 pl-4 w-1/3">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {breakdown.map((b) => {
              const total = breakdown.reduce((n, x) => n + x.product_count, 0);
              const pct = total ? (b.product_count / total) * 100 : 0;
              return (
                <tr key={b.id ?? "none"} className="text-gray-700">
                  <td className="py-2">
                    {/* Straight through to the product list filtered to this
                        licence type — "none" is the unclassified bucket. */}
                    <Link
                      href={`/panel/products?licence_type=${b.id === null ? "none" : b.id}`}
                      className={`hover:underline ${b.id === null ? "text-amber-600" : "text-gray-700"}`}
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {b.product_count.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">
                    {b.active_count.toLocaleString("en-IN")}
                  </td>
                  {/* Only meaningful on the Food row; blank elsewhere rather
                      than a misleading 0. */}
                  <td className="py-2 text-right tabular-nums text-green-700">
                    {b.veg_count ? b.veg_count.toLocaleString("en-IN") : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-amber-700">
                    {b.non_veg_count ? b.non_veg_count.toLocaleString("en-IN") : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${b.id === null ? "bg-amber-400" : "bg-gray-900"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums w-10 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Editable table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2">Name</th>
              <th className="text-left font-medium px-4 py-2">Description</th>
              <th className="text-right font-medium px-4 py-2">Products</th>
              <th className="text-right font-medium px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {types.map((t) => (
              <tr key={t.id} className="text-gray-800">
                {editingId === t.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, name: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editDraft.description}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            description: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                      {t.product_count}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => saveEdit(t.id)}
                        disabled={saving}
                        className="text-xs font-medium text-gray-900 hover:underline disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="ml-3 text-xs text-gray-400 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {t.description || (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {t.product_count > 0 ? (
                        <Link
                          href={`/panel/products?licence_type=${t.id}`}
                          className="text-gray-700 hover:text-gray-900 hover:underline"
                          title={`View the ${t.product_count} product(s) with this licence type`}
                        >
                          {t.product_count.toLocaleString("en-IN")}
                        </Link>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/panel/products?licence_type=${t.id}`}
                        className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
                      >
                        View products
                      </Link>
                      <button
                        onClick={() => startEdit(t)}
                        className="ml-3 text-xs text-gray-600 hover:text-gray-900 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={saving}
                        className="ml-3 text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">
                  No licence types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add new */}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-gray-200 rounded-xl p-4 flex items-end gap-3 flex-wrap"
      >
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            New licence type
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Medical Device"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="flex-[2] min-w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Description (optional)
          </label>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !newName.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
