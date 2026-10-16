"use client";

// Shared pieces of the Attendance pages (/panel/attendance, the per-employee
// calendar, and staff's My Leaves): eTimeOffice day states, date helpers,
// small UI bits and the month calendar.

import { useState } from "react";

export const STATES = {
  present: { label: "Present", code: "P", chip: "bg-green-50 text-green-700 border-green-200", cell: "bg-green-100 text-green-800" },
  in: { label: "At work", code: "IN", chip: "bg-teal-50 text-teal-700 border-teal-200", cell: "bg-teal-100 text-teal-800" },
  half_day: { label: "Half day", code: "½", chip: "bg-amber-50 text-amber-700 border-amber-200", cell: "bg-amber-100 text-amber-800" },
  absent: { label: "Absent", code: "A", chip: "bg-red-50 text-red-700 border-red-200", cell: "bg-red-100 text-red-700" },
  missed_punch: { label: "Missed punch", code: "MP", chip: "bg-orange-50 text-orange-700 border-orange-200", cell: "bg-orange-100 text-orange-800" },
  weekly_off: { label: "Weekly off", code: "WO", chip: "bg-gray-50 text-gray-500 border-gray-200", cell: "bg-gray-100 text-gray-400" },
  holiday: { label: "Holiday", code: "H", chip: "bg-blue-50 text-blue-700 border-blue-200", cell: "bg-blue-100 text-blue-700" },
  leave: { label: "On leave", code: "L", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", cell: "bg-indigo-100 text-indigo-800" },
  upcoming: { label: "Upcoming", code: "", chip: "bg-white text-gray-400 border-gray-200", cell: "bg-white text-gray-300" },
  not_synced: { label: "Not synced", code: "·", chip: "bg-white text-gray-400 border-gray-200", cell: "bg-white text-gray-300" },
  other: { label: "Other", code: "?", chip: "bg-gray-50 text-gray-600 border-gray-200", cell: "bg-gray-100 text-gray-600" },
};

export const REMARKS = { LT: "Late", EO: "Left early", EI: "Early in", OT: "Overtime", MIS: "Missed punch", M: "Manual entry" };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Dates travel as "YYYY-MM-DD" strings in IST; build and shift them without
// going through UTC so the day never slips.
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function shiftDate(s, days) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
export function shiftMonth(s, months) {
  const [y, m] = s.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function prettyDate(s) {
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
export function prettyMonth(s) {
  const [y, m] = s.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function hm(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
export function timeOf(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function StateChip({ state }) {
  const s = STATES[state] || STATES.other;
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${s.chip}`}>{s.label}</span>;
}

export function Remarks({ remark }) {
  if (!remark) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {remark.split("-").filter(Boolean).map((r) => (
        <span key={r} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]" title={REMARKS[r] || r}>
          {REMARKS[r] || r}
        </span>
      ))}
    </div>
  );
}

export function Punches({ punches }) {
  if (!punches?.length) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {punches.map((p, i) => (
        <span
          key={i}
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${p.manual ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-gray-100 text-gray-700"}`}
          title={p.manual ? "Added by hand in eTimeOffice" : "Fingerprint scan"}
        >
          {p.time}
          {p.manual && " M"}
        </span>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone = "text-gray-900", hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 truncate">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 truncate">{hint}</p>}
    </div>
  );
}

export function Stepper({ label, onPrev, onNext, nextDisabled, children }) {
  const btn = "p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-1">
      <button onClick={onPrev} className={btn} aria-label="Previous">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      <span className="text-sm font-semibold text-gray-800 min-w-[9.5rem] text-center">{label}</span>
      <button onClick={onNext} disabled={nextDisabled} className={btn} aria-label="Next">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
      {children}
    </div>
  );
}

export const inputCls = "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400";

// The short code a day shows in a grid cell: "½L" for a half-day leave.
export function cellCode(d) {
  if (d.state === "leave" && d.leave?.portion === 0.5) return "½L";
  return (STATES[d.state] || STATES.other).code;
}

// 1 → "1 day", 2.5 → "2.5 days"
export function fmtDays(n) {
  const v = Math.round((n || 0) * 10) / 10;
  return `${v} day${v === 1 ? "" : "s"}`;
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens the file as UTF-8.
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// One employee's month (an entry of a month report) as CSV.
export function exportEmployeeMonth(emp, month) {
  const header = ["Date", "Day", "Status", "In", "Out", "Hours", "Late (min)", "Left early (min)", "Overtime (min)", "Leave", "Scans", "Remarks"];
  const rows = emp.days
    .filter((d) => d.state !== "upcoming")
    .map((d) => [
      d.date,
      WEEKDAYS[parseYmd(d.date).getDay()],
      (STATES[d.state] || STATES.other).label,
      d.in_time || "",
      d.out_time || "",
      (d.work_minutes / 60).toFixed(2),
      d.in_time ? d.late_minutes : "",
      d.early_out_minutes || "",
      d.overtime_minutes || "",
      d.leave ? `${d.leave.portion === 0.5 ? "Half day" : "Full day"} ${d.leave.paid ? "paid" : "unpaid"}` : "",
      d.punches.map((p) => p.time + (p.manual ? " (manual)" : "")).join(" "),
      d.remark || "",
    ]);
  downloadCsv(`attendance-${emp.emp_code}-${emp.name.replace(/\s+/g, "-")}-${month}.csv`, [header, ...rows]);
}

export const LEAVE_STATUS = {
  pending: { label: "Pending", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", chip: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "Rejected", chip: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", chip: "bg-gray-50 text-gray-500 border-gray-200" },
};

export function LeaveStatusChip({ status }) {
  const s = LEAVE_STATUS[status] || LEAVE_STATUS.cancelled;
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${s.chip}`}>{s.label}</span>;
}

// "Mon, 19 Oct" or "Mon, 19 Oct – Wed, 21 Oct"; "(half day)" when it is one.
export function leaveRange(l) {
  const short = (s) => prettyDate(s).replace(/ \d{4}$/, "");
  const range = l.from_date === l.to_date ? short(l.from_date) : `${short(l.from_date)} – ${short(l.to_date)}`;
  return l.half_day ? `${range} (half day)` : range;
}

// Paid / unpaid split of an approved leave.
export function paidSplit(l) {
  if (l.status !== "approved" || l.paid_days == null) return null;
  const unpaid = Math.round((l.days - l.paid_days) * 10) / 10;
  if (unpaid <= 0) return "Paid";
  if (l.paid_days <= 0) return "Unpaid";
  return `${l.paid_days} paid, ${unpaid} unpaid`;
}

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function clock(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
}

// One employee's month as summary tiles, a calendar and the picked day's
// detail. `emp` is an entry of a month report ({name, totals, days}); give
// it a `key` of the month so the picked day resets when the month changes.
export function EmployeeMonthView({ emp, today, loading, extraStats }) {
  const days = emp.days;
  const elapsed = days.filter((d) => d.date <= today);
  const [selected, setSelected] = useState(() => {
    if (days.some((d) => d.date === today)) return today;
    return (elapsed[elapsed.length - 1] || days[0])?.date || null;
  });

  const t = emp.totals;
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const day = selected ? byDate[selected] : null;
  const month = days[0]?.date.slice(0, 7) || "2000-01";

  // Usual arrival / leaving: average over days with that punch.
  const ins = days.filter((d) => d.in_time).map((d) => toMinutes(d.in_time));
  const outs = days.filter((d) => d.in_time && d.out_time).map((d) => toMinutes(d.out_time));
  const avg = (xs) => (xs.length ? clock(xs.reduce((a, b) => a + b, 0) / xs.length) : "—");
  const workingDays = elapsed.filter((d) => d.state !== "weekly_off" && d.state !== "holiday").length;

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Stat label="Present" value={t.present} tone="text-green-700" hint={t.half_day ? `incl. ${t.half_day} half day${t.half_day > 1 ? "s" : ""}` : `of ${workingDays} working days`} />
        <Stat label="Absent" value={t.absent} tone="text-red-600" hint={t.missed_punch ? `+ ${t.missed_punch} missed punch` : undefined} />
        <Stat label="On leave" value={t.leave} tone="text-indigo-700" />
        <Stat label="Late" value={t.late} tone="text-amber-700" hint={t.late ? `${hm(t.late_minutes)} in total` : undefined} />
        <Stat label="Hours" value={hm(t.work_minutes)} hint={t.overtime_minutes ? `${hm(t.overtime_minutes)} overtime` : undefined} />
        <Stat label="Usual in / out" value={avg(ins)} hint={`out ${avg(outs)}`} />
        {extraStats}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
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
              const blank = !r || r.state === "upcoming";
              const s = r ? STATES[r.state] || STATES.other : null;
              const isSel = d === selected;
              const late = r && r.late_minutes > 0 && r.in_time;
              return (
                <button
                  key={d}
                  disabled={blank}
                  onClick={() => setSelected(d)}
                  title={r && !blank ? s.label : undefined}
                  className={`relative min-h-[4.5rem] rounded-lg p-1.5 flex flex-col text-left border transition-shadow ${
                    blank ? "border-gray-50 cursor-default" : `${s.cell} border-transparent hover:shadow-sm`
                  } ${isSel ? "ring-2 ring-gray-900 ring-offset-1" : ""} ${d === today && !isSel ? "ring-1 ring-red-300" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${blank ? "text-gray-300" : ""}`}>{Number(d.slice(8))}</span>
                    {r && !blank && <span className="text-[9px] font-bold opacity-70">{cellCode(r)}</span>}
                  </div>
                  {r?.in_time && (
                    <span className="mt-auto text-[10px] font-mono leading-tight">
                      {r.in_time}
                      <br />
                      {r.out_time || (r.state === "in" ? "now" : "—")}
                    </span>
                  )}
                  {r?.leave && r.state !== "leave" && (
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold text-indigo-700" title="Leave approved for this day">L</span>
                  )}
                  {late && <span className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" title={`Late ${hm(r.late_minutes)}`} />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
            {["present", "half_day", "leave", "absent", "missed_punch", "weekly_off", "holiday"].map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${STATES[k].cell}`} /> {STATES[k].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Late</span>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 self-start">
          {!day ? (
            <p className="text-sm text-gray-400 text-center py-10">Pick a day on the calendar</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{prettyDate(day.date)}</h3>
                  {day.date === today && <p className="text-xs text-red-600">Today</p>}
                  {day.state === "leave" && day.date > today && <p className="text-xs text-indigo-600">Upcoming</p>}
                </div>
                <StateChip state={day.state} />
              </div>

              {day.leave && (
                <p className="text-xs text-indigo-800 bg-indigo-50 rounded-lg px-3 py-2 mb-4">
                  {day.leave.portion === 0.5 ? "Half-day" : "Full-day"} leave approved · {day.leave.paid ? "paid" : "unpaid"}
                  {day.state !== "leave" && " — came in anyway"}
                </p>
              )}

              {day.state !== "leave" || day.in_time ? (
                <>
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
                </>
              ) : null}

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
  );
}
