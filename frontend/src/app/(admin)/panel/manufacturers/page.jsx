"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", emails: [""], phone: "", address: "", gst_number: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const formRef = useRef(null);

  const fetchData = () => {
    apiFetch("/admin/manufacturers")
      .then((data) => setManufacturers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({ name: "", emails: [""], phone: "", address: "", gst_number: "", notes: "" });
    setEditing(null);
    setShowForm(false);
    setError("");
  };

  const startEdit = (m) => {
    setForm({
      name: m.name,
      emails: m.emails?.length ? m.emails : [""],
      phone: m.phone || "",
      address: m.address || "",
      gst_number: m.gst_number || "",
      notes: m.notes || "",
    });
    setEditing(m.id);
    setShowForm(true);
    // The form renders above the list — without this, clicking Edit on a
    // row further down the page opens it off-screen and looks like nothing
    // happened.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError("");
    const body = {
      name: form.name.trim(),
      emails: form.emails.filter((e) => e.trim()),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      gst_number: form.gst_number.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        await apiFetch(`/admin/manufacturers/${editing}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/admin/manufacturers", { method: "POST", body: JSON.stringify(body) });
      }
      resetForm();
      setLoading(true);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this manufacturer? This will fail if purchase orders reference it.")) return;
    try {
      await apiFetch(`/admin/manufacturers/${id}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const addEmail = () => setForm({ ...form, emails: [...form.emails, ""] });
  const removeEmail = (i) => setForm({ ...form, emails: form.emails.filter((_, idx) => idx !== i) });
  const updateEmail = (i, val) => {
    const emails = [...form.emails];
    emails[i] = val;
    setForm({ ...form, emails });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Manufacturers</h2>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add Manufacturer"}
        </button>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="mb-6 p-5 bg-white rounded-xl border border-gray-200 space-y-4 max-w-xl">
          <h3 className="text-sm font-semibold text-gray-700">{editing ? "Edit Manufacturer" : "New Manufacturer"}</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emails</label>
            {form.emails.map((email, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input type="email" value={email} onChange={(e) => updateEmail(i, e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                {form.emails.length > 1 && (
                  <button type="button" onClick={() => removeEmail(i)}
                    className="px-2 text-red-400 hover:text-red-600 text-sm">&times;</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEmail}
              className="text-xs text-blue-600 hover:text-blue-700">+ Add email</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
              <input type="text" value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {submitting ? "Saving..." : editing ? "Update" : "Create"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : manufacturers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No manufacturers yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {manufacturers.map((m) => {
            const isExpanded = expandedId === m.id;
            const hasDetails = m.emails?.length > 0 || m.phone || m.address || m.gst_number || m.notes;
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                    {m.code && (
                      <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {m.code}
                      </span>
                    )}
                    <span className="font-medium text-gray-900">{m.name}</span>
                    {!hasDetails && (
                      <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        No details yet
                      </span>
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <Field label="Code" value={m.code} />
                      <Field label="Emails" value={m.emails?.length ? m.emails.join(", ") : null} />
                      <Field label="Phone" value={m.phone} />
                      <Field label="GST Number" value={m.gst_number} />
                      <Field label="Address" value={m.address} />
                      <Field label="Notes" value={m.notes} full />
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <button onClick={() => startEdit(m)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(m.id)}
                        className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Field({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={value ? "text-gray-800" : "text-gray-300 italic"}>{value || "Not set"}</p>
    </div>
  );
}
