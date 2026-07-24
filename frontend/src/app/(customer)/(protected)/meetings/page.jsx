"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

const STATUS_STYLES = {
  upcoming: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

function toLocalDateKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingsPageInner />
    </Suspense>
  );
}

function MeetingsPageInner() {
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date());

  // Day panel — opened by clicking a date on the calendar
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [dayForm, setDayForm] = useState({ doctor_id: "", time: "", notes: "", mom: "", request: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Inline MOM editing on an existing meeting
  const [editingMomId, setEditingMomId] = useState(null);
  const [momDraft, setMomDraft] = useState("");
  const [savingMom, setSavingMom] = useState(false);

  const fetchMeetings = useCallback(() => {
    apiFetch("/meetings")
      .then((data) => setMeetings(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMeetings();
    apiFetch("/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(() => setDoctors([]));
  }, [fetchMeetings]);

  // Deep link from a doctor's page (?doctor_id=) — open today's panel with the doctor preselected
  useEffect(() => {
    const doctorId = searchParams.get("doctor_id");
    if (doctorId) {
      setSelectedDateKey(toLocalDateKey(new Date()));
      setDayForm((f) => ({ ...f, doctor_id: doctorId, time: f.time || "11:00" }));
    }
  }, [searchParams]);

  const meetingsByDate = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      const key = toLocalDateKey(m.scheduled_at);
      (map[key] = map[key] || []).push(m);
    });
    return map;
  }, [meetings]);

  const [upcomingFilter, setUpcomingFilter] = useState("all");

  const allUpcoming = useMemo(
    () => meetings.filter((m) => m.status === "upcoming").sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [meetings]
  );

  const upcoming = useMemo(() => {
    if (upcomingFilter === "all") return allUpcoming;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    let from, to;
    if (upcomingFilter === "tomorrow") {
      from = startOfTomorrow;
      to = new Date(startOfTomorrow);
      to.setDate(to.getDate() + 1);
    } else if (upcomingFilter === "week") {
      from = startOfToday;
      to = new Date(startOfToday);
      to.setDate(to.getDate() + 7);
    } else if (upcomingFilter === "month") {
      from = startOfToday;
      to = new Date(startOfToday);
      to.setDate(to.getDate() + 30);
    }

    return allUpcoming.filter((m) => {
      const d = new Date(m.scheduled_at);
      return d >= from && d < to;
    });
  }, [allUpcoming, upcomingFilter]);

  const UPCOMING_FILTERS = [
    { value: "all", label: "All" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "week", label: "Next 7 Days" },
    { value: "month", label: "Next 30 Days" },
  ];

  const openDay = (dateKey) => {
    setSelectedDateKey(dateKey);
    setDayForm({ doctor_id: "", time: "11:00", notes: "", mom: "", request: "" });
    setError("");
  };

  const closeDay = () => {
    setSelectedDateKey(null);
    setError("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!dayForm.doctor_id || !dayForm.time) {
      setError("Doctor and time are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const scheduledAt = new Date(`${selectedDateKey}T${dayForm.time}`).toISOString();
      await apiFetch("/meetings", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: dayForm.doctor_id,
          scheduled_at: scheduledAt,
          notes: dayForm.notes || null,
          mom: dayForm.mom || null,
        }),
      });

      // A doctor's ask gets flagged to the company as a request, separate
      // from the meeting notes, so it actually surfaces on the admin side.
      if (dayForm.request.trim()) {
        const doctorName = doctors.find((d) => d.id === dayForm.doctor_id)?.name || "doctor";
        await apiFetch("/requests", {
          method: "POST",
          body: JSON.stringify({
            description: `[Meeting with Dr. ${doctorName} on ${selectedDateKey}] ${dayForm.request.trim()}`,
          }),
        }).catch(() => {});
      }

      setDayForm({ doctor_id: "", time: "", notes: "", mom: "", request: "" });
      fetchMeetings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEditMom = (m) => {
    setEditingMomId(m.id);
    setMomDraft(m.mom || "");
  };

  const saveMom = async (id) => {
    setSavingMom(true);
    try {
      await apiFetch(`/meetings/${id}/mom`, {
        method: "PUT",
        body: JSON.stringify({ mom: momDraft.trim() || null }),
      });
      setEditingMomId(null);
      fetchMeetings();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMom(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await apiFetch(`/meetings/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      fetchMeetings();
    } catch (err) {
      alert(err.message);
    }
  };

  // Calendar grid for monthCursor
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayKey = toLocalDateKey(new Date());
  const selectedMeetings = selectedDateKey ? meetingsByDate[selectedDateKey] || [] : [];
  const selectedDateLabel = selectedDateKey
    ? new Date(`${selectedDateKey}T00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light text-gray-900">My Meetings</h1>
        <button
          onClick={() => openDay(todayKey)}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Schedule Meeting
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10 items-start">
        {/* Calendar */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              &larr;
            </button>
            <p className="text-sm font-medium text-gray-900">
              {monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </p>
            <button
              onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              &rarr;
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayMeetings = meetingsByDate[dateKey] || [];
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === todayKey;
              return (
                <button
                  key={i}
                  onClick={() => openDay(dateKey)}
                  className={`aspect-square flex flex-col items-center justify-center text-sm rounded-lg relative transition-colors ${
                    isSelected
                      ? "bg-gray-900 text-white"
                      : isToday
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {day}
                  {dayMeetings.length > 0 && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${isSelected ? "bg-white" : "bg-red-600"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day panel — appears to the right when a date is clicked */}
        {selectedDateKey ? (
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">{selectedDateLabel}</h2>
              <button onClick={closeDay} className="text-xs text-gray-400 hover:text-gray-900">
                Close
              </button>
            </div>

            {selectedMeetings.length > 0 && (
              <div className="space-y-2 mb-5">
                {selectedMeetings.map((m) => (
                  <div key={m.id} className="border border-gray-200 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-900">Dr. {m.doctor_name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(m.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </p>
                        {m.notes && <p className="text-xs text-gray-400 mt-1">{m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[m.status]}`}>
                          {m.status}
                        </span>
                        {m.status === "upcoming" && (
                          <>
                            <button
                              onClick={() => updateStatus(m.id, "completed")}
                              className="text-xs text-green-600 hover:text-green-700"
                            >
                              Mark done
                            </button>
                            <button
                              onClick={() => updateStatus(m.id, "cancelled")}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* MOM (Minutes of Meeting) */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {editingMomId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={momDraft}
                            onChange={(e) => setMomDraft(e.target.value)}
                            rows={2}
                            placeholder="What was discussed / decided..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-900"
                            autoFocus
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => saveMom(m.id)}
                              disabled={savingMom}
                              className="text-xs font-medium text-gray-900 hover:underline disabled:opacity-50"
                            >
                              {savingMom ? "Saving..." : "Save"}
                            </button>
                            <button onClick={() => setEditingMomId(null)} className="text-xs text-gray-400 hover:text-gray-900">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : m.mom ? (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">MOM</p>
                          <p className="text-xs text-gray-600">{m.mom}</p>
                          <button onClick={() => startEditMom(m)} className="text-xs text-blue-600 hover:text-blue-700 mt-1">
                            Edit
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEditMom(m)} className="text-xs text-blue-600 hover:text-blue-700">
                          + Add MOM
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs font-medium text-gray-500 mb-3">
              {selectedMeetings.length > 0 ? "Schedule another meeting for this day" : "Schedule a meeting for this day"}
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Doctor</label>
                <select
                  value={dayForm.doctor_id}
                  onChange={(e) => setDayForm({ ...dayForm, doctor_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                >
                  <option value="">Select a doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.clinic_name ? ` — ${d.clinic_name}` : ""}
                    </option>
                  ))}
                </select>
                {doctors.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    You don&apos;t have any doctors yet — add one from the Doctors page first.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Time</label>
                <input
                  type="time"
                  value={dayForm.time}
                  onChange={(e) => setDayForm({ ...dayForm, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={dayForm.notes}
                  onChange={(e) => setDayForm({ ...dayForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">MOM — Minutes of Meeting (optional)</label>
                <textarea
                  value={dayForm.mom}
                  onChange={(e) => setDayForm({ ...dayForm, mom: e.target.value })}
                  rows={2}
                  placeholder="What was discussed / decided..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Doctor requested something? (optional)
                </label>
                <textarea
                  value={dayForm.request}
                  onChange={(e) => setDayForm({ ...dayForm, request: e.target.value })}
                  rows={2}
                  placeholder="e.g. Dr. wants more samples of X, needs a brochure for Y..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <p className="text-xs text-gray-400 mt-1">
                  This gets flagged to our team separately so it doesn&apos;t get lost in the notes.
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </form>
          </div>
        ) : (
          <div className="border border-dashed border-gray-200 rounded-lg p-6 flex items-center justify-center text-center h-full min-h-[200px]">
            <p className="text-sm text-gray-400">Click a date on the calendar to view or schedule a meeting</p>
          </div>
        )}
      </div>

      {/* Upcoming list */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Upcoming ({upcoming.length})
        </h2>
        <div className="flex gap-2">
          {UPCOMING_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setUpcomingFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                upcomingFilter === f.value
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-400">
          {upcomingFilter === "all" ? "No upcoming meetings scheduled" : "No meetings in this range"}
        </p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((m) => (
            <div key={m.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm text-gray-900">Dr. {m.doctor_name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {m.notes && <p className="text-xs text-gray-400 mt-1">{m.notes}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[m.status]}`}>
                  {m.status}
                </span>
                <button
                  onClick={() => updateStatus(m.id, "completed")}
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  Mark done
                </button>
                <button
                  onClick={() => updateStatus(m.id, "cancelled")}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
