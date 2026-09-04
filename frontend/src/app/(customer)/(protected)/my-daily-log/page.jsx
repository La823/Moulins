"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MyDailyLogPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Only the device's current position is ever used — no manual pin-drop —
  // so a partner can trust a log's location reflects where it was actually
  // submitted from.
  const getCurrentLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported on this device"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error("Could not get your current location. Please enable location access.")),
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

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!notes.trim()) {
      setError("Notes are required");
      return;
    }
    setSubmitting(true);
    try {
      setLocating(true);
      const { lat, lng } = await getCurrentLocation();
      setLocating(false);

      await apiFetch("/my-daily-log", {
        method: "POST",
        body: JSON.stringify({ date, notes: notes.trim(), latitude: lat, longitude: lng }),
      });
      setNotes("");
      setSuccess("Log saved");
      setTimeout(() => setSuccess(""), 3000);
      fetchLogs();
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
      setSubmitting(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-6">My Daily Log</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayStr()}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">What did you do today?</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Summarize your work for the day..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.5-7.5 11.25-7.5 11.25S4.5 18 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Your current location will be attached to this log automatically.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? (locating ? "Getting location..." : "Saving...") : "Save Log"}
        </button>
      </form>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Past Logs</h3>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 w-28 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400">No logs for {MONTHS[month - 1]} {year}.</p>
      ) : (
        <div className="space-y-3">
          {logs.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">{l.date}</p>
                {l.latitude != null && l.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-teal-600 hover:underline flex items-center gap-0.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.5-7.5 11.25-7.5 11.25S4.5 18 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    Located
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{l.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
