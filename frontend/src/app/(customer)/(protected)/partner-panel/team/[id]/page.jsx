"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { STATUSES, NOT_MARKED, friendlyDate, UpdateItem, UpdateList, asVisits } from "@/components/team/attendanceUi";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let googleMapsScriptPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleMapsScriptPromise;
}

// Daily-log markers reuse the doctor pin shape but in teal, so they read as
// distinct from the red clinic pins on the Doctors Map.
const LOG_MARKER_ICON = {
  path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  fillColor: "#00A6A4",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
  scale: 1.6,
  anchor: { x: 12, y: 22 },
};

function DailyLogsMap({ logs }) {
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const mapDivRef = useRef(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      setError("Google Maps API key is not configured");
      return;
    }
    loadGoogleMaps()
      .then(() => setMapReady(true))
      .catch(() => setError("Failed to load Google Maps"));
  }, []);

  const located = logs.filter((l) => l.latitude != null && l.longitude != null);

  useEffect(() => {
    if (!mapReady || !mapDivRef.current) return;

    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: 22.5, lng: 79.5 },
      zoom: 5,
    });

    if (located.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    located.forEach((l) => {
      const position = { lat: l.latitude, lng: l.longitude };
      const marker = new window.google.maps.Marker({
        position,
        map,
        title: l.date,
        icon: {
          ...LOG_MARKER_ICON,
          anchor: new window.google.maps.Point(12, 22),
        },
      });
      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-size:13px;line-height:1.5;">
            <strong>${l.date}</strong><br/>
            ${l.address ? `${l.address}<br/>` : ""}
            <span style="color:#888;">${(l.notes || "").slice(0, 120)}</span>
          </div>
        `);
        infoWindow.open(map, marker);
      });
      bounds.extend(position);
    });

    if (located.length > 1) {
      map.fitBounds(bounds);
    } else {
      map.setCenter({ lat: located[0].latitude, lng: located[0].longitude });
      map.setZoom(14);
    }
  }, [mapReady, located]);

  if (error) {
    return <p className="text-sm text-red-600 mb-4">{error}</p>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      {!mapReady ? (
        <div className="h-[350px] flex items-center justify-center text-sm text-gray-400">Loading map...</div>
      ) : located.length === 0 ? (
        <div className="h-[350px] flex items-center justify-center text-sm text-gray-400">
          No located logs for this month
        </div>
      ) : (
        <div ref={mapDivRef} className="h-[350px] w-full" />
      )}
    </div>
  );
}

export default function TeamMemberPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [attendance, setAttendance] = useState([]);
  const [logs, setLogs] = useState([]);
  const [member, setMember] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [form, setForm] = useState({ check_in_time: "09:00", status: "present", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Schedule-a-meeting-for-this-team-member, shown alongside the selected
  // day's logs/attendance instead of on the general Meetings page, since a
  // partner reviewing a specific day here is often deciding right then
  // whether to book a follow-up for that rep.
  const [doctors, setDoctors] = useState([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ doctor_id: "", time: "11:00", notes: "" });
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (user && user.role !== "partner") router.push("/dashboard");
  }, [user, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [att, dailyLogs, visits] = await Promise.all([
        apiFetch(`/team/${id}/attendance/month?year=${year}&month=${month}`),
        apiFetch(`/team/${id}/daily-logs?year=${year}&month=${month}`),
        apiFetch(`/team/visit-logs?year=${year}&month=${month}`).catch(() => []),
      ]);
      setAttendance(Array.isArray(att) ? att : []);
      // their daily updates plus the doctor visits they logged
      setLogs([
        ...(Array.isArray(dailyLogs) ? dailyLogs : []),
        ...asVisits(visits).filter((v) => v.team_member_id === id),
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, year, month]);

  useEffect(() => {
    if (user?.role === "partner") fetchData();
  }, [fetchData, user]);

  useEffect(() => {
    if (user?.role === "partner") {
      apiFetch(`/team/${id}`)
        .then(setMember)
        .catch((err) => console.error(err));
      apiFetch("/doctors")
        .then((data) => setDoctors(Array.isArray(data) ? data : []))
        .catch(() => setDoctors([]));
    }
  }, [id, user]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const attendanceByDay = {};
  attendance.forEach((a) => { attendanceByDay[parseInt(a.date.split("-")[2], 10)] = a; });

  const logsByDay = {};
  logs.forEach((l) => {
    const day = parseInt(l.date.split("-")[2], 10);
    (logsByDay[day] ||= []).push(l);
  });

  const dateStr = (day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
    setSelectedDate(null);
  };

  const isToday = (day) => day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

  const selectDate = (day) => {
    const selected = selectedDate === day;
    setSelectedDate(selected ? null : day);
    setError("");
    const rec = attendanceByDay[day];
    setForm(rec
      ? { check_in_time: rec.check_in_time.slice(0, 5), status: rec.status, description: rec.description || "" }
      : { check_in_time: "09:00", status: "present", description: "" });
    setScheduleOpen(false);
    setScheduleError("");
    setScheduleForm({ doctor_id: "", time: "11:00", notes: "" });
  };

  const handleScheduleMeeting = async (e) => {
    e.preventDefault();
    if (!selectedDate || !scheduleForm.doctor_id) return;
    setScheduleSubmitting(true);
    setScheduleError("");
    try {
      await apiFetch("/meetings", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: scheduleForm.doctor_id,
          scheduled_at: `${dateStr(selectedDate)}T${scheduleForm.time}:00`,
          notes: scheduleForm.notes.trim() || null,
          assigned_to: id,
        }),
      });
      setScheduleOpen(false);
      setScheduleForm({ doctor_id: "", time: "11:00", notes: "" });
    } catch (err) {
      setScheduleError(err.message);
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleMark = async (e) => {
    e.preventDefault();
    if (!selectedDate) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/team/attendance", {
        method: "POST",
        body: JSON.stringify({
          employee_id: id,
          date: dateStr(selectedDate),
          check_in_time: form.check_in_time,
          status: form.status,
          description: form.description.trim() || null,
        }),
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAttendance = async (attId) => {
    if (!confirm("Delete this attendance record?")) return;
    try {
      await apiFetch(`/team/attendance/${attId}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const selectedRecord = selectedDate ? attendanceByDay[selectedDate] : null;

  const startEditEmail = () => {
    setEmailInput(member?.email || "");
    setEditingEmail(true);
  };

  const saveEmail = async () => {
    setSavingEmail(true);
    try {
      await apiFetch(`/team/${id}`, {
        method: "PUT",
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      setMember((m) => ({ ...m, email: emailInput.trim() || null }));
      setEditingEmail(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEmail(false);
    }
  };

  if (user && user.role !== "partner") return null;

  return (
    <div className="max-w-5xl">
      <Link href="/partner-panel/team" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-5">
        &larr; My Team
      </Link>

      {member && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Login Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400 text-xs">Name</span>
              <p className="text-gray-900 font-medium mt-0.5">{member.username || "—"}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Phone</span>
              <p className="text-gray-900 font-medium mt-0.5">{member.phone_number}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Email</span>
              {editingEmail ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400"
                    placeholder="name@example.com"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveEmail}
                    disabled={savingEmail}
                    className="text-xs text-teal-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                  >
                    {savingEmail ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingEmail(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-gray-900 font-medium">{member.email || "—"}</p>
                  <button
                    type="button"
                    onClick={startEditEmail}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    {member.email ? "Edit" : "Add"}
                  </button>
                </div>
              )}
            </div>
            <div>
              <span className="text-gray-400 text-xs">Password</span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-gray-900 font-medium font-mono">
                  {member.plain_password
                    ? (showPassword ? member.plain_password : "••••••••")
                    : "Not available"}
                </p>
                {member.plain_password && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h3 className="text-sm font-semibold text-gray-800">{MONTHS[month - 1]} {year}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader size="sm" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} />;
                const rec = attendanceByDay[day];
                const selected = selectedDate === day;
                return (
                  <button
                    key={day}
                    onClick={() => selectDate(day)}
                    className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                      selected
                        ? "bg-gray-900 text-white"
                        : rec
                        ? rec.status === "present" ? "bg-green-50 text-green-800"
                          : rec.status === "late" ? "bg-yellow-50 text-yellow-800"
                          : rec.status === "half-day" ? "bg-orange-50 text-orange-800"
                          : "bg-red-50 text-red-800"
                        : isToday(day)
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {[...STATUSES, NOT_MARKED].map((st) => (
              <span key={st.label} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
            ))}
          </div>
        </div>

        {/* Mark attendance for selected day */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {!selectedDate ? (
            <div className="h-full flex items-center justify-center min-h-[200px]">
              <p className="text-sm text-gray-400 text-center">Pick a day on the calendar to see their updates and mark attendance</p>
            </div>
          ) : (
            <div className="space-y-5">
              <h3 className="text-base font-semibold text-gray-900">
                {friendlyDate(`${year}-${String(month).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}`)}
              </h3>

              {/* Logs submitted for this day */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {(logsByDay[selectedDate] || []).length === 0
                    ? "No updates sent"
                    : `${logsByDay[selectedDate].length} update${logsByDay[selectedDate].length > 1 ? "s" : ""}`}
                </p>
                {(logsByDay[selectedDate] || []).length > 0 && <UpdateList logs={logsByDay[selectedDate]} />}
              </div>

              <form onSubmit={handleMark} className="space-y-3">
              <div>
                <p className="block text-xs text-gray-500 mb-1.5">Attendance</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setForm({ ...form, status: st.key })}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                        form.status === st.key ? st.on : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Came in at</label>
                  <input
                    type="time"
                    value={form.check_in_time}
                    onChange={(e) => setForm({ ...form, check_in_time: e.target.value })}
                    required
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : selectedRecord ? "Save changes" : "Save attendance"}
                </button>
                {selectedRecord && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAttendance(selectedRecord.id)}
                    className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              </form>

              {/* Schedule a meeting for this team member on this day */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setScheduleOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-medium text-gray-500"
                >
                  <span>Schedule a meeting for {member?.username || "this member"}</span>
                  <span className="text-gray-400">{scheduleOpen ? "▾" : "▸"}</span>
                </button>
                {scheduleOpen && (
                  <form onSubmit={handleScheduleMeeting} className="space-y-2 mt-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Doctor</label>
                      <select
                        value={scheduleForm.doctor_id}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, doctor_id: e.target.value })}
                        required
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                      >
                        <option value="">Select a doctor</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}{d.clinic_name ? ` — ${d.clinic_name}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Time</label>
                      <input
                        type="time"
                        value={scheduleForm.time}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={scheduleForm.notes}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                      />
                    </div>
                    {scheduleError && <p className="text-xs text-red-600">{scheduleError}</p>}
                    <button
                      type="submit"
                      disabled={scheduleSubmitting}
                      className="w-full px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
                    >
                      {scheduleSubmitting ? "Scheduling..." : "Schedule Meeting"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Daily logs */}
      <div className="mt-8">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Updates this month</h3>
        {logs.length > 0 && <DailyLogsMap logs={logs} />}
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">No logs submitted for {MONTHS[month - 1]} {year}.</p>
        ) : (
          <div className="space-y-4 mt-4">
            {[...new Set(logs.map((l) => l.date))].sort().reverse().map((d) => (
              <section key={d} className="bg-white rounded-xl border border-gray-200">
                <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-900">{friendlyDate(d)}</div>
                <div className="px-4 py-4 space-y-4 border-l-2 border-teal-50 ml-4">
                  {logs
                    .filter((l) => l.date === d)
                    .sort((x, y) => x.created_at.localeCompare(y.created_at))
                    .map((l) => (
                      <UpdateItem key={l.id} log={l} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
