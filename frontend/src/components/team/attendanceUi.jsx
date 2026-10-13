"use client";

import { useState } from "react";

// Shared look for team attendance and daily logs — the partner's attendance
// page, Team Logs, a team member's page, and the team member's own pages —
// so every screen says the same thing in the same plain words and colours.

export const STATUSES = [
  { key: "present", label: "Present", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", on: "bg-emerald-600 text-white border-emerald-600", cell: "bg-emerald-500" },
  { key: "late", label: "Late", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", on: "bg-amber-500 text-white border-amber-500", cell: "bg-amber-400" },
  { key: "half-day", label: "Half day", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-200", on: "bg-orange-500 text-white border-orange-500", cell: "bg-orange-400" },
  { key: "absent", label: "Absent", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200", on: "bg-red-600 text-white border-red-600", cell: "bg-red-500" },
];
export const NOT_MARKED = { key: "", label: "Not marked", dot: "bg-gray-300", chip: "bg-gray-50 text-gray-500 border-gray-200", cell: "bg-gray-200" };

export const statusMeta = (status) => STATUSES.find((s) => s.key === status) || NOT_MARKED;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10-10" for a Date, in local time. */
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "09:05:00" / "09:05" -> "9:05 AM" */
export function clockTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Timestamp -> "11:30 AM" */
export const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();

/** "2026-10-10" -> "Today" / "Yesterday" / "Wed, 8 Oct" */
export function friendlyDate(iso) {
  const today = isoDate(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === today) return "Today";
  if (iso === isoDate(y)) return "Yesterday";
  const [yy, mm, dd] = iso.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function StatusChip({ status, className = "" }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium ${m.chip} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function Avatar({ name, status, size = "w-10 h-10 text-sm" }) {
  const m = statusMeta(status);
  return (
    <div className="relative shrink-0">
      <div className={`${size} rounded-full bg-gray-100 text-gray-700 font-semibold flex items-center justify-center`}>
        {(name || "?").charAt(0).toUpperCase()}
      </div>
      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${m.dot}`} />
    </div>
  );
}

const PinIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.5-7.5 11.25-7.5 11.25S4.5 18 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);

/** Where a log was sent from: the place name when we have it, linking to the map. */
export function Place({ log }) {
  if (log.latitude == null || log.longitude == null) {
    return <span className="text-gray-400">No location</span>;
  }
  return (
    <a
      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Google Maps"
      className="inline-flex items-center gap-1 text-teal-700 hover:underline min-w-0"
    >
      <PinIcon />
      <span className="truncate">{log.address || "See on map"}</span>
    </a>
  );
}

/** "120 m" / "3.2 km" */
export const distanceText = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * How far from the doctor's clinic a visit was logged: green "At the clinic"
 * within 500 m (the backend's rule, allowing for GPS drift), amber beyond.
 */
export function ClinicDistance({ visit }) {
  if (visit.distance_from_clinic_m == null) {
    return <span className="text-xs text-gray-400">Clinic location not saved — distance unknown</span>;
  }
  const near = visit.within_expected_proximity;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
        near ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"
      }`}
    >
      {near ? "✓ At the clinic" : "⚠ Away from the clinic"} · {distanceText(visit.distance_from_clinic_m)}
      {near ? " away" : " from it"}
    </span>
  );
}

/** A logged doctor visit: who, when, which doctor, and how close to the clinic. */
function VisitItem({ visit, showName }) {
  return (
    <div className="relative pl-5">
      <span className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-indigo-100" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {showName && <span className="font-semibold text-gray-900">{visit.member_name}</span>}
        <span className="font-medium text-gray-700">{timeOf(visit.created_at)}</span>
        <a
          href={`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-700 hover:underline"
        >
          See on map
        </a>
      </div>
      <p className="mt-1 text-sm text-gray-900">
        {visit.doctor_name ? (
          <>
            <span className="font-semibold">Doctor visit</span> — Dr. {visit.doctor_name.replace(/^dr\.?\s*/i, "")}
          </>
        ) : (
          // a meeting with no doctor, only a title
          <>
            <span className="font-semibold">Meeting</span> — {visit.meeting_title || "Untitled"}
          </>
        )}
        {visit.clinic_name ? <span className="text-gray-500"> · {visit.clinic_name}</span> : null}
      </p>
      <div className="mt-1">
        <ClinicDistance visit={visit} />
      </div>
      {visit.notes && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{visit.notes}</p>}
    </div>
  );
}

/** Marks a doctor-visit row so it can share timelines with daily updates. */
export const asVisits = (rows) => (Array.isArray(rows) ? rows : []).map((v) => ({ ...v, kind: "visit" }));

/** One daily-log entry as a readable "update": time, place, what they wrote. Doctor visits get their own look. */
export function UpdateItem({ log, showName = false }) {
  if (log.kind === "visit") return <VisitItem visit={log} showName={showName} />;
  return <DailyUpdateItem log={log} showName={showName} />;
}

function DailyUpdateItem({ log, showName }) {
  const [open, setOpen] = useState(false);
  const long = (log.notes || "").length > 220;
  return (
    <div className="relative pl-5">
      <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-teal-500" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {showName && <span className="font-semibold text-gray-900">{log.member_name}</span>}
        <span className="font-medium text-gray-700">{timeOf(log.created_at)}</span>
        <Place log={log} />
      </div>
      <p className={`mt-1 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed ${!open && long ? "line-clamp-3" : ""}`}>
        {log.notes}
      </p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-0.5 text-xs text-gray-500 hover:text-gray-900 underline">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export function MonthSwitcher({ year, month, onChange }) {
  const go = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getFullYear(), d.getMonth() + 1);
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
      <button onClick={() => go(-1)} className="p-1.5 rounded-md hover:bg-gray-100" aria-label="Previous month">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      <span className="text-sm font-medium text-gray-800 w-32 text-center">{MONTHS[month - 1]} {year}</span>
      <button onClick={() => go(1)} className="p-1.5 rounded-md hover:bg-gray-100" aria-label="Next month">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
    </div>
  );
}

/**
 * A day's updates, newest first: the latest one shown, the earlier ones
 * folded away behind "Show N earlier updates" so a busy day stays compact.
 */
export function UpdateList({ logs }) {
  const [open, setOpen] = useState(false);
  const sorted = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [latest, ...earlier] = sorted;
  if (!latest) return null;
  return (
    <div className="space-y-3 border-l border-teal-100 ml-1">
      <UpdateItem log={latest} />
      {open && earlier.map((l) => <UpdateItem key={l.id} log={l} />)}
      {earlier.length > 0 && (
        <button
          onClick={() => setOpen(!open)}
          className="ml-5 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
          {open ? "Show less" : `Show ${earlier.length} earlier update${earlier.length > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
