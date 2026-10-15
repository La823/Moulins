// Shared pieces of the Attendance pages (/panel/attendance and the
// per-employee calendar): eTimeOffice day states, date helpers, small UI bits.

export const STATES = {
  present: { label: "Present", code: "P", chip: "bg-green-50 text-green-700 border-green-200", cell: "bg-green-100 text-green-800" },
  in: { label: "At work", code: "IN", chip: "bg-teal-50 text-teal-700 border-teal-200", cell: "bg-teal-100 text-teal-800" },
  half_day: { label: "Half day", code: "½", chip: "bg-amber-50 text-amber-700 border-amber-200", cell: "bg-amber-100 text-amber-800" },
  absent: { label: "Absent", code: "A", chip: "bg-red-50 text-red-700 border-red-200", cell: "bg-red-100 text-red-700" },
  missed_punch: { label: "Missed punch", code: "MP", chip: "bg-orange-50 text-orange-700 border-orange-200", cell: "bg-orange-100 text-orange-800" },
  weekly_off: { label: "Weekly off", code: "WO", chip: "bg-gray-50 text-gray-500 border-gray-200", cell: "bg-gray-100 text-gray-400" },
  holiday: { label: "Holiday", code: "H", chip: "bg-blue-50 text-blue-700 border-blue-200", cell: "bg-blue-100 text-blue-700" },
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
