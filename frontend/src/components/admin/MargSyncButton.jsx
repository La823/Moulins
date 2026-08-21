"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

function formatLastSynced(value) {
  if (!value) return "Never synced";
  // Marg's DateTime cursor comes back as "YYYY-MM-DD HH:MM:SS" (no
  // timezone) — treat it as UTC, matching how it's stored (TIMESTAMPTZ).
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return `Last synced ${date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
}

// Triggers a Marg ERP master-data sync (products + parties, one API call
// updates both) — admin-only, since POST /admin/marg-sync/trigger is
// gated stricter than the marg_master view permission employees can hold.
// Shows the last-synced timestamp to everyone with view access, so staff
// can see at a glance whether triggering another sync is even worthwhile
// (Marg rate-limits how often this can be called).
export default function MargSyncButton({ onDone }) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null); // { type: "success" | "error", message: string }
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    apiFetch("/admin/marg-sync/status")
      .then((data) => setLastSyncedAt(data.last_synced_at || null))
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  // Auto-dismiss the status banner after a few seconds so it doesn't
  // linger indefinitely.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  const handleSync = async () => {
    setSyncing(true);
    setStatus(null);
    try {
      const data = await apiFetch("/admin/marg-sync/trigger", { method: "POST" });
      const message =
        data.products_upserted === 0 && data.parties_upserted === 0
          ? "Already up to date — no changes since last sync."
          : `Synced ${data.products_upserted} product${data.products_upserted !== 1 ? "s" : ""} and ${data.parties_upserted} part${data.parties_upserted !== 1 ? "ies" : "y"}.`;
      setStatus({
        type: data.cursor_warning ? "error" : "success",
        message: data.cursor_warning ? `${message} (${data.cursor_warning})` : message,
      });
      apiFetch("/admin/marg-sync/status")
        .then((d) => setLastSyncedAt(d.last_synced_at || null))
        .catch(() => {});
      onDone?.();
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {user?.role === "admin" && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="relative flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-80 disabled:cursor-not-allowed overflow-hidden"
        >
          {syncing && (
            <span className="absolute inset-0 bg-white/10">
              <span className="absolute inset-y-0 left-0 w-1/3 bg-white/20 animate-[margsync-sweep_1.1s_ease-in-out_infinite]" />
            </span>
          )}
          <svg
            className={`w-4 h-4 relative ${syncing ? "animate-spin" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span className="relative">{syncing ? "Syncing with Marg..." : "Sync from Marg"}</span>
        </button>
      )}

      {!loadingStatus && (
        <span className="text-xs text-gray-400">{formatLastSynced(lastSyncedAt)}</span>
      )}

      {status && (
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
            status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {status.type === "success" ? (
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          )}
          {status.message}
        </div>
      )}

      <style jsx global>{`
        @keyframes margsync-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
