"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";
import { fmtMoney, fmtDate } from "@/components/admin/MargBills";
import { VOUCHER_KINDS } from "@/components/admin/MargDaybook";

// One party's ledger for FY 2025-26 from the Day Book, oldest first, with
// the running balance (opening balance zero).
export default function MargDaybookPartyPage() {
  const { code: rawCode } = useParams();
  const code = decodeURIComponent(rawCode);
  const [led, setLed] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/marg-daybook/parties/${encodeURIComponent(code)}`)
      .then(setLed)
      .catch((e) => setError(e.message || "Could not load the ledger"));
  }, [code]);

  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>;
  if (!led) return <Loader />;

  const sum = (key) => led.rows.reduce((n, r) => n + r[key], 0);
  const closing = led.rows.length ? led.rows[led.rows.length - 1].balance : 0;

  return (
    <>
      <Link href="/panel/marg-daybook" className="text-xs text-gray-500 hover:text-gray-800">
        ← Day Book 2025-26
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mt-2 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{led.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {led.party_code}
            {led.kind && ` · ${KIND_LABELS[led.kind] || led.kind}`}
            {" · "}ledger for 1 Apr 2025 – 31 Mar 2026 from the Day Book, opening balance zero
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <Link href={`/panel/party-bills/${encodeURIComponent(led.party_code)}`} className="text-gray-900 font-medium hover:underline">
            Bills, year by year
          </Link>
          <Link href={`/panel/marg-ledger/${encodeURIComponent(led.party_code)}`} className="text-gray-500 hover:text-gray-800 underline">
            Marg Accounts (current year)
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Entries" value={led.rows.length.toLocaleString("en-IN")} />
        <Stat label="Total debit" value={fmtMoney(sum("debit"))} />
        <Stat label="Total credit" value={fmtMoney(sum("credit"))} />
        <Stat
          label={closing >= 0 ? "Closing balance (owes Moulins)" : "Closing balance (Moulins owes)"}
          value={fmtMoney(Math.abs(closing))}
          strong
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Ref / bill no</th>
              <th className="px-4 py-3">Narration</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {led.rows.map((r, i) => {
              const k = VOUCHER_KINDS[r.voucher_kind] || { label: r.voucher_kind, cls: "bg-gray-100 text-gray-600" };
              return (
                <tr key={i} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${k.cls}`}>{k.label}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-900">
                    {r.ref_no || (r.against_bills.length > 0 ? <span className="text-gray-500">Ag. {r.against_bills.join(", ")}</span> : "—")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 max-w-md break-all">{r.ref_no && r.narration === `Bill No. ${r.ref_no}` ? "" : r.narration}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-900">{r.debit ? fmtMoney(r.debit) : ""}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-900">{r.credit ? fmtMoney(r.credit) : ""}</td>
                  <td className={`px-4 py-2.5 text-right whitespace-nowrap font-medium ${r.balance < 0 ? "text-green-700" : "text-gray-900"}`}>
                    {fmtMoney(r.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 ${strong ? "text-lg font-semibold text-gray-900" : "text-sm font-medium text-gray-800"}`}>{value}</p>
    </div>
  );
}
