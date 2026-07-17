"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AttendancePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  // Per-employee form state: { [employeeId]: { check_in_time, status, description } }
  const [forms, setForms] = useState({});
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [att, emps] = await Promise.all([
        apiFetch(`/admin/attendance/month?year=${year}&month=${month}`),
        apiFetch("/admin/employees"),
      ]);
      setAttendance(Array.isArray(att) ? att : []);
      setEmployees(Array.isArray(emps) ? emps : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calendar helpers
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // Group attendance by date
  const attendanceByDate = {};
  attendance.forEach((a) => {
    const day = parseInt(a.date.split("-")[2], 10);
    if (!attendanceByDate[day]) attendanceByDate[day] = [];
    attendanceByDate[day].push(a);
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDate(null);
  };

  const dateStr = (day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const getForm = (empId) => forms[empId] || { check_in_time: "09:00", status: "present", description: "" };
  const updateForm = (empId, patch) => setForms({ ...forms, [empId]: { ...getForm(empId), ...patch } });

  const toggleExpand = (empId) => {
    setExpandedEmp(expandedEmp === empId ? null : empId);
    setError("");
  };

  const handleMark = async (e, empId) => {
    e.preventDefault();
    if (!selectedDate) return;
    const f = getForm(empId);
    setSubmitting(empId);
    setError("");
    try {
      await apiFetch("/admin/attendance", {
        method: "POST",
        body: JSON.stringify({
          employee_id: empId,
          date: dateStr(selectedDate),
          check_in_time: f.check_in_time,
          status: f.status,
          description: f.description.trim() || null,
        }),
      });
      setExpandedEmp(null);
      setForms((prev) => { const next = { ...prev }; delete next[empId]; return next; });
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this attendance record?")) return;
    try {
      await apiFetch(`/admin/attendance/${id}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const isToday = (day) => day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

  const selectedRecords = selectedDate ? (attendanceByDate[selectedDate] || []) : [];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Attendance</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h3 className="text-sm font-semibold text-gray-800">
              {MONTHS[month - 1]} {year}
            </h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-gray-400">Loading...</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} />;
                const count = (attendanceByDate[day] || []).length;
                const selected = selectedDate === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(selected ? null : day)}
                    className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                      selected
                        ? "bg-gray-900 text-white"
                        : isToday(day)
                        ? "bg-red-50 text-red-700 font-medium"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {day}
                    {count > 0 && (
                      <div className={`absolute bottom-1 flex gap-0.5`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white/60" : "bg-green-400"}`} />
                        {count > 1 && <span className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white/40" : "bg-green-300"}`} />}
                        {count > 2 && <span className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white/20" : "bg-green-200"}`} />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Attendance marked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-50 border border-red-100" /> Today
            </span>
          </div>
        </div>

        {/* Right panel: employee list */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {!selectedDate ? (
            <div className="h-full flex items-center justify-center min-h-[200px]">
              <p className="text-sm text-gray-400 text-center">
                Click on a day to view and mark attendance
              </p>
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">No employees found</p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                {selectedDate} {MONTHS[month - 1]} {year}
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                {selectedRecords.length}/{employees.length} marked
              </p>

              <div className="space-y-2">
                {employees.map((emp) => {
                  const record = selectedRecords.find((r) => r.employee_id === emp.id);
                  const isMarked = !!record;
                  const isExpanded = expandedEmp === emp.id;
                  const f = getForm(emp.id);

                  return (
                    <div key={emp.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Employee row - always visible */}
                      <button
                        onClick={() => toggleExpand(emp.id)}
                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          isMarked
                            ? record.status === "present" ? "bg-green-100 text-green-700"
                              : record.status === "late" ? "bg-yellow-100 text-yellow-700"
                              : record.status === "half-day" ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {(emp.username || emp.phone_number || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {emp.username || emp.phone_number}
                          </p>
                          {isMarked ? (
                            <p className="text-xs text-gray-500">
                              {record.check_in_time.slice(0, 5)}
                              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                record.status === "present" ? "bg-green-50 text-green-700" :
                                record.status === "late" ? "bg-yellow-50 text-yellow-700" :
                                record.status === "half-day" ? "bg-orange-50 text-orange-700" :
                                "bg-red-50 text-red-700"
                              }`}>
                                {record.status}
                              </span>
                              {record.description && (
                                <span className="ml-1.5 text-gray-400"> &middot; {record.description}</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">Not marked</p>
                          )}
                        </div>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {/* Expanded form */}
                      {isExpanded && (
                        <form onSubmit={(e) => handleMark(e, emp.id)} className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                              <input
                                type="time"
                                value={f.check_in_time}
                                onChange={(e) => updateForm(emp.id, { check_in_time: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Status</label>
                              <select
                                value={f.status}
                                onChange={(e) => updateForm(emp.id, { status: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                              >
                                <option value="present">Present</option>
                                <option value="late">Late</option>
                                <option value="half-day">Half Day</option>
                                <option value="absent">Absent</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Notes</label>
                            <input
                              type="text"
                              value={f.description}
                              onChange={(e) => updateForm(emp.id, { description: e.target.value })}
                              placeholder="e.g. Late due to traffic"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                            />
                          </div>
                          {error && expandedEmp === emp.id && (
                            <p className="text-xs text-red-600">{error}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={submitting === emp.id}
                              className="flex-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                              {submitting === emp.id ? "Saving..." : isMarked ? "Update" : "Mark"}
                            </button>
                            {isMarked && (
                              <button
                                type="button"
                                onClick={() => handleDelete(record.id)}
                                className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
