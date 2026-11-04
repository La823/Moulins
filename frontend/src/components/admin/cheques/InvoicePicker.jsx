"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// Picking the Marg purchase invoices a payment pays, and how much of each —
// used by the cheque register and the cheque writer. A debit note can be
// picked too: it takes its amount off the cheque.

// Invoices handed from the register's "To be paid" list to the cheque writer.
export const PAY_KEY = "cheques.payInvoices";

export const inr = (v) =>
  "₹" + (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const isNote = (inv) => inv.kind === "debit_note";

// What is left of an invoice (or note), leaving out `own` — the amount this
// payment already takes from it, when editing a payment.
export const outstanding = (inv, own = 0) =>
  Math.max(0, Math.abs(inv.total || 0) - (inv.used ?? inv.used_total ?? 0) + Math.abs(own));

// An invoice as a short label: the supplier's bill no., else Marg's.
export const invoiceLabel = (inv) =>
  `${isNote(inv) ? "Debit note " : ""}${inv.supplier_bill_no || inv.marg_no || inv.invoice_key}`;

export const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

// A link as the API takes it: a note's amount goes negative.
export const toLinks = (links) =>
  links.map((l) => ({ invoice_key: l.inv.invoice_key, amount: (isNote(l.inv) ? -1 : 1) * Math.abs(Number(l.amount) || 0) }));

// What the links come to: invoices less notes.
export const linksTotal = (links) =>
  links.reduce((s, l) => s + (isNote(l.inv) ? -1 : 1) * Math.abs(Number(l.amount) || 0), 0);

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";

// links: [{ inv: <invoice from the API>, amount: "123.00", own: <amount saved before> }]
// manufacturerId: when set, the list shows that manufacturer's open invoices.
export default function InvoicePicker({ links, setLinks, total, manufacturerId }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);

  const search = (text) => {
    clearTimeout(timer.current);
    const t = text.trim();
    if (!manufacturerId && t.length < 2) return setList([]);
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const qs = new URLSearchParams({ search: t });
        if (manufacturerId) {
          qs.set("manufacturer", manufacturerId);
          if (!t) qs.set("open", "1");
        }
        const res = await apiFetch(`/admin/cheques/invoices?${qs}`);
        if (n === seq.current) setList(res.invoices || []);
      } catch {
        if (n === seq.current) setList([]);
      }
    }, t ? 250 : 0);
  };
  const add = (inv) => {
    if (links.some((l) => l.inv.invoice_key === inv.invoice_key)) return;
    setLinks([...links, { inv, amount: outstanding(inv).toFixed(2), own: 0 }]);
    setQ("");
    setList([]);
    setOpen(false);
  };
  const split = linksTotal(links);
  const left = (Number(total) || 0) - split;
  const shown = list.filter((inv) => !links.some((l) => l.inv.invoice_key === inv.invoice_key));

  return (
    <div>
      {links.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-2">
          {links.map((l, i) => (
            <div key={l.inv.invoice_key} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className={`truncate ${isNote(l.inv) ? "text-emerald-700" : "text-gray-900"}`}>{invoiceLabel(l.inv)}</div>
                <div className="text-xs text-gray-400 truncate">
                  {[l.inv.marg_no, fmtDate(l.inv.bill_date), l.inv.supplier].filter(Boolean).join(" · ")}
                  {l.inv.total != null ? ` · ${inr(Math.abs(l.inv.total))} · ${isNote(l.inv) ? "unused" : "unpaid"} ${inr(outstanding(l.inv, l.own))}` : " · no longer in Marg"}
                </div>
              </div>
              {isNote(l.inv) && <span className="text-emerald-700">−</span>}
              <input
                value={l.amount}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                inputMode="decimal"
                className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-right"
              />
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 px-1" title="Unlink">✕</button>
            </div>
          ))}
          <div className={`px-3 py-1.5 text-xs flex justify-between ${Math.abs(left) < 0.005 ? "text-gray-500" : left < 0 ? "text-red-600" : "text-amber-700"}`}>
            <span>Invoices less notes {inr(split)}</span>
            <span>{left < -0.004 ? `${inr(-left)} more than the payment` : left > 0.004 ? `${inr(left)} not split` : "matches the payment"}</span>
          </div>
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          placeholder={manufacturerId ? "Link an invoice — pick from the list or type a bill no." : "Link an invoice — type bill no. or supplier"}
          autoComplete="off"
          className={inputCls}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            search(e.target.value);
          }}
          onFocus={() => {
            setOpen(true);
            if (!q) search("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && shown.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto text-sm">
            {shown.map((inv) => (
              <li
                key={inv.invoice_key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(inv);
                }}
                className="px-3 py-2 cursor-pointer hover:bg-gray-50"
              >
                <span className={isNote(inv) ? "text-emerald-700" : "text-gray-900"}>{invoiceLabel(inv)}</span>
                <span className="text-gray-400"> · {inr(inv.total)}</span>
                <span className="block text-xs text-gray-400">
                  {[inv.marg_no, fmtDate(inv.bill_date), inv.supplier].filter(Boolean).join(" · ")} · {isNote(inv) ? "unused" : "unpaid"} {inr(outstanding(inv))}
                  {inv.due_on ? ` · due ${fmtDate(inv.due_on)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
