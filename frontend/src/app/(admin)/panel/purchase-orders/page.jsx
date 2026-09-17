"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Reply previews from Graph include the quoted original message inline
// ("On <date>, <name> <email> wrote: ..."). Split that off so the actual
// reply text can be shown on its own, with the quote tucked away.
function splitReplyQuote(bodyPreview) {
  if (!bodyPreview) return { text: "", quoted: "" };
  const match = bodyPreview.match(/\n*On .{0,120}wrote:\s*/i);
  if (!match) return { text: bodyPreview.trim(), quoted: "" };
  return {
    text: bodyPreview.slice(0, match.index).trim(),
    quoted: bodyPreview.slice(match.index + match[0].length).trim(),
  };
}

function initials(address) {
  if (!address) return "?";
  const name = address.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

function ReplyItem({ poId, reply }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // {type: "ok"|"error", text}
  const { text, quoted } = splitReplyQuote(reply.body_preview);

  async function sendReply() {
    if (!draft.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      await apiFetch(`/admin/purchase-order-master/${poId}/emails/reply`, {
        method: "POST",
        body: JSON.stringify({ message_id: reply.id, body: draft.trim(), to: reply.from }),
      });
      setStatus({ type: "ok", text: "Reply sent." });
      setDraft("");
      setReplying(false);
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setSending(false);
    }
  }

  const isOurs = !!reply.is_from_sender;

  return (
    <div className="flex gap-2.5">
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center ${
          isOurs ? "bg-gray-900 text-white" : "bg-blue-100 text-blue-700"
        }`}
      >
        {isOurs ? "You" : initials(reply.from)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900 text-xs">{isOurs ? "You" : reply.from}</span>
          <span className="text-[11px] text-gray-400">{formatDateTime(reply.received_at)}</span>
        </div>
        <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">
          {text || <span className="text-gray-400 italic">(no preview text)</span>}
        </p>
        {!isOurs && quoted && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowQuoted((v) => !v)}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              {showQuoted ? "▾ Hide original message" : "▸ Show original message"}
            </button>
            {showQuoted && (
              <p className="text-[11px] text-gray-400 mt-1 pl-2 border-l-2 border-gray-200 whitespace-pre-wrap leading-relaxed">
                {quoted}
              </p>
            )}
          </div>
        )}

        {!isOurs && !replying && (
          <button
            onClick={() => setReplying(true)}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 mt-1.5"
          >
            ↩ Reply
          </button>
        )}
        {!isOurs && replying && (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              rows={3}
              placeholder={`Reply to ${reply.from}…`}
              className="w-full border border-gray-300 rounded-md text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
              autoFocus
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={sendReply}
                disabled={sending || !draft.trim()}
                className="px-2.5 py-1 bg-gray-900 text-white rounded-md text-[11px] font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              <button
                onClick={() => {
                  setReplying(false);
                  setDraft("");
                }}
                disabled={sending}
                className="px-2.5 py-1 border border-gray-300 rounded-md text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {status && (
          <p className={`text-[11px] mt-1.5 ${status.type === "ok" ? "text-green-700" : "text-red-600"}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

// Placeholder landing page for Purchase Orders — content TBD beyond the
// active-PO snapshot below. The full PO data lives in the master list
// (/panel/purchase-order-master) and new POs are created at
// /panel/purchase-orders/new; this page is separate from both.
export default function PurchaseOrdersPage() {
  const [activeRows, setActiveRows] = useState([]);
  const [activeTotal, setActiveTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sendingFor, setSendingFor] = useState(null);
  const [mailStatus, setMailStatus] = useState({}); // { [rowId]: {type: "ok"|"error", text} }
  const [expandedId, setExpandedId] = useState(null);
  const [emailsById, setEmailsById] = useState({}); // { [rowId]: emails[] | "loading" | {error} }
  const [revisionHistoryById, setRevisionHistoryById] = useState({}); // { [rowId]: revisions[] }
  const [manufacturers, setManufacturers] = useState([]);
  // Revise: creates a new row under the same po_number instead of editing
  // this one in place — only available while status is Active (both here
  // and enforced server-side).
  const [revisingId, setRevisingId] = useState(null);
  const [revisionDraft, setRevisionDraft] = useState({});
  const [savingRevisionFor, setSavingRevisionFor] = useState(null);
  const [error, setError] = useState("");

  function loadActive() {
    setLoading(true);
    apiFetch("/admin/purchase-order-master/active?limit=10")
      .then((data) => {
        setActiveRows(data.rows || []);
        setActiveTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadActive();
  }, []);

  useEffect(() => {
    apiFetch("/admin/manufacturers")
      .then((data) => setManufacturers(data || []))
      .catch(() => {});
  }, []);

  function openRevise(row) {
    setRevisingId(row.id);
    setRevisionDraft({
      po_date: row.po_date ? row.po_date.slice(0, 10) : "",
      product_name: row.product_name || "",
      quantity: row.quantity ?? "",
      mrp: row.mrp || "",
      rate: row.rate ?? "",
      type: row.type || "",
      manufacturer_id: "",
      status: "Active",
    });
  }

  function cancelRevise() {
    setRevisingId(null);
    setRevisionDraft({});
  }

  async function saveRevision(rowId) {
    setSavingRevisionFor(rowId);
    setError("");
    try {
      await apiFetch(`/admin/purchase-order-master/${rowId}/revise`, {
        method: "POST",
        body: JSON.stringify({
          po_date: revisionDraft.po_date || undefined,
          product_name: revisionDraft.product_name?.trim() || undefined,
          quantity: revisionDraft.quantity !== "" ? Number(revisionDraft.quantity) : undefined,
          mrp: revisionDraft.mrp !== "" ? Number(revisionDraft.mrp) : undefined,
          rate: revisionDraft.rate !== "" ? Number(revisionDraft.rate) : undefined,
          type: revisionDraft.type?.trim() || undefined,
          manufacturer_id: revisionDraft.manufacturer_id || undefined,
          status: revisionDraft.status || undefined,
        }),
      });
      cancelRevise();
      setRevisionHistoryById((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      loadActive();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRevisionFor(null);
    }
  }

  function loadEmails(rowId) {
    setEmailsById((prev) => ({ ...prev, [rowId]: "loading" }));
    apiFetch(`/admin/purchase-order-master/${rowId}/emails`)
      .then((data) => setEmailsById((prev) => ({ ...prev, [rowId]: data || [] })))
      .catch((err) => setEmailsById((prev) => ({ ...prev, [rowId]: { error: err.message } })));
  }

  function loadRevisionHistory(rowId) {
    apiFetch(`/admin/purchase-order-master/${rowId}/revisions`)
      .then((data) => setRevisionHistoryById((prev) => ({ ...prev, [rowId]: data || [] })))
      .catch(() => setRevisionHistoryById((prev) => ({ ...prev, [rowId]: [] })));
  }

  function toggleMail(rowId) {
    if (expandedId === rowId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rowId);
    loadEmails(rowId);
    if (!revisionHistoryById[rowId]) loadRevisionHistory(rowId);
  }

  async function handleSendMail(rowId) {
    setSendingFor(rowId);
    setMailStatus((prev) => ({ ...prev, [rowId]: null }));
    try {
      const res = await apiFetch(`/admin/purchase-order-master/${rowId}/send-mail`, {
        method: "POST",
      });
      const sentTo = (res.sent_to || []).join(", ");
      setMailStatus((prev) => ({ ...prev, [rowId]: { type: "ok", text: `Sent to ${sentTo}` } }));
      setActiveRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, last_mail_sent_at: new Date().toISOString() } : r))
      );
      if (expandedId === rowId) loadEmails(rowId);
    } catch (err) {
      setMailStatus((prev) => ({ ...prev, [rowId]: { type: "error", text: err.message } }));
    } finally {
      setSendingFor(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Purchase Orders</h2>
          <p className="text-sm text-gray-500">More coming here soon.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/panel/purchase-order-master"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View PO Master List
          </Link>
          <Link
            href="/panel/purchase-orders/new"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Create PO
          </Link>
          <Link
            href="/panel/purchase-orders/new?blank=1"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="For a product that's never had a PO before — every field starts blank"
          >
            New Product PO
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Active Purchase Orders</h3>
          <p className="text-xs text-gray-500">
            {activeTotal.toLocaleString()} {activeTotal === 1 ? "PO is" : "POs are"} currently marked Active — every new PO starts out this way.
            Send Mail emails the manufacturer's address(es) on file with this PO's details; click a P-O number to see what was sent and any replies.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 px-4 pt-3">{error}</p>}
        {loading && <p className="text-sm text-gray-500 px-4 py-6">Loading…</p>}

        {!loading && activeRows.length === 0 && (
          <p className="text-sm text-gray-500 px-4 py-6">No active purchase orders right now.</p>
        )}

        {!loading && activeRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">P-O Number</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">P-O Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Product Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Company</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Revised</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Last Mail Sent</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Mail</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Revise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeRows.map((r) => {
                  const isExpanded = expandedId === r.id;
                  const emails = emailsById[r.id];
                  const revisions = revisionHistoryById[r.id];
                  const hasBeenRevised = (r.revision_number || 1) > 1;
                  return (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                          <button
                            onClick={() => toggleMail(r.id)}
                            className="font-medium text-gray-900 hover:underline"
                          >
                            {isExpanded ? "▾" : "▸"} {r.po_number}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{formatDate(r.po_date)}</td>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{r.product_name}</td>
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{r.company}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {hasBeenRevised ? (
                            <span
                              className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                              title="This PO has been revised — expand the row to see the original and every change made"
                            >
                              Yes (Rev {r.revision_number})
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {formatDateTime(r.last_mail_sent_at) || "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSendMail(r.id)}
                              disabled={sendingFor === r.id}
                              className="px-2.5 py-1 bg-gray-900 text-white rounded-md text-[11px] font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                              {sendingFor === r.id ? "Sending…" : "Send Mail"}
                            </button>
                            {mailStatus[r.id] && (
                              <span
                                className={`text-[11px] ${
                                  mailStatus[r.id].type === "ok" ? "text-green-700" : "text-red-600"
                                }`}
                              >
                                {mailStatus[r.id].text}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            onClick={() => (revisingId === r.id ? cancelRevise() : openRevise(r))}
                            className="px-2.5 py-1 border border-gray-300 rounded-md text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                            title="Create a new revision of this PO under the same P-O number, instead of editing it in place"
                          >
                            {revisingId === r.id ? "Cancel" : "Revise PO"}
                          </button>
                        </td>
                      </tr>
                      {revisingId === r.id && (
                        <tr className="bg-amber-50">
                          <td colSpan={9} className="px-6 py-3">
                            <p className="text-xs font-semibold text-amber-800 mb-2">
                              Revise {r.po_number} — creates a new row (Revision {(r.revision_number || 1) + 1}) under the same P-O number; this row will be marked "Revised" and kept as history. Leave a field as-is to carry it over unchanged.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 max-w-3xl">
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-0.5">P-O Date</label>
                                <input
                                  type="date"
                                  value={revisionDraft.po_date || ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, po_date: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[10px] text-gray-500 mb-0.5">Product Name</label>
                                <input
                                  type="text"
                                  value={revisionDraft.product_name || ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, product_name: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-0.5">Quantity</label>
                                <input
                                  type="number"
                                  value={revisionDraft.quantity ?? ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, quantity: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-0.5">MRP</label>
                                <input
                                  type="text"
                                  value={revisionDraft.mrp ?? ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, mrp: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-0.5">Rate</label>
                                <input
                                  type="number"
                                  value={revisionDraft.rate ?? ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, rate: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-0.5">Type</label>
                                <input
                                  type="text"
                                  value={revisionDraft.type || ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, type: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[10px] text-gray-500 mb-0.5">
                                  Manufacturer (current: {r.company || "—"})
                                </label>
                                <select
                                  value={revisionDraft.manufacturer_id || ""}
                                  onChange={(e) => setRevisionDraft((d) => ({ ...d, manufacturer_id: e.target.value }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                                >
                                  <option value="">Keep unchanged</option>
                                  {manufacturers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveRevision(r.id)}
                                disabled={savingRevisionFor === r.id}
                                className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                              >
                                {savingRevisionFor === r.id ? "Creating…" : "Create Revision"}
                              </button>
                              <button
                                onClick={cancelRevise}
                                disabled={savingRevisionFor === r.id}
                                className="px-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="mb-4">
                              <p className="text-xs font-semibold text-gray-600 mb-1.5">PO Details</p>
                              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 max-w-3xl text-xs">
                                {[
                                  ["P-O Number", r.po_number],
                                  ["P-O Date", formatDate(r.po_date)],
                                  ["Product Name", r.product_name],
                                  ["Product Code", r.product_code || "—"],
                                  ["Composition", r.composition || "—"],
                                  ["Quantity", r.quantity ?? "—"],
                                  ["MRP", r.mrp || "—"],
                                  ["Rate", r.rate ?? "—"],
                                  ["Estimate", r.estimate ?? "—"],
                                  ["Type", r.type || "—"],
                                  ["Company", r.company],
                                  ["Category", r.category || "—"],
                                  ["Specifications", r.specifications || "—"],
                                  ["Remarks", r.remarks || "—"],
                                  ["Status", r.status],
                                ].map(([label, value]) => (
                                  <div key={label}>
                                    <dt className="text-gray-400">{label}</dt>
                                    <dd className="text-gray-800 font-medium">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>

                            {(revisions?.length ?? 0) > 1 && (
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-gray-600 mb-1">
                                  Revision History — original P-O {r.po_number} has been revised {revisions.length - 1}{" "}
                                  time{revisions.length - 1 === 1 ? "" : "s"}
                                </p>
                                <table className="text-xs border border-gray-200 rounded-md overflow-hidden w-full max-w-3xl bg-white">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-2 py-1 text-left">Rev</th>
                                      <th className="px-2 py-1 text-left">Date</th>
                                      <th className="px-2 py-1 text-left">Product</th>
                                      <th className="px-2 py-1 text-left">Qty</th>
                                      <th className="px-2 py-1 text-left">Rate</th>
                                      <th className="px-2 py-1 text-left">Company</th>
                                      <th className="px-2 py-1 text-left">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {revisions.map((rev) => (
                                      <tr key={rev.id} className={rev.id === r.id ? "bg-blue-50" : ""}>
                                        <td className="px-2 py-1">
                                          {rev.revision_number}
                                          {rev.revision_number === 1 && (
                                            <span className="ml-1 text-[10px] text-gray-500">(original)</span>
                                          )}
                                          {rev.id === r.id && <span className="ml-1 text-[10px] text-blue-600">(current)</span>}
                                        </td>
                                        <td className="px-2 py-1">{formatDate(rev.po_date)}</td>
                                        <td className="px-2 py-1">{rev.product_name}</td>
                                        <td className="px-2 py-1">{rev.quantity ?? ""}</td>
                                        <td className="px-2 py-1">{rev.rate ?? ""}</td>
                                        <td className="px-2 py-1">{rev.company}</td>
                                        <td className="px-2 py-1">{rev.status}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            <p className="text-xs font-semibold text-gray-600 mb-1.5">Mail History</p>
                            {emails === "loading" && <p className="text-xs text-gray-400">Loading mail history…</p>}
                            {emails && emails.error && (
                              <p className="text-xs text-red-600">Could not load mail history: {emails.error}</p>
                            )}
                            {Array.isArray(emails) && emails.length === 0 && (
                              <p className="text-xs text-gray-400">No emails sent yet for this PO.</p>
                            )}
                            {Array.isArray(emails) && emails.length > 0 && (
                              <div className="space-y-3 max-w-2xl">
                                {emails.map((e) => (
                                  <div key={e.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                                    <div className="flex gap-2.5 p-3 bg-gray-50/60 border-b border-gray-100">
                                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex items-center justify-center">
                                        You
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                          <span className="font-medium text-gray-900 text-xs">
                                            To {(e.to_addresses || []).join(", ")}
                                          </span>
                                          <span className="text-[11px] text-gray-400">{formatDateTime(e.sent_at)}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{e.subject}</p>
                                      </div>
                                    </div>

                                    <div className="p-3">
                                      {e.reply_error && (
                                        <p className="text-[11px] text-amber-600">
                                          Could not check for replies: {e.reply_error}
                                        </p>
                                      )}
                                      {!e.reply_error && (!e.replies || e.replies.length === 0) && (
                                        <p className="text-[11px] text-gray-400">No replies yet.</p>
                                      )}
                                      {e.replies && e.replies.length > 0 && (
                                        <div className="space-y-3">
                                          {e.replies.map((reply) => (
                                            <ReplyItem key={reply.id} poId={r.id} reply={reply} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTotal > activeRows.length && (
          <div className="px-4 py-3 border-t border-gray-200 text-right">
            <Link
              href="/panel/purchase-order-master"
              className="text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              View all in PO Master List →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
