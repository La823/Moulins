"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import {
  shiftMonth, prettyMonth, fmtDays, Stepper, EmployeeMonthView, exportEmployeeMonth,
  LeaveStatusChip, leaveRange, paidSplit,
} from "@/components/admin/attendanceShared";
import { useBreadcrumbTitle, BackLink } from "@/components/admin/Breadcrumbs";

// One employee's month from the fingerprint scanner, as a calendar, with
// their leave. Reached from any name on /panel/attendance; ?month=YYYY-MM.

function EmployeeCalendar() {
  const { code } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canSeeLeave = user?.role === "admin" || (user?.permissions || []).includes("leaves_view");

  const [status, setStatus] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    if (canSeeLeave) {
      apiFetch(`/admin/etime/employees/${encodeURIComponent(code)}/balance?month=${month}`).then(setBalance).catch(() => setBalance(null));
      apiFetch(`/admin/etime/leaves?emp_code=${encodeURIComponent(code)}&month=${month}`)
        .then((r) => setLeaves(r?.leaves || []))
        .catch(() => setLeaves([]));
    }
  }, [code, month, canSeeLeave]);

  const go = (c, m) => router.push(`/panel/attendance/employee/${encodeURIComponent(c)}?month=${m}`);
  const emp = data?.employees?.[0];
  useBreadcrumbTitle(emp?.name);

  return (
    <>
      <BackLink fallback="/panel/attendance" fallbackLabel="Attendance" />

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
          <button onClick={() => exportEmployeeMonth(emp, month)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
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
          <EmployeeMonthView key={`${code}-${month}`} emp={emp} today={today} loading={loading} />

          {canSeeLeave && balance && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 self-start">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Leave balance · {prettyMonth(month)}</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-[11px] text-gray-400">Allowance</dt><dd className="text-gray-800">{fmtDays(balance.per_month)} / month</dd></div>
                  <div><dt className="text-[11px] text-gray-400">Built up this year</dt><dd className="text-gray-800">{fmtDays(balance.accrued)}</dd></div>
                  <div><dt className="text-[11px] text-gray-400">Paid leave booked</dt><dd className="text-gray-800">{fmtDays(balance.paid_booked)}</dd></div>
                  <div><dt className="text-[11px] text-gray-400">Available</dt><dd className={`font-semibold ${balance.available < 0 ? "text-red-600" : "text-indigo-700"}`}>{fmtDays(balance.available)}</dd></div>
                  {balance.unpaid_this_year > 0 && <div><dt className="text-[11px] text-gray-400">Unpaid this year</dt><dd className="text-gray-800">{fmtDays(balance.unpaid_this_year)}</dd></div>}
                  {balance.pending_days > 0 && <div><dt className="text-[11px] text-gray-400">Waiting for approval</dt><dd className="text-amber-700">{fmtDays(balance.pending_days)}</dd></div>}
                </dl>
                {balance.per_month === 0 && (
                  <p className="text-[11px] text-gray-400 mt-3">No allowance set. Set it on Attendance → Employees.</p>
                )}
              </div>

              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Leave touching {prettyMonth(month)}</h3>
                {leaves.length === 0 ? (
                  <p className="text-xs text-gray-400">None.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {leaves.map((l) => (
                      <li key={l.id} className="py-2.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800">{leaveRange(l)} <span className="text-xs text-gray-400">· {fmtDays(l.days)}</span></p>
                          {l.reason && <p className="text-xs text-gray-500 truncate">{l.reason}</p>}
                          {paidSplit(l) && <p className="text-[11px] text-gray-400">{paidSplit(l)}</p>}
                        </div>
                        <LeaveStatusChip status={l.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
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
