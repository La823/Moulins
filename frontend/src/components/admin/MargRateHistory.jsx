"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { BillDetail } from "@/components/admin/MargBills";

// What a partner has been charged before for a product — Marg sale bills to
// the partner's Marg party and earlier app orders with a rate — shown beside
// an order line's rate. useRateHistory fetches every line at once; RateHint
// is the small "Last ₹210 · 12 Oct" line that opens the history window.

const money = (v) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
function day(v, withYear = true) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleDateString("en-IN", withYear ? { day: "2-digit", month: "short", year: "numeric" } : { day: "2-digit", month: "short" });
}

const SOURCE = {
  bill: { label: "Bill", className: "bg-green-50 text-green-700" },
  challan: { label: "Challan", className: "bg-teal-50 text-teal-700" },
  order: { label: "Order", className: "bg-gray-100 text-gray-600" },
};

// Fetches the history of all productIds for partnerId in one request.
// excludeOrder keeps the order being edited out of its own history.
export function useRateHistory(partnerId, productIds, excludeOrder) {
  const [data, setData] = useState(null);
  const key = [...new Set(productIds || [])].sort().join(",");
  useEffect(() => {
    if (!partnerId || !key) return;
    let cancelled = false;
    const p = new URLSearchParams({ products: key });
    if (excludeOrder) p.set("exclude_order", excludeOrder);
    apiFetch(`/admin/partners/${partnerId}/rate-history?${p}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ unavailable: true, products: {} }); });
    return () => { cancelled = true; };
  }, [partnerId, key, excludeOrder]);
  return data;
}

// The hint under a line's rate; click it for the full history window.
// The window is position: fixed at the hint's screen position, so a table
// inside a scrolling box (the order page's) can't clip it; it closes on
// scroll or resize rather than drifting away from its line.
const PANEL_WIDTH = 416;

export function RateHint({ history, data }) {
  const [pos, setPos] = useState(null); // {top, left} while open
  const ref = useRef(null);
  const btnRef = useRef(null);
  const open = pos != null;

  const toggle = () => {
    if (open) return setPos(null);
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left, width });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!data || data.unavailable) return null;
  const last = history?.last;
  const label = last ? `Last ${money(last.rate)} · ${day(last.date, false)}` : "No past rate";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Rates this partner was charged before for this product"
        className={`text-[11px] whitespace-nowrap underline decoration-dotted underline-offset-2 ${
          last ? "text-gray-500 hover:text-gray-900" : "text-gray-300 hover:text-gray-500"
        }`}
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-gray-800">Past rates to this partner</div>
            <button type="button" onClick={() => setPos(null)} className="text-gray-400 hover:text-gray-700" aria-label="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!data.party_code && (
            <p className="text-[11px] text-amber-700 mb-2">
              This partner isn&apos;t linked to a Marg party, so only earlier app orders can show here.
            </p>
          )}

          {!history || history.points.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Never sold to this partner before.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 mb-2 text-[11px]">
                <Stat label="Last" value={money(last?.rate)} />
                <Stat label="Lowest" value={money(history.min_rate)} />
                <Stat label="Highest" value={money(history.max_rate)} />
                <Stat label="Average" value={money(history.avg_rate)} sub={`${history.times} time${history.times !== 1 ? "s" : ""}`} />
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Date</th>
                      <th className="px-2 py-1.5 text-left font-medium">From</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                      <th className="px-2 py-1.5 text-right font-medium">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.points.map((p, i) => {
                      const s = SOURCE[p.source] || SOURCE.order;
                      return (
                        <tr key={`${p.ref}-${i}`}>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{day(p.date)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded-full ${s.className}`}>{s.label}</span>{" "}
                            <span className="text-gray-700">{p.ref}</span>
                            {p.batch && <span className="text-gray-400"> · {p.batch}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">
                            {qty(p.qty)}{p.free > 0 && <span className="text-green-700"> +{qty(p.free)}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium text-gray-900 whitespace-nowrap">{money(p.rate)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500 whitespace-nowrap">{p.mrp ? money(p.mrp) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">Rates before GST. Bills come from Marg (this financial year); orders are earlier app orders with a rate.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <div className="text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-gray-400">{sub}</div>}
    </div>
  );
}

// The order page's side panel: everything this party bought of the selected
// product, grouped by batch — each batch with its MRP, purchase rate and
// expiry, then every sale from it with the rate charged and the margin over
// purchase. Earlier app orders (no batch) come last.
export function ProductHistoryPanel({ productName, history, data, position, count }) {
  const [openBill, setOpenBill] = useState(null); // the bill point shown in full
  const [view, setView] = useState("list"); // list: every sale, newest first | batch: grouped by batch
  const header = (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History with this party</div>
        {count > 1 && (
          <div className="text-[10px] text-gray-400 whitespace-nowrap">
            {position + 1} of {count} · <kbd className="px-1 border border-gray-200 rounded">↑</kbd>{" "}
            <kbd className="px-1 border border-gray-200 rounded">↓</kbd>
          </div>
        )}
      </div>
      <div className="text-sm font-semibold text-gray-900 mt-1">{productName || "Select a product"}</div>
    </div>
  );

  if (!data) return <div>{header}<p className="text-xs text-gray-400">Loading history...</p></div>;
  if (data.unavailable) return <div>{header}<p className="text-xs text-gray-400">History isn&apos;t available.</p></div>;

  const points = history?.points || [];
  const bills = points.filter((p) => p.source !== "order");
  const orders = points.filter((p) => p.source === "order");

  // Group bills by batch, most recently sold batch first (points are newest first).
  const batches = [];
  const byBatch = new Map();
  for (const p of bills) {
    const k = p.batch || "—";
    if (!byBatch.has(k)) {
      const g = { batch: p.batch, expiry: p.expiry, mrp: p.batch_mrp ?? p.mrp, purchaseRate: p.purchase_rate, sales: [] };
      byBatch.set(k, g);
      batches.push(g);
    }
    byBatch.get(k).sales.push(p);
  }

  // How each sold batch came in: its purchase bills this financial year, or,
  // for a batch bought earlier, the supplier invoice Marg's stock records.
  const purchasesOf = new Map();
  for (const pu of history?.purchases || []) {
    const k = pu.batch || "—";
    if (!purchasesOf.has(k)) purchasesOf.set(k, []);
    purchasesOf.get(k).push({
      kind: "purchase", date: pu.date, ref: pu.bill_no, voucher: pu.voucher, source: "purchase",
      supplier: pu.supplier, batch: pu.batch, qty: pu.qty, free: pu.free, rate: pu.rate, mrp: pu.mrp,
    });
  }
  for (const g of batches) {
    const k = g.batch || "—";
    const first = g.sales[0];
    if (!purchasesOf.has(k) && first?.supplier_invoice) {
      purchasesOf.set(k, [{
        kind: "earlier", date: first.supplier_invoice_date, ref: first.supplier_invoice, batch: g.batch,
        rate: g.purchaseRate, mrp: g.mrp,
      }]);
    }
    g.purchases = purchasesOf.get(k) || [];
  }
  // The purchases box: every purchase of the sold batches, newest first.
  const purchases = [...purchasesOf.values()].flat().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return (
    <div>
      {header}
      {!data.party_code && (
        <p className="text-[10px] text-amber-700 mb-2">
          This partner isn&apos;t linked to a Marg party, so only earlier app orders can show here.
        </p>
      )}
      {points.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Never sold to this party before.</p>
      ) : (
        <>
          <section className="border border-blue-200 rounded-xl p-2.5 mb-3">
          <h4 className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide mb-2">Sales to this party</h4>
          <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
            <Stat label="Last" value={money(history.last?.rate)} sub={history.last ? day(history.last.date, false) : null} />
            <Stat label="Lowest" value={money(history.min_rate)} />
            <Stat label="Highest" value={money(history.max_rate)} />
            <Stat label="Average" value={money(history.avg_rate)} sub={`${history.times} time${history.times !== 1 ? "s" : ""}`} />
          </div>

          {bills.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-gray-700">
                {bills.length} sale{bills.length !== 1 ? "s" : ""} ·{" "}
                {qty(bills.reduce((t, p) => t + p.qty + p.free, 0))} units
              </div>
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-[10px]">
                {[["list", "All sales"], ["batch", "By batch"]].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setView(k)}
                    className={`px-2 py-0.5 ${view === k ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "list" && bills.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto mb-3">
              <table className="w-full text-[10px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-1.5 py-1 text-left font-medium">Date / bill</th>
                    <th className="px-1.5 py-1 text-left font-medium">Batch</th>
                    <th className="px-1.5 py-1 text-right font-medium">Qty</th>
                    <th className="px-1.5 py-1 text-right font-medium">Rate</th>
                    <th className="px-1.5 py-1 text-right font-medium">MRP</th>
                    <th className="px-1.5 py-1 text-right font-medium">Purchase</th>
                    <th className="px-1.5 py-1 text-right font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map((p, i) => {
                    const margin = p.purchase_rate && p.rate ? ((p.rate - p.purchase_rate) / p.purchase_rate) * 100 : null;
                    return (
                      <tr
                        key={`${p.ref}-${i}`}
                        onClick={() => p.voucher && setOpenBill(p)}
                        className="cursor-pointer hover:bg-blue-50"
                        title="Open the whole bill"
                      >
                        <td className="px-1.5 py-1 whitespace-nowrap">
                          <div className="text-gray-600">{day(p.date)}</div>
                          <div className="text-blue-700 underline decoration-dotted underline-offset-2">
                            {p.ref}
                            {p.source === "challan" && <span className="ml-1 text-teal-700 no-underline">(challan)</span>}
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-gray-700 whitespace-nowrap">
                          {p.batch || "—"}
                          {p.expiry && (
                            <div className="text-gray-400">Exp {String(p.expiry).slice(5, 7)}/{String(p.expiry).slice(2, 4)}</div>
                          )}
                        </td>
                        <td className="px-1.5 py-1 text-right text-gray-700 whitespace-nowrap">
                          {qty(p.qty)}{p.free > 0 && <span className="text-green-700"> +{qty(p.free)}</span>}
                        </td>
                        <td className="px-1.5 py-1 text-right font-medium text-gray-900 whitespace-nowrap">{money(p.rate)}</td>
                        <td className="px-1.5 py-1 text-right text-gray-600 whitespace-nowrap">{money(p.batch_mrp ?? p.mrp)}</td>
                        <td className="px-1.5 py-1 text-right text-gray-600 whitespace-nowrap">{money(p.purchase_rate)}</td>
                        <td className="px-1.5 py-1 text-right text-gray-600 whitespace-nowrap">
                          {margin == null ? "—" : `${margin >= 0 ? "+" : ""}${margin.toFixed(0)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-3">
            {view === "batch" && batches.map((g) => {
              const units = g.sales.reduce((s, p) => s + p.qty + p.free, 0);
              return (
                <div key={g.batch || "none"} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px]">
                    <span className="font-semibold text-gray-900">Batch {g.batch || "—"}</span>
                    {g.expiry && <span className="text-gray-500">Exp {String(g.expiry).slice(5, 7)}/{String(g.expiry).slice(2, 4)}</span>}
                    <span className="text-gray-700">MRP {money(g.mrp)}</span>
                    <span className="text-gray-700">Purchase {money(g.purchaseRate)}</span>
                    <span className="text-gray-400 ml-auto">{qty(units)} units</span>
                  </div>
                  <table className="w-full text-[10px]">
                    <thead className="text-gray-400">
                      <tr>
                        <th className="px-1.5 py-1 text-left font-medium">Date</th>
                        <th className="px-1.5 py-1 text-left font-medium">Bill</th>
                        <th className="px-1.5 py-1 text-right font-medium">Qty</th>
                        <th className="px-1.5 py-1 text-right font-medium">Rate</th>
                        <th className="px-1.5 py-1 text-right font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {g.sales.map((p, i) => {
                        const margin = g.purchaseRate && p.rate ? ((p.rate - g.purchaseRate) / g.purchaseRate) * 100 : null;
                        return (
                          <tr
                            key={`${p.ref}-${i}`}
                            onClick={() => p.voucher && setOpenBill(p)}
                            className="cursor-pointer hover:bg-blue-50"
                            title="Open the whole bill"
                          >
                            <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{day(p.date)}</td>
                            <td className="px-1.5 py-1 whitespace-nowrap text-blue-700 underline decoration-dotted underline-offset-2">
                              {p.ref}
                              {p.source === "challan" && <span className="ml-1 text-teal-700">(challan)</span>}
                            </td>
                            <td className="px-1.5 py-1 text-right text-gray-700 whitespace-nowrap">
                              {qty(p.qty)}{p.free > 0 && <span className="text-green-700"> +{qty(p.free)}</span>}
                            </td>
                            <td className="px-1.5 py-1 text-right font-medium text-gray-900 whitespace-nowrap">{money(p.rate)}</td>
                            <td className="px-1.5 py-1 text-right text-gray-600 whitespace-nowrap">
                              {margin == null ? "—" : `${margin >= 0 ? "+" : ""}${margin.toFixed(0)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {orders.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-[10px] font-semibold text-gray-900">Earlier app orders (no batch)</div>
                <table className="w-full text-[10px]">
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((p, i) => (
                      <tr key={`${p.ref}-${i}`}>
                        <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{day(p.date)}</td>
                        <td className="px-1.5 py-1 text-gray-800 whitespace-nowrap">
                          Order {p.ref}
                          {p.status && <span className="text-gray-400"> · {p.status}</span>}
                        </td>
                        <td className="px-1.5 py-1 text-right text-gray-700">{qty(p.qty)}</td>
                        <td className="px-1.5 py-1 text-right font-medium text-gray-900">{money(p.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </section>

          <section className="border border-amber-200 rounded-xl p-2.5">
            <h4 className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-2">
              Purchases of these batches
            </h4>
            {purchases.length === 0 ? (
              <p className="text-[10px] text-gray-400">No purchase found for the batches sold to this party.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead className="bg-amber-50 text-gray-500">
                    <tr>
                      <th className="px-1.5 py-1 text-left font-medium">Date / bill</th>
                      <th className="px-1.5 py-1 text-left font-medium">Supplier</th>
                      <th className="px-1.5 py-1 text-left font-medium">Batch</th>
                      <th className="px-1.5 py-1 text-right font-medium">Qty in</th>
                      <th className="px-1.5 py-1 text-right font-medium">MRP</th>
                      <th className="px-1.5 py-1 text-right font-medium">Purchase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.map((pu, i) => (
                      <PurchaseRow key={`pu-${pu.ref}-${i}`} p={pu} onOpen={setOpenBill} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="text-[10px] text-gray-400 mt-2">
            Rates before GST. Margin is over the batch&apos;s purchase rate. Bills are from Marg (this financial year);
            click a bill to see all of it.
          </p>
        </>
      )}
      {openBill && <BillModal point={openBill} onClose={() => setOpenBill(null)} />}
    </div>
  );
}

// A whole Marg bill over the order page. Esc or a click outside closes it;
// while it is open the arrow keys don't move the order page's selection.
function BillModal({ point, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-5xl bg-white rounded-xl shadow-xl border border-gray-200 p-5 mt-10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Bill ${point.ref}`}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="text-base font-semibold text-gray-900">
              {point.source === "challan" ? "Challan" : point.source === "purchase" ? "Purchase bill" : "Bill"} {point.ref}
            </div>
            <div className="text-xs text-gray-500">{day(point.date)}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <BillDetail voucher={point.voucher} />
      </div>
    </div>
  );
}

// A purchase that brought a batch in, as a row of the purchases box: a
// purchase bill this financial year, or the supplier invoice of a batch
// bought before it ("earlier", no bill to open).
function PurchaseRow({ p, onOpen }) {
  return (
    <tr
      onClick={() => p.voucher && onOpen(p)}
      className={p.voucher ? "cursor-pointer hover:bg-amber-50" : ""}
      title={p.voucher ? "Open the whole purchase bill" : "Bought before this financial year; Marg's stock records the supplier invoice"}
    >
      <td className="px-1.5 py-1 whitespace-nowrap">
        <div className="text-gray-600">{p.date ? day(p.date) : "—"}</div>
        <span className={p.voucher ? "text-blue-700 underline decoration-dotted underline-offset-2" : "text-gray-700"}>{p.ref}</span>
        {p.kind === "earlier" && <div className="text-gray-400">bought earlier</div>}
      </td>
      <td className="px-1.5 py-1 text-gray-700">
        <div className="truncate max-w-[8rem]" title={p.supplier || undefined}>{p.supplier || "—"}</div>
      </td>
      <td className="px-1.5 py-1 text-gray-700 whitespace-nowrap">{p.batch || "—"}</td>
      <td className="px-1.5 py-1 text-right text-green-700 whitespace-nowrap">
        {p.kind === "earlier" ? "—" : <>+{qty(p.qty)}{p.free > 0 && <> +{qty(p.free)}</>}</>}
      </td>
      <td className="px-1.5 py-1 text-right text-gray-600 whitespace-nowrap">{money(p.mrp)}</td>
      <td className="px-1.5 py-1 text-right font-medium text-amber-800 whitespace-nowrap">{money(p.rate)}</td>
    </tr>
  );
}
