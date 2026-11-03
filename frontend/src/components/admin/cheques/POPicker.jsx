"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// Picking the purchase orders a payment pays, and how much of it goes to
// each — used by the cheque register and the cheque writer.

// POs handed from the register's "To be made" list to the cheque writer.
export const PAY_KEY = "cheques.payPOs";

export const inr = (v) =>
  "₹" + (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// What is still unpaid on a PO line, leaving out `own` — the amount this
// payment already puts on it, when editing a payment.
export const outstanding = (po, own = 0) => Math.max(0, (po.owed || 0) - (po.paid ?? po.paid_total ?? 0) + own);

// A PO line as a short label.
export const poLabel = (po) => `${po.po_number}${po.product ? " · " + po.product : ""}`;

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";

// links: [{ po: <PO line from the API>, amount: "123.00", own: <amount saved before> }]
export default function POPicker({ links, setLinks, total }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);

  const search = (text) => {
    clearTimeout(timer.current);
    if (text.trim().length < 2) return setList([]);
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const res = await apiFetch(`/admin/cheques/pos?search=${encodeURIComponent(text.trim())}`);
        if (n === seq.current) setList(res.pos || []);
      } catch {
        if (n === seq.current) setList([]);
      }
    }, 250);
  };
  const add = (po) => {
    if (links.some((l) => l.po.po_id === po.po_id)) return;
    setLinks([...links, { po, amount: outstanding(po).toFixed(2), own: 0 }]);
    setQ("");
    setList([]);
    setOpen(false);
  };
  const split = links.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const left = (Number(total) || 0) - split;

  return (
    <div>
      {links.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-2">
          {links.map((l, i) => (
            <div key={l.po.po_id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-gray-900 truncate">{poLabel(l.po)}</div>
                <div className="text-xs text-gray-400 truncate">
                  {l.po.company} · owes {inr(l.po.owed)}{l.po.owed_is_estimate ? " (est.)" : ""} · unpaid {inr(outstanding(l.po, l.own))}
                </div>
              </div>
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
            <span>Split over POs {inr(split)}</span>
            <span>{left < -0.004 ? `${inr(-left)} more than the payment` : left > 0.004 ? `${inr(left)} not split` : "all split"}</span>
          </div>
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          placeholder="Link a PO — type PO no., supplier, product or bill no."
          autoComplete="off"
          className={inputCls}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            search(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && list.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto text-sm">
            {list.map((po) => (
              <li
                key={po.po_id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(po);
                }}
                className="px-3 py-2 cursor-pointer hover:bg-gray-50"
              >
                <span className="text-gray-900">{poLabel(po)}</span>
                <span className="block text-xs text-gray-400">
                  {po.company} · {po.status || "no status"} · owes {inr(po.owed)}{po.owed_is_estimate ? " (est.)" : ""} · unpaid {inr(outstanding(po))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
