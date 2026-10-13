"use client";

import { useState } from "react";
import Link from "next/link";
import {
  STATUSES,
  NOT_MARKED,
  statusMeta,
  isoDate,
  clockTime,
  friendlyDate,
  timeOf,
  StatusChip,
  Avatar,
  UpdateList,
} from "@/components/team/attendanceUi";

// One team member's month in detail, for the partner's Month summary: how
// often they came in and when, how much they reported, their doctor visits,
// the things worth a second look, and every day with its updates.
//
// Working days are Monday to Saturday — the same rule the team summary uses
// when it greys out Sundays — counted only up to today.

const minutesOf = (hhmm) => {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const hhmmOf = (mins) => {
  const t = Math.round(mins);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export default function MemberMonthDetail({ member, name, year, month, records, logs, visits, onOpenDay }) {
  const todayIso = isoDate(new Date());
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(year, month - 1, i + 1)));
  const elapsed = days.filter((d) => d <= todayIso);
  const isSunday = (d) => new Date(d + "T00:00:00").getDay() === 0;
  const workingDays = elapsed.filter((d) => !isSunday(d));

  const recordByDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const updatesByDate = groupByDate(logs);
  const visitsByDate = groupByDate(visits);

  // ---- attendance
  const count = (k) => records.filter((r) => r.status === k).length;
  const cameIn = records.filter((r) => r.status !== "absent");
  const unmarkedWorkdays = workingDays.filter((d) => !recordByDate[d]);
  const arrivals = cameIn.map((r) => minutesOf(r.check_in_time)).filter((m) => m != null);
  const avgArrival = arrivals.length ? hhmmOf(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : null;
  const earliest = arrivals.length ? hhmmOf(Math.min(...arrivals)) : null;
  const latest = arrivals.length ? hhmmOf(Math.max(...arrivals)) : null;
  const attendanceRate = percent(cameIn.length, workingDays.length);

  // ---- updates
  const updateDays = Object.keys(updatesByDate).length;
  const silentDays = cameIn.map((r) => r.date).filter((d) => !updatesByDate[d] && !visitsByDate[d]).sort();
  const noLocation = logs.filter((l) => l.latitude == null || l.longitude == null).length;
  const busiest = Object.entries(updatesByDate).sort((a, b) => b[1].length - a[1].length)[0];
  const places = new Set(logs.map((l) => l.address).filter(Boolean));

  // ---- visits
  const doctors = new Set(visits.map((v) => v.doctor_name).filter(Boolean));
  const measured = visits.filter((v) => v.distance_from_clinic_m != null);
  const atClinic = measured.filter((v) => v.within_expected_proximity).length;
  const awayVisits = measured.length - atClinic;

  const flags = [
    count("late") > 0 && { tone: "amber", text: `Late on ${plural(count("late"), "day")}` },
    count("absent") > 0 && { tone: "red", text: `Absent on ${plural(count("absent"), "day")}` },
    unmarkedWorkdays.length > 0 && {
      tone: "gray",
      text: `${plural(unmarkedWorkdays.length, "working day")} with no attendance marked`,
      days: unmarkedWorkdays,
    },
    silentDays.length > 0 && {
      tone: "amber",
      text: `Came in but sent no update or visit on ${plural(silentDays.length, "day")}`,
      days: silentDays,
    },
    awayVisits > 0 && { tone: "amber", text: `${plural(awayVisits, "doctor visit")} logged away from the clinic` },
    noLocation > 0 && { tone: "gray", text: `${plural(noLocation, "update")} sent without a location` },
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Who */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={name} status="" size="w-10 h-10 text-sm" />
          <div>
            <p className="text-base font-semibold text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">
              {plural(workingDays.length, "working day")} so far this month
            </p>
          </div>
        </div>
        <Link href={`/partner-panel/team/${member.id}`} className="text-xs text-blue-600 hover:underline">
          Open profile
        </Link>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Attendance"
          value={attendanceRate == null ? "—" : `${attendanceRate}%`}
          sub={`Came in ${cameIn.length} of ${workingDays.length} working days`}
        />
        <Stat
          label="Average arrival"
          value={avgArrival ? clockTime(avgArrival) : "—"}
          sub={earliest ? `Earliest ${clockTime(earliest)} · latest ${clockTime(latest)}` : "No arrival times yet"}
        />
        <Stat
          label="Updates sent"
          value={logs.length}
          sub={
            logs.length
              ? `On ${plural(updateDays, "day")}${cameIn.length ? ` · ${(logs.length / Math.max(cameIn.length, 1)).toFixed(1)} per day in` : ""}`
              : "None this month"
          }
        />
        <Stat
          label="Doctor visits"
          value={visits.length}
          sub={
            visits.length
              ? `${plural(doctors.size, "doctor")}${measured.length ? ` · ${percent(atClinic, measured.length)}% at the clinic` : ""}`
              : "None this month"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Attendance breakdown + month strip */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <span key={s.key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {count(s.key)} {s.label}
              </span>
            ))}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${NOT_MARKED.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${NOT_MARKED.dot}`} />
              {unmarkedWorkdays.length} Not marked
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {days.map((d) => {
              const r = recordByDate[d];
              const future = d > todayIso;
              const n = (updatesByDate[d]?.length || 0) + (visitsByDate[d]?.length || 0);
              const cls = r ? statusMeta(r.status).cell : future || isSunday(d) ? "bg-gray-50 border border-dashed border-gray-200" : NOT_MARKED.cell;
              return (
                <button
                  key={d}
                  disabled={future}
                  onClick={() => onOpenDay(d)}
                  title={`${friendlyDate(d)} — ${r ? statusMeta(r.status).label : "Not marked"}${n ? ` · ${plural(n, "entry")}` : ""}`}
                  className={`relative w-7 h-7 rounded-sm text-[10px] font-medium flex items-center justify-center ${cls} ${
                    r ? "text-white" : "text-gray-400"
                  } ${future ? "cursor-default" : "hover:ring-2 hover:ring-gray-900/30"}`}
                >
                  {Number(d.slice(8))}
                  {n > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-teal-500 ring-1 ring-white" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            Teal dot: sent an update or logged a visit that day. Tap a day to open it in the day view.
          </p>
          {(busiest || places.size > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t border-gray-100 text-sm text-gray-600">
              {busiest && (
                <span>
                  Busiest day: <span className="font-medium text-gray-900">{friendlyDate(busiest[0])}</span> ({plural(busiest[1].length, "update")})
                </span>
              )}
              {places.size > 0 && (
                <span>
                  Reported from <span className="font-medium text-gray-900">{plural(places.size, "place")}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Worth a look */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Worth a look</p>
          {flags.length === 0 ? (
            <p className="text-sm text-emerald-700">Nothing stands out — a clean month so far.</p>
          ) : (
            <ul className="space-y-3">
              {flags.map((f) => (
                <Flag key={f.text} flag={f} onOpenDay={onOpenDay} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Day by day */}
      <div className="bg-white rounded-xl border border-gray-200">
        <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-800">Day by day</p>
        <div className="divide-y divide-gray-100">
          {[...elapsed].reverse().map((d) => {
            const r = recordByDate[d];
            const dayEntries = [...(updatesByDate[d] || []), ...(visitsByDate[d] || [])];
            // quiet Sundays aren't worth a row
            if (isSunday(d) && !r && dayEntries.length === 0) return null;
            return <DayRow key={d} date={d} record={r} entries={dayEntries} />;
          })}
        </div>
      </div>
    </div>
  );
}

function groupByDate(rows) {
  const map = {};
  rows.forEach((r) => {
    if (r.date) (map[r.date] ||= []).push(r);
  });
  return map;
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

const TONES = {
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-300",
};

function Flag({ flag, onOpenDay }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-sm text-gray-700">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONES[flag.tone]}`} />
        <div className="min-w-0">
          <p>{flag.text}</p>
          {flag.days && (
            <button onClick={() => setOpen(!open)} className="text-xs text-gray-500 hover:text-gray-900 underline">
              {open ? "Hide days" : "Show days"}
            </button>
          )}
          {open && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {flag.days.map((d) => (
                <button
                  key={d}
                  onClick={() => onOpenDay(d)}
                  className="px-2 py-0.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-gray-400"
                >
                  {friendlyDate(d)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function DayRow({ date, record, entries }) {
  const [open, setOpen] = useState(false);
  const updates = entries.filter((e) => e.kind !== "visit").length;
  const visitCount = entries.length - updates;
  const first = entries.length ? [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] : null;
  return (
    <div className="px-4 py-3">
      <button onClick={() => entries.length && setOpen(!open)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 text-left">
        <span className="w-28 text-sm font-medium text-gray-900">{friendlyDate(date)}</span>
        <StatusChip status={record?.status || ""} />
        <span className="text-sm text-gray-600 w-20">
          {record && record.status !== "absent" ? clockTime(record.check_in_time) : ""}
        </span>
        <span className="text-sm text-gray-600">
          {entries.length === 0 ? (
            <span className="text-gray-400">No updates</span>
          ) : (
            [updates > 0 && plural(updates, "update"), visitCount > 0 && plural(visitCount, "visit")].filter(Boolean).join(" · ")
          )}
          {first && <span className="text-gray-400"> · first at {timeOf(first.created_at)}</span>}
        </span>
        {entries.length > 0 && (
          <svg className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>
      {record?.description && <p className="mt-1 ml-0 text-xs text-gray-500 italic">&ldquo;{record.description}&rdquo;</p>}
      {open && (
        <div className="mt-3">
          <UpdateList logs={entries} />
        </div>
      )}
    </div>
  );
}
