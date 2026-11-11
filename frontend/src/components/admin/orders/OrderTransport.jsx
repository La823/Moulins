"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// The order's delivery mode and transporter, as two fields of the order's
// details; staff who can edit orders change them in place (PUT
// /admin/orders/{id}/transport), and the change goes on the order's history.
export default function OrderTransport({ order, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [modes, setModes] = useState([]);
  const [mode, setMode] = useState(order.transport_mode || "");
  const [transports, setTransports] = useState([]);
  const [transportId, setTransportId] = useState(order.transport_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    apiFetch("/transport-modes")
      .then((data) => setModes(data || []))
      .catch(() => {});
  }, [editing]);

  useEffect(() => {
    if (!editing || !mode) return;
    let off = false;
    apiFetch(`/transports?mode=${encodeURIComponent(mode)}`)
      .then((data) => !off && setTransports(data || []))
      .catch(() => !off && setTransports([]));
    return () => {
      off = true;
    };
  }, [editing, mode]);

  const start = () => {
    setMode(order.transport_mode || "");
    setTransportId(order.transport_id || "");
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/orders/${order.id}/transport`, {
        method: "PUT",
        body: JSON.stringify({ transport_mode: mode, transport_id: transportId || null }),
      });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e.message || "Could not change the delivery mode");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="col-span-full sm:col-span-2 border border-gray-200 rounded-lg p-3 space-y-2">
        <span className="text-gray-400">Delivery mode</span>
        <div className="flex flex-wrap gap-2">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setTransportId("");
            }}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm"
          >
            {!mode && <option value="">Choose…</option>}
            {modes.map((m) => (
              <option key={m.id} value={m.name}>
                {titleCase(m.name)}
              </option>
            ))}
          </select>
          <select
            value={transportId}
            onChange={(e) => setTransportId(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm min-w-[12rem]"
          >
            <option value="">No particular transporter</option>
            {transports.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !mode}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <span className="text-gray-400">Transport Mode</span>
        <p className="text-gray-900 font-medium">
          {order.transport_mode ? `By ${titleCase(order.transport_mode)}` : "—"}
          {canEdit && (
            <button type="button" onClick={start} className="ml-2 text-xs font-normal text-blue-600 hover:underline">
              Change
            </button>
          )}
        </p>
      </div>
      {order.transport_name && (
        <div>
          <span className="text-gray-400">Transport</span>
          <p className="text-gray-900 font-medium">
            {order.transport_name}
            {order.transport_gst_number && (
              <span className="text-xs text-gray-400 font-normal"> · GST {order.transport_gst_number}</span>
            )}
          </p>
        </div>
      )}
    </>
  );
}
