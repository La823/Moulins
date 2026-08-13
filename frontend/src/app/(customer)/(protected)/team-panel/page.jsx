"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

const STATUS_COLORS = {
  present: "text-green-600 bg-green-50",
  late: "text-yellow-600 bg-yellow-50",
  "half-day": "text-orange-600 bg-orange-50",
  absent: "text-red-600 bg-red-50",
};

export default function TeamPanelDashboard() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      apiFetch(`/my-attendance?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).catch(() => []),
      apiFetch(`/my-daily-log?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).catch(() => []),
    ]).then(([att, dailyLogs]) => {
      setAttendance(Array.isArray(att) ? att : []);
      setLogs(Array.isArray(dailyLogs) ? dailyLogs : []);
      setLoading(false);
    });
  }, []);

  const presentDays = attendance.filter((a) => a.status === "present").length;
  const lateDays = attendance.filter((a) => a.status === "late").length;
  const absentDays = attendance.filter((a) => a.status === "absent").length;
  const recentLogs = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);

  const quickLinks = [
    { label: "Mark today's attendance", href: "/team-panel/attendance", icon: "📅" },
    { label: "Write today's log", href: "/team-panel/daily-log", icon: "📝" },
    { label: "View doctors", href: "/team-panel/doctors", icon: "🩺" },
    { label: "Log a meeting", href: "/team-panel/meetings", icon: "🤝" },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-light text-gray-900 mb-1">
        Welcome, {user?.username || user?.phone_number}
      </h1>
      <p className="text-sm text-gray-400 mb-8">Here's your activity this month.</p>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className={`rounded-xl p-4 ${STATUS_COLORS.present}`}>
          <p className="text-2xl font-semibold">{loading ? "—" : presentDays}</p>
          <p className="text-xs font-medium mt-1">Present days</p>
        </div>
        <div className={`rounded-xl p-4 ${STATUS_COLORS.late}`}>
          <p className="text-2xl font-semibold">{loading ? "—" : lateDays}</p>
          <p className="text-xs font-medium mt-1">Late days</p>
        </div>
        <div className={`rounded-xl p-4 ${STATUS_COLORS.absent}`}>
          <p className="text-2xl font-semibold">{loading ? "—" : absentDays}</p>
          <p className="text-xs font-medium mt-1">Absent days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
        {quickLinks.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
          >
            <span className="text-xl">{q.icon}</span>
            <span className="text-sm font-medium text-gray-800">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Recent Daily Logs</h3>
        <Link href="/team-panel/daily-log" className="text-xs text-red-600 hover:text-red-700">
          View all &rarr;
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : recentLogs.length === 0 ? (
        <p className="text-sm text-gray-400">No logs submitted yet this month.</p>
      ) : (
        <div className="space-y-3">
          {recentLogs.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">{l.date}</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-2">{l.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
