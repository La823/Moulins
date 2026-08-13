"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function DeletionRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchRequests = () => {
    setLoading(true);
    apiFetch("/admin/deletion-requests")
      .then((data) => setRequests(data.requests || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const approve = async (req) => {
    if (
      !confirm(
        `Permanently delete "${req.user_name || req.user_phone}"'s account? This cannot be undone.`
      )
    )
      return;
    setBusyId(req.id);
    try {
      await apiFetch(`/admin/deletion-requests/${req.id}/approve`, { method: "PUT" });
      fetchRequests();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    const notes = prompt("Reason for declining this request (optional):") || "";
    setBusyId(req.id);
    try {
      await apiFetch(`/admin/deletion-requests/${req.id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ notes }),
      });
      fetchRequests();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Account Deletion Requests</h2>
          <p className="text-sm text-gray-400 mt-1">
            Partners and team members who have asked for their account to be permanently removed.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No pending deletion requests</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {requests.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">
                    {req.user_name || "No name"}{" "}
                    <span className="text-xs font-normal text-gray-400">({req.user_role})</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{req.user_phone}</p>
                  {req.reason && (
                    <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                      &ldquo;{req.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Requested {new Date(req.requested_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => reject(req)}
                    disabled={busyId === req.id}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => approve(req)}
                    disabled={busyId === req.id}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Approve &amp; Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
