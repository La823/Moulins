"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { packerDay } from "@/components/admin/orders/PackerPicker";

// An order's packing (backend internal/packing): the dispatch team packs
// orders sent to packing in the app, photographing each product's batch;
// the photo is read by AI and compared with the batch on the order. Every
// photo is kept: each line shows its latest, and the log has every one
// (retakes too). Shows what was read, the result and who ticked it, and who
// the order is assigned to (rotation, internal/dispatch) — staff who can
// edit orders can hand it to another packer. Admins can let a mismatched
// batch through and reopen a packed order.

const RESULT = {
  match: ["Matched", "bg-green-50 text-green-700"],
  unchecked: ["Recorded", "bg-gray-100 text-gray-600"],
  mismatch: ["Doesn't match", "bg-red-50 text-red-700"],
  unreadable: ["Couldn't read", "bg-amber-50 text-amber-700"],
};
const ACTION = {
  started: "Started",
  photo: "Photo",
  typed: "Typed batch",
  packed: "Ticked",
  unpacked: "Unticked",
  override: "Allowed by admin",
  finished: "Marked Packed",
  reopened: "Reopened",
};
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round((n || 0) / 1024)} KB`);
const when = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function OrderPacking({ orderId, status, isAdmin, canEdit, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [reload, setReload] = useState(0);
  const [packers, setPackers] = useState(null); // loaded when the reassign picker opens

  useEffect(() => {
    let off = false;
    apiFetch(`/admin/orders/${orderId}/packing`)
      .then((d) => {
        if (off) return;
        setData(d);
        setError("");
      })
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [orderId, status, reload]);

  if (error) return null; // no orders permission for packing, or not reachable: leave the page as it was
  if (!data) return null;
  const started = data.log.length > 0;
  if (!started && data.status !== "packing" && data.status !== "packed") return null;

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      setReload((n) => n + 1);
      onChanged?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  const override = (it) => {
    const reason = prompt(`Allow batch ${it.read_batch || "(none)"} for ${it.product_name}? Give the reason:`);
    if (!reason?.trim()) return;
    act(() =>
      apiFetch(`/admin/packing/orders/${orderId}/items/${it.order_item_id}/override`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      }),
    );
  };
  const loadPackers = () => {
    if (packers) return;
    apiFetch("/admin/dispatch/packers")
      .then((d) => setPackers(d.packers || []))
      .catch(() => setPackers([]));
  };
  const assign = (userId) =>
    act(() => apiFetch(`/admin/orders/${orderId}/packing-assignee`, { method: "PUT", body: JSON.stringify({ user_id: userId }) }));

  const reopen = () => {
    const reason = prompt("Reopen this order for packing? It goes back to Sent to packing, on the dispatch team's list. Reason (optional):");
    if (reason === null) return;
    act(() => apiFetch(`/admin/packing/orders/${orderId}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Packing</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.status === "packed" && data.packed_at
              ? `Packed by ${data.packed_by || "someone"} on ${when(data.packed_at)}`
              : started
                ? `${data.ticked} of ${data.items.length} products ticked`
                : "Sent to packing. The dispatch team packs it in the app."}
          </p>
          {data.status !== "packed" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">Assigned to</span>
              {canEdit ? (
                <select
                  value={data.assigned_to_id || ""}
                  onFocus={loadPackers}
                  onMouseDown={loadPackers}
                  disabled={busy}
                  onChange={(e) => assign(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900 bg-white"
                >
                  <option value="">Nobody (whole team)</option>
                  {data.assigned_to_id && !packers?.some((p) => p.id === data.assigned_to_id) && (
                    <option value={data.assigned_to_id}>{data.assigned_to}</option>
                  )}
                  {(packers || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {" · "}{packerDay(p).text}{p.skip ? " · out of rotation" : ""} · {p.open} open
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-medium text-gray-800">{data.assigned_to || "Nobody (whole team)"}</span>
              )}
            </div>
          )}
        </div>
        {isAdmin && data.status === "packed" && (
          <button
            type="button"
            disabled={busy}
            onClick={reopen}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Reopen for packing
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {data.items.map((it) => {
          const [label, cls] = RESULT[it.result] || ["Not checked", "bg-gray-50 text-gray-400"];
          return (
            <div key={it.order_item_id} className="py-2.5 flex gap-3 items-start">
              {it.photo_url ? (
                <button type="button" onClick={() => setPhoto(it.photo_url)} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.photo_url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                </button>
              ) : (
                <div className="w-14 h-14 shrink-0 rounded-lg border border-dashed border-gray-200" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{it.product_name}</span>
                  <span className="text-xs text-gray-400">× {it.quantity}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                  {it.override_at && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Allowed</span>}
                  {it.packed ? (
                    <span className="text-[11px] text-green-700">✓ ticked by {it.packed_by} · {when(it.packed_at)}</span>
                  ) : it.qty_changed ? (
                    <span className="text-[11px] text-amber-700">Quantity changed since it was ticked</span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Expected: {it.expected_batch ? `batch ${it.expected_batch}${it.expected_expiry ? `, exp ${it.expected_expiry}` : ""}` : "any of the product's Marg batches"}
                  {it.result && (
                    <>
                      {" · "}
                      {it.read_source === "typed" ? "Typed" : "Read"}: {it.read_batch || "nothing"}
                      {it.read_expiry ? `, exp ${it.read_expiry}` : ""}
                      {it.checked_by ? ` (by ${it.checked_by})` : ""}
                    </>
                  )}
                </div>
                {it.result_note && <div className="text-xs text-gray-400 mt-0.5">{it.result_note}</div>}
                {it.photo_usage && (
                  <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                    Photo {fmtBytes(it.photo_usage.image_bytes)}
                    {it.photo_usage.image_width ? ` · ${it.photo_usage.image_width}×${it.photo_usage.image_height}` : ""} · AI read{" "}
                    {it.photo_usage.total_tokens.toLocaleString("en-IN")} tokens ({it.photo_usage.image_tokens.toLocaleString("en-IN")} image)
                    {" · "}${it.photo_usage.cost_usd.toFixed(4)} · {(it.photo_usage.duration_ms / 1000).toFixed(1)}s
                  </div>
                )}
                {it.override_reason && (
                  <div className="text-xs text-amber-700 mt-0.5">
                    Allowed by {it.override_by}: {it.override_reason}
                  </div>
                )}
              </div>
              {isAdmin && data.status === "packing" && (it.result === "mismatch" || it.result === "unreadable") && !it.override_at && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => override(it)}
                  className="shrink-0 px-2.5 py-1 text-xs border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                >
                  Allow anyway
                </button>
              )}
            </div>
          );
        })}
      </div>

      {started && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setShowLog((v) => !v)} className="text-xs text-teal-700 hover:underline">
            {showLog ? "Hide packing log" : `Packing log (${data.log.length})`}
          </button>
          {showLog && (
            <ul className="mt-2 space-y-1.5">
              {data.log.map((l, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-2">
                  <span className="text-gray-400 whitespace-nowrap tabular-nums">{when(l.at)}</span>
                  <span>
                    <b className="font-medium text-gray-800">{l.user || "Someone"}</b> · {ACTION[l.action] || l.action}
                    {l.product ? ` · ${l.product}` : ""}
                    {l.detail && l.action !== "started" ? <span className="text-gray-400"> · {l.detail}</span> : null}
                    {l.photo_url && (
                      <button type="button" onClick={() => setPhoto(l.photo_url)} className="ml-1 text-teal-700 hover:underline">
                        photo
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {photo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Batch photo" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
