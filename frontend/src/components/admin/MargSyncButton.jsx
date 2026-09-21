"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

function formatLastSynced(value) {
  if (!value) return "Never synced";
  // Marg's DateTime cursor comes back as "YYYY-MM-DD HH:MM:SS" — this is
  // Marg's own India-local (IST) wall-clock time, NOT UTC, even though it's
  // stored in a TIMESTAMPTZ column. Labeling it "Z" (UTC) here was the bug:
  // it shifted an already-correct IST time forward by another +05:30 on
  // display (e.g. an actual 00:49 sync showed as "6:19 am"). Label it
  // +05:30 instead so the parsed instant is correct, then always render in
  // Asia/Kolkata explicitly — regardless of the viewing admin's own
  // browser timezone — since that's the timezone this timestamp means.
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "+05:30";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return `Last synced ${date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}`;
}

function formatElapsed(seconds) {
  if (seconds == null) return "";
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const PHASE_LABELS = {
  queued: "Queued",
  fetching: "Fetching from Marg",
  validating: "Checking the response is complete",
  products: "Saving products",
  batches: "Saving batches",
  parties: "Saving parties",
  done: "Finishing up",
  failed: "Failed",
};

// Progress is reported per phase rather than as a single row counter, so the
// bar is weighted by roughly how long each phase takes. Fetching dominates a
// small window; the write phases dominate a wide one.
function phaseProgress(run) {
  if (!run) return 0;
  if (run.status === "completed") return 100;
  const { phase, products_done: pd, products_total: pt, batches_done: bd, rows_received: rr, parties_done: sd, parties_total: st } = run;
  switch (phase) {
    case "queued":
      return 2;
    case "fetching":
      return 8;
    case "validating":
      return 14;
    case "products":
      return 15 + (pt ? Math.min(1, pd / pt) : 0) * 40;
    case "batches":
      return 55 + (rr ? Math.min(1, bd / rr) : 0) * 30;
    case "parties":
      return 85 + (st ? Math.min(1, sd / st) : 0) * 15;
    case "done":
      return 100;
    default:
      return 0;
  }
}

// Triggers a Marg ERP master-data sync (products + parties, one API call
// updates both) — admin-only, since POST /admin/marg-sync/trigger is
// gated stricter than the marg_master view permission employees can hold.
//
// The sync runs in the BACKGROUND on the server: a wide pull moves thousands
// of rows, so the trigger returns a run id immediately and this component
// polls it. That also means a sync started in one browser tab (or by the
// scheduler) is visible in every other one — on mount we attach to whatever
// is already running rather than pretending nothing is happening.
export default function MargSyncButton({ onDone }) {
  const { user } = useAuth();
  const [windows, setWindows] = useState([]);
  const [windowKey, setWindowKey] = useState("1m");
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState(null);
  const [status, setStatus] = useState(null); // { type, message }
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [tick, setTick] = useState(0);

  const pollRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/admin/marg-sync/status");
      setLastSyncedAt(data.last_synced_at || null);
      setWindows(data.windows || []);
      setHistory(data.recent_runs || []);
      if (data.active_run) setRun(data.active_run);
      return data.active_run;
    } catch {
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Re-render once a second while a sync is in flight so the elapsed timer
  // ticks even between polls — important when a run lasts many minutes and
  // would otherwise look frozen between two-second polls.
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run]);

  // Poll the run while it's running.
  useEffect(() => {
    if (!run || run.status !== "running") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    const id = run.id;
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await apiFetch(`/admin/marg-sync/runs/${id}`);
        setRun(fresh);
        if (fresh.status !== "running") {
          if (fresh.status === "completed") {
            const bits = [];
            if (fresh.products_new > 0) bits.push(`${fresh.products_new} new product${fresh.products_new !== 1 ? "s" : ""}`);
            bits.push(`${fresh.products_done} product${fresh.products_done !== 1 ? "s" : ""} updated`);
            bits.push(`${fresh.parties_done} part${fresh.parties_done !== 1 ? "ies" : "y"}`);
            setStatus({
              type: fresh.warning ? "warn" : "success",
              message: fresh.products_done === 0 && fresh.parties_done === 0
                ? "Already up to date — nothing changed since the last sync."
                : `Synced in ${formatElapsed(fresh.elapsed_seconds)} — ${bits.join(", ")}.${fresh.warning ? ` (${fresh.warning})` : ""}`,
            });
            doneRef.current?.();
          } else {
            setStatus({ type: "error", message: fresh.error || "Sync failed" });
          }
          loadStatus();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [run, loadStatus]);

  const handleSync = async () => {
    setStarting(true);
    setStatus(null);
    try {
      const data = await apiFetch("/admin/marg-sync/trigger", {
        method: "POST",
        body: JSON.stringify({ window: windowKey }),
      });
      setRun(data.run || { id: data.run_id, status: "running", phase: "queued" });
    } catch (err) {
      // A 409 means a sync is already in flight — the body carries its run
      // id, so attach to it instead of reporting a failure the user can't
      // act on.
      let attached = false;
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.run_id) {
          const fresh = await apiFetch(`/admin/marg-sync/runs/${parsed.run_id}`);
          setRun(fresh);
          setStatus({ type: "warn", message: "A sync was already running — showing its progress." });
          attached = true;
        }
      } catch {
        /* not a JSON conflict body */
      }
      if (!attached) setStatus({ type: "error", message: err.message || "Sync failed" });
    } finally {
      setStarting(false);
    }
  };

  const running = run?.status === "running";
  const pct = phaseProgress(run);
  const elapsed = running && run?.started_at
    ? (Date.now() - new Date(run.started_at).getTime()) / 1000
    : run?.elapsed_seconds;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-3 flex-wrap">
        {user?.role === "admin" && (
          <>
            <select
              value={windowKey}
              onChange={(e) => setWindowKey(e.target.value)}
              disabled={running || starting}
              title={windows.find((w) => w.key === windowKey)?.description || ""}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {(windows.length ? windows : [{ key: "1m", label: "Last 1 month" }]).map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>

            <button
              onClick={handleSync}
              disabled={running || starting}
              className="relative flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-80 disabled:cursor-not-allowed overflow-hidden"
            >
              {(running || starting) && (
                <span className="absolute inset-0 bg-white/10">
                  <span className="absolute inset-y-0 left-0 w-1/3 bg-white/20 animate-[margsync-sweep_1.1s_ease-in-out_infinite]" />
                </span>
              )}
              <svg
                className={`w-4 h-4 relative ${running || starting ? "animate-spin" : ""}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span className="relative">
                {starting ? "Starting..." : running ? "Syncing..." : "Sync from Marg"}
              </span>
            </button>
          </>
        )}

        {!loadingStatus && (
          <span className="text-xs text-gray-400">{formatLastSynced(lastSyncedAt)}</span>
        )}

        {history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            {showHistory ? "Hide" : "Sync history"}
          </button>
        )}

        {status && !running && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              status.type === "success"
                ? "bg-green-50 text-green-700"
                : status.type === "warn"
                ? "bg-amber-50 text-amber-700"
                : "bg-red-50 text-red-600"
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
      </div>

      {/* Live progress — visible to anyone with view access, including when
          the run was started by the scheduler or in another tab. */}
      {running && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-sm font-medium text-gray-800">
                {PHASE_LABELS[run.phase] || run.phase || "Working"}
              </span>
              <span className="text-xs text-gray-400">
                run #{run.id} · {run.window_label}
                {run.trigger_source === "scheduled" ? " · scheduled" : ""}
              </span>
            </div>
            <span className="text-xs font-mono text-gray-500 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>

          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
            />
          </div>

          <div className="flex items-center gap-x-5 gap-y-1 mt-2.5 text-xs text-gray-500 flex-wrap tabular-nums">
            {run.rows_received > 0 && <span>{run.rows_received.toLocaleString("en-IN")} rows received</span>}
            {run.products_total > 0 && (
              <span>
                Products {run.products_done.toLocaleString("en-IN")}/{run.products_total.toLocaleString("en-IN")}
              </span>
            )}
            {run.products_new > 0 && (
              <span className="text-green-600 font-medium">{run.products_new} new</span>
            )}
            {run.batches_done > 0 && <span>Batches {run.batches_done.toLocaleString("en-IN")}</span>}
            {run.parties_total > 0 && (
              <span>
                Parties {run.parties_done.toLocaleString("en-IN")}/{run.parties_total.toLocaleString("en-IN")}
              </span>
            )}
          </div>

          {elapsed > 300 && (
            <p className="text-xs text-amber-600 mt-2">
              This sync has been running for {formatElapsed(elapsed)}. Wide windows move a lot of
              data — it will keep running in the background even if you leave this page.
            </p>
          )}
        </div>
      )}

      {showHistory && history.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Run</th>
                <th className="text-left px-3 py-2 font-medium">Window</th>
                <th className="text-left px-3 py-2 font-medium">Started</th>
                <th className="text-right px-3 py-2 font-medium">Took</th>
                <th className="text-right px-3 py-2 font-medium">Products</th>
                <th className="text-right px-3 py-2 font-medium">New</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr key={h.id} className="text-gray-600">
                  <td className="px-3 py-2">#{h.id}</td>
                  <td className="px-3 py-2">
                    {h.window_label}
                    {h.trigger_source === "scheduled" && (
                      <span className="ml-1 text-gray-400">(auto)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(h.started_at).toLocaleString("en-IN", {
                      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatElapsed(h.elapsed_seconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.products_done.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {h.products_new > 0 ? (
                      <span className="text-green-600 font-medium">+{h.products_new}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        h.status === "completed"
                          ? "bg-green-50 text-green-700"
                          : h.status === "running"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-red-50 text-red-600"
                      }`}
                      title={h.error || h.warning || ""}
                    >
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
