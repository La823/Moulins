"use client";

import { useState } from "react";
import Link from "next/link";
import { BillDetail, fmtMoney, fmtDate, fmtQty, TYPE_STYLES } from "@/components/admin/MargBills";

// A stock batch's movements this financial year (the batch page): its
// opening on 1 April, every bill line that moved it with a running balance,
// and how that ends against Marg's own current stock. A gap means stock left
// or entered the batch without a bill line the API sends (breakage or sample
// issues, or lines Marg leaves out of an edited bill).

// Opening, in, out, closing by bills, Marg's stock, and the gap.
export function BatchSummary({ h }) {
  const gap = Math.abs(h.unexplained) >= 0.01;
  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 text-xs">
      <Fact label="Opening (1 Apr)" value={fmtQty(h.opening)} />
      <Fact label="In" value={`+${fmtQty(h.in)}`} sub="purchases, returns, adjustments" />
      <Fact label="Out" value={`−${fmtQty(h.out)}`} sub={`sold ${fmtQty(h.sold_qty)} · ${fmtMoney(h.sold_value)} before GST`} />
      <Fact label="Closing by bills" value={fmtQty(h.calculated)} />
      <Fact label="Stock in Marg now" value={fmtQty(h.marg_stock)} strong />
      <Fact
        label="Not explained by bills"
        value={gap ? `${h.unexplained > 0 ? "+" : ""}${fmtQty(h.unexplained)}` : "0"}
        sub={gap ? (h.unexplained < 0 ? "left the batch without a bill line" : "came in without a bill line") : "bills match Marg"}
        tone={gap ? "warn" : "ok"}
      />
    </div>
  );
}

// Every bill line that moved the batch, oldest first, with a running balance.
export function BatchMovements({ h }) {
  const [openBill, setOpenBill] = useState(null);
  const gap = Math.abs(h.unexplained) >= 0.01;
  if (h.movements.length === 0) return <p className="text-xs text-gray-400">No bills moved this batch this year.</p>;
  return (
    <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
      <table className="w-full text-xs">
        <thead className="bg-gray-100 text-left text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Bill</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Party</th>
            <th className="px-3 py-2 text-right">In / out</th>
            <th className="px-3 py-2 text-right">Rate</th>
            <th className="px-3 py-2 text-right">Value (before GST)</th>
            <th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="bg-gray-50">
            <td className="px-3 py-2 text-gray-500" colSpan={7}>Opening stock on 1 April</td>
            <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtQty(h.opening)}</td>
          </tr>
          {h.movements.map((m, i) => (
            <MovementRow
              key={`${m.voucher}-${i}`}
              m={m}
              open={openBill === `${m.voucher}-${i}`}
              onToggle={() => setOpenBill((v) => (v === `${m.voucher}-${i}` ? null : `${m.voucher}-${i}`))}
            />
          ))}
          <tr className="bg-gray-50">
            <td className="px-3 py-2 text-gray-500" colSpan={7}>
              Closing by bills
              {gap && <span className="text-amber-700"> · Marg shows {fmtQty(h.marg_stock)}</span>}
            </td>
            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtQty(h.calculated)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MovementRow({ m, open, onToggle }) {
  const inbound = m.change >= 0;
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(m.date)}</td>
        <td className="px-3 py-2">
          <button onClick={onToggle} className="font-medium text-gray-900 hover:underline">{m.bill_no}</button>
        </td>
        <td className="px-3 py-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_STYLES[m.bill_type] || "bg-gray-100 text-gray-600"}`}>
            {m.bill_type_name || m.bill_type}
          </span>
        </td>
        <td className="px-3 py-2">
          {m.party_code ? (
            <Link href={`/panel/marg-ledger/${encodeURIComponent(m.party_code)}`} className="text-gray-800 hover:underline">
              {m.party_name || m.party_code}
            </Link>
          ) : "—"}
        </td>
        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${inbound ? "text-green-700" : "text-gray-900"}`}>
          {inbound ? "▲ +" : "▼ "}{fmtQty(m.change)}
          {m.free > 0 && <span className="text-gray-400 font-normal"> (incl. {fmtQty(m.free)} free)</span>}
        </td>
        <td className="px-3 py-2 text-right text-gray-600">{m.rate ? fmtMoney(m.rate) : "—"}</td>
        <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(m.amount)}</td>
        <td className={`px-3 py-2 text-right font-medium ${m.balance < 0 ? "text-red-600" : "text-gray-900"}`}>{fmtQty(m.balance)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-3 pb-3 bg-gray-50">
            <BillDetail voucher={m.voucher} />
          </td>
        </tr>
      )}
    </>
  );
}

function Fact({ label, value, sub, strong, tone }) {
  const color = tone === "warn" ? "text-amber-700" : strong ? "text-gray-900" : "text-gray-800";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-gray-500">{label}</div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-gray-400 truncate" title={sub}>{sub}</div>}
    </div>
  );
}
