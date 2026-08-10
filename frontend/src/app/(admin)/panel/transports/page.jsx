"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export default function AdminTransportsPage() {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState("");
  const [error, setError] = useState("");

  const [modes, setModes] = useState([]);
  const [newModeName, setNewModeName] = useState("");
  const [addingMode, setAddingMode] = useState(false);
  const [modeError, setModeError] = useState("");
  const [confirmDeleteModeId, setConfirmDeleteModeId] = useState(null);

  const [newMode, setNewMode] = useState("");
  const [newName, setNewName] = useState("");
  const [newGst, setNewGst] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editGst, setEditGst] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchModes = useCallback(() => {
    apiFetch("/transport-modes")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setModes(list);
        setNewMode((prev) => prev || list[0]?.name || "");
      })
      .catch(() => setModes([]));
  }, []);

  const fetchTransports = useCallback(() => {
    setLoading(true);
    const params = modeFilter ? `?mode=${modeFilter}` : "";
    apiFetch(`/transports${params}`)
      .then((data) => setTransports(Array.isArray(data) ? data : []))
      .catch(() => setTransports([]))
      .finally(() => setLoading(false));
  }, [modeFilter]);

  useEffect(() => {
    fetchModes();
  }, [fetchModes]);

  useEffect(() => {
    fetchTransports();
  }, [fetchTransports]);

  const handleAddMode = async (e) => {
    e.preventDefault();
    setModeError("");
    const name = newModeName.trim().toLowerCase();
    if (!name) return;
    setAddingMode(true);
    try {
      await apiFetch("/admin/transport-modes", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewModeName("");
      fetchModes();
    } catch (err) {
      setModeError(err.message || "Could not add mode");
    } finally {
      setAddingMode(false);
    }
  };

  const handleDeleteMode = async (id) => {
    try {
      await apiFetch(`/admin/transport-modes/${id}`, { method: "DELETE" });
      fetchModes();
    } catch (err) {
      setModeError(err.message || "Could not delete mode");
    } finally {
      setConfirmDeleteModeId(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await apiFetch("/admin/transports", {
        method: "POST",
        body: JSON.stringify({ mode: newMode, name, gst_number: newGst.trim() || null }),
      });
      setNewName("");
      setNewGst("");
      fetchTransports();
    } catch (err) {
      setError(err.message || "Could not add transport");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditGst(t.gst_number || "");
  };

  const handleSaveEdit = async (id) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/transports/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, gst_number: editGst.trim() || null }),
      });
      setEditingId(null);
      fetchTransports();
    } catch (err) {
      setError(err.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/admin/transports/${id}`, { method: "DELETE" });
      fetchTransports();
    } catch (err) {
      setError(err.message || "Could not delete transport");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Transports</h2>
        {!loading && <span className="text-sm text-gray-400">{transports.length} total</span>}
      </div>

      {/* Mode manager */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Modes of Transportation</h3>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {modes.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700 capitalize"
            >
              {m.name}
              {confirmDeleteModeId === m.id ? (
                <button onClick={() => handleDeleteMode(m.id)} className="text-red-600 hover:text-red-800 font-semibold">
                  Confirm?
                </button>
              ) : (
                <button onClick={() => setConfirmDeleteModeId(m.id)} className="text-gray-400 hover:text-red-600">
                  ×
                </button>
              )}
            </span>
          ))}
          {modes.length === 0 && <span className="text-xs text-gray-400">No modes yet — add one below</span>}
        </div>
        <form onSubmit={handleAddMode} className="flex gap-2">
          <input
            type="text"
            value={newModeName}
            onChange={(e) => setNewModeName(e.target.value)}
            placeholder="New mode name, e.g. hand delivery"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
          />
          <button
            type="submit"
            disabled={addingMode || !newModeName.trim()}
            className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {addingMode ? "Adding..." : "Add Mode"}
          </button>
        </form>
        {modeError && <p className="text-sm text-red-600 mt-2">{modeError}</p>}
      </div>

      {/* Add form */}
      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Add Transport</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mode</label>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value)}
              disabled={modes.length === 0}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 disabled:opacity-50"
            >
              {modes.length === 0 && <option value="">Add a mode first</option>}
              {modes.map((m) => (
                <option key={m.id} value={m.name} className="capitalize">
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Blue Dart, Sharma Roadways"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">GST Number <span className="text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={newGst}
              onChange={(e) => setNewGst(e.target.value)}
              placeholder="e.g. 27AAPCT1234H1Z0"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={creating || !newName.trim() || !newMode}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {creating ? "Adding..." : "Add Transport"}
        </button>
      </form>

      {/* Mode tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <button
          onClick={() => setModeFilter("")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            modeFilter === ""
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          }`}
        >
          All
        </button>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setModeFilter(m.name)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap capitalize transition-colors ${
              modeFilter === m.name
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-5">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : transports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No transports added yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">GST Number</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transports.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-medium capitalize border ${
                      t.mode === "courier" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"
                    }`}>
                      {t.mode}
                    </span>
                  </td>
                  {editingId === t.id ? (
                    <>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-gray-900"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={editGst}
                          onChange={(e) => setEditGst(e.target.value)}
                          placeholder="GST number"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-gray-900"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveEdit(t.id)}
                            disabled={saving}
                            className="text-xs font-medium text-gray-900 hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3 text-gray-900 font-medium">{t.name}</td>
                      <td className="px-5 py-3 text-gray-600">{t.gst_number || "—"}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(t)} className="text-xs font-medium text-gray-600 hover:text-gray-900">
                            Edit
                          </button>
                          {confirmDeleteId === t.id && (
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:underline">
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => (confirmDeleteId === t.id ? handleDelete(t.id) : setConfirmDeleteId(t.id))}
                            className={`text-xs font-medium ${
                              confirmDeleteId === t.id ? "text-red-700 underline" : "text-red-500 hover:text-red-700"
                            }`}
                          >
                            {confirmDeleteId === t.id ? "Confirm delete?" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
