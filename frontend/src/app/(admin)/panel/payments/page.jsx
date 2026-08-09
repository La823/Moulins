"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  verified: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [active, setActive] = useState(null); // payment being reviewed
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectFor, setShowRejectFor] = useState(null);
  const [updating, setUpdating] = useState(false);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchPayments = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);

    apiFetch(`/admin/payments?${params}`)
      .then((data) => {
        setPayments(data.payments || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const verify = async (payment, isVerified, rejectionReason) => {
    setUpdating(true);
    try {
      await apiFetch(`/admin/payments/${payment.id}/verify`, {
        method: "PUT",
        body: JSON.stringify({
          is_verified: isVerified,
          rejection_reason: rejectionReason || null,
        }),
      });
      setPayments((prev) =>
        prev.map((p) =>
          p.id === payment.id
            ? { ...p, status: isVerified ? "verified" : "rejected", rejection_reason: rejectionReason || null }
            : p
        )
      );
      setActive(null);
      setShowRejectFor(null);
      setRejectReason("");
    } catch (err) {
      alert("Failed to update payment: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Payments</h2>
        {!loading && (
          <span className="text-sm text-gray-400">
            {total} {statusFilter ? statusFilter : "total"}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="relative max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by partner name or phone..."
            className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder:text-gray-400"
          />
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-5">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">
            {search || statusFilter ? "No payments match your filters" : "No payments submitted yet"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Partner</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Screenshot</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Reviewed</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{p.user_name || "No name"}</p>
                    <p className="text-xs text-gray-400">{p.user_phone}</p>
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-900">
                    ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setActive(p)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDateTime(p.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-medium capitalize border ${STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {p.verified_at ? formatDateTime(p.verified_at) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {p.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => verify(p, true)}
                          disabled={updating}
                          className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => setShowRejectFor(p.id)}
                          disabled={updating}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {p.status === "rejected" && p.rejection_reason ? p.rejection_reason : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed">
                  Previous
                </button>
                <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Screenshot viewer modal */}
      {active && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setActive(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Payment Screenshot</h3>
              <button onClick={() => setActive(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {active.user_name} · ₹{Number(active.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.screenshot_url} alt="Payment screenshot" className="w-full rounded-lg border border-gray-200" />
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {showRejectFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setShowRejectFor(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-3">Reject Payment</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowRejectFor(null); setRejectReason(""); }} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={() => verify(payments.find((p) => p.id === showRejectFor), false, rejectReason.trim())}
                disabled={updating}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
