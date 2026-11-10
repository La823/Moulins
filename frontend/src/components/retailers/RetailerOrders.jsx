"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// Retailer orders, shared by the partner panel (orders from their retailers,
// with accept / decline / dispatch / deliver / order from Moulins) and the
// retailer panel (their own orders to the partner, cancellable until
// accepted). Backend: routehandlers/retailers.

export const STATUS_LABELS = {
  pending: "Awaiting acceptance",
  accepted: "Accepted",
  rejected: "Declined",
  cancelled: "Cancelled",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-teal-50 text-teal-700",
  dispatched: "bg-blue-50 text-blue-700",
  delivered: "bg-green-50 text-green-700",
  rejected: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
};

export function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// "5 Strips", "1 Bottle"
const qtyLabel = (it) => `${it.quantity} ${it.unit || "Unit"}${it.quantity === 1 ? "" : "s"}`;
const perUnit = (it) => `per ${(it.unit || "unit").toLowerCase()}`;

const rs = (n) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The list. `incoming` = the partner's view; `base` = where an order's page lives. */
export function RetailerOrderList({ incoming, base }) {
  const [orders, setOrders] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    apiFetch(`${incoming ? "/retailer-orders/incoming" : "/retailer-orders"}${status ? `?status=${status}` : ""}`)
      .then((list) => !off && (setOrders(list || []), setError("")))
      .catch((e) => !off && (setOrders([]), setError(e.message)));
    return () => {
      off = true;
    };
  }, [incoming, status]);

  const filters = { "": "All", pending: "New", accepted: "Accepted", dispatched: "Dispatched", delivered: "Delivered" };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(filters).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            className={`text-sm px-3 py-1.5 rounded-full border ${status === k ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600 hover:border-gray-500"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {orders === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500">
          {incoming ? "No orders from your retailers yet." : "You have not placed any orders yet. Add products to your cart to order from your partner."}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {orders.map((o) => (
            <Link key={o.id} href={`${base}/${o.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
              <div className="w-20 font-semibold text-gray-900">RO-{o.order_no}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">
                  {incoming ? o.shop_name || o.retailer_name : `To ${o.partner_name}`}
                </div>
                <div className="text-xs text-gray-500">
                  {o.item_count} product{o.item_count === 1 ? "" : "s"} · {when(o.created_at)}
                </div>
              </div>
              {o.total != null && <div className="text-sm font-medium text-gray-900">{rs(o.total)}</div>}
              <StatusBadge status={o.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** One order. `incoming` = the partner (actions); otherwise the retailer. */
export function RetailerOrderView({ id, incoming, backHref }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [rates, setRates] = useState({});
  const [note, setNote] = useState("");

  const load = useCallback(
    () =>
      apiFetch(`/retailer-orders/${id}`)
        .then((o) => (setOrder(o), setError("")))
        .catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    let off = false;
    apiFetch(`/retailer-orders/${id}`)
      .then((o) => !off && setOrder(o))
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [id]);

  const act = async (path, body, done) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await apiFetch(`/retailer-orders/${id}/${path}`, {
        method: path === "forward" ? "POST" : "PUT",
        body: JSON.stringify(body || {}),
      });
      setMessage(res?.message || done);
      setAccepting(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!order) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-400">Loading…</p>;

  const startAccept = () => {
    setRates(Object.fromEntries(order.items.map((it) => [it.id, it.rate != null ? String(it.rate) : ""])));
    setAccepting(true);
  };
  const submitAccept = () => {
    const out = {};
    for (const it of order.items) {
      const v = parseFloat(rates[it.id]);
      if (Number.isNaN(v) || v < 0) {
        setError("Please enter a rate for every product in the order.");
        return;
      }
      out[it.id] = v;
    }
    act("accept", { rates: out, note: note.trim() }, "The order has been accepted.");
  };
  const reject = () => {
    const reason = window.prompt("Reason for declining (shown to the retailer):", "");
    if (reason === null) return;
    act("reject", { note: reason.trim() }, "The order has been declined.");
  };
  const forward = () => {
    if (!window.confirm(`The products in RO-${order.order_no} will be placed as your own order to Moulins, in whole boxes (strips rounded up to full boxes).`)) return;
    act("forward", {}, "The order has been sent to Moulins as your order.");
  };
  const cancel = () => {
    if (!window.confirm(`Cancel order RO-${order.order_no}?`)) return;
    act("cancel", {}, "The order has been cancelled.");
  };

  const btn = "text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50";
  return (
    <div className="max-w-3xl">
      {backHref && (
        <Link href={backHref} className="text-xs text-gray-400 hover:text-gray-600">
          &larr; All orders
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-3 mb-1">
        <h1 className="text-2xl font-light text-gray-900">RO-{order.order_no}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-sm text-gray-600">
        {incoming
          ? `${order.shop_name ? `${order.shop_name} · ` : ""}${order.retailer_name} · ${order.retailer_phone}`
          : `To ${order.partner_name}`}
      </p>
      <p className="text-xs text-gray-400 mb-5">Placed {when(order.created_at)}</p>

      {message && <p className="text-sm text-teal-700 mb-4">{message}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {(order.notes || order.partner_note) && (
        <div className="mb-5 space-y-1 text-sm text-gray-700">
          {order.notes && <p>Retailer&apos;s note: {order.notes}</p>}
          {order.partner_note && <p>Partner&apos;s note: {order.partner_note}</p>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Product</th>
              <th className="text-right px-4 py-2 font-medium">Quantity</th>
              <th className="text-right px-4 py-2 font-medium">MRP (per unit)</th>
              <th className="text-right px-4 py-2 font-medium">Rate (per unit)</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2 text-gray-900">{it.product_name}</td>
                <td className="px-4 py-2 text-right">{qtyLabel(it)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{it.mrp != null ? rs(it.mrp) : ""}</td>
                <td className="px-4 py-2 text-right">
                  {accepting ? (
                    <input
                      value={rates[it.id] ?? ""}
                      onChange={(e) => setRates((r) => ({ ...r, [it.id]: e.target.value }))}
                      inputMode="decimal"
                      placeholder={perUnit(it)}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-right"
                    />
                  ) : it.rate != null ? (
                    rs(it.rate)
                  ) : (
                    ""
                  )}
                </td>
                <td className="px-4 py-2 text-right font-medium">{it.rate != null && !accepting ? rs(it.rate * it.quantity) : ""}</td>
              </tr>
            ))}
          </tbody>
          {order.total != null && !accepting && (
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={4} className="px-4 py-2 text-right font-semibold">
                  Total
                </td>
                <td className="px-4 py-2 text-right font-semibold">{rs(order.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {accepting && (
        <div className="mb-5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the retailer (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={submitAccept} className={`${btn} bg-gray-900 text-white hover:bg-gray-700`}>
              Accept order
            </button>
            <button type="button" onClick={() => setAccepting(false)} className={`${btn} border border-gray-300 text-gray-700`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {!incoming && order.status === "pending" && (
          <button type="button" disabled={busy} onClick={cancel} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
            Cancel order
          </button>
        )}
        {incoming && !accepting && (
          <>
            {order.status === "pending" && (
              <>
                <button type="button" disabled={busy} onClick={startAccept} className={`${btn} bg-gray-900 text-white hover:bg-gray-700`}>
                  Accept with rates
                </button>
                <button type="button" disabled={busy} onClick={reject} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
                  Decline
                </button>
              </>
            )}
            {order.status === "accepted" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act("dispatch", {}, "The order has been marked as dispatched.")}
                className={`${btn} bg-gray-900 text-white hover:bg-gray-700`}
              >
                Mark as dispatched
              </button>
            )}
            {(order.status === "accepted" || order.status === "dispatched") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act("deliver", {}, "The order has been marked as delivered.")}
                className={`${btn} border border-gray-300 text-gray-700 hover:border-gray-500`}
              >
                Mark as delivered
              </button>
            )}
            {!order.forwarded_order_id && order.status !== "rejected" && order.status !== "cancelled" && (
              <button type="button" disabled={busy} onClick={forward} className={`${btn} border border-gray-300 text-gray-700 hover:border-gray-500`}>
                Order these from Moulins
              </button>
            )}
          </>
        )}
      </div>

      {order.forwarded_order_id && (
        <p className="text-sm text-gray-600 mb-6">
          {incoming ? (
            <Link href={`/orders/${order.forwarded_order_id}`} className="text-teal-700 hover:underline">
              Ordered from Moulins: view your order &rarr;
            </Link>
          ) : (
            "Your partner has ordered these products from Moulins."
          )}
        </p>
      )}

      {order.events?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">History</h2>
          <ul className="text-xs text-gray-600 space-y-1">
            {order.events.map((e, i) => (
              <li key={i}>
                {when(e.created_at)} · {e.description}
                {e.actor_name ? ` (${e.actor_name})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
