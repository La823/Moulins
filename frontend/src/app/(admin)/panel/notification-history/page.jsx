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

// Notification history, in two tabs:
//  - Broadcasts: notifications a person composed and sent (from "Send New
//    Broadcast" here or in the app), with exactly who received each.
//  - Automatic alerts: what the system sends on its own — new orders,
//    official updates, meeting reminders, bank statement problems. Those are
//    stored as one row per person, so each alert is shown once with everyone
//    it went to (GET /admin/notifications/auto).
export default function NotificationHistoryPage() {
  const [tab, setTab] = useState("manual");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState({}); // { manual, auto } totals for the tab labels
  const [expanded, setExpanded] = useState(null);
  const [recipientsById, setRecipientsById] = useState({}); // broadcasts: { [id]: recipients[] | "loading" | { error } }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let off = false;
    const url =
      tab === "manual"
        ? `/admin/notifications?kind=manual&page=${page}&limit=${PAGE_SIZE}`
        : `/admin/notifications/auto?page=${page}&limit=${PAGE_SIZE}`;
    apiFetch(url)
      .then((data) => {
        if (off) return;
        setItems((tab === "manual" ? data.notifications : data.alerts) || []);
        setTotal(data.total || 0);
        setCounts((c) => ({ ...c, [tab]: data.total || 0 }));
        setError("");
      })
      .catch((err) => !off && setError(err.message))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [tab, page]);

  // the other tab's count, for its label
  useEffect(() => {
    const other = tab === "manual" ? "auto" : "manual";
    if (counts[other] !== undefined) return;
    const url = other === "manual" ? `/admin/notifications?kind=manual&limit=1` : `/admin/notifications/auto?limit=1`;
    apiFetch(url)
      .then((d) => setCounts((c) => ({ ...c, [other]: d.total || 0 })))
      .catch(() => {});
  }, [tab, counts]);

  function switchTab(t) {
    if (t === tab) return;
    setTab(t);
    setPage(1);
    setItems([]);
    setExpanded(null);
    setLoading(true);
  }

  function changePage(p) {
    setPage(p);
    setExpanded(null);
    setLoading(true);
  }

  function toggleBroadcast(id) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!recipientsById[id]) {
      setRecipientsById((prev) => ({ ...prev, [id]: "loading" }));
      apiFetch(`/admin/notifications/${id}/recipients`)
        .then((data) => setRecipientsById((prev) => ({ ...prev, [id]: data || [] })))
        .catch((err) => setRecipientsById((prev) => ({ ...prev, [id]: { error: err.message } })));
    }
  }

  const tabs = [
    ["manual", "Broadcasts", "Sent by a person"],
    ["auto", "Automatic alerts", "Sent by the system"],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Notification History</h2>
          <p className="text-sm text-gray-500">
            {tab === "manual"
              ? "Broadcasts someone composed and sent. Click one to see exactly who received it."
              : "Alerts the system sends by itself: new orders, official updates, reminders. Each is shown once with everyone it went to."}
          </p>
        </div>
        <Link
          href="/panel/notifications"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          Send New Broadcast
        </Link>
      </div>

      <div className="mb-5 inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white">
        {tabs.map(([k, label, hint]) => (
          <button
            key={k}
            type="button"
            onClick={() => switchTab(k)}
            className={`px-4 py-2 text-sm text-left ${tab === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
          >
            <span className="font-medium">{label}</span>
            {counts[k] !== undefined && <span className={tab === k ? "text-gray-300" : "text-gray-400"}> · {counts[k]}</span>}
            <span className={`block text-[11px] ${tab === k ? "text-gray-300" : "text-gray-400"}`}>{hint}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <Loader />}

      {!loading && items.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">
            {tab === "manual" ? "No broadcasts have been sent yet." : "No automatic alerts yet."}
          </p>
        </div>
      )}

      {!loading && items.length > 0 && tab === "manual" && (
        <div className="space-y-3">
          {items.map((n) => {
            const isExpanded = expanded === n.id;
            const recipients = recipientsById[n.id];
            return (
              <Fragment key={n.id}>
                <div
                  onClick={() => toggleBroadcast(n.id)}
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
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 ml-5">
                    Sent by{" "}
                    <span className="font-medium text-gray-500">
                      {n.created_by_name || "—"}
                      {n.created_by_role ? ` (${n.created_by_role})` : ""}
                    </span>{" "}
                    &middot; {n.audience_type === "list" ? "to a broadcast list" : "to everyone"} &middot; {n.recipient_count} recipients
                    &middot; {n.push_success_count} push delivered &middot; {n.push_failure_count} failed &middot;{" "}
                    {formatDateTime(n.sent_at || n.created_at)}
                  </p>
                </div>

                {isExpanded && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 -mt-1">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Sent To</p>
                    {recipients === "loading" && <p className="text-xs text-gray-400">Loading recipients…</p>}
                    {recipients?.error && <p className="text-xs text-red-600">Could not load recipients: {recipients.error}</p>}
                    {Array.isArray(recipients) && recipients.length === 0 && (
                      <p className="text-xs text-gray-400">No recipients recorded for this notification.</p>
                    )}
                    {Array.isArray(recipients) && recipients.length > 0 && <RecipientTable rows={recipients} />}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {!loading && items.length > 0 && tab === "auto" && (
        <div className="space-y-3">
          {items.map((a, i) => {
            const key = `${a.sent_at}-${a.title}-${i}`;
            const isExpanded = expanded === key;
            return (
              <Fragment key={key}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs select-none">{isExpanded ? "▾" : "▸"}</span>
                        <p className="font-medium text-gray-900 truncate">{a.title}</p>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 ml-5">{a.body}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 bg-gray-100 text-gray-600">
                      automatic
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 ml-5">
                    Sent to <span className="font-medium text-gray-500">{a.recipient_count} {a.recipient_count === 1 ? "person" : "people"}</span>
                    &nbsp;&middot; read by {a.read_count} &middot; {a.push_success_count} push delivered &middot; {a.push_failure_count} failed &middot;{" "}
                    {formatDateTime(a.sent_at)}
                    {a.deep_link && (
                      <>
                        {" "}
                        &middot;{" "}
                        <Link href={a.deep_link} onClick={(e) => e.stopPropagation()} className="text-teal-700 hover:underline">
                          open
                        </Link>
                      </>
                    )}
                  </p>
                </div>

                {isExpanded && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 -mt-1">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Sent To</p>
                    {a.recipients.length === 0 ? (
                      <p className="text-xs text-gray-400">No recipients recorded.</p>
                    ) : (
                      <RecipientTable rows={a.recipients} showPush />
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
              onClick={() => changePage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => changePage(Math.min(totalPages, page + 1))}
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

function StatusBadge({ status }) {
  const cls =
    status === "sent" ? "bg-green-100 text-green-700" : status === "failed" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700";
  return <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${cls}`}>{status}</span>;
}

function RecipientTable({ rows, showPush = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pr-4 py-1 font-medium">Name</th>
            <th className="pr-4 py-1 font-medium">Phone</th>
            <th className="pr-4 py-1 font-medium">Role</th>
            {showPush && <th className="pr-4 py-1 font-medium">Push</th>}
            <th className="pr-4 py-1 font-medium">Read</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="pr-4 py-1 text-gray-800">{r.username || "—"}</td>
              <td className="pr-4 py-1 text-gray-600">{r.phone_number || "—"}</td>
              <td className="pr-4 py-1 text-gray-600">{r.role || "—"}</td>
              {showPush && (
                <td className="pr-4 py-1 text-gray-600">
                  {r.push_delivered > 0 ? `${r.push_delivered} device${r.push_delivered === 1 ? "" : "s"}` : <span className="text-gray-400">no device</span>}
                  {r.push_failed > 0 && <span className="text-red-600"> · {r.push_failed} failed</span>}
                </td>
              )}
              <td className="pr-4 py-1">
                {r.is_read ? (
                  <span className="text-green-700">Yes{r.read_at ? ` — ${formatDateTime(r.read_at)}` : ""}</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
