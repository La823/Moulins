"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import {
  shiftMonth, prettyMonth, fmtDays, inputCls, timeOf, Stat, Stepper, EmployeeMonthView,
  LeaveStatusChip, leaveRange, paidSplit,
} from "@/components/admin/attendanceShared";

// Staff self-service: leave balance, apply for leave, and their own
// fingerprint attendance. Works once an admin has linked the login to the
// person's eTimeOffice code (Attendance → Employees).

function ApplyForm({ today, onApplied }) {
  const [form, setForm] = useState({ from: "", to: "", half_day: false, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      const l = await apiFetch("/etime/me/leaves", {
        method: "POST",
        body: JSON.stringify({ ...form, to: form.half_day || !form.to ? form.from : form.to }),
      });
      setForm({ from: "", to: "", half_day: false, reason: "" });
      setDone(`Sent for approval: ${leaveRange(l)}, ${fmtDays(l.days)}.`);
      onApplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Apply for leave</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          From
          <input type="date" required value={form.from}
            onChange={(e) => set({ from: e.target.value, to: form.to && form.to < e.target.value ? e.target.value : form.to })}
            className={`${inputCls} w-full mt-1`} />
        </label>
        <label className={`text-xs text-gray-500 ${form.half_day ? "opacity-40" : ""}`}>
          To
          <input type="date" value={form.half_day ? form.from : form.to} min={form.from || today} disabled={form.half_day}
            onChange={(e) => set({ to: e.target.value })} className={`${inputCls} w-full mt-1`} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600 mt-3">
        <input type="checkbox" checked={form.half_day} onChange={(e) => set({ half_day: e.target.checked })} />
        Half day (one date)
      </label>
      <label className="block text-xs text-gray-500 mt-3">
        Reason
        <textarea required rows={2} value={form.reason} onChange={(e) => set({ reason: e.target.value })}
          className={`${inputCls} w-full mt-1`} placeholder="e.g. family function, unwell" />
      </label>
      <p className="text-[11px] text-gray-400 mt-2">Sundays aren&apos;t counted. Leave over your balance can still be approved, as unpaid.</p>
      <button type="submit" disabled={busy} className="mt-3 w-full px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
        {busy ? "Sending…" : "Send for approval"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {done && <p className="text-xs text-green-700 mt-2">{done}</p>}
    </form>
  );
}

export default function MyLeavesPage() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(null);
  const [cal, setCal] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  const loadMe = useCallback(() => {
    apiFetch("/etime/me")
      .then((d) => {
        setMe(d);
        setMonth((m) => m || d?.today?.slice(0, 7) || null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    if (!me?.linked || !month) return;
    setCalLoading(true);
    apiFetch(`/etime/me/month?month=${month}`)
      .then(setCal)
      .catch(() => setCal(null))
      .finally(() => setCalLoading(false));
  }, [me, month]);

  const cancel = async (l) => {
    if (!confirm("Withdraw this leave request?")) return;
    try {
      await apiFetch(`/etime/me/leaves/${l.id}/cancel`, { method: "POST" });
      loadMe();
    } catch (err) {
      alert(err.message);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!me) return <div className="h-64 flex items-center justify-center"><Loader size="sm" /></div>;

  if (!me.linked) {
    return (
      <>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">My Leaves</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-700">Your login isn&apos;t linked to the attendance system yet.</p>
          <p className="text-xs text-gray-400 mt-1">Ask an admin to link it under Attendance → Employees.</p>
        </div>
      </>
    );
  }

  const b = me.balance;
  const today = me.today;
  const thisMonth = today.slice(0, 7);
  const emp = cal?.employees?.[0];

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">My Leaves</h2>
        <p className="text-xs text-gray-400">{me.employee.name} · #{me.employee.emp_code}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Available" value={fmtDays(b.available)} tone={b.available < 0 ? "text-red-600" : "text-indigo-700"} hint="paid leave left this year" />
        <Stat label="Allowance" value={fmtDays(b.per_month)} hint="per month, carried within the year" />
        <Stat label="Taken this month" value={fmtDays(b.used_this_month)} />
        <Stat label="Waiting for approval" value={fmtDays(b.pending_days)} tone={b.pending_days ? "text-amber-700" : "text-gray-900"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        <div className="lg:col-span-2">
          <ApplyForm today={today} onApplied={loadMe} />
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 self-start">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">My requests</h3>
          {me.leaves.length === 0 ? (
            <p className="text-xs text-gray-400">No leave requested yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {me.leaves.map((l) => (
                <li key={l.id} className="py-2.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">{leaveRange(l)} <span className="text-xs text-gray-400">· {fmtDays(l.days)}</span></p>
                    {l.reason && <p className="text-xs text-gray-500 truncate">{l.reason}</p>}
                    <p className="text-[11px] text-gray-400">
                      {l.status === "pending" ? `Applied ${timeOf(l.created_at)}` : l.decided_at ? `${l.status === "approved" ? "Approved" : l.status === "rejected" ? "Rejected" : "Cancelled"} ${timeOf(l.decided_at)}` : ""}
                      {paidSplit(l) && ` · ${paidSplit(l)}`}
                    </p>
                    {l.decision_note && <p className="text-[11px] text-gray-600">&ldquo;{l.decision_note}&rdquo;</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <LeaveStatusChip status={l.status} />
                    {l.status === "pending" && (
                      <button onClick={() => cancel(l)} className="text-[11px] text-gray-500 hover:text-red-600">Withdraw</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mr-auto">My attendance</h3>
        {month && (
          <Stepper label={prettyMonth(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= shiftMonth(thisMonth, 2)} />
        )}
      </div>
      {!emp ? (
        <div className="h-48 flex items-center justify-center">{calLoading ? <Loader size="sm" /> : <p className="text-sm text-gray-400">Nothing for this month.</p>}</div>
      ) : (
        <EmployeeMonthView key={month} emp={emp} today={today} loading={calLoading} />
      )}
    </>
  );
}
