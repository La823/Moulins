"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { inputCls, timeOf, prettyDate, LeaveStatusChip } from "@/components/admin/attendanceShared";

// Missed punches: a staff member logs a check-in or check-out they forgot to
// punch on the scanner (the date and time); whoever approves leave approves
// or rejects it. A log only — the scanner attendance isn't changed.
// Server: internal/etimeoffice/missed_punch.go.

const KIND = { in: "Check-in", out: "Check-out" };

// "09:05" -> "9:05 AM"
export function clock(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// The staff member's own logs, with the form to log one (My Leaves page).
export function MyMissedPunches() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ type: "in", date: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    apiFetch("/etime/me/missed-punches")
      .then((d) => {
        setData(d);
        setForm((f) => (f.date ? f : { ...f, date: d?.today || "" }));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      const m = await apiFetch("/etime/me/missed-punches", { method: "POST", body: JSON.stringify(form) });
      setDone(`Sent for approval: ${KIND[m.type].toLowerCase()} at ${clock(m.time)} on ${prettyDate(m.date)}.`);
      setForm((f) => ({ ...f, time: "" }));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (m) => {
    try {
      await apiFetch(`/etime/me/missed-punches/${m.id}/cancel`, { method: "POST" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (data && !data.linked) return null; // the page already says the login isn't linked
  const list = data?.missed_punches || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
      <form onSubmit={submit} className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 self-start">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Missed punch</h3>
        <p className="text-[11px] text-gray-400 mb-3">Forgot to punch on the machine? Log it here for approval.</p>
        <p className="text-xs text-gray-500 mb-1">What was missed</p>
        <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-3">
          {["in", "out"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: k }))}
              className={`px-2 py-1.5 rounded-md text-xs font-medium ${form.type === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {KIND[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            Date
            <input type="date" required value={form.date} max={data?.today} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="text-xs text-gray-500">
            Time
            <input type="time" required value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className={`${inputCls} w-full mt-1`} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="mt-3 w-full px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Sending…" : "Send for approval"}
        </button>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        {done && <p className="text-xs text-green-700 mt-2">{done}</p>}
      </form>

      <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 self-start">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">My missed punches</h3>
        {!data ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-gray-400">None logged yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((m) => (
              <li key={m.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    {KIND[m.type]} at {clock(m.time)} <span className="text-xs text-gray-400">· {prettyDate(m.date)}</span>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {m.status === "pending" ? `Logged ${timeOf(m.created_at)}` : m.decided_at ? `${m.status[0].toUpperCase()}${m.status.slice(1)} ${timeOf(m.decided_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <LeaveStatusChip status={m.status} />
                  {m.status === "pending" && (
                    <button onClick={() => withdraw(m)} className="text-[11px] text-gray-500 hover:text-red-600">
                      Withdraw
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Everyone's logs for approvers (Attendance → Leaves tab): pending first.
export function MissedPunchApprovals({ canDecide }) {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiFetch(`/admin/etime/missed-punches${status ? `?status=${status}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (m, action) => {
    setBusy(m.id);
    setError("");
    try {
      await apiFetch(`/admin/etime/missed-punches/${m.id}/${action}`, { method: "POST" });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const list = data?.missed_punches || [];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-800 mr-auto">
          Missed punches{data?.pending ? <span className="ml-2 text-xs font-medium text-amber-700">{data.pending} waiting</span> : null}
        </h3>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Withdrawn</option>
          <option value="">All</option>
        </select>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {!data ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-gray-400">{status === "pending" ? "Nothing waiting." : "None."}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {list.map((m) => (
            <li key={m.id} className="py-2.5 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{m.name}</span> <span className="text-[11px] text-gray-400">#{m.emp_code}</span>
                </p>
                <p className="text-sm text-gray-700">
                  Missed {KIND[m.type].toLowerCase()} at {clock(m.time)} <span className="text-gray-400">· {prettyDate(m.date)}</span>
                </p>
                <p className="text-[11px] text-gray-400">
                  Logged {timeOf(m.created_at)}
                  {m.decided_by_name && m.status !== "pending" ? ` · ${m.status} by ${m.decided_by_name}` : ""}
                </p>
              </div>
              {m.status === "pending" && canDecide ? (
                <div className="flex gap-2">
                  <button disabled={busy === m.id} onClick={() => decide(m, "approve")} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50">
                    Approve
                  </button>
                  <button disabled={busy === m.id} onClick={() => decide(m, "reject")} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              ) : (
                <LeaveStatusChip status={m.status} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
