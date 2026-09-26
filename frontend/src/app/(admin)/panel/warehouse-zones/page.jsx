"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Manages warehouse_zones — the four physical picking zones from the WMS SKU
// spec (OS / LQ / IN / TP) — and which product form sits in each. The zone
// code is the [ZONE] segment of the SKU and the form code is [FORM], so this
// screen owns both halves of the prefix that inventory codes will be built
// from later.
export default function WarehouseZonesPage() {
  const [zones, setZones] = useState(null);
  const [forms, setForms] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ code: "", name: "", description: "", scope: "" });
  const [showNew, setShowNew] = useState(false);
  const [newZone, setNewZone] = useState({ code: "", name: "", description: "", scope: "" });
  const [codeDrafts, setCodeDrafts] = useState({}); // { [formId]: "TAB" }

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/admin/warehouse-zones");
      setZones(data.zones || []);
      setForms(data.forms || []);
    } catch (err) {
      setError(err.message);
      setZones([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const saveFormZone = async (form, zoneId, formCode) => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/product-forms/${form.id}/zone`, {
        method: "PUT",
        body: JSON.stringify({
          zone_id: zoneId === "" || zoneId == null ? null : Number(zoneId),
          form_code: formCode ? formCode : null,
        }),
      });
      setSuccess(`${form.name} saved`);
      await load();
    } catch (err) {
      setError(err.message);
      await load(); // re-sync the row so a rejected value doesn't linger
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newZone.code.trim() || !newZone.name.trim()) return;
    setSaving(true); setError("");
    try {
      await apiFetch("/admin/warehouse-zones", {
        method: "POST",
        body: JSON.stringify({
          code: newZone.code.trim(),
          name: newZone.name.trim(),
          description: newZone.description.trim() || null,
          scope: newZone.scope.trim() || null,
          sort_order: (zones?.length || 0) + 1,
        }),
      });
      setNewZone({ code: "", name: "", description: "", scope: "" });
      setShowNew(false);
      setSuccess("Zone added");
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const saveZone = async (z) => {
    setSaving(true); setError("");
    try {
      await apiFetch(`/admin/warehouse-zones/${z.id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: draft.code.trim(),
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          scope: draft.scope.trim() || null,
          sort_order: z.sort_order,
        }),
      });
      setEditingId(null);
      setSuccess("Zone updated");
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const deleteZone = async (z) => {
    const msg = z.form_count > 0
      ? `Delete zone "${z.code} — ${z.name}"?\n\n${z.form_count} product form${z.form_count !== 1 ? "s" : ""} will become unassigned. No forms or products are deleted.`
      : `Delete zone "${z.code} — ${z.name}"?`;
    if (!confirm(msg)) return;
    setSaving(true); setError("");
    try {
      const res = await apiFetch(`/admin/warehouse-zones/${z.id}`, { method: "DELETE" });
      setSuccess(res?.forms_unassigned
        ? `Zone deleted — ${res.forms_unassigned} form(s) now unassigned`
        : "Zone deleted");
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (zones === null) return <Loader />;

  const unassigned = forms.filter((f) => f.zone_id == null);

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Warehouse Zones</h2>
        <p className="text-sm text-gray-500">
          Physical picking zones. Each product form belongs to one zone — the
          zone code and form code together form the start of a product&apos;s
          warehouse SKU.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">{success}</p>
      )}

      {unassigned.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
          {unassigned.length} product form{unassigned.length !== 1 ? "s" : ""} not yet assigned to a zone:{" "}
          {unassigned.map((f) => f.name).join(", ")}
        </div>
      )}

      {/* Zones */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-16">Code</th>
              <th className="text-left font-medium px-4 py-2">Zone</th>
              <th className="text-left font-medium px-4 py-2">Handling</th>
              <th className="text-right font-medium px-4 py-2">Forms</th>
              <th className="text-right font-medium px-4 py-2">Products</th>
              <th className="text-right font-medium px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {zones.map((z) => (
              <tr key={z.id} className="text-gray-800 align-top">
                {editingId === z.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                        className="w-14 px-2 py-1 border border-gray-300 rounded-md text-sm uppercase" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        placeholder="handling notes"
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs mb-1" />
                      <input value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                        placeholder="scope"
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs" />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{z.form_count}</td>
                    <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{z.product_count}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => saveZone(z)} disabled={saving}
                        className="text-xs font-medium text-gray-900 hover:underline disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="ml-3 text-xs text-gray-400 hover:text-gray-700">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">
                      <span className="font-mono font-semibold text-gray-900">{z.code}</span>
                    </td>
                    <td className="px-4 py-2 font-medium">{z.name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {z.description || <span className="text-gray-300">—</span>}
                      {z.scope && <div className="text-gray-400 mt-0.5">{z.scope}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{z.form_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{z.product_count.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setEditingId(z.id); setDraft({ code: z.code, name: z.name, description: z.description || "", scope: z.scope || "" }); }}
                        className="text-xs text-gray-600 hover:text-gray-900 hover:underline">Edit</button>
                      <button onClick={() => deleteZone(z)} disabled={saving}
                        className="ml-3 text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew ? (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Code</label>
            <input value={newZone.code} onChange={(e) => setNewZone({ ...newZone, code: e.target.value })}
              placeholder="CL" className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase" />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Zone name</label>
            <input value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
              placeholder="Cold Chain" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex-[2] min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Handling notes (optional)</label>
            <input value={newZone.description} onChange={(e) => setNewZone({ ...newZone, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" disabled={saving || !newZone.code.trim() || !newZone.name.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">Add</button>
          <button type="button" onClick={() => setShowNew(false)}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
        </form>
      ) : (
        <button onClick={() => setShowNew(true)}
          className="mb-4 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2">
          + Add a zone
        </button>
      )}

      {/* Form -> zone assignment */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-medium text-gray-500">Product form assignment</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Form code is the 3-letter [FORM] token in the SKU. Changes save immediately.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2">Product form</th>
              <th className="text-right font-medium px-4 py-2">Products</th>
              <th className="text-left font-medium px-4 py-2 w-40">Zone</th>
              <th className="text-left font-medium px-4 py-2 w-28">Form code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {forms.map((f) => (
              <tr key={f.id} className={f.zone_id == null ? "bg-amber-50/40" : ""}>
                <td className="px-4 py-2 text-gray-800">{f.name}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">{f.product_count}</td>
                <td className="px-4 py-2">
                  <select
                    value={f.zone_id ?? ""}
                    disabled={saving}
                    onChange={(e) => saveFormZone(f, e.target.value, f.form_code)}
                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm bg-white disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.code} — {z.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    value={codeDrafts[f.id] ?? f.form_code ?? ""}
                    maxLength={3}
                    placeholder="TAB"
                    disabled={saving}
                    onChange={(e) => setCodeDrafts({ ...codeDrafts, [f.id]: e.target.value.toUpperCase() })}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      setCodeDrafts((prev) => { const n = { ...prev }; delete n[f.id]; return n; });
                      if (v !== (f.form_code || "")) saveFormZone(f, f.zone_id, v);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm font-mono uppercase disabled:opacity-60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
