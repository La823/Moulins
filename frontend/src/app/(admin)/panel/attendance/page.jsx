"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import {
  STATES, WEEKDAYS, parseYmd, shiftDate, shiftMonth, prettyDate, prettyMonth, hm, ago, timeOf,
  StateChip, Stepper, inputCls, cellCode, fmtDays, downloadCsv,
  LEAVE_STATUS, LeaveStatusChip, leaveRange, paidSplit,
} from "@/components/admin/attendanceShared";

// Office staff attendance from the fingerprint scanner, pulled from
// eTimeOffice — read-only, with eTimeOffice's own per-shift late / early-out /
// hours figures shown as-is.
//
// This page used to mark attendance by hand (/admin/attendance). Those
// endpoints and the `attendance` table are left in place: partners' team
// attendance in the app and the partner/team web panels still use them.

const TABS = [
  { key: "calendar", label: "Calendar" },
  { key: "month", label: "Monthly register" },
  { key: "punches", label: "Punch log" },
  { key: "leaves", label: "Leaves", permission: "leaves_view" },
  { key: "employees", label: "Employees" },
  // The old hand-marked attendance; only for people who can still read it.
  { key: "teams", label: "Partner teams", permission: "attendance_view" },
];

// ---------------------------------------------------------------- Sync bar

function SyncBar({ status, canSync, onSynced }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const last = status?.recent_runs?.[0];
  const lastOk = status?.recent_runs?.find((r) => r.status === "completed");

  const run = async (fromDate) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch("/admin/etime/sync", {
        method: "POST",
        body: JSON.stringify(fromDate ? { from: fromDate } : {}),
      });
      const r = res.run;
      setMsg({ ok: true, text: `Synced ${prettyDate(r.date_from)} – ${prettyDate(r.date_to)}: ${r.punches_new} new punch${r.punches_new === 1 ? "" : "es"}.` });
      setOpen(false);
      onSynced();
    } catch (err) {
      let text = err.message;
      try { text = JSON.parse(err.message).error || text; } catch {}
      setMsg({ ok: false, text });
      onSynced();
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.configured) {
    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        eTimeOffice isn&apos;t connected on this server. Set ETIMEOFFICE_CORPORATE_ID, ETIMEOFFICE_USERNAME and ETIMEOFFICE_PASSWORD in the backend environment.
      </div>
    );
  }

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-gray-500">
          {lastOk ? (
            <>Last synced <span className="font-medium text-gray-700">{timeOf(lastOk.finished_at || lastOk.started_at)}</span> ({ago(lastOk.finished_at || lastOk.started_at)})</>
          ) : (
            "Not synced yet"
          )}
          {last && last.status === "failed" && <span className="text-red-600"> · last attempt failed</span>}
        </p>
        {canSync && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => { setOpen(!open); setFrom(status?.default_from || ""); }}
              disabled={busy}
              className="text-xs text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline disabled:opacity-40"
            >
              Choose dates
            </button>
            <button
              onClick={() => run(null)}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
            >
              <svg className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        )}
      </div>

      {open && canSync && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <label className="text-xs text-gray-500">Pull from</label>
          <input
            type="date"
            value={from}
            max={status?.today}
            min={status?.today ? shiftDate(status.today, -(status.max_days - 1)) : undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={inputCls}
          />
          <span className="text-xs text-gray-500">to today</span>
          <button onClick={() => run(from)} disabled={busy || !from} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-50">
            Sync these dates
          </button>
          <span className="text-[11px] text-gray-400 w-full">Up to {status?.max_days} days at a time. Re-syncing a date replaces it with eTimeOffice&apos;s latest figures.</span>
        </div>
      )}

      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Calendar

const PRESENTISH = ["present", "in", "half_day"];

// Per-date roll-up of the month report: counts for the calendar cell, and
// every employee's row for the side panel.
function byDate(data) {
  const out = {};
  (data?.dates || []).forEach((d) => {
    out[d] = { rows: [], present: 0, in: 0, late: 0, absent: 0, missed: 0, leave: 0, off: 0, holiday: 0, synced: 0 };
  });
  (data?.employees || []).forEach((e) => {
    e.days.forEach((d) => {
      const b = out[d.date];
      if (!b) return;
      b.rows.push(d);
      if (d.state !== "not_synced" && d.state !== "upcoming") b.synced++;
      if (d.state === "leave") b.leave++;
      if (PRESENTISH.includes(d.state)) b.present++;
      if (d.state === "in") b.in++;
      if (d.state === "absent") b.absent++;
      if (d.state === "missed_punch") b.missed++;
      if (d.state === "weekly_off") b.off++;
      if (d.state === "holiday") b.holiday++;
      if (d.late_minutes > 0 && d.in_time) b.late++;
    });
  });
  return out;
}

function CalendarView({ today, thisMonth, refreshKey, onOpenEmployee }) {
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => { if (thisMonth) setMonth(thisMonth); }, [thisMonth]);
  useEffect(() => { if (today) setSelected(today); }, [today]);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError("");
    apiFetch(`/admin/etime/month?month=${month}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month, refreshKey]);

  const goMonth = (delta) => {
    const m = shiftMonth(month, delta);
    setMonth(m);
    // Keep a day selected: today in the current month, else the 1st.
    setSelected(m === thisMonth ? today : `${m}-01`);
    setFilter("all");
  };

  const days = byDate(data);
  const [y, m] = (month || "2000-01").split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  const day = days[selected];
  const isToday = selected === today;
  const isFuture = selected > today;
  const rows = (day?.rows || []).filter((r) => {
    if (isFuture) return r.state === "leave"; // nothing else is known yet
    if (filter === "all") return true;
    if (filter === "late") return r.late_minutes > 0 && r.in_time;
    if (filter === "present") return PRESENTISH.includes(r.state);
    return r.state === filter;
  });
  const filters = [
    ["all", "All", day?.rows.length],
    ["present", "Present", day?.present],
    ...(isToday ? [["in", "At work", day?.in]] : []),
    ["late", "Late", day?.late],
    ["absent", "Absent", day?.absent],
    ["missed_punch", "Missed punch", day?.missed],
    ["leave", "On leave", day?.leave],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Calendar */}
      <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-center mb-5">
          {/* Up to two months ahead, to see booked leave. */}
          <Stepper label={month ? prettyMonth(month) : ""} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} nextDisabled={month >= shiftMonth(thisMonth, 2)} />
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-2">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center"><Loader size="sm" /></div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} />;
              const b = days[d];
              const future = d > today;
              const closed = future && !(b?.leave > 0); // future days open only to see who's on leave
              const isSel = d === selected;
              const allOff = b && b.synced > 0 && b.present === 0 && b.off + b.holiday === b.synced;
              const total = b?.rows.length || 0;
              return (
                <button
                  key={d}
                  disabled={closed}
                  onClick={() => { setSelected(d); setFilter("all"); }}
                  className={`relative min-h-[4.25rem] rounded-lg p-1.5 flex flex-col items-stretch text-left transition-colors border ${
                    isSel
                      ? "bg-gray-900 border-gray-900 text-white"
                      : closed
                      ? "border-transparent text-gray-300 cursor-default"
                      : future
                      ? "border-gray-100 hover:bg-gray-50"
                      : d === today
                      ? "border-red-200 bg-red-50/40 hover:bg-red-50"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <span className={`text-xs font-medium ${isSel ? "text-white" : future ? "text-gray-300" : d === today ? "text-red-700" : "text-gray-700"}`}>{Number(d.slice(8))}</span>
                  {future && b?.leave > 0 && (
                    <span className={`mt-auto text-[10px] font-medium ${isSel ? "text-white" : "text-indigo-700"}`}>{b.leave} on leave</span>
                  )}
                  {!future && b && b.synced === 0 && <span className={`mt-auto text-[10px] ${isSel ? "text-white/60" : "text-gray-300"}`}>Not synced</span>}
                  {allOff && (
                    <span className={`mt-auto text-[10px] ${isSel ? "text-white/70" : b.holiday ? "text-blue-600" : "text-gray-400"}`}>
                      {b.holiday ? "Holiday" : "Weekly off"}
                    </span>
                  )}
                  {b && b.synced > 0 && !allOff && (
                    <div className="mt-auto">
                      <p className={`text-[11px] font-semibold tabular-nums ${isSel ? "text-white" : "text-green-700"}`}>
                        {b.present}<span className={`font-normal ${isSel ? "text-white/60" : "text-gray-400"}`}>/{total}</span>
                      </p>
                      <div className="flex gap-1 mt-0.5 h-1.5">
                        {b.late > 0 && <span title={`${b.late} late`} className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        {b.absent > 0 && <span title={`${b.absent} absent`} className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                        {b.missed > 0 && <span title={`${b.missed} missed punch`} className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                        {b.leave > 0 && <span title={`${b.leave} on leave`} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <span><span className="font-semibold text-green-700">12</span>/18 = present / staff</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Someone late</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Someone absent</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Missed punch</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> On leave</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Today</span>
        </div>
      </div>

      {/* Selected day */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
        {!day ? (
          <div className="h-full min-h-[200px] flex items-center justify-center">
            <p className="text-sm text-gray-400 text-center">Pick a day on the calendar</p>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-800">
              {prettyDate(selected)}
              {isToday && <span className="ml-2 text-xs font-normal text-red-600">Today</span>}
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              {isFuture ? (
                `${day.leave} on approved leave`
              ) : (
                <>
                  {day.present} of {day.rows.length} present
                  {day.late > 0 && ` · ${day.late} late`}
                  {day.absent > 0 && ` · ${day.absent} absent`}
                  {day.leave > 0 && ` · ${day.leave} on leave`}
                </>
              )}
            </p>

            <div className={`flex flex-wrap gap-1.5 mb-3 ${isFuture ? "hidden" : ""}`}>
              {filters.map(([k, l, n]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${filter === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {l}{n ? ` ${n}` : ""}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {rows.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">Nobody in this list</p>}
              {rows.map((r) => (
                <button
                  key={r.emp_code}
                  onClick={() => onOpenEmployee(r.emp_code, month)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono">
                      {r.in_time ? `${r.in_time} – ${r.out_time || (r.state === "in" ? "now" : "?")}` : `#${r.emp_code}`}
                      {r.work_minutes > 0 && <span className="font-sans"> · {hm(r.work_minutes)}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StateChip state={r.state} />
                    {r.leave && <span className="text-[10px] text-indigo-700">{r.leave.portion === 0.5 ? "Half-day leave" : "Leave"} · {r.leave.paid ? "paid" : "unpaid"}</span>}
                    {r.late_minutes > 0 && r.in_time && <span className="text-[10px] text-amber-700">Late {hm(r.late_minutes)}</span>}
                    {r.early_out_minutes > 0 && <span className="text-[10px] text-orange-600">Left {hm(r.early_out_minutes)} early</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Monthly register

function exportRegister(data) {
  const header = ["Code", "Name", ...data.dates.map((d) => d.slice(8)), "Present", "Absent", "On leave", "Missed punch", "Half days", "Late days", "Late (min)", "Hours", "Overtime"];
  const lines = data.employees.map((e) => [
    e.emp_code,
    e.name,
    ...e.days.map((d) => {
      const code = cellCode(d);
      return d.in_time ? `${code} ${d.in_time}-${d.out_time || ""}` : code;
    }),
    e.totals.present,
    e.totals.absent,
    e.totals.leave,
    e.totals.missed_punch,
    e.totals.half_day,
    e.totals.late,
    e.totals.late_minutes,
    (e.totals.work_minutes / 60).toFixed(2),
    (e.totals.overtime_minutes / 60).toFixed(2),
  ]);
  downloadCsv(`biometric-attendance-${data.month}.csv`, [header, ...lines]);
}

function MonthView({ thisMonth, refreshKey, onOpenEmployee }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (thisMonth) setMonth(thisMonth); }, [thisMonth]);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError("");
    apiFetch(`/admin/etime/month?month=${month}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month, refreshKey]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Stepper label={month ? prettyMonth(month) : ""} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= thisMonth} />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          {["present", "in", "half_day", "leave", "absent", "missed_punch", "weekly_off", "holiday"].map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-semibold ${STATES[k].cell}`}>{STATES[k].code}</span>
              {STATES[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Late</span>
        </div>
        {data?.employees?.length > 0 && (
          <button onClick={() => exportRegister(data)} className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Export to Excel (CSV)
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data.employees.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">No attendance for this month.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-gray-400">
                <th className="sticky left-0 z-10 bg-white text-left font-medium px-3 py-2 border-b border-gray-100 min-w-[10rem]">Employee</th>
                {data.dates.map((d) => {
                  const wd = parseYmd(d).getDay();
                  return (
                    <th key={d} className={`font-medium px-0.5 py-2 border-b border-gray-100 text-center ${wd === 0 ? "text-gray-300" : ""}`}>
                      <div className="text-[9px]">{WEEKDAYS[wd][0]}</div>
                      <div>{Number(d.slice(8))}</div>
                    </th>
                  );
                })}
                <th className="font-medium px-2 py-2 border-b border-gray-100 text-right" title="Present days (half days count ½)">Present</th>
                <th className="font-medium px-2 py-2 border-b border-gray-100 text-right">Absent</th>
                <th className="font-medium px-2 py-2 border-b border-gray-100 text-right">Leave</th>
                <th className="font-medium px-2 py-2 border-b border-gray-100 text-right" title="Days with only one scan">Missed</th>
                <th className="font-medium px-2 py-2 border-b border-gray-100 text-right">Late</th>
                <th className="font-medium px-3 py-2 border-b border-gray-100 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.emp_code} className="group">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 py-1.5 border-b border-gray-50">
                    <button onClick={() => onOpenEmployee(e.emp_code, month)} className="text-left hover:underline">
                      <span className="font-medium text-gray-800">{e.name}</span>
                      <span className="ml-1 text-[10px] text-gray-400">#{e.emp_code}</span>
                    </button>
                  </td>
                  {e.days.map((d) => {
                    const s = STATES[d.state] || STATES.other;
                    const late = d.late_minutes > 0 && d.in_time;
                    const tip = [prettyDate(d.date), s.label, d.in_time && `In ${d.in_time}`, d.out_time && `Out ${d.out_time}`, d.work_minutes && hm(d.work_minutes), late && `Late ${hm(d.late_minutes)}`].filter(Boolean).join(" · ");
                    return (
                      <td key={d.date} className="px-0.5 py-1 border-b border-gray-50 group-hover:bg-gray-50">
                        <div title={tip} className={`relative w-7 h-6 mx-auto flex items-center justify-center rounded text-[10px] font-semibold ${s.cell}`}>
                          {cellCode(d)}
                          {late && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 border-b border-gray-50 text-right tabular-nums font-medium text-gray-800 group-hover:bg-gray-50">{e.totals.present}</td>
                  <td className="px-2 py-1.5 border-b border-gray-50 text-right tabular-nums text-red-600 group-hover:bg-gray-50">{e.totals.absent || ""}</td>
                  <td className="px-2 py-1.5 border-b border-gray-50 text-right tabular-nums text-indigo-700 group-hover:bg-gray-50">{e.totals.leave || ""}</td>
                  <td className="px-2 py-1.5 border-b border-gray-50 text-right tabular-nums text-orange-600 group-hover:bg-gray-50">{e.totals.missed_punch || ""}</td>
                  <td className="px-2 py-1.5 border-b border-gray-50 text-right tabular-nums text-amber-700 group-hover:bg-gray-50">{e.totals.late || ""}</td>
                  <td className="px-3 py-1.5 border-b border-gray-50 text-right tabular-nums text-gray-700 whitespace-nowrap group-hover:bg-gray-50">{hm(e.totals.work_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Punch log

const PAGE = 200;

function PunchLogView({ today, employees, refreshKey }) {
  const [from, setFrom] = useState(today ? shiftDate(today, -6) : "");
  const [to, setTo] = useState(today || "");
  const [emp, setEmp] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (today && !to) { setTo(today); setFrom(shiftDate(today, -6)); }
  }, [today, to]);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    apiFetch(`/admin/etime/punches?from=${from}&to=${to}&emp_code=${encodeURIComponent(emp)}&limit=${PAGE}&offset=${offset}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to, emp, offset, refreshKey]);

  const change = (setter) => (e) => { setter(e.target.value); setOffset(0); };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="date" value={from} max={to} onChange={change(setFrom)} className={inputCls} />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={to} min={from} max={today} onChange={change(setTo)} className={inputCls} />
        <select value={emp} onChange={change(setEmp)} className={inputCls}>
          <option value="">All employees</option>
          {employees.map((e) => <option key={e.emp_code} value={e.emp_code}>{e.name} (#{e.emp_code})</option>)}
        </select>
        {data && <span className="ml-auto text-xs text-gray-500">{data.total} scan{data.total === 1 ? "" : "s"}</span>}
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.punches.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-gray-400">No scans in this range</td></tr>
              )}
              {data.punches.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{prettyDate(p.time.slice(0, 10))}</td>
                  <td className="px-3 py-2 font-mono text-gray-800">{p.time.slice(11, 16)}</td>
                  <td className="px-3 py-2 text-gray-800">{p.name || "—"} <span className="text-[11px] text-gray-400">#{p.emp_code}</span></td>
                  <td className="px-3 py-2">
                    {p.manual
                      ? <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[11px]">Manual entry</span>
                      : <span className="text-[11px] text-gray-500">Fingerprint</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > PAGE && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
              <span>{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
              <div className="flex gap-2">
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Newer</button>
                <button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Older</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Partner teams (manual)

const MANUAL_STATUS = {
  present: "bg-green-50 text-green-700 border-green-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  "half-day": "bg-amber-50 text-amber-700 border-amber-200",
  absent: "bg-red-50 text-red-700 border-red-200",
};

// Read-only view of the hand-marked `attendance` table — in practice
// partners marking their own field teams from the app. Shown here because
// this page used to be its admin calendar; marking stays with the partners.
function TeamAttendanceView({ thisMonth }) {
  const [month, setMonth] = useState(thisMonth);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number);
    setLoading(true);
    setError("");
    apiFetch(`/admin/attendance/month?year=${y}&month=${m}`)
      .then((r) => setRecords(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  // Newest day first, people in check-in order within a day.
  const dates = [...new Set(records.map((r) => r.date))].sort().reverse();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Stepper label={month ? prettyMonth(month) : ""} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= thisMonth} />
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Attendance that partners mark by hand for their own team members in the app. Read-only here.
      </p>

      {loading ? (
        <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : dates.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">Nothing marked this month.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Team member</th>
                <th className="px-3 py-2.5 font-medium">Check-in</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d) =>
                records
                  .filter((r) => r.date === d)
                  .map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i === 0 ? "border-t border-gray-100" : ""}`}>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{i === 0 ? prettyDate(d) : ""}</td>
                      <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{r.check_in_time?.slice(0, 5)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${MANUAL_STATUS[r.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {r.status.replace("-", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.description || ""}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Leaves

const PAID_OPTIONS = [
  ["auto", "Paid while balance lasts"],
  ["paid", "All paid"],
  ["unpaid", "All unpaid"],
];

// Paid / unpaid split "auto" would give, for the approve button's hint.
function autoSplit(days, available, halfDay) {
  const step = halfDay ? 0.5 : 1;
  let paid = 0;
  let left = Math.max(0, available);
  for (let d = 0; d < days; d += step) {
    if (left >= step) {
      paid += step;
      left -= step;
    }
  }
  return { paid, unpaid: Math.round((days - paid) * 10) / 10 };
}

function PendingCard({ leave, canDecide, onDone }) {
  const [balance, setBalance] = useState(null);
  const [paid, setPaid] = useState("auto");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/etime/employees/${encodeURIComponent(leave.emp_code)}/balance?month=${leave.to_date.slice(0, 7)}`)
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [leave.emp_code, leave.to_date]);

  const decide = async (action) => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/admin/etime/leaves/${leave.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ paid, note }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const split = balance ? autoSplit(leave.days, balance.available, leave.half_day) : null;
  const over = split && split.unpaid > 0;

  return (
    <div className={`bg-white rounded-xl border p-4 ${over ? "border-amber-200" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">
            {leave.name} <span className="text-[11px] font-normal text-gray-400">#{leave.emp_code}</span>
          </p>
          <p className="text-sm text-gray-700">{leaveRange(leave)} <span className="text-gray-400">· {fmtDays(leave.days)}</span></p>
          {leave.reason && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">&ldquo;{leave.reason}&rdquo;</p>}
          <p className="text-[11px] text-gray-400 mt-1">Applied {timeOf(leave.created_at)}</p>
        </div>
        {balance && (
          <div className={`text-right text-xs rounded-lg px-3 py-2 ${over ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600"}`}>
            <p><span className="font-semibold">{fmtDays(balance.available)}</span> available</p>
            <p className="text-[11px] opacity-80">{fmtDays(balance.per_month)} / month</p>
            {over && <p className="text-[11px] mt-0.5">Over by {fmtDays(split.unpaid)}</p>}
          </div>
        )}
      </div>

      {canDecide && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <select value={paid} onChange={(e) => setPaid(e.target.value)} className={`${inputCls} py-1 text-xs`}>
            {PAID_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${inputCls} py-1 text-xs flex-1 min-w-[8rem]`} />
          <button onClick={() => decide("approve")} disabled={busy} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            Approve{paid === "auto" && split ? (split.unpaid > 0 ? ` (${split.paid} paid, ${split.unpaid} unpaid)` : " (paid)") : ""}
          </button>
          <button onClick={() => decide("reject")} disabled={busy} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function RecordLeaveForm({ employees, today, onDone, onClose }) {
  const [form, setForm] = useState({ emp_code: "", from: today, to: today, half_day: false, reason: "", paid: "auto" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/admin/etime/leaves", {
        method: "POST",
        body: JSON.stringify({ ...form, to: form.half_day ? form.from : form.to }),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Record leave</h3>
        <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800">Close</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">For anyone, including staff without a login. It&apos;s approved straight away.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-gray-500">
          Employee
          <select required value={form.emp_code} onChange={(e) => set({ emp_code: e.target.value })} className={`${inputCls} w-full mt-1`}>
            <option value="">Choose…</option>
            {employees.filter((e) => e.active).map((e) => <option key={e.emp_code} value={e.emp_code}>{e.name} (#{e.emp_code})</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          From
          <input type="date" required value={form.from} onChange={(e) => set({ from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} className={`${inputCls} w-full mt-1`} />
        </label>
        <label className={`text-xs text-gray-500 ${form.half_day ? "opacity-40" : ""}`}>
          To
          <input type="date" required value={form.half_day ? form.from : form.to} min={form.from} disabled={form.half_day} onChange={(e) => set({ to: e.target.value })} className={`${inputCls} w-full mt-1`} />
        </label>
        <label className="text-xs text-gray-500">
          Pay
          <select value={form.paid} onChange={(e) => set({ paid: e.target.value })} className={`${inputCls} w-full mt-1`}>
            {PAID_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.half_day} onChange={(e) => set({ half_day: e.target.checked })} />
          Half day
        </label>
        <input value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Reason" className={`${inputCls} flex-1 min-w-[12rem]`} />
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Saving…" : "Record leave"}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Sundays aren&apos;t counted.</p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </form>
  );
}

function LeavesView({ employees, today, thisMonth, canDecide, onChanged, onOpenEmployee }) {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [month, setMonth] = useState(thisMonth);
  const [status, setStatus] = useState("");
  const [emp, setEmp] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    apiFetch("/admin/etime/leaves?status=pending").then((r) => setPending(r?.leaves || [])).catch((e) => setError(e.message));
  }, [reload]);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    apiFetch(`/admin/etime/leaves?month=${month}&status=${status}&emp_code=${encodeURIComponent(emp)}`)
      .then((r) => setHistory(r?.leaves || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month, status, emp, reload]);

  const refresh = () => { setReload((k) => k + 1); onChanged(); };

  const cancel = async (l) => {
    const what = l.status === "approved" ? "Cancel this approved leave? Its days go back to absent / the balance." : "Withdraw this request?";
    if (!confirm(what)) return;
    try {
      await apiFetch(`/admin/etime/leaves/${l.id}/cancel`, { method: "POST" });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Waiting for approval {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px]">{pending.length}</span>}</h3>
        {canDecide && !recording && (
          <button onClick={() => setRecording(true)} className="ml-auto px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium">
            Record leave
          </button>
        )}
      </div>

      {recording && <RecordLeaveForm employees={employees} today={today} onDone={refresh} onClose={() => setRecording(false)} />}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400 mb-6">Nothing waiting.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
          {pending.map((l) => <PendingCard key={l.id} leave={l} canDecide={canDecide} onDone={refresh} />)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800 mr-2">All leave</h3>
        <Stepper label={month ? prettyMonth(month) : ""} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= shiftMonth(thisMonth, 11)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">Any status</option>
          {Object.entries(LEAVE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={emp} onChange={(e) => setEmp(e.target.value)} className={inputCls}>
          <option value="">Everyone</option>
          {employees.map((e) => <option key={e.emp_code} value={e.emp_code}>{e.name} (#{e.emp_code})</option>)}
        </select>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center"><Loader size="sm" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Dates</th>
                <th className="px-3 py-2.5 font-medium">Days</th>
                <th className="px-3 py-2.5 font-medium">Reason</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Decided</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">No leave in {prettyMonth(month)}</td></tr>
              )}
              {history.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="px-4 py-2.5">
                    <button onClick={() => onOpenEmployee(l.emp_code, l.from_date.slice(0, 7))} className="font-medium text-gray-800 hover:underline text-left">{l.name}</button>
                    <p className="text-[11px] text-gray-400">{l.applied_by_self ? "Applied themselves" : `Entered by ${l.applied_by_name || "admin"}`}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{leaveRange(l)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">
                    {l.days}
                    {paidSplit(l) && paidSplit(l) !== "Paid" && <p className="text-[11px] text-gray-400 whitespace-nowrap">{paidSplit(l)}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[16rem]">{l.reason || "—"}</td>
                  <td className="px-3 py-2.5"><LeaveStatusChip status={l.status} /></td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-500">
                    {l.decided_at ? <>{l.decided_by_name || "—"}<br />{timeOf(l.decided_at)}</> : "—"}
                    {l.decision_note && <p className="text-gray-600 mt-0.5">&ldquo;{l.decision_note}&rdquo;</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canDecide && (l.status === "approved" || l.status === "pending") && (
                      <button onClick={() => cancel(l)} className="text-xs text-gray-500 hover:text-red-600">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Employees

// "SONIA MEHRA " and "Sonia" share a first name: suggest linking them.
function firstName(s) {
  return (s || "").trim().toLowerCase().split(/\s+/)[0] || "";
}

function EmployeesView({ employees, canEdit, onChanged, onOpenEmployee, thisMonth }) {
  const [logins, setLogins] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({}); // emp_code -> allowance being typed
  const [everyone, setEveryone] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    apiFetch("/admin/etime/staff-logins").then((l) => setLogins(Array.isArray(l) ? l : [])).catch(() => {});
  }, [canEdit, employees]);

  const update = async (code, body) => {
    setBusy(code);
    setError("");
    try {
      await apiFetch(`/admin/etime/employees/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(body) });
      onChanged();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveAllowance = async (e) => {
    const raw = drafts[e.emp_code];
    if (raw === undefined) return;
    const v = Number(raw);
    if (raw === "" || Number.isNaN(v) || v === e.leaves_per_month) {
      setDrafts((d) => { const n = { ...d }; delete n[e.emp_code]; return n; });
      return;
    }
    if (await update(e.emp_code, { leaves_per_month: v })) {
      setDrafts((d) => { const n = { ...d }; delete n[e.emp_code]; return n; });
    }
  };

  const setForEveryone = async () => {
    const v = Number(everyone);
    if (everyone === "" || Number.isNaN(v)) return;
    if (!confirm(`Give every employee on the dashboard ${v} leave day${v === 1 ? "" : "s"} a month?`)) return;
    setBusy("*");
    setError("");
    try {
      await apiFetch("/admin/etime/leaves-per-month", { method: "PUT", body: JSON.stringify({ value: v }) });
      setEveryone("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const free = logins.filter((l) => !l.linked_to);
  const suggestionFor = (e) => {
    if (e.user_id) return null;
    const matches = free.filter((l) => firstName(l.username) === firstName(e.name));
    return matches.length === 1 ? matches[0] : null;
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Everyone set up in eTimeOffice. Names and codes come from there, so change them in eTimeOffice. Link someone&apos;s staff login so they can
        apply for leave themselves; for people without a login, record their leave on the Leaves tab. Hidden employees are left out of the calendar and
        register, but their history is kept.
      </p>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-gray-600">
          <span>Set everyone&apos;s allowance to</span>
          <input
            type="number" min="0" max="31" step="0.5" value={everyone}
            onChange={(e) => setEveryone(e.target.value)}
            className={`${inputCls} w-20`} placeholder="1.5"
          />
          <span>days / month</span>
          <button onClick={setForEveryone} disabled={busy === "*" || everyone === ""} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-40">
            Apply
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Last scan</th>
              <th className="px-3 py-2.5 font-medium">Staff login</th>
              <th className="px-3 py-2.5 font-medium">Leaves / month</th>
              <th className="px-3 py-2.5 font-medium">On dashboard</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400">No employees yet. Sync from eTimeOffice first.</td></tr>
            )}
            {employees.map((e) => {
              const suggestion = suggestionFor(e);
              const draft = drafts[e.emp_code];
              return (
                <tr key={e.emp_code} className={`border-b border-gray-50 last:border-0 ${e.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2.5 font-mono text-gray-500">{e.emp_code}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => onOpenEmployee(e.emp_code, thisMonth)} className="font-medium text-gray-800 hover:underline">{e.name}</button>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{e.last_punch ? `${prettyDate(e.last_punch.slice(0, 10))}, ${e.last_punch.slice(11)}` : "Never"}</td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={e.user_id || ""}
                          disabled={busy === e.emp_code}
                          onChange={(ev) => update(e.emp_code, { user_id: ev.target.value || null })}
                          className={`${inputCls} max-w-[11rem] py-1`}
                        >
                          <option value="">No login</option>
                          {logins
                            .filter((l) => !l.linked_to || l.linked_to === e.emp_code)
                            .map((l) => <option key={l.id} value={l.id}>{l.username}</option>)}
                        </select>
                        {suggestion && (
                          <button
                            onClick={() => update(e.emp_code, { user_id: suggestion.id })}
                            disabled={busy === e.emp_code}
                            className="text-[11px] text-teal-700 hover:underline whitespace-nowrap"
                            title="Their names match"
                          >
                            Link {suggestion.username.trim()}?
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">{e.user_name || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <input
                        type="number" min="0" max="31" step="0.5"
                        value={draft ?? e.leaves_per_month}
                        disabled={busy === e.emp_code}
                        onChange={(ev) => setDrafts((d) => ({ ...d, [e.emp_code]: ev.target.value }))}
                        onBlur={() => saveAllowance(e)}
                        onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                        className={`${inputCls} w-20 py-1 ${draft !== undefined ? "border-amber-300" : ""}`}
                      />
                    ) : (
                      <span className="text-xs text-gray-600">{e.leaves_per_month}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <button
                        onClick={() => update(e.emp_code, { active: !e.active })}
                        disabled={busy === e.emp_code}
                        className={`relative w-9 h-5 rounded-full transition-colors ${e.active ? "bg-green-500" : "bg-gray-300"} disabled:opacity-50`}
                        aria-label={e.active ? "Hide from dashboard" : "Show on dashboard"}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${e.active ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">{e.active ? "Shown" : "Hidden"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Page

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const perms = user?.permissions || [];
  const canEdit = isAdmin || perms.includes("etime_edit");
  const canSeeLeaves = isAdmin || perms.includes("leaves_view");
  const canDecideLeaves = isAdmin || perms.includes("leaves_edit");
  const tabs = TABS.filter((t) => !t.permission || isAdmin || perms.includes(t.permission));

  const router = useRouter();
  // Remembered so coming back from an employee's page lands on the same tab.
  const [tab, setTabState] = useState("calendar");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("attendance_tab");
      if (saved && TABS.some((t) => t.key === saved)) setTabState(saved);
    } catch {}
  }, []);
  const setTab = (t) => {
    setTabState(t);
    try { sessionStorage.setItem("attendance_tab", t); } catch {}
  };
  // A remembered tab this viewer can't see (another login) falls back.
  const current = tabs.some((t) => t.key === tab) ? tab : "calendar";
  const [status, setStatus] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [pendingLeaves, setPendingLeaves] = useState(0);

  const loadMeta = useCallback(() => {
    apiFetch("/admin/etime/status").then(setStatus).catch(() => {});
    apiFetch("/admin/etime/employees").then((e) => setEmployees(Array.isArray(e) ? e : [])).catch(() => {});
    if (canSeeLeaves) {
      apiFetch("/admin/etime/leaves?status=pending").then((r) => setPendingLeaves(r?.pending_count || 0)).catch(() => {});
    }
  }, [canSeeLeaves]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const afterSync = () => { loadMeta(); setRefreshKey((k) => k + 1); };

  const today = status?.today;
  const thisMonth = today?.slice(0, 7);
  const openEmployee = (code, month) =>
    router.push(`/panel/attendance/employee/${encodeURIComponent(code)}?month=${month || thisMonth}`);

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-800">Attendance</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">From the fingerprint scanner, via eTimeOffice. Late and early-out follow each person&apos;s shift in eTimeOffice.</p>

      <SyncBar status={status} canSync={canEdit} onSynced={afterSync} />

      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${current === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
            {t.key === "leaves" && pendingLeaves > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">{pendingLeaves}</span>
            )}
          </button>
        ))}
      </div>

      {!status ? (
        <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>
      ) : current === "calendar" ? (
        <CalendarView today={today} thisMonth={thisMonth} refreshKey={refreshKey} onOpenEmployee={openEmployee} />
      ) : current === "month" ? (
        <MonthView thisMonth={thisMonth} refreshKey={refreshKey} onOpenEmployee={openEmployee} />
      ) : current === "leaves" ? (
        <LeavesView
          employees={employees}
          today={today}
          thisMonth={thisMonth}
          canDecide={canDecideLeaves}
          onChanged={() => { loadMeta(); setRefreshKey((k) => k + 1); }}
          onOpenEmployee={openEmployee}
        />
      ) : current === "teams" ? (
        <TeamAttendanceView thisMonth={thisMonth} />
      ) : current === "punches" ? (
        <PunchLogView today={today} employees={employees} refreshKey={refreshKey} />
      ) : (
        <EmployeesView employees={employees} canEdit={canEdit} onChanged={loadMeta} onOpenEmployee={openEmployee} thisMonth={thisMonth} />
      )}

    </>
  );
}
