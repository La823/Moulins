"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchRequests = useCallback(() => {
    apiFetch("/requests")
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const desc = description.trim();
    if (!desc) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/requests", {
        method: "POST",
        body: JSON.stringify({ description: desc }),
      });
      setDescription("");
      fetchRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-8">Requests</h1>

      <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-6 mb-10">
        <label className="block text-xs font-medium text-gray-500 mb-2">
          Need something from us? Let us know.
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Need more samples for Dr. Sharma, need marketing material for the clinic..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        Your Requests ({requests.length})
      </h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-400">No requests submitted yet</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4 mb-2">
                <p className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] || "bg-gray-50 text-gray-600"}`}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm text-gray-800">{r.description}</p>
              {r.admin_notes && (
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium">Response:</span> {r.admin_notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
