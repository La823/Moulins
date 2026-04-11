"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS = {
  present: "bg-green-100 text-green-800",
  late: "bg-yellow-100 text-yellow-800",
  "half-day": "bg-orange-100 text-orange-800",
  absent: "bg-red-100 text-red-800",
};

export default function MyAttendancePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    apiFetch("/attendance-visibility")
      .then((data) => setVisible(data.visible === "true"))
      .catch(() => setVisible(false));
  }, []);

  const fetchAttendance = useCallback(async () => {
    if (visible === false) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/my-attendance?year=${year}&month=${month}`);
      setAttendance(Array.isArray(data) ? data : []);
    } catch {
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, visible]);

  useEffect(() => { if (visible) fetchAttendance(); }, [fetchAttendance, visible]);

  if (visible === null) return <p className="text-sm text-gray-400 p-6">Loading...</p>;

  if (!visible) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-sm text-gray-500">Attendance viewing is not enabled</p>
          <p className="text-xs text-gray-400 mt-1">Contact your admin to enable this feature</p>
        </div>
      </div>
    );
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const attendanceByDay = {};
  attendance.forEach((a) => {
    const day = parseInt(a.date.split("-")[2], 10);
    attendanceByDay[day] = a;
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
    setSelectedDate(null);
  };

  const isToday = (day) => day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

  // Stats
  const presentDays = attendance.filter((a) => a.status === "present").length;
  const lateDays = attendance.filter((a) => a.status === "late").length;
  const halfDays = attendance.filter((a) => a.status === "half-day").length;
  const absentDays = attendance.filter((a) => a.status === "absent").length;

  const selectedRecord = selectedDate ? attendanceByDay[selectedDate] : null;

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-800 mb-6">My Attendance</h2>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Present", value: presentDays, color: "text-green-600 bg-green-50" },
          { label: "Late", value: lateDays, color: "text-yellow-600 bg-yellow-50" },
          { label: "Half Day", value: halfDays, color: "text-orange-600 bg-orange-50" },
          { label: "Absent", value: absentDays, color: "text-red-600 bg-red-50" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs font-medium mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

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
              <p className="text-sm text-gray-400">Loading...</p>
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
                    onClick={() => setSelectedDate(selected ? null : day)}
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
        </div>

        {/* Day detail */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {!selectedDate ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-gray-400 text-center">Click a day to see details</p>
            </div>
          ) : selectedRecord ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                {selectedDate} {MONTHS[month - 1]}
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedRecord.status]}`}>
                    {selectedRecord.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Check-in Time</p>
                  <p className="text-sm text-gray-900 mt-0.5">{selectedRecord.check_in_time.slice(0, 5)}</p>
                </div>
                {selectedRecord.description && (
                  <div>
                    <p className="text-xs text-gray-500">Notes</p>
                    <p className="text-sm text-gray-700 mt-0.5">{selectedRecord.description}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                {selectedDate} {MONTHS[month - 1]}
              </h3>
              <p className="text-xs text-gray-400">No attendance recorded</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
