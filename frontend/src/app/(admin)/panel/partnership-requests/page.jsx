"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const STATUSES = [
  { value: "new", label: "New", cls: "bg-blue-50 text-blue-700" },
  { value: "contacted", label: "Contacted", cls: "bg-amber-50 text-amber-700" },
  { value: "converted", label: "Converted", cls: "bg-green-50 text-green-700" },
  { value: "declined", label: "Declined", cls: "bg-gray-100 text-gray-500" },
];
const statusOf = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];
const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");

// "Become a partner" requests from visitors — people who signed up with
// Google to look around. Staff call them, then mark the request contacted,
// converted (once the partner account is made on the Partners page) or
// declined. Open requests come first.
export default function PartnershipRequestsPage() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch(`/admin/partnership-requests${filter ? `?status=${filter}` : ""}`)
      .then((d) => setRows(d || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id, body) => {
    setError("");
    try {
      await apiFetch(`/admin/partnership-requests/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Partnership Requests</h2>
        <p className="text-sm text-gray-500">
          Visitors who signed up with Google and asked to become a partner. Call them, then set the status. To make
          them a partner, create the account on the Partners page.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[{ value: "", label: "All" }, ...STATUSES].map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              filter === s.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No requests{filter ? ` marked ${statusOf(filter).label.toLowerCase()}` : " yet"}.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} onUpdate={(body) => update(r.id, body)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ r, onUpdate }) {
  const [note, setNote] = useState(r.staff_note || "");
  const [saving, setSaving] = useState(false);
  const s = statusOf(r.status);

  const save = async (body) => {
    setSaving(true);
    await onUpdate(body);
    setSaving(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{r.firm_name}</span>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>
          </div>
          <p className="text-sm text-gray-700 mt-0.5">
            {r.contact_name || r.visitor_name || "—"} ·{" "}
            <a href={`tel:${r.phone}`} className="text-blue-600 hover:underline">
              {r.phone}
            </a>
            {r.city ? ` · ${r.city}` : ""}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Google: {r.visitor_email} · sent {fmt(r.created_at)}
            {r.handled_by_name ? ` · last updated by ${r.handled_by_name}, ${fmt(r.updated_at)}` : ""}
          </p>
          {r.message && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{r.message}</p>}
        </div>
        <select
          value={r.status}
          disabled={saving}
          onChange={(e) => save({ status: e.target.value })}
          className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
        >
          {STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Staff note (only staff see this)"
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          onClick={() => save({ staff_note: note })}
          disabled={saving || note === (r.staff_note || "")}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium disabled:opacity-50"
        >
          Save note
        </button>
      </div>
    </div>
  );
}
