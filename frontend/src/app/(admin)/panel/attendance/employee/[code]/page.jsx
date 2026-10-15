"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import {
  STATES, WEEKDAYS, shiftMonth, prettyDate, prettyMonth, hm,
  StateChip, Remarks, Punches, Stat, Stepper,
} from "@/components/admin/attendanceShared";

// One employee's month from the fingerprint scanner, as a calendar.
// Reached from any name on /panel/attendance; ?month=YYYY-MM picks the month.

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function clock(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
}

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EmployeeCalendar() {
  const { code } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const today = status?.today;
  const thisMonth = today?.slice(0, 7);
  const month = searchParams.get("month") || thisMonth;

  useEffect(() => {
    apiFetch("/admin/etime/status").then(setStatus).catch((e) => setError(e.message));
    apiFetch("/admin/etime/employees").then((e) => setEmployees(Array.isArray(e) ? e : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError("");
    apiFetch(`/admin/etime/employees/${encodeURIComponent(code)}/month?month=${month}`)
      .then((d) => {
        setData(d);
        // Select today in the current month, otherwise the latest day shown.
        const dates = d?.dates || [];
        setSelected(dates.includes(today) ? today : dates[dates.length - 1] || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code, month, today]);

  const go = (c, m) => router.push(`/panel/attendance/employee/${encodeURIComponent(c)}?month=${m}`);

  const emp = data?.employees?.[0];
  const t = emp?.totals;
  const byDate = Object.fromEntries((emp?.days || []).map((d) => [d.date, d]));
  const day = selected ? byDate[selected] : null;

  // Usual arrival / leaving: average over days with that punch.
  const ins = (emp?.days || []).filter((d) => d.in_time).map((d) => toMinutes(d.in_time));
  const outs = (emp?.days || []).filter((d) => d.in_time && d.out_time).map((d) => toMinutes(d.out_time));
  const avg = (xs) => (xs.length ? clock(xs.reduce((a, b) => a + b, 0) / xs.length) : "—");

  const [y, m] = (month || "2000-01").split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  const exportMonth = () => {
    const header = ["Date", "Day", "Status", "In", "Out", "Hours", "Late (min)", "Left early (min)", "Overtime (min)", "Scans", "Remarks"];
    const rows = emp.days.map((d) => [
      d.date,
      WEEKDAYS[new Date(d.date + "T00:00:00").getDay()],
      (STATES[d.state] || STATES.other).label,
      d.in_time || "",
      d.out_time || "",
      (d.work_minutes / 60).toFixed(2),
      d.in_time ? d.late_minutes : "",
      d.early_out_minutes || "",
      d.overtime_minutes || "",
      d.punches.map((p) => p.time + (p.manual ? " (manual)" : "")).join(" "),
      d.remark || "",
    ]);
    downloadCsv(`attendance-${emp.emp_code}-${emp.name.replace(/\s+/g, "-")}-${month}.csv`, [header, ...rows]);
  };

  return (
    <>
      <Link href="/panel/attendance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Attendance
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-0 mr-auto">
          <h2 className="text-lg font-semibold text-gray-800 truncate">{emp?.name || (loading ? "…" : "Employee")}</h2>
          <p className="text-xs text-gray-400">#{code} · fingerprint attendance from eTimeOffice</p>
        </div>
        {employees.length > 0 && month && (
          <select
            value={code}
            onChange={(e) => go(e.target.value, month)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"
            aria-label="Switch employee"
          >
            {employees.map((e) => (
              <option key={e.emp_code} value={e.emp_code}>{e.name} (#{e.emp_code}){e.active ? "" : " · hidden"}</option>
            ))}
          </select>
        )}
        {month && (
          <Stepper label={prettyMonth(month)} onPrev={() => go(code, shiftMonth(month, -1))} onNext={() => go(code, shiftMonth(month, 1))} nextDisabled={month >= thisMonth} />
        )}
        {emp && (
          <button onClick={exportMonth} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Export month (CSV)
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-red-600">{error.includes("not found") ? "No such employee in eTimeOffice." : error}</p>
      ) : !emp ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">Nothing for this month.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <Stat label="Present" value={t.present} tone="text-green-700" hint={t.half_day ? `incl. ${t.half_day} half day${t.half_day > 1 ? "s" : ""}` : `of ${data.dates.length - t.weekly_off - t.holiday} working days`} />
            <Stat label="Absent" value={t.absent} tone="text-red-600" hint={t.missed_punch ? `+ ${t.missed_punch} missed punch` : undefined} />
            <Stat label="Late" value={t.late} tone="text-amber-700" hint={t.late ? `${hm(t.late_minutes)} in total` : undefined} />
            <Stat label="Left early" value={t.early_out} tone="text-orange-600" />
            <Stat label="Hours" value={hm(t.work_minutes)} hint={t.overtime_minutes ? `${hm(t.overtime_minutes)} overtime` : undefined} />
            <Stat label="Usual in / out" value={avg(ins)} hint={`out ${avg(outs)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-2">{d}</div>
                ))}
              </div>
              <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
                {cells.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} />;
                  const r = byDate[d];
                  const s = r ? STATES[r.state] || STATES.other : null;
                  const isSel = d === selected;
                  const late = r && r.late_minutes > 0 && r.in_time;
                  return (
                    <button
                      key={d}
                      disabled={!r}
                      onClick={() => setSelected(d)}
                      title={r ? s.label : undefined}
                      className={`relative min-h-[4.5rem] rounded-lg p-1.5 flex flex-col text-left border transition-shadow ${
                        !r ? "border-transparent cursor-default" : `${s.cell} border-transparent hover:shadow-sm`
                      } ${isSel ? "ring-2 ring-gray-900 ring-offset-1" : ""} ${d === today && !isSel ? "ring-1 ring-red-300" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${r ? "" : "text-gray-300"}`}>{Number(d.slice(8))}</span>
                        {r && <span className="text-[9px] font-bold opacity-70">{s.code}</span>}
                      </div>
                      {r?.in_time && (
                        <span className="mt-auto text-[10px] font-mono leading-tight">
                          {r.in_time}
                          <br />
                          {r.out_time || (r.state === "in" ? "now" : "—")}
                        </span>
                      )}
                      {late && <span className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" title={`Late ${hm(r.late_minutes)}`} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
                {["present", "half_day", "absent", "missed_punch", "weekly_off", "holiday"].map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded ${STATES[k].cell}`} /> {STATES[k].label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Late</span>
              </div>
            </div>

            {/* Selected day */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 self-start">
              {!day ? (
                <p className="text-sm text-gray-400 text-center py-10">Pick a day on the calendar</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">{prettyDate(day.date)}</h3>
                      {day.date === today && <p className="text-xs text-red-600">Today</p>}
                    </div>
                    <StateChip state={day.state} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
                    <div><dt className="text-[11px] text-gray-400">In</dt><dd className="font-mono text-gray-800">{day.in_time || "—"}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Out</dt><dd className="font-mono text-gray-800">{day.out_time || (day.state === "in" ? "still at work" : "—")}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Hours</dt><dd className="text-gray-800">{hm(day.work_minutes)}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Overtime</dt><dd className="text-gray-800">{hm(day.overtime_minutes)}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Late by</dt><dd className={day.late_minutes && day.in_time ? "text-amber-700 font-medium" : "text-gray-800"}>{day.in_time ? hm(day.late_minutes) : "—"}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Left early by</dt><dd className={day.early_out_minutes ? "text-orange-600 font-medium" : "text-gray-800"}>{hm(day.early_out_minutes)}</dd></div>
                  </dl>

                  <p className="text-[11px] text-gray-400 mb-1.5">Every scan</p>
                  <Punches punches={day.punches} />
                  {day.punches?.some((p) => p.manual) && (
                    <p className="text-[11px] text-purple-700 mt-1.5">M = added by hand in eTimeOffice, not a fingerprint scan</p>
                  )}

                  {day.remark && (
                    <>
                      <p className="text-[11px] text-gray-400 mt-4 mb-1.5">eTimeOffice remarks</p>
                      <Remarks remark={day.remark} />
                    </>
                  )}
                  {day.state === "missed_punch" && (
                    <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2 mt-4">
                      Only one scan this day, so eTimeOffice counts it as absent.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function EmployeeAttendancePage() {
  // useSearchParams needs a Suspense boundary for the production build.
  return (
    <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>}>
      <EmployeeCalendar />
    </Suspense>
  );
}
