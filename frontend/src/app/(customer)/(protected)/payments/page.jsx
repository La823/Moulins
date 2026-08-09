"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  verified: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function uploadScreenshotToS3(file) {
  const { upload_url, key } = await apiFetch("/payments/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename: file.name }),
  });
  await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return key;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef(null);

  const fetchPayments = () => {
    apiFetch("/payments")
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPayments(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!file) { setError("Please attach a payment screenshot"); return; }

    setSubmitting(true);
    try {
      const screenshotKey = await uploadScreenshotToS3(file);
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({ amount: amt, screenshot_key: screenshotKey }),
      });
      setSuccess("Payment submitted for verification.");
      setAmount("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchPayments();
    } catch (err) {
      setError(err.message || "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-2">My Payments</h1>
      <p className="text-sm text-gray-400 mb-10">Submit a payment screenshot for verification</p>

      {/* Upload form */}
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 mb-10 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₹) *</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Screenshot *</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="w-full text-sm text-gray-600"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#00A6A4" }}
        >
          {submitting ? "Submitting..." : "Submit Payment"}
        </button>
      </form>

      {/* History */}
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Payment History</h2>
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-gray-100 rounded-lg p-5">
              <div className="h-4 bg-gray-100 rounded w-1/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">No payments submitted yet</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                  {p.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <a href={p.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                  View screenshot →
                </a>
                <p className="text-xs text-gray-400">Submitted {formatDateTime(p.created_at)}</p>
              </div>
              {p.verified_at && (
                <p className="text-xs text-gray-400 mt-1">
                  {p.status === "rejected" ? "Rejected" : "Verified"} {formatDateTime(p.verified_at)}
                </p>
              )}
              {p.status === "rejected" && p.rejection_reason && (
                <p className="text-xs text-red-500 mt-2">Reason: {p.rejection_reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
