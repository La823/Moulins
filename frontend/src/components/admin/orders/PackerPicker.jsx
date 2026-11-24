"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Choosing who packs an order when it is sent to packing: every dispatch
// member with today's attendance (from the fingerprint scanner) and the
// orders they already have open, or "Auto" to leave it to the rotation.
// Server: GET /admin/dispatch/packers (internal/dispatch/rotation.go).

const clock = (hhmm) => {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// today's attendance in words, and its colour
export function packerDay(p) {
  if (p.on_leave) return { text: "On leave today", tone: "text-red-600", dot: "bg-red-500" };
  if (!p.linked) return { text: "Not on the attendance machine", tone: "text-gray-500", dot: "bg-gray-300" };
  const half = p.half_day_leave ? " · half-day leave" : "";
  if (p.first_in) return { text: `Present · in at ${clock(p.first_in)}${half}`, tone: "text-green-700", dot: "bg-green-500" };
  return { text: `Not punched in yet${half}`, tone: "text-amber-700", dot: "bg-amber-400" };
}

export default function PackerPicker({ onCancel, onConfirm, busy }) {
  const [packers, setPackers] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState(""); // "" = auto (rotation)

  useEffect(() => {
    apiFetch("/admin/dispatch/packers")
      .then((d) => setPackers(d.packers || []))
      .catch((e) => setError(e.message || "Could not load the dispatch team"));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // present people first, then by fewest open orders
  const sorted = (packers || []).slice().sort((a, b) => {
    const rank = (p) => (p.on_leave ? 3 : !p.linked ? 1 : p.first_in ? 0 : 2);
    return rank(a) - rank(b) || a.open - b.open || a.name.localeCompare(b.name);
  });

  const row = (value, children) => (
    <label
      key={value || "auto"}
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${
        pick === value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <input type="radio" name="packer" checked={pick === value} onChange={() => setPick(value)} className="mt-1" />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5 my-10">
        <h3 className="text-base font-semibold text-gray-900">Send to packing</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">Choose who packs this order. Today&apos;s attendance is from the fingerprint machine.</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {!packers && !error ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading the dispatch team…</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {row(
              "",
              <>
                <p className="text-sm font-medium text-gray-900">Auto (rotation)</p>
                <p className="text-xs text-gray-500">The next person in turn who is present today</p>
              </>,
            )}
            {sorted.map((p) => {
              const day = packerDay(p);
              return row(
                p.id,
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">
                      {p.open} open order{p.open === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className={`text-xs flex items-center gap-1.5 ${day.tone}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${day.dot}`} />
                    {day.text}
                    {p.skip && <span className="text-gray-400"> · out of rotation</span>}
                  </p>
                </>,
              );
            })}
            {packers && packers.length === 0 && <p className="text-xs text-gray-400">Nobody packs orders yet (Packing permission).</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (!packers && !error)}
            onClick={() => onConfirm(pick)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to packing"}
          </button>
        </div>
      </div>
    </div>
  );
}
