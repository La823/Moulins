"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import RetailerDocuments from "@/components/retailers/RetailerDocuments";

// The partner's retailers: the shops they supply. A retailer logs in with
// their phone number, which is also their first password, sees the
// partner's products (MRP only) and orders from the partner.

const empty = { name: "", phone: "", shop_name: "", city: "", address: "" };

export default function PartnerRetailersPage() {
  const [retailers, setRetailers] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null); // null, or { ...fields, id? }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [docsFor, setDocsFor] = useState(null); // retailer id whose GST / DL panel is open

  const load = useCallback(
    () =>
      apiFetch("/retailers")
        .then((list) => (setRetailers(list || []), setError("")))
        .catch((e) => (setRetailers((r) => r || []), setError(e.message))),
    [],
  );

  useEffect(() => {
    let off = false;
    apiFetch("/retailers")
      .then((list) => !off && setRetailers(list || []))
      .catch((e) => !off && (setRetailers([]), setError(e.message)));
    return () => {
      off = true;
    };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Please enter the retailer's name.");
    if (!form.id && !/^(\+?91)?\d{10}$/.test(form.phone.replace(/[\s-]/g, "")))
      return setFormError("Please enter a valid 10-digit mobile number.");
    setSaving(true);
    setFormError("");
    try {
      const body = { name: form.name.trim(), shop_name: form.shop_name, city: form.city, address: form.address };
      if (form.id) {
        await apiFetch(`/retailers/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage("The retailer's details have been updated.");
      } else {
        await apiFetch("/retailers", { method: "POST", body: JSON.stringify({ ...body, phone: form.phone }) });
        setMessage("The retailer has been added. They can log in with their phone number as the password.");
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async (r) => {
    if (!window.confirm(`Reset ${r.shop_name || r.name}'s password to their phone number, ${r.phone}?`)) return;
    try {
      const res = await apiFetch(`/retailers/${r.id}/reset-password`, { method: "POST" });
      setMessage(res?.message || "The password has been reset.");
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.shop_name || r.name}? They will no longer be able to log in or place orders. Their past orders will be kept.`)) return;
    try {
      await apiFetch(`/retailers/${r.id}`, { method: "DELETE" });
      setMessage("The retailer has been removed.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const field = (key, label, props = {}) => (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        {...props}
      />
    </label>
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-light text-gray-900">My Retailers</h1>
          <p className="text-sm text-gray-500 mt-1">
            The shops you supply. Each logs in with their phone number and orders from you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (setForm({ ...empty }), setFormError(""))}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Add Retailer
        </button>
      </div>

      {message && <p className="text-sm text-teal-700 mb-4">{message}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {form && (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 grid sm:grid-cols-2 gap-4">
          <h2 className="sm:col-span-2 font-semibold text-gray-900">{form.id ? "Edit retailer" : "Add retailer"}</h2>
          {field("name", "Contact name")}
          {field("phone", "Mobile number (their login)", { disabled: !!form.id, inputMode: "tel" })}
          {field("shop_name", "Shop name (optional)")}
          {field("city", "City (optional)")}
          <div className="sm:col-span-2">{field("address", "Address (optional)")}</div>
          {formError && <p className="sm:col-span-2 text-sm text-red-600">{formError}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-50">
              {saving ? "Saving…" : form.id ? "Save" : "Add Retailer"}
            </button>
            <button type="button" onClick={() => setForm(null)} className="text-sm px-4 py-2 border border-gray-300 rounded-lg text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {retailers === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : retailers.length === 0 ? (
        <p className="text-sm text-gray-500">No retailers yet. Add the shops you supply so they can order from you.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {retailers.map((r) => (
            <div key={r.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{r.shop_name || r.name}</div>
                <div className="text-xs text-gray-500">
                  {[r.shop_name ? r.name : null, r.phone, r.city].filter(Boolean).join(" · ")}
                </div>
                <div className="text-xs mt-0.5">
                  {r.gst_number ? (
                    <span className={r.gst_verified ? "text-green-700" : "text-amber-700"}>
                      GST {r.gst_number} {r.gst_verified ? "✓" : "(not checked)"}
                    </span>
                  ) : (
                    <span className="text-gray-400">No GST on file</span>
                  )}
                  <span className="text-gray-300"> · </span>
                  {r.dl_count > 0 ? (
                    <span className={r.dl_verified === r.dl_count ? "text-green-700" : "text-amber-700"}>
                      {r.dl_count} drug licence{r.dl_count === 1 ? "" : "s"}, {r.dl_verified} checked
                    </span>
                  ) : (
                    <span className="text-gray-400">No drug licence on file</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-500">
                {r.order_count} order{r.order_count === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => (setForm({ ...empty, ...r, shop_name: r.shop_name || "", city: r.city || "", address: r.address || "" }), setFormError(""))}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDocsFor((x) => (x === r.id ? null : r.id))}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500"
                >
                  GST &amp; DL
                </button>
                <button type="button" onClick={() => reset(r)} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500">
                  Reset password
                </button>
                <button type="button" onClick={() => remove(r)} className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
                  Remove
                </button>
              </div>
            </div>
            {docsFor === r.id && <RetailerDocuments retailer={r} onChanged={load} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
