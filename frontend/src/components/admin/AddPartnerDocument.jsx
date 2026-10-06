"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

// Lets staff add a drug licence or GST certificate on a partner's behalf —
// for partners who send the paperwork by WhatsApp or hand it over in person
// rather than uploading it in the app.
//
// It drives the same backend code as the partner's own upload: the photo goes
// to S3 through a presigned URL, then the document is saved against the
// partner named in the URL. So it lands unverified and goes through the usual
// verify / reject step like any other upload, and the partner's onboarding
// step is recalculated the same way.
export default function AddPartnerDocument({ partnerId, onAdded }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("license"); // "license" | "gst"
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setLabel("");
    setNumber("");
    setExpiry("");
    setFile(null);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!number.trim() || !file) {
      setError("Document number and a photo are required.");
      return;
    }
    if (kind === "license" && (!label.trim() || !expiry)) {
      setError("A drug licence needs a label (e.g. Form 20B) and an expiry date.");
      return;
    }

    setSaving(true);
    try {
      // 1. upload the photo
      const { upload_url, public_url } = await apiFetch("/onboarding/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      const put = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error("Photo upload failed");

      // 2. save the document against the partner
      if (kind === "gst") {
        await apiFetch(`/admin/partners/${partnerId}/documents`, {
          method: "POST",
          body: JSON.stringify({ doc_type: "GST", doc_number: number.trim(), photo_url: public_url }),
        });
      } else {
        await apiFetch(`/admin/partners/${partnerId}/licenses`, {
          method: "POST",
          body: JSON.stringify({
            label: label.trim(),
            doc_number: number.trim(),
            expiry_date: expiry,
            photo_url: public_url,
          }),
        });
      }

      reset();
      setOpen(false);
      onAdded?.();
    } catch (err) {
      setError(err.message || "Could not add the document");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
      >
        + Add drug licence or GST
      </button>
    );
  }

  const input =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400";

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900">Add a document for this partner</p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      <div className="flex gap-2">
        {[
          ["license", "Drug licence"],
          ["gst", "GST certificate"],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setKind(v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              kind === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {kind === "license" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Form 20B, Form 21B, Wholesale"
            className={input}
          />
        </div>
      )}

      <div className={kind === "license" ? "grid grid-cols-2 gap-3" : ""}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {kind === "gst" ? "GSTIN" : "Licence number"}
          </label>
          <input value={number} onChange={(e) => setNumber(e.target.value)} className={input} />
        </div>
        {kind === "license" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expiry date</label>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Photo or scan</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-gray-700"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Saved as unverified — verify it below like any upload.</p>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add document"}
        </button>
      </div>
    </form>
  );
}
