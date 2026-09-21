"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

const PAGE_SIZE = 20;

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Full history of every broadcast notification ever sent — when it went
// out and exactly who received it (via notification_recipients), unlike
// the /panel/notifications page which only shows the 10 most recent as a
// side note under the send form.
export default function NotificationHistoryPage() {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [recipientsById, setRecipientsById] = useState({}); // { [id]: recipients[] | "loading" | { error } }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    apiFetch(`/admin/notifications?page=${page}&limit=${PAGE_SIZE}`)
      .then((data) => {
        setNotifications(data.notifications || []);
        setTotal(data.total || 0);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  function toggleRow(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!recipientsById[id]) {
      setRecipientsById((prev) => ({ ...prev, [id]: "loading" }));
      apiFetch(`/admin/notifications/${id}/recipients`)
        .then((data) => setRecipientsById((prev) => ({ ...prev, [id]: data || [] })))
        .catch((err) => setRecipientsById((prev) => ({ ...prev, [id]: { error: err.message } })));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Notification History</h2>
          <p className="text-sm text-gray-500">
            Every broadcast ever sent — click a row to see exactly who received it.
          </p>
        </div>
        <Link
          href="/panel/notifications"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          Send New Broadcast
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <Loader />}

      {!loading && notifications.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No notifications sent yet</p>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isExpanded = expandedId === n.id;
            const recipients = recipientsById[n.id];
            return (
              <Fragment key={n.id}>
                <div
                  onClick={() => toggleRow(n.id)}
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs select-none">{isExpanded ? "▾" : "▸"}</span>
                        <p className="font-medium text-gray-900 truncate">{n.title}</p>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 ml-5">{n.body}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                        n.status === "sent"
                          ? "bg-green-100 text-green-700"
                          : n.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 ml-5">
                    Sent by{" "}
                    <span className="font-medium text-gray-500">
                      {n.created_by_name || "System"}
                      {n.created_by_role ? ` (${n.created_by_role})` : ""}
                    </span>{" "}
                    &middot; {n.recipient_count} recipients &middot; {n.push_success_count} push delivered &middot;{" "}
                    {n.push_failure_count} failed &middot; {formatDateTime(n.sent_at || n.created_at)}
                  </p>
                </div>

                {isExpanded && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 -mt-1">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Sent To</p>
                    {recipients === "loading" && <p className="text-xs text-gray-400">Loading recipients…</p>}
                    {recipients?.error && (
                      <p className="text-xs text-red-600">Could not load recipients: {recipients.error}</p>
                    )}
                    {Array.isArray(recipients) && recipients.length === 0 && (
                      <p className="text-xs text-gray-400">No recipients recorded for this notification.</p>
                    )}
                    {Array.isArray(recipients) && recipients.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="pr-4 py-1 font-medium">Name</th>
                              <th className="pr-4 py-1 font-medium">Phone</th>
                              <th className="pr-4 py-1 font-medium">Role</th>
                              <th className="pr-4 py-1 font-medium">Read</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {recipients.map((r) => (
                              <tr key={r.user_id}>
                                <td className="pr-4 py-1 text-gray-800">{r.username || "—"}</td>
                                <td className="pr-4 py-1 text-gray-600">{r.phone_number || "—"}</td>
                                <td className="pr-4 py-1 text-gray-600">{r.role || "—"}</td>
                                <td className="pr-4 py-1">
                                  {r.is_read ? (
                                    <span className="text-green-700">
                                      Yes{r.read_at ? ` — ${formatDateTime(r.read_at)}` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">No</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
