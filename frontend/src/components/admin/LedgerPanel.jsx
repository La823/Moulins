"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function LedgerPanel({ partnerId }) {
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    apiFetch(`/admin/partners/${partnerId}/ledger`)
      .then((data) => setLedger(data))
      .catch(() => setLedger(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [partnerId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Ledger must be a PDF file");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const { upload_url, key } = await apiFetch("/admin/ledger/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "application/pdf" },
      });
      await apiFetch(`/admin/partners/${partnerId}/ledger`, {
        method: "PUT",
        body: JSON.stringify({ file_key: key }),
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Account Ledger
        </h3>
        <label className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
          {uploading ? "Uploading..." : ledger ? "Replace Ledger" : "Upload Ledger"}
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : !ledger ? (
        <p className="text-xs text-gray-400 italic">No ledger uploaded yet</p>
      ) : (
        <a
          href={ledger.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">View current ledger</p>
            <p className="text-xs text-gray-400">
              Updated {new Date(ledger.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </a>
      )}
    </div>
  );
}
