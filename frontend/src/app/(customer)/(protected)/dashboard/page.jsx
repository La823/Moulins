"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
  upcoming: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [requestsList, setRequestsList] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [balance, setBalance] = useState(null);
  // partner only: their bills, payments, retailers and team
  const [partnerData, setPartnerData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ledger/balance are partner-only — team members never see them, so skip
  // the fetch entirely rather than just hiding the section after the fact.
  const isTeamMember = user?.role === "team_member";

  useEffect(() => {
    Promise.all([
      apiFetch("/orders").catch(() => []),
      apiFetch("/doctors").catch(() => []),
      apiFetch("/meetings").catch(() => []),
      apiFetch("/requests").catch(() => []),
      isTeamMember ? Promise.resolve(null) : apiFetch("/ledger").catch(() => null),
      isTeamMember ? Promise.resolve(null) : apiFetch("/profile/balance").catch(() => null),
    ]).then(([o, d, m, r, l, b]) => {
      setOrders(Array.isArray(o) ? o : []);
      setDoctors(Array.isArray(d) ? d : []);
      setMeetings(Array.isArray(m) ? m : []);
      setRequestsList(Array.isArray(r) ? r : []);
      setLedger(l || null);
      setBalance(b || null);
      setLoading(false);
    });
  }, [isTeamMember]);

  useEffect(() => {
    if (!user || isTeamMember) return;
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const list = (x) => (Array.isArray(x) ? x : null);
    Promise.all([
      apiFetch("/my/marg-bills").catch(() => null),
      apiFetch("/payments").then(list).catch(() => null),
      apiFetch("/retailers").then(list).catch(() => null),
      apiFetch("/retailer-orders/incoming").then(list).catch(() => null),
      apiFetch("/team").then(list).catch(() => null),
      apiFetch(`/team/attendance?date=${today}`).then(list).catch(() => null),
    ]).then(([bills, payments, retailers, retailerOrders, team, attendance]) =>
      setPartnerData({ bills, payments, retailers, retailerOrders, team, attendance }),
    );
  }, [user, isTeamMember]);

  const upcomingMeetings = meetings
    .filter((m) => m.status === "upcoming")
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const recentRequests = [...requestsList].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/4" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-1">
        Welcome{user?.username ? `, ${user.username}` : ""}
      </h1>
      <p className="text-sm text-gray-400 mb-8">Here&apos;s an overview of your account</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <SummaryCard label="Orders" value={orders.length} href="/orders" />
        <SummaryCard label="Doctors" value={doctors.length} href="/doctors" />
        <SummaryCard label="Upcoming Meetings" value={upcomingMeetings.length} href="/meetings" />
        <SummaryCard label="Requests" value={requestsList.length} href="/requests" />
      </div>

      {/* Current Balance — partner-only, pulled from their linked Marg
          ledger account. Not shown at all if there's no rid linked yet or
          no synced balance, rather than showing a confusing zero. */}
      {!isTeamMember && balance?.balance !== null && balance?.balance !== undefined && (
        <div className="mb-10 border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Balance</p>
            <p className="text-2xl font-light text-gray-900">
              ₹{Number(balance.balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {balance.synced_at && (
            <p className="text-xs text-gray-400">
              As of {new Date(balance.synced_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
            </p>
          )}
        </div>
      )}

      {!isTeamMember && partnerData && <PartnerFigures data={partnerData} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming meetings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Upcoming Meetings</h2>
            <Link href="/meetings" className="text-xs text-red-600 hover:text-red-700">View all &rarr;</Link>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming meetings</p>
          ) : (
            <div className="space-y-2">
              {upcomingMeetings.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-900">Dr. {m.doctor_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[m.status]}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent orders */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Recent Orders</h2>
            <Link href="/orders" className="text-xs text-red-600 hover:text-red-700">View all &rarr;</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-400">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-400 transition-colors"
                >
                  <div>
                    <p className="text-xs text-gray-400 font-mono">{o.id.slice(0, 8)}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[o.status] || "bg-gray-100 text-gray-600"}`}>
                    {o.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* My Doctors */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">My Doctors</h2>
            <Link href="/doctors" className="text-xs text-red-600 hover:text-red-700">View all &rarr;</Link>
          </div>
          {doctors.length === 0 ? (
            <p className="text-sm text-gray-400">No doctors added yet</p>
          ) : (
            <div className="space-y-2">
              {doctors.slice(0, 5).map((d) => (
                <Link
                  key={d.id}
                  href={`/doctors/${d.id}`}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-400 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-900">{d.name}</p>
                    {d.clinic_name && <p className="text-xs text-gray-500">{d.clinic_name}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Account Ledger — partner-only, never shown to team members */}
        {!isTeamMember && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Account Ledger</h2>
            </div>
            {!ledger ? (
              <p className="text-sm text-gray-400">No ledger uploaded yet</p>
            ) : (
              <a
                href={ledger.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-400 transition-colors"
              >
                <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-900">View / download ledger</p>
                  <p className="text-xs text-gray-500">
                    Updated {new Date(ledger.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </p>
                </div>
              </a>
            )}
          </section>
        )}

        {/* Recent requests */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Recent Requests</h2>
            <Link href="/requests" className="text-xs text-red-600 hover:text-red-700">View all &rarr;</Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-gray-400">No requests submitted yet</p>
          ) : (
            <div className="space-y-2">
              {recentRequests.map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] || "bg-gray-100 text-gray-600"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, href, sub, alert }) {
  return (
    <Link
      href={href}
      className={`border rounded-lg p-5 hover:border-gray-400 transition-colors ${alert ? "border-orange-300" : "border-gray-200"}`}
    >
      <p className="text-2xl font-light text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className={`text-xs mt-1 ${alert ? "text-orange-700 font-medium" : "text-gray-400"}`}>{sub}</p>}
    </Link>
  );
}

const rupees = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// The partner's figures, like the app's dashboard: what Moulins billed them
// this financial year, their payments, their retailers and those retailers'
// orders, and their team. A figure that couldn't be loaded shows a dash.
function PartnerFigures({ data }) {
  const { bills, payments, retailers, retailerOrders, team, attendance } = data;
  const linked = bills?.linked === true;
  const lastBill = linked
    ? (bills.bills || []).reduce((last, b) => (!last || new Date(b.date) > new Date(last) ? b.date : last), null)
    : null;
  const pending = payments?.filter((p) => p.status === "pending").length ?? 0;
  const verified = payments?.filter((p) => p.status === "verified").reduce((s, p) => s + Number(p.amount || 0), 0);
  const waiting = retailerOrders?.filter((o) => o.status === "pending").length ?? 0;
  const present = attendance?.filter((a) => a.status === "present").length;
  const dash = "—";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
      <SummaryCard
        label="Billed this financial year"
        value={linked ? rupees(bills.total) : dash}
        href="/partner-panel/bills"
        sub={
          linked
            ? `${bills.count} invoice${bills.count === 1 ? "" : "s"}${
                lastBill ? ` · last ${new Date(lastBill).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""
              }`
            : "Not linked to billing yet"
        }
      />
      <SummaryCard
        label="Payments verified"
        value={payments ? rupees(verified) : dash}
        href="/partner-panel/payments"
        sub={pending > 0 ? `${pending} waiting to be checked` : null}
        alert={pending > 0}
      />
      <SummaryCard
        label="Retailer orders"
        value={retailerOrders ? retailerOrders.length : dash}
        href="/partner-panel/retailer-orders"
        sub={retailerOrders ? (waiting > 0 ? `${waiting} waiting for you` : "None waiting") : null}
        alert={waiting > 0}
      />
      <SummaryCard label="Retailers" value={retailers ? retailers.length : dash} href="/partner-panel/retailers" />
      <SummaryCard
        label="Team members"
        value={team ? team.length : dash}
        href="/partner-panel/team"
        sub={team?.length > 0 && present != null ? `${present} present today` : null}
      />
    </div>
  );
}
