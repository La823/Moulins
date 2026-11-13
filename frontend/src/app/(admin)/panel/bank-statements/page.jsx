"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Bank statements (admin only): HDFC emails a statement every morning for the
// previous day; the server reads the email, opens HDFC's statement page with
// the saved password and stores every field and transaction
// (internal/bankstatements, checked hourly 8 AM–8 PM). Each statement shows
// as a block — opening, debits, credits, closing — with its transactions,
// and "View HDFC statement" shows the page exactly as HDFC sent it.

const btnCls = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50";
const primaryCls = "px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50";
const inputCls = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";

const inr = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v) || 0;
  return (n < 0 ? "−₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const ymd = (d) => d.toLocaleDateString("en-CA");
const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const fmtWhen = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—";
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};

const EMPTY = { accounts: [], statements: [], problems: [] };

const TYPES = [
  ["all", "All transactions"],
  ["deposit", "Money in"],
  ["withdrawal", "Money out"],
  ["cheque", "Cheques"],
];

export default function BankStatementsPage() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(ymd(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [viewing, setViewing] = useState(null); // { title, html } or { title, loading }
  const [view, setView] = useState("day"); // "day": one block per date; "email": one block per HDFC email

  const fetchRange = useCallback(() => apiFetch(`/admin/bank-statements?from=${from}&to=${to}`), [from, to]);

  const load = useCallback(
    () =>
      fetchRange()
        .then((d) => (setData(d), setError("")))
        .catch((e) => (setError(e.message), setData((x) => x || EMPTY))),
    [fetchRange],
  );

  useEffect(() => {
    let off = false;
    fetchRange()
      .then((d) => !off && (setData(d), setError("")))
      .catch((e) => !off && (setError(e.message), setData((x) => x || EMPTY)));
    return () => {
      off = true;
    };
  }, [fetchRange]);

  const checkNow = async () => {
    setChecking(true);
    setCheckMsg("");
    try {
      const r = await apiFetch("/admin/bank-statements/check", { method: "POST" });
      const saved = r?.saved?.length || 0;
      setCheckMsg(
        (saved ? `${saved} new statement${saved === 1 ? "" : "s"} saved.` : "No new statements.") +
          (r?.errors?.length ? ` Problems: ${r.errors.join("; ")}` : ""),
      );
      await load();
    } catch (e) {
      setCheckMsg(`Check failed: ${e.message}`);
    } finally {
      setChecking(false);
    }
  };

  const viewStatement = async (s) => {
    const title = `${fmtDate(s.period_from)}${s.period_to !== s.period_from ? ` – ${fmtDate(s.period_to)}` : ""}`;
    setViewing({ title, loading: true });
    try {
      const r = await apiFetch(`/admin/bank-statements/${s.id}/html`);
      setViewing({ title, html: r?.html || "<p>No copy saved.</p>" });
    } catch (e) {
      setViewing({ title, html: `<p style="color:#b91c1c">${e.message}</p>` });
    }
  };

  const q = search.trim().toLowerCase();
  const keep = useCallback(
    (l) => {
      if (type === "deposit" && !l.deposit) return false;
      if (type === "withdrawal" && !l.withdrawal) return false;
      if (type === "cheque" && !/cheque/i.test(l.txn_type || "")) return false;
      if (!q) return true;
      const amt = [l.deposit, l.withdrawal].filter(Boolean).map((v) => `${v} ${Number(v).toLocaleString("en-IN")}`);
      return `${l.narration || ""} ${l.ref_no || ""} ${amt.join(" ")}`.toLowerCase().includes(q);
    },
    [q, type],
  );

  const shown = useMemo(() => {
    if (!data) return [];
    return data.statements
      .map((s) => ({ ...s, shownLines: s.lines.filter(keep) }))
      .filter((s) => s.shownLines.length > 0 || (!q && type === "all"));
  }, [data, keep, q, type]);

  // Day by day: every statement's dates split out. A day's opening is the
  // previous day's closing (the first day starts from the statement's
  // opening); its closing is the balance after its last transaction. Days
  // inside a statement with no transactions still show, with the balance
  // carried. Only days within the chosen dates.
  const days = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const s of [...data.statements].sort((a, b) => a.period_from.localeCompare(b.period_from))) {
      const byDate = new Map();
      for (let d = new Date(s.period_from); d <= new Date(s.period_to); d.setUTCDate(d.getUTCDate() + 1))
        byDate.set(d.toISOString().slice(0, 10), []);
      for (const l of s.lines) {
        const d = (l.txn_date || s.period_to).slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d).push(l);
      }
      let bal = s.opening_balance;
      for (const [d, lines] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const opening = bal;
        let debit = 0, credit = 0, dn = 0, cn = 0;
        for (const l of lines) {
          if (l.withdrawal) (dn++, (debit += l.withdrawal));
          if (l.deposit) (cn++, (credit += l.deposit));
        }
        if (lines.length) bal = lines[lines.length - 1].closing_balance;
        if (d >= from && d <= to)
          out.push({ key: `${s.id}-${d}`, date: d, stmt: s, opening, closing: bal, debit, credit, dn, cn, lines, shownLines: lines.filter(keep) });
      }
    }
    return out.reverse().filter((x) => x.shownLines.length > 0 || (!q && type === "all"));
  }, [data, keep, q, type, from, to]);

  const blocks = view === "day" ? days : shown;

  const totals = useMemo(() => {
    const t = { inN: 0, inAmt: 0, outN: 0, outAmt: 0 };
    for (const s of shown)
      for (const l of s.shownLines) {
        if (l.deposit) (t.inN++, (t.inAmt += l.deposit));
        if (l.withdrawal) (t.outN++, (t.outAmt += l.withdrawal));
      }
    return t;
  }, [shown]);

  const downloadCSV = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Account", "Date", "Transaction details", "Cheque/Ref No", "Value date", "Withdrawal", "Deposit", "Closing balance", "Type"]];
    for (const s of [...shown].reverse())
      for (const l of s.shownLines)
        rows.push([s.account_no, l.txn_date?.slice(0, 10), l.narration, l.ref_no, l.value_date?.slice(0, 10), l.withdrawal ?? "", l.deposit ?? "", l.closing_balance ?? "", l.txn_type]);
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bank-statement-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <Loader />;
  const acc = data.accounts.find((a) => a.active) || data.accounts[0];
  const headroom = acc?.od_limit != null && acc?.latest_closing != null ? acc.od_limit + acc.latest_closing : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Bank Statements</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Read from HDFC&apos;s daily statement emails. Checked every hour from 8 AM to 8 PM.
          </p>
        </div>
        <button type="button" onClick={checkNow} disabled={checking} className={primaryCls}>
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>

      {checking && <p className="text-sm text-gray-500 mb-3">Reading the mailbox and opening new statements…</p>}
      {checkMsg && <p className="text-sm text-gray-700 mb-3">{checkMsg}</p>}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {data.problems.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <p className="font-medium text-red-800">Some statement emails could not be read</p>
          <ul className="mt-1 space-y-1 text-red-700">
            {data.problems.map((p) => (
              <li key={p.gmail_message_id}>
                {p.subject || p.gmail_message_id} · {p.status === "rejected" ? "HDFC refused the password" : `failed ${p.attempts}×`}
                {p.last_error && <span className="block text-xs text-red-600/80 break-words">{p.last_error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {acc && (
        <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {acc.bank} ···{acc.last4} <span className="font-normal text-gray-500">· {acc.account_no}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {[acc.product_type, acc.customer_name].filter(Boolean).join(" · ")}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {[acc.branch_name, acc.ifsc && `IFSC ${acc.ifsc}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-right">
              <div>
                <div className="text-xs text-gray-500">Balance</div>
                <div className={`text-lg font-semibold ${acc.latest_closing < 0 ? "text-red-700" : "text-gray-900"}`}>{inr(acc.latest_closing)}</div>
                <div className="text-[11px] text-gray-400">as of {fmtDate(acc.latest_period_to)}</div>
              </div>
              {acc.od_limit > 0 && (
                <>
                  <div>
                    <div className="text-xs text-gray-500">Overdraft limit</div>
                    <div className="text-lg font-semibold text-gray-900">{inr(acc.od_limit)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Still available</div>
                    <div className="text-lg font-semibold text-emerald-700">{inr(headroom)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            {acc.statement_count} statement{acc.statement_count === 1 ? "" : "s"} saved since {fmtDate(acc.first_period_from)} · last read {fmtWhen(acc.last_fetched_at)}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white">
          {[["day", "Day by day"], ["email", "By email"]].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={`px-3 py-1.5 text-sm ${view === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
        <span className="text-sm text-gray-400">to</span>
        <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
        {[
          ["7 days", 7],
          ["30 days", 30],
          ["90 days", 90],
        ].map(([l, n]) => (
          <button key={l} type="button" className={btnCls} onClick={() => (setFrom(daysAgo(n)), setTo(ymd(new Date())))}>
            {l}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          {TYPES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search party, ref no, amount…" className={`${inputCls} w-60`} />
        <button type="button" className={btnCls} onClick={downloadCSV} disabled={!shown.length}>
          Download CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span className="text-gray-600">
          Money in: <b className="text-emerald-700">{inr(totals.inAmt)}</b> <span className="text-gray-400">({totals.inN})</span>
        </span>
        <span className="text-gray-600">
          Money out: <b className="text-red-700">{inr(totals.outAmt)}</b> <span className="text-gray-400">({totals.outN})</span>
        </span>
      </div>

      {blocks.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400 bg-white border border-gray-200 rounded-xl">
          {q || type !== "all" ? "No transactions match." : "No statements in these dates."}
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((b) => {
            const st = view === "day" ? b.stmt : b;
            const multiDay = st.period_to !== st.period_from;
            const h =
              view === "day"
                ? { opening: b.opening, closing: b.closing, debit: b.debit, credit: b.credit, dn: b.dn, cn: b.cn }
                : { opening: b.opening_balance, closing: b.closing_balance, debit: b.debit_amount, credit: b.credit_amount, dn: b.debit_count ?? 0, cn: b.credit_count ?? 0 };
            return (
              <section key={view === "day" ? b.key : b.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <header className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/60">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">
                      {view === "day" ? (
                        new Date(b.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
                      ) : (
                        <>
                          {fmtDate(st.period_from)}
                          {multiDay && <> – {fmtDate(st.period_to)}</>}
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {view === "day" && multiDay ? `Part of the ${fmtDate(st.period_from)} – ${fmtDate(st.period_to)} email · ` : ""}
                      Email received {fmtWhen(st.email_received_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600">
                    <span>Opening <b className="text-gray-900">{inr(h.opening)}</b></span>
                    <span>Out <b className="text-red-700">{inr(h.debit)}</b> ({h.dn})</span>
                    <span>In <b className="text-emerald-700">{inr(h.credit)}</b> ({h.cn})</span>
                    <span>Closing <b className="text-gray-900">{inr(h.closing)}</b></span>
                    <button type="button" className="text-teal-700 hover:underline font-medium" onClick={() => viewStatement(st)}>
                      View HDFC statement
                    </button>
                  </div>
                </header>
                {b.shownLines.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No transactions.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-gray-500">
                        <tr>
                          <th className="text-left font-medium px-4 py-2">Date</th>
                          <th className="text-left font-medium px-4 py-2">Transaction details</th>
                          <th className="text-left font-medium px-4 py-2">Cheque / Ref no</th>
                          <th className="text-right font-medium px-4 py-2">Out</th>
                          <th className="text-right font-medium px-4 py-2">In</th>
                          <th className="text-right font-medium px-4 py-2">Balance</th>
                          <th className="text-left font-medium px-4 py-2">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {b.shownLines.map((l) => (
                          <tr key={l.line_no} className="align-top hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                              {fmtDate(l.txn_date)}
                              {l.value_date && l.txn_date && l.value_date !== l.txn_date && (
                                <span className="block text-[11px] text-gray-400">value {fmtDate(l.value_date)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-900 break-words min-w-64 max-w-md">{l.narration}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-gray-600 tabular-nums">{l.ref_no}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums text-red-700">{l.withdrawal ? inr(l.withdrawal) : ""}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums text-emerald-700">{l.deposit ? inr(l.deposit) : ""}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums text-gray-700">{inr(l.closing_balance)}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{l.txn_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">HDFC statement · {viewing.title}</span>
              <button type="button" className={btnCls} onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
            {viewing.loading ? (
              <div className="p-8">
                <Loader />
              </div>
            ) : (
              // sandbox with no permissions: the bank's page shows, but none of its links or scripts run
              <iframe title="HDFC statement" sandbox="" srcDoc={viewing.html} className="flex-1 w-full" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
