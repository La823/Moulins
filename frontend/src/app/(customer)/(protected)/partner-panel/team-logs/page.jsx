"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { friendlyDate, UpdateItem, MonthSwitcher, MONTHS, asVisits } from "@/components/team/attendanceUi";

// Every update the team sent this month, newest day first, grouped under
// "Today", "Yesterday", "Wed, 8 Oct" … — who, when, where, and what.
export default function TeamLogsPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberFilter, setMemberFilter] = useState("all");

  const fetchLogs = useCallback(() => {
    setLoading(true);
    // daily updates and doctor visits, shown together
    Promise.all([
      apiFetch(`/team/daily-logs?year=${year}&month=${month}`).catch(() => []),
      apiFetch(`/team/visit-logs?year=${year}&month=${month}`).catch(() => []),
    ])
      .then(([daily, visits]) => setLogs([...(Array.isArray(daily) ? daily : []), ...asVisits(visits)]))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const members = Array.from(new Set(logs.map((l) => l.member_name))).sort();
  const visible = memberFilter === "all" ? logs : logs.filter((l) => l.member_name === memberFilter);

  // newest day first; within a day, in the order they were sent
  const byDay = {};
  visible.forEach((l) => {
    (byDay[l.date] ||= []).push(l);
  });
  const dayKeys = Object.keys(byDay).sort().reverse();
  dayKeys.forEach((d) => byDay[d].sort((a, b) => a.created_at.localeCompare(b.created_at)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Team Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every update and doctor visit your team logged, with the time and place — visits show how far from the clinic they were.{" "}
            <Link href="/partner-panel/attendance" className="text-teal-700 hover:underline">
              See attendance &rarr;
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {members.length > 0 && (
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
            >
              <option value="all">Everyone</option>
              {members.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <MonthSwitcher year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setMemberFilter("all"); }} />
        </div>
      </div>

      {loading ? (
        <Loader />
      ) : dayKeys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">No updates in {MONTHS[month - 1]} {year}.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {dayKeys.map((d) => (
            <section key={d} className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">{friendlyDate(d)}</h2>
                <span className="text-xs text-gray-400">
                  {byDay[d].length} update{byDay[d].length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="px-4 py-4 space-y-4 border-l-2 border-teal-50 ml-4">
                {byDay[d].map((l) => (
                  <UpdateItem key={l.id} log={l} showName />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
