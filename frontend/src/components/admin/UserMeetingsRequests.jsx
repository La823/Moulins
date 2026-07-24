"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const MEETING_STATUS_STYLES = {
  upcoming: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

const REQUEST_STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

// Shared "Meetings" + "Requests" panel embedded on both the partner and
// employee detail pages — same user_id-filtered admin endpoints power both.
export default function UserMeetingsRequests({ userId }) {
  const [meetings, setMeetings] = useState(null);
  const [requestsList, setRequestsList] = useState(null);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/admin/meetings?user_id=${userId}&limit=50`)
      .then((data) => setMeetings(data.meetings || []))
      .catch(() => setMeetings(null));
    apiFetch(`/admin/requests?user_id=${userId}&limit=50`)
      .then((data) => setRequestsList(data.requests || []))
      .catch(() => setRequestsList(null));
  }, [userId]);

  if (meetings === null && requestsList === null) return null;

  return (
    <div className="space-y-6">
      {meetings !== null && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Meetings ({meetings.length})
          </h3>
          {meetings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No meetings scheduled yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {meetings.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-900">{m.doctor_name ? `Dr. ${m.doctor_name}` : m.title || "Meeting"}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {m.notes && <p className="text-xs text-gray-400 mt-1">{m.notes}</p>}
                    {m.mom && (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">MOM:</span> {m.mom}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${MEETING_STATUS_STYLES[m.status] || "bg-gray-50 text-gray-600"}`}
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {requestsList !== null && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Requests ({requestsList.length})
          </h3>
          {requestsList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No requests submitted yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {requestsList.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <p className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${REQUEST_STATUS_STYLES[r.status] || "bg-gray-50 text-gray-600"}`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{r.description}</p>
                  {r.admin_notes && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">Admin note:</span> {r.admin_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
