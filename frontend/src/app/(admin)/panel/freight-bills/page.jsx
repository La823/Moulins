"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Freight bills (backend internal/dispatch, migration 190): the dispatch team
// records each transporter's freight bill in the MPPL Team app — a photo or
// PDF of it, bill no. and date, the amount paid, how and by whom, and
// remarks. Admins (and freight_bills_view) see every bill here and open the
// bill itself; others with freight_bills_edit see the bills they added.

const inputCls =
  "px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";
const MODES = { cash: "Cash", upi: "UPI", bank: "Bank transfer", cheque: "Cheque", other: "Other" };
const inr = (v) => "₹" + (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d) => d.toLocaleDateString("en-CA");
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const fmtWhen = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "";
const isPdf = (b) => (b.content_type || "").includes("pdf") || /\.pdf$/i.test(b.file_name || b.file_url || "");

export default function FreightBillsPage() {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  const fetchBills = useCallback(
    () => apiFetch(`/admin/freight-bills?from=${from}&to=${to}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`),
    [from, to, q],
  );

  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      fetchBills()
        .then((d) => !off && (setData(d), setError("")))
        .catch((e) => !off && (setError(e.message), setData((x) => x || { bills: [], total: 0 })));
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [fetchBills]);

  // paid per transporter, biggest first
  const byTransporter = useMemo(() => {
    const m = new Map();
    for (const b of data?.bills || []) {
      const k = b.transporter_name || "Not set";
      const v = m.get(k) || { name: k, total: 0, n: 0 };
      v.total += b.amount_paid;
      v.n += 1;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data]);

  const downloadCSV = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Bill date", "Bill no", "Transporter", "Amount paid", "Payment mode", "Paid by", "Remarks", "Added by", "Added on", "Bill file"]];
    for (const b of data?.bills || [])
      rows.push([
        b.bill_date?.slice(0, 10) || "",
        b.bill_no,
        b.transporter_name,
        b.amount_paid,
        MODES[b.payment_mode] || b.payment_mode,
        b.paid_by,
        b.remarks,
        b.created_by,
        b.created_at?.slice(0, 10),
        b.file_url,
      ]);
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `freight-bills-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <Loader />;

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Freight Bills</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Recorded by the dispatch team in the MPPL Team app: the bill, what was paid for it, how and by whom.
          {data.all ? "" : " You see the bills you added."}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
        <span className="text-sm text-gray-400">to</span>
        <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bill no, transporter, remarks…" className={`${inputCls} w-64`} />
        <button
          type="button"
          onClick={downloadCSV}
          disabled={!data.bills.length}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="mb-4 grid sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">Paid in these dates</div>
          <div className="text-xl font-semibold text-gray-900 mt-1">{inr(data.total)}</div>
          <div className="text-[11px] text-gray-400">
            {data.bills.length} bill{data.bills.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="sm:col-span-2 bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1.5">By transporter</div>
          {byTransporter.length === 0 ? (
            <p className="text-sm text-gray-400">—</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {byTransporter.slice(0, 8).map((t) => (
                <span key={t.name} className="text-gray-700">
                  {t.name}: <b className="text-gray-900">{inr(t.total)}</b> <span className="text-gray-400">({t.n})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.bills.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400 bg-white border border-gray-200 rounded-xl">No freight bills in these dates.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Bill</th>
                <th className="text-left font-medium px-4 py-2">Transporter</th>
                <th className="text-right font-medium px-4 py-2">Paid</th>
                <th className="text-left font-medium px-4 py-2">How / by whom</th>
                <th className="text-left font-medium px-4 py-2">Remarks</th>
                <th className="text-left font-medium px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.bills.map((b) => (
                <tr key={b.id} className="align-top hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-3">
                      <button type="button" onClick={() => setViewing(b)} className="shrink-0" title="Open the bill">
                        {isPdf(b) ? (
                          <span className="w-12 h-12 rounded-lg bg-red-50 text-red-700 text-[11px] font-semibold flex items-center justify-center border border-red-100">
                            PDF
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.file_url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                        )}
                      </button>
                      <div>
                        <div className="text-gray-900 font-medium">{b.bill_no || "No bill no."}</div>
                        <div className="text-xs text-gray-500">{fmtDate(b.bill_date)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800">{b.transporter_name || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">{inr(b.amount_paid)}</td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {MODES[b.payment_mode] || b.payment_mode}
                    {b.paid_by && <span className="block text-xs text-gray-500">{b.paid_by}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-xs break-words">{b.remarks || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {b.created_by || "—"}
                    <span className="block">{fmtWhen(b.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-900">
                {viewing.transporter_name || "Freight bill"} · {viewing.bill_no || "no bill no."} · {inr(viewing.amount_paid)}
              </span>
              <div className="flex gap-2">
                <a href={viewing.file_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50">
                  Open in new tab
                </a>
                <button type="button" onClick={() => setViewing(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
            {isPdf(viewing) ? (
              <iframe title="Freight bill" src={viewing.file_url} className="flex-1 w-full" />
            ) : (
              <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewing.file_url} alt="Freight bill" className="max-w-full max-h-full" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
