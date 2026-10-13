"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import {
  STATUSES,
  NOT_MARKED,
  statusMeta,
  isoDate,
  clockTime,
  friendlyDate,
  StatusChip,
  Avatar,
  UpdateList,
  MonthSwitcher,
  asVisits,
} from "@/components/team/attendanceUi";

const nameOf = (m) => m.username || m.phone_number || "Team member";

// "HH:MM" right now — the default arrival time when marking today.
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// The partner's one place for their team's attendance and daily updates:
// a day view (who's in, one-tap marking, what each person reported and from
// where) and a month summary (counts + a strip of coloured days per person).
export default function TeamAttendancePage() {
  const [tab, setTab] = useState("day");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    apiFetch("/team")
      .then((list) => setMembers(Array.isArray(list) ? list : []))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, []);

  // Day picked in the day view; the month summary can jump to a day.
  const [date, setDate] = useState(isoDate(new Date()));
  const openDay = (iso) => {
    setDate(iso);
    setTab("day");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Team Attendance</h2>
          <p className="text-sm text-gray-500 mt-0.5">Who came in, and what they reported during the day.</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {[
            ["day", "Day view"],
            ["month", "Month summary"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadingMembers ? (
        <Loader />
      ) : members.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">You don&apos;t have any team members yet.</p>
          <p className="text-sm text-gray-400 mt-1">Add them from My Team, then their attendance shows here.</p>
        </div>
      ) : tab === "day" ? (
        <DayView members={members} date={date} setDate={setDate} />
      ) : (
        <MonthView members={members} onOpenDay={openDay} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Day view

function DayView({ members, date, setDate }) {
  const [records, setRecords] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [y, m] = date.split("-").map(Number);

  const load = useCallback(async () => {
    setLoading(true);
    const [att, monthLogs, monthVisits] = await Promise.all([
      apiFetch(`/team/attendance?date=${date}`).catch(() => []),
      apiFetch(`/team/daily-logs?year=${y}&month=${m}`).catch(() => []),
      apiFetch(`/team/visit-logs?year=${y}&month=${m}`).catch(() => []),
    ]);
    setRecords(Array.isArray(att) ? att : []);
    // the day's updates and doctor visits together
    setLogs([...(Array.isArray(monthLogs) ? monthLogs : []), ...asVisits(monthVisits)].filter((l) => l.date === date));
    setLoading(false);
  }, [date, y, m]);

  useEffect(() => {
    load();
  }, [load]);

  const shift = (days) => {
    const [yy, mm, dd] = date.split("-").map(Number);
    setDate(isoDate(new Date(yy, mm - 1, dd + days)));
  };
  const today = isoDate(new Date());

  const recordFor = (id) => records.find((r) => r.employee_id === id);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
    let unmarked = 0;
    members.forEach((mem) => {
      const r = records.find((x) => x.employee_id === mem.id);
      if (r && c[r.status] !== undefined) c[r.status]++;
      else unmarked++;
    });
    return { ...c, unmarked };
  }, [members, records]);

  // bumped after every save so the calendar's dots catch up
  const [version, setVersion] = useState(0);
  const onChanged = async () => {
    await load();
    setVersion((v) => v + 1);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Left: the day — date bar, then one person per row */}
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Previous day">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className="min-w-[9rem] text-center">
              <p className="text-base font-semibold text-gray-900">{friendlyDate(date)}</p>
              <p className="text-xs text-gray-400">
                {new Date(y, m - 1, Number(date.split("-")[2])).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <button
              onClick={() => shift(1)}
              disabled={date >= today}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Next day"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
            {date !== today && (
              <button onClick={() => setDate(today)} className="ml-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50">
                Back to today
              </button>
            )}
          </div>

          {/* At a glance */}
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <span key={s.key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {counts[s.key]} {s.label}
              </span>
            ))}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${NOT_MARKED.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${NOT_MARKED.dot}`} />
              {counts.unmarked} Not marked
            </span>
          </div>
        </div>

        {loading ? (
          <Loader />
        ) : (
          <div className="space-y-4">
            {members.map((mem) => (
              <MemberDayCard
                // a fresh card (time, note, open editor) whenever the day or
                // the saved record changes
                key={`${mem.id}|${date}|${recordFor(mem.id)?.id}|${recordFor(mem.id)?.check_in_time}|${recordFor(mem.id)?.description}`}
                member={mem}
                date={date}
                record={recordFor(mem.id)}
                logs={logs.filter((l) => l.team_member_id === mem.id)}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: the month calendar — pick any day */}
      <div className="lg:sticky lg:top-6">
        <TeamCalendar members={members} date={date} onPick={setDate} version={version} />
      </div>
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Month calendar for the whole team: each day shows a dot per person marked,
// in their status colour, so gaps and absences stand out at a glance.
function TeamCalendar({ members, date, onPick, version }) {
  const [sy, sm] = date.split("-").map(Number);
  const [view, setView] = useState({ year: sy, month: sm });
  // follow the selected day into its month (e.g. after "Back to today")
  const [shown, setShown] = useState(date);
  if (shown !== date) {
    setShown(date);
    setView({ year: sy, month: sm });
  }

  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      members.map((mem) => apiFetch(`/team/${mem.id}/attendance/month?year=${view.year}&month=${view.month}`).catch(() => []))
    ).then((perMember) => {
      if (cancelled) return;
      const map = {};
      perMember.flat().forEach((r) => {
        if (r && r.date) (map[r.date] ||= []).push(r.status);
      });
      setByDate(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [members, view.year, view.month, version]);

  const today = isoDate(new Date());
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const lead = new Date(view.year, view.month - 1, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <MonthSwitcher
          year={view.year}
          month={view.month}
          onChange={(yy, mm) => setView({ year: yy, month: mm })}
        />
        {loading && <span className="text-[11px] text-gray-400">Loading…</span>}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const iso = isoDate(new Date(view.year, view.month - 1, day));
          const marks = byDate[iso] || [];
          const selected = iso === date;
          const future = iso > today;
          return (
            <button
              key={iso}
              disabled={future}
              onClick={() => onPick(iso)}
              title={`${friendlyDate(iso)} — ${marks.length} of ${members.length} marked`}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-sm transition-colors ${
                selected
                  ? "bg-gray-900 text-white"
                  : iso === today
                  ? "bg-red-50 text-red-700 font-semibold"
                  : future
                  ? "text-gray-300 cursor-default"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {day}
              {marks.length > 0 && (
                <span className="flex flex-wrap justify-center gap-0.5 max-w-[2rem]">
                  {marks.slice(0, 6).map((st, k) => (
                    <span key={k} className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white/80" : statusMeta(st).dot}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        {STATUSES.map((st) => (
          <span key={st.key} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${st.dot}`} /> {st.label}
          </span>
        ))}
        <span className="text-gray-400">· one dot per person marked</span>
      </div>
    </div>
  );
}

function MemberDayCard({ member, date, record, logs, onChanged }) {
  const isToday = date === isoDate(new Date());
  const [time, setTime] = useState(record?.check_in_time?.slice(0, 5) || (isToday ? nowHHMM() : "09:30"));
  const [note, setNote] = useState(record?.description || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const save = async (status) => {
    setSaving(status);
    setError("");
    try {
      await apiFetch("/team/attendance", {
        method: "POST",
        body: JSON.stringify({
          employee_id: member.id,
          date,
          check_in_time: time || "09:30",
          status,
          description: note.trim() || null,
        }),
      });
      await onChanged();
    } catch (err) {
      setError(err.message || "Could not save");
    } finally {
      setSaving("");
    }
  };

  const clear = async () => {
    if (!record || !confirm(`Clear ${nameOf(member)}'s attendance for ${friendlyDate(date).toLowerCase()}?`)) return;
    try {
      await apiFetch(`/team/attendance/${record.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err.message || "Could not clear");
    }
  };

  const status = record?.status || "";
  const summary = !record
    ? "Attendance not marked yet"
    : status === "absent"
    ? "Did not come in"
    : `Came in at ${clockTime(record.check_in_time)}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={nameOf(member)} status={status} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-gray-900 truncate">{nameOf(member)}</p>
              <StatusChip status={status} />
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{summary}</p>
            {record?.description && <p className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{record.description}&rdquo;</p>}
          </div>
        </div>

        {/* One tap to mark */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => save(s.key)}
              disabled={!!saving}
              className={`px-3.5 py-1.5 rounded-full border text-sm font-medium transition-colors disabled:opacity-60 ${
                status === s.key ? s.on : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
              }`}
            >
              {saving === s.key ? "Saving…" : s.label}
            </button>
          ))}
          <button onClick={() => setEditing(!editing)} className="ml-auto text-xs text-gray-500 hover:text-gray-900 underline">
            {editing ? "Close" : "Time & note"}
          </button>
        </div>

        {editing && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
            <label className="text-xs text-gray-500">
              Came in at
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 block px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              />
            </label>
            <label className="text-xs text-gray-500 flex-1 min-w-[12rem]">
              Note (optional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Late due to traffic"
                className="mt-1 block w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              />
            </label>
            {record && (
              <>
                <button
                  onClick={() => save(record.status)}
                  disabled={!!saving}
                  className="px-3.5 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-60"
                >
                  Save
                </button>
                <button onClick={clear} className="px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50">
                  Clear
                </button>
              </>
            )}
            {!record && <p className="text-xs text-gray-400 w-full">Pick a status above to save.</p>}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* What they reported that day */}
      <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
          {logs.length === 0 ? "No updates sent" : `${logs.length} update${logs.length > 1 ? "s" : ""}`}
        </p>
        {logs.length > 0 && <UpdateList logs={logs} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Month summary

function MonthView({ members, onOpenDay }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [byMember, setByMember] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Promise.all(members.map((mem) => apiFetch(`/team/${mem.id}/attendance/month?year=${year}&month=${month}`).catch(() => []))),
      apiFetch(`/team/daily-logs?year=${year}&month=${month}`).catch(() => []),
    ]).then(([perMember, monthLogs]) => {
      if (cancelled) return;
      setByMember(Object.fromEntries(members.map((mem, i) => [mem.id, Array.isArray(perMember[i]) ? perMember[i] : []])));
      setLogs(Array.isArray(monthLogs) ? monthLogs : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [members, year, month]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = isoDate(now);
  const days = Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(year, month - 1, i + 1)));

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <MonthSwitcher year={year} month={month} onChange={(yy, mm) => { setYear(yy); setMonth(mm); }} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {[...STATUSES, NOT_MARKED].map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${s.cell}`} /> {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-50 border border-dashed border-gray-200" /> Sunday / future
          </span>
        </div>
      </div>

      {loading ? (
        <Loader />
      ) : (
        <div className="divide-y divide-gray-100">
          {members.map((mem) => {
            const recs = byMember[mem.id] || [];
            const byDate = Object.fromEntries(recs.map((r) => [r.date, r]));
            const count = (k) => recs.filter((r) => r.status === k).length;
            const updates = logs.filter((l) => l.team_member_id === mem.id).length;
            return (
              <div key={mem.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-3 w-48 min-w-0">
                    <Avatar name={nameOf(mem)} status="" size="w-8 h-8 text-xs" />
                    <p className="font-medium text-gray-900 truncate">{nameOf(mem)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                    {STATUSES.map((s) => (
                      <span key={s.key} className="text-gray-600">
                        <span className="font-semibold text-gray-900">{count(s.key)}</span> {s.label.toLowerCase()}
                      </span>
                    ))}
                    <span className="text-gray-600">
                      <span className="font-semibold text-gray-900">{updates}</span> update{updates === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                {/* one square per day — tap to open that day */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {days.map((d) => {
                    const r = byDate[d];
                    const future = d > todayIso;
                    const sunday = new Date(d + "T00:00:00").getDay() === 0;
                    const cls = r ? statusMeta(r.status).cell : future || sunday ? "bg-gray-50 border border-dashed border-gray-200" : NOT_MARKED.cell;
                    return (
                      <button
                        key={d}
                        disabled={future}
                        onClick={() => onOpenDay(d)}
                        title={`${friendlyDate(d)} — ${r ? statusMeta(r.status).label : "Not marked"}`}
                        className={`w-6 h-6 rounded-sm text-[10px] font-medium flex items-center justify-center ${cls} ${
                          r ? "text-white" : "text-gray-400"
                        } ${future ? "cursor-default" : "hover:ring-2 hover:ring-gray-900/30"}`}
                      >
                        {Number(d.slice(8))}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
