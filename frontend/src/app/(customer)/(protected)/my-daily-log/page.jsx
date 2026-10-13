"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { isoDate, friendlyDate, UpdateItem, MonthSwitcher, MONTHS } from "@/components/team/attendanceUi";

// Tap one to start the message — the team member then adds the detail.
const QUICK = ["Visited doctor", "Met chemist", "Office work", "Travelling", "Took an order"];

// A team member's updates to their partner: what they did, sent with the
// phone's current location. Always for today — a location is only honest
// for the day it was taken, so there's no picking an earlier date.
export default function MyDailyLogPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Only the device's current position is ever used — no manual pin-drop —
  // so a partner can trust a log's location reflects where it was sent from.
  const getCurrentLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("This device can't share its location."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error("We couldn't get your location. Please turn on location access and try again.")),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/my-daily-log?year=${year}&month=${month}`);
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const addQuick = (q) => {
    setNotes((n) => (n.trim() ? `${n.trim()}\n${q} — ` : `${q} — `));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!notes.trim()) {
      setError("Write a line about what you did.");
      return;
    }
    setSubmitting(true);
    try {
      setLocating(true);
      const { lat, lng } = await getCurrentLocation();
      setLocating(false);
      await apiFetch("/my-daily-log", {
        method: "POST",
        body: JSON.stringify({ date: isoDate(new Date()), notes: notes.trim(), latitude: lat, longitude: lng }),
      });
      setNotes("");
      setSuccess("Update sent ✓");
      setTimeout(() => setSuccess(""), 3000);
      const t = new Date();
      if (year !== t.getFullYear() || month !== t.getMonth() + 1) {
        setYear(t.getFullYear());
        setMonth(t.getMonth() + 1);
      } else {
        fetchLogs();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
      setSubmitting(false);
    }
  };

  const days = [...new Set(logs.map((l) => l.date))].sort().reverse();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Updates</h1>
        <p className="text-sm text-gray-500 mt-1">Tell your manager what you did today. Send as many updates as you like.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-gray-900">Send an update</p>
          <p className="text-xs text-gray-400">for {friendlyDate(isoDate(new Date())).toLowerCase()}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => addQuick(q)}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors"
            >
              + {q}
            </button>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="e.g. Visited Dr. Mehta — left 2 samples of Acnepres"
          className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-base text-gray-900 focus:outline-none focus:border-gray-900"
        />

        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.5-7.5 11.25-7.5 11.25S4.5 18 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Your current location is added automatically.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600 font-medium">{success}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto px-6 py-3 bg-gray-900 text-white rounded-xl text-base font-semibold hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? (locating ? "Getting your location…" : "Sending…") : "Send update"}
        </button>
      </form>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Updates you sent</h2>
          <MonthSwitcher year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
        {loading ? (
          <Loader />
        ) : days.length === 0 ? (
          <p className="text-sm text-gray-400">No updates in {MONTHS[month - 1]} {year}.</p>
        ) : (
          <div className="space-y-4">
            {days.map((d) => (
              <section key={d} className="bg-white rounded-xl border border-gray-200">
                <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-900">{friendlyDate(d)}</div>
                <div className="px-4 py-4 space-y-4 border-l-2 border-teal-50 ml-4">
                  {logs
                    .filter((l) => l.date === d)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((l) => (
                      <UpdateItem key={l.id} log={l} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
