"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import POPicker, { PAY_KEY, inr, outstanding, poLabel } from "@/components/admin/cheques/POPicker";
import ManufacturerPicker, { forgetManufacturers } from "@/components/admin/cheques/ManufacturerPicker";

// Cheque register (admin only): every payment to a supplier — cheques and
// transfers — the purchase orders each one pays, where each cheque is
// (made, in the office, handed over, cleared), remarks against it, and the
// received POs still to be paid, due by the supplier's credit period.
// Backend: internal/cheques/register.go.

const STATUS = {
  made: { label: "Made", cls: "bg-blue-50 text-blue-700" },
  in_office: { label: "In office", cls: "bg-amber-50 text-amber-800" },
  handed_over: { label: "Handed over", cls: "bg-violet-50 text-violet-700" },
  cleared: { label: "Cleared", cls: "bg-green-50 text-green-700" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500 line-through" },
};
const STATUS_KEYS = Object.keys(STATUS);
const METHODS = { cheque: "Cheque", neft: "NEFT", rtgs: "RTGS", imps: "IMPS", upi: "UPI", cash: "Cash", other: "Other" };
const BANKS = ["ICICI BANK", "HDFC", "Indian Bank"];


const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";
const btnCls = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50";
const primaryCls = "px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50";
const today = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (s) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtWhen = (s) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ChequeRegisterPage() {
  const [tab, setTab] = useState("payments");
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null); // { id } or { draft }
  const [refresh, setRefresh] = useState(0);
  const toastTimer = useRef(null);
  const say = useCallback((msg, err) => {
    setToast({ msg, err });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const changed = () => setRefresh((n) => n + 1);
  const close = useCallback(() => setEditing(null), []);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Cheque Register</h2>
          <p className="text-xs text-gray-400 mt-0.5">Payments to suppliers, the purchase orders they pay, and what is still to be paid.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing({ draft: {} })} className={primaryCls}>+ Record payment</button>
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white">
            {[["payments", "Cheques & payments"], ["dues", "To be made"], ["suppliers", "Manufacturers"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm ${tab === k ? "bg-gray-900 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {tab === "payments" && <PaymentsTab refresh={refresh} onOpen={(id) => setEditing({ id })} say={say} changed={changed} />}
      {tab === "dues" && <DuesTab refresh={refresh} say={say} changed={changed} onRecord={(draft) => setEditing({ draft })} />}
      {tab === "suppliers" && <SuppliersTab say={say} />}

      {editing && (
        <PaymentDrawer
          key={editing.id ?? "new"}
          id={editing.id}
          draft={editing.draft}
          say={say}
          onClose={close}
          onSaved={(p) => {
            changed();
            setEditing({ id: p.id });
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-sm text-white ${toast.err ? "bg-red-600" : "bg-gray-900"}`}>{toast.msg}</div>
      )}
    </>
  );
}

// ---- cheques & payments --------------------------------------------------------

function PaymentsTab({ refresh, onOpen, say, changed }) {
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [linked, setLinked] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  // a new filter starts again from page 1
  const filter = (setter) => (v) => {
    setter(v);
    setPage(1);
  };

  useEffect(() => {
    let off = false;
    (async () => {
      const qs = new URLSearchParams({ page: String(page) });
      if (status) qs.set("status", status);
      if (method) qs.set("method", method);
      if (linked) qs.set("linked", linked);
      if (q.trim()) qs.set("search", q.trim());
      try {
        const d = await apiFetch(`/admin/cheques/register?${qs}`);
        if (!off) setData(d);
      } catch (e) {
        if (!off) say(e.message || "Could not load payments", true);
      }
    })();
    return () => {
      off = true;
    };
  }, [page, status, method, linked, q, say, refresh]);

  const setRowStatus = async (p, s) => {
    try {
      await apiFetch(`/admin/cheques/register/${p.id}/status`, { method: "POST", body: JSON.stringify({ status: s }) });
      say(`${p.cheque_no ? "Cheque " + p.cheque_no : "Payment"} · ${STATUS[s].label}`);
      changed();
    } catch (e) {
      say(e.message || "Could not change status", true);
    }
  };

  const counts = data?.counts || {};
  const all = STATUS_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[["", "All", all], ...STATUS_KEYS.map((k) => [k, STATUS[k].label, counts[k] || 0])].map(([k, l, n]) => (
            <button key={k || "all"} onClick={() => filter(setStatus)(k)} className={`px-3 py-1 rounded-full text-xs border ${status === k ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {l} <span className={status === k ? "text-gray-300" : "text-gray-400"}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payee, cheque no., PO no., bill no." className={`${inputCls} max-w-sm`} />
          <select value={method} onChange={(e) => filter(setMethod)(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">Cheques & transfers</option>
            <option value="cheque">Cheques only</option>
            <option value="transfer">Transfers only</option>
          </select>
          <select value={linked} onChange={(e) => filter(setLinked)(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">Linked or not</option>
            <option value="yes">Linked to POs</option>
            <option value="no">Not linked to a PO</option>
          </select>
        </div>
      </div>
      {!data ? (
        <div className="p-8"><Loader /></div>
      ) : data.payments.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400">No payments match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date</th>
                <th className="text-left font-medium px-4 py-2">Cheque / ref</th>
                <th className="text-left font-medium px-4 py-2">Payee</th>
                <th className="text-right font-medium px-4 py-2">Amount</th>
                <th className="text-left font-medium px-4 py-2">POs</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">Last remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.payments.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.id)} className="hover:bg-gray-50 cursor-pointer align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="text-gray-900">{p.method === "cheque" ? p.cheque_no : METHODS[p.method]}</div>
                    <div className="text-xs text-gray-400">{p.bank || (p.method === "cheque" ? "" : "")}</div>
                  </td>
                  <td className="px-4 py-2.5 max-w-56">
                    <div className="text-gray-900 truncate">{p.manufacturer_name || p.payee}</div>
                    <div className="text-xs text-gray-400 truncate">{p.manufacturer_code || (p.manufacturer_id ? "" : "Other payee")}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-900">{inr(p.amount)}</td>
                  <td className="px-4 py-2.5 max-w-48">
                    {p.po_numbers.length ? (
                      <span className="text-gray-700">{p.po_numbers.slice(0, 3).join(", ")}{p.po_numbers.length > 3 ? ` +${p.po_numbers.length - 3}` : ""}</span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <select value={p.status} onChange={(e) => setRowStatus(p, e.target.value)} className={`text-xs rounded px-2 py-1 border-0 ${STATUS[p.status].cls}`}>
                      {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-64 truncate">{p.last_remark || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>{data.total} payments</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnCls}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={btnCls}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- one payment: details, POs, status, remarks ------------------------------

function PaymentDrawer({ id, draft, say, onClose, onSaved }) {
  const d0 = draft || {};
  const [p, setP] = useState(null);
  const [form, setForm] = useState(() => (id ? null : {
    method: "cheque", bank: "", cheque_no: "", payment_date: today(), payee: d0.payee || "",
    manufacturer_id: d0.manufacturer_id || null, other_payee: false, amount: d0.amount ? String(d0.amount) : "", status: "made",
  }));
  const [links, setLinks] = useState(() => (id ? [] : (d0.pos || []).map((po) => ({ po, amount: outstanding(po).toFixed(2), own: 0 }))));
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    if (!id) return;
    let off = false;
    (async () => {
      try {
        const x = await apiFetch(`/admin/cheques/register/${id}`);
        if (off) return;
        setP(x);
        setForm({ method: x.method, bank: x.bank || "", cheque_no: x.cheque_no || "", payment_date: x.payment_date || "", payee: x.payee, manufacturer_id: x.manufacturer_id, other_payee: !x.manufacturer_id, amount: String(x.amount), status: x.status });
        setLinks(x.allocations.map((a) => ({ po: { ...a, paid: a.paid_total }, amount: a.amount.toFixed(2), own: a.amount })));
      } catch (e) {
        if (off) return;
        say(e.message || "Could not load payment", true);
        onClose();
      }
    })();
    return () => {
      off = true;
    };
  }, [id, say, onClose, reload]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...form,
        amount: Number(form.amount),
        manufacturer_id: form.other_payee ? null : form.manufacturer_id,
        allocations: links.map((l) => ({ po_id: l.po.po_id, amount: Number(l.amount) || 0 })),
        remark: id ? "" : remark,
      };
      const out = await apiFetch(id ? `/admin/cheques/register/${id}` : "/admin/cheques/register", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
      say(id ? "Payment saved" : "Payment recorded");
      setRemark("");
      onSaved(out);
    } catch (e) {
      say(e.message || "Could not save", true);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (s) => {
    try {
      await apiFetch(`/admin/cheques/register/${id}/status`, { method: "POST", body: JSON.stringify({ status: s, note: remark }) });
      setRemark("");
      say(STATUS[s].label);
      onSaved({ id });
      load();
    } catch (e) {
      say(e.message || "Could not change status", true);
    }
  };
  const addRemark = async () => {
    if (!remark.trim()) return;
    try {
      await apiFetch(`/admin/cheques/register/${id}/remarks`, { method: "POST", body: JSON.stringify({ note: remark }) });
      setRemark("");
      onSaved({ id });
      load();
    } catch (e) {
      say(e.message || "Could not save remark", true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {id ? (p?.method === "cheque" ? `Cheque ${p?.cheque_no || ""}` : `${METHODS[p?.method] || ""} payment`) : "Record payment"}
            </h3>
            {p && <p className="text-xs text-gray-400">{p.source === "import" ? "From the Invoice Tracker" : p.source === "print" ? "Printed from Cheques" : "Entered by hand"} · added {fmtWhen(p.created_at)}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2">✕</button>
        </div>
        {!form ? (
          <div className="p-8"><Loader /></div>
        ) : (
          <div className="p-5 space-y-5">
            {id && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_KEYS.map((k) => (
                    <button key={k} onClick={() => k !== p?.status && setStatus(k)} className={`px-3 py-1 rounded-full text-xs border ${k === p?.status ? `${STATUS[k].cls} border-transparent font-medium` : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {STATUS[k].label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">A remark typed below is saved with the status change.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <L label="Paid by">
                <select value={form.method} onChange={set("method")} className={inputCls}>
                  {Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </L>
              <L label="Bank">
                <input value={form.bank} onChange={set("bank")} list="register-banks" className={inputCls} />
                <datalist id="register-banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist>
              </L>
              {form.method === "cheque" && (
                <L label="Cheque no."><input value={form.cheque_no} onChange={set("cheque_no")} inputMode="numeric" className={inputCls} /></L>
              )}
              <L label={form.method === "cheque" ? "Cheque date" : "Date"}><input type="date" value={form.payment_date} onChange={set("payment_date")} className={inputCls} /></L>
              <L label="Amount"><input value={form.amount} onChange={set("amount")} inputMode="decimal" className={inputCls} /></L>
              {!id && (
                <L label="Status">
                  <select value={form.status} onChange={set("status")} className={inputCls}>
                    {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                  </select>
                </L>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Paid to</div>
              <ManufacturerPicker
                value={{ manufacturer_id: form.manufacturer_id, payee: form.payee, other_payee: form.other_payee }}
                onChange={(v) => setForm((f) => ({ ...f, ...v }))}
              />
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500 mb-1.5">Purchase orders this pays</div>
              <POPicker links={links} setLinks={setLinks} total={form.amount} />
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500 mb-1.5">{id ? "Add a remark" : "Remark"}</div>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} placeholder="e.g. handed to Rajesh at the gate" className={inputCls} />
              {id && <button onClick={addRemark} disabled={!remark.trim()} className={`${btnCls} mt-2`}>Add remark</button>}
            </div>

            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className={primaryCls}>{id ? "Save changes" : "Record payment"}</button>
              <button onClick={onClose} className={btnCls}>Close</button>
            </div>

            {p?.events?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Remarks & history</div>
                <ol className="space-y-2">
                  {[...p.events].reverse().map((e) => (
                    <li key={e.id} className="text-sm border-l-2 border-gray-200 pl-3">
                      <div className="text-gray-800">
                        {e.kind === "remark" ? e.note
                          : e.kind === "status" ? <>Marked <b>{STATUS[e.status]?.label || e.status}</b>{e.note ? ` — ${e.note}` : ""}</>
                          : e.kind === "created" ? <>Recorded{e.status ? <> as <b>{STATUS[e.status]?.label}</b></> : ""}{e.note ? ` — ${e.note}` : ""}</>
                          : "Details or POs changed"}
                      </div>
                      <div className="text-xs text-gray-400">{e.actor || "—"} · {fmtWhen(e.created_at)}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- to be made ---------------------------------------------------------------

function DuesTab({ refresh, say, changed, onRecord }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [older, setOlder] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState({});
  const [receiving, setReceiving] = useState(null); // a PO line, or {} to search
  const [fromEdit, setFromEdit] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    let off = false;
    (async () => {
      const qs = new URLSearchParams();
      if (older) qs.set("older", "1");
      if (q.trim()) qs.set("search", q.trim());
      try {
        const d = await apiFetch(`/admin/cheques/dues?${qs}`);
        if (!off) setData(d);
      } catch (e) {
        if (!off) say(e.message || "Could not load", true);
      }
    })();
    return () => {
      off = true;
    };
  }, [older, q, say, refresh, reload]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const d of data?.dues || []) {
      const k = d.company || "No supplier";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return [...m.entries()];
  }, [data]);
  const sel = (data?.dues || []).filter((d) => picked[d.po_id]);
  const selTotal = sel.reduce((s, d) => s + outstanding(d), 0);
  const now = today();

  const saveFrom = async () => {
    try {
      await apiFetch("/admin/cheques/dues/from", { method: "PUT", body: JSON.stringify({ from: fromEdit }) });
      setFromEdit(null);
      load();
    } catch (e) {
      say(e.message || "Could not save the date", true);
    }
  };
  const draft = () => ({ pos: sel, payee: sel[0]?.company || "", manufacturer_id: sel.find((d) => d.manufacturer_id)?.manufacturer_id || null, amount: selTotal.toFixed(2) });
  const writeCheque = () => {
    try {
      sessionStorage.setItem(PAY_KEY, JSON.stringify(draft()));
    } catch {}
    router.push("/panel/cheques");
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO no., supplier, product, bill no." className={`${inputCls} max-w-sm`} />
        <div className="text-sm text-gray-600 flex items-center gap-2">
          Received from
          {fromEdit === null ? (
            <button onClick={() => setFromEdit(data?.from || today())} className="font-medium text-gray-900 underline decoration-dotted underline-offset-2">{fmtDate(data?.from)}</button>
          ) : (
            <>
              <input type="date" value={fromEdit} onChange={(e) => setFromEdit(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" />
              <button onClick={saveFrom} className={btnCls}>Save</button>
              <button onClick={() => setFromEdit(null)} className="text-gray-400 text-sm">Cancel</button>
            </>
          )}
        </div>
        <label className="text-sm text-gray-600 flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={older} onChange={(e) => setOlder(e.target.checked)} /> include older POs
        </label>
        <button onClick={() => setReceiving({})} className={`${btnCls} ml-auto`}>Goods received…</button>
      </div>
      <p className="px-4 pt-3 text-xs text-gray-400">
        Received POs not yet fully paid. What a PO owes is its bill amount; until the bill is entered it is quantity × rate (marked est.).
        Due = received date + the supplier&apos;s credit period. POs received before the date above count as settled.
      </p>

      {sel.length > 0 && (
        <div className="sticky top-0 z-10 mx-4 mt-3 flex flex-wrap items-center gap-3 bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm">
          <span>{sel.length} PO{sel.length > 1 ? "s" : ""} selected · unpaid {inr(selTotal)}</span>
          <button onClick={writeCheque} className="px-3 py-1 bg-white text-gray-900 rounded font-medium">Write cheque</button>
          <button onClick={() => onRecord(draft())} className="px-3 py-1 border border-white/40 rounded">Record payment</button>
          <button onClick={() => setPicked({})} className="text-white/60 ml-auto">Clear</button>
        </div>
      )}

      {!data ? (
        <div className="p-8"><Loader /></div>
      ) : groups.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400">Nothing to pay{q ? " matches" : ""}.</p>
      ) : (
        <div className="p-4 space-y-4">
          {groups.map(([company, rows]) => {
            const owed = rows.reduce((s, d) => s + outstanding(d), 0);
            const allOn = rows.every((d) => picked[d.po_id]);
            return (
              <div key={company} className="border border-gray-200 rounded-lg overflow-x-auto">
                <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 text-sm">
                  <input type="checkbox" checked={allOn} onChange={() => setPicked((x) => ({ ...x, ...Object.fromEntries(rows.map((d) => [d.po_id, !allOn])) }))} />
                  <span className="font-medium text-gray-900">{company}</span>
                  <span className="text-xs text-gray-400">{rows[0].credit_days != null ? `${rows[0].credit_days} days credit` : "no credit period set"}</span>
                  <span className="ml-auto text-gray-700">{inr(owed)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr>
                      <th className="w-8"></th>
                      <th className="text-left font-normal px-2 py-1.5">PO</th>
                      <th className="text-left font-normal px-2 py-1.5">Received</th>
                      <th className="text-left font-normal px-2 py-1.5">Bill</th>
                      <th className="text-right font-normal px-2 py-1.5">Owes</th>
                      <th className="text-right font-normal px-2 py-1.5">Paid</th>
                      <th className="text-right font-normal px-2 py-1.5">Unpaid</th>
                      <th className="text-left font-normal px-2 py-1.5">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((d) => (
                      <tr key={d.po_id} className="align-top">
                        <td className="px-2 py-2 text-center"><input type="checkbox" checked={!!picked[d.po_id]} onChange={() => setPicked((x) => ({ ...x, [d.po_id]: !x[d.po_id] }))} /></td>
                        <td className="px-2 py-2"><div className="text-gray-900">{d.po_number}</div><div className="text-xs text-gray-400 max-w-56 truncate">{d.product}</div></td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtDate(d.received_on)}</td>
                        <td className="px-2 py-2">
                          {d.bill_number || d.bill_amount != null ? (
                            <button onClick={() => setReceiving(d)} className="text-left">
                              <div className="text-gray-800">{d.bill_number || "—"}</div>
                              <div className="text-xs text-gray-400">{d.bill_date ? fmtDate(d.bill_date) : ""}</div>
                            </button>
                          ) : (
                            <button onClick={() => setReceiving(d)} className="text-xs text-blue-700 hover:underline">Enter bill</button>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap text-gray-700">{inr(d.owed)}{d.owed_is_estimate && <span className="block text-xs text-amber-700">est.</span>}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap text-gray-500">{d.paid ? inr(d.paid) : "—"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap font-medium text-gray-900">{inr(outstanding(d))}</td>
                        <td className={`px-2 py-2 whitespace-nowrap ${d.due_on && d.due_on < now ? "text-red-600 font-medium" : "text-gray-700"}`}>
                          {d.due_on ? fmtDate(d.due_on) : <span className="text-xs text-gray-400">no credit period</span>}
                          {d.due_on && d.due_on < now && <span className="block text-xs">overdue</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {receiving && (
        <ReceiveModal
          po={receiving.po_id ? receiving : null}
          say={say}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            changed();
          }}
        />
      )}
    </div>
  );
}

// Goods arriving for a PO line: marks it received and stores the bill.
function ReceiveModal({ po: start, say, onClose, onDone }) {
  const formFor = (x) => x && {
    received_on: x.received_on || today(),
    qty_received: x.qty_received ?? x.quantity ?? "",
    bill_number: x.bill_number || "",
    bill_date: x.bill_date || "",
    bill_amount: x.bill_amount ?? "",
  };
  const [po, setPoState] = useState(start);
  const [f, setF] = useState(() => formFor(start));
  const setPo = (x) => {
    setPoState(x);
    setF(formFor(x));
  };
  const [found, setList] = useState([]);
  const [q, setQ] = useState("");
  const seq = useRef(0);
  const list = po || q.trim().length < 2 ? [] : found;

  useEffect(() => {
    if (po || q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const res = await apiFetch(`/admin/cheques/pos?open=1&search=${encodeURIComponent(q.trim())}`);
        if (n === seq.current) setList(res.pos || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q, po]);

  const save = async () => {
    try {
      await apiFetch(`/admin/cheques/pos/${po.po_id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          received_on: f.received_on,
          qty_received: f.qty_received === "" ? null : Number(f.qty_received),
          bill_number: f.bill_number,
          bill_date: f.bill_date || null,
          bill_amount: f.bill_amount === "" ? null : Number(f.bill_amount),
        }),
      });
      say(`${po.po_number} received`);
      onDone();
    } catch (e) {
      say(e.message || "Could not save", true);
    }
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Goods received</h3>
        <p className="text-xs text-gray-400 mb-4">Marks the PO received from this date (the credit period starts then) and stores the supplier&apos;s bill.</p>
        {!po ? (
          <>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find the PO — PO no., supplier or product" className={inputCls} />
            <ul className="mt-2 max-h-72 overflow-auto divide-y divide-gray-100 text-sm">
              {list.map((x) => (
                <li key={x.po_id} onClick={() => setPo(x)} className="px-2 py-2 cursor-pointer hover:bg-gray-50">
                  <div className="text-gray-900">{poLabel(x)}</div>
                  <div className="text-xs text-gray-400">{x.company} · {x.status || "no status"} · {x.quantity ?? "?"} × {x.rate != null ? inr(x.rate) : "?"}</div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2">Lists POs not yet received. To change the bill on a received PO, use Enter bill on its row.</p>
          </>
        ) : !f ? null : (
          <>
            <div className="text-sm mb-3">
              <div className="text-gray-900 font-medium">{poLabel(po)}</div>
              <div className="text-xs text-gray-400">{po.company} · ordered {po.quantity ?? "?"} × {po.rate != null ? inr(po.rate) : "?"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <L label="Received on"><input type="date" value={f.received_on} onChange={set("received_on")} className={inputCls} /></L>
              <L label="Quantity received"><input value={f.qty_received} onChange={set("qty_received")} inputMode="decimal" className={inputCls} /></L>
              <L label="Supplier bill no."><input value={f.bill_number} onChange={set("bill_number")} className={inputCls} /></L>
              <L label="Bill date"><input type="date" value={f.bill_date} onChange={set("bill_date")} className={inputCls} /></L>
              <L label="Bill amount (incl. GST)"><input value={f.bill_amount} onChange={set("bill_amount")} inputMode="decimal" placeholder="for this PO" className={inputCls} /></L>
            </div>
            <p className="text-xs text-gray-400 mt-1">If one bill covers several POs, enter each PO&apos;s share of it.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={!f.received_on} className={primaryCls}>Save</button>
              {!start && <button onClick={() => setPo(null)} className={btnCls}>Back</button>}
              <button onClick={onClose} className={btnCls}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- manufacturers: Marg links, flags, credit periods -----------------------

function SuppliersTab({ say }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [linking, setLinking] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let off = false;
    apiFetch("/admin/cheques/suppliers")
      .then((r) => !off && setList(r.suppliers))
      .catch((e) => !off && say(e.message || "Could not load", true));
    return () => {
      off = true;
    };
  }, [say, reload]);
  const save = async (s, v) => {
    const days = v.trim() === "" ? null : Number(v);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) return say("Days must be a whole number from 0 to 365", true);
    if (days === s.credit_days) return;
    try {
      await apiFetch(`/admin/cheques/suppliers/${s.id}/credit-days`, { method: "PUT", body: JSON.stringify({ credit_days: days }) });
      setList((l) => l.map((x) => (x.id === s.id ? { ...x, credit_days: days } : x)));
      forgetManufacturers();
      say(`${s.name}: ${days == null ? "no credit period" : days + " days"}`);
    } catch (e) {
      say(e.message || "Could not save", true);
    }
  };
  if (!list) return <div className="bg-white rounded-xl border border-gray-200 p-8"><Loader /></div>;
  const needle = q.toLowerCase();
  const flagged = list.filter((s) => s.marg_flag).length;
  const shown = list.filter((s) => (!flaggedOnly || s.marg_flag) &&
    (s.name.toLowerCase().includes(needle) || (s.code || "").toLowerCase().includes(needle) || s.marg_parties.some((p) => p.party_code.toLowerCase().includes(needle))));
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, MFR code or Marg code" className={`${inputCls} max-w-xs`} />
        <label className="text-sm text-gray-600 flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> needs linking only
          <span className={`text-xs px-1.5 rounded ${flagged ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}>{flagged}</span>
        </label>
        <p className="text-xs text-gray-400 w-full">
          Names follow Marg&apos;s supplier names, which print on cheques. Credit period: days to pay, counted from the day goods are received.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 bg-gray-50">
            <tr>
              <th className="text-left font-medium px-4 py-2">Manufacturer</th>
              <th className="text-left font-medium px-4 py-2">Marg party</th>
              <th className="text-right font-medium px-4 py-2">POs</th>
              <th className="text-left font-medium px-4 py-2">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-2.5">
                  <div className="text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.code}</div>
                  {s.marg_flag && <div className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1 max-w-md">{s.marg_flag}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {s.marg_parties.length ? (
                    s.marg_parties.map((p) => (
                      <div key={p.party_code} className="text-gray-700"><span className="text-xs text-gray-400 mr-1">{p.party_code}</span>{p.name}{p.city ? <span className="text-gray-400"> · {p.city}</span> : ""}</div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">not linked</span>
                  )}
                  <button onClick={() => setLinking(s)} className="text-xs text-blue-700 hover:underline mt-1">{s.marg_parties.length ? "Change" : "Link Marg party…"}</button>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600">{s.pos}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <input
                    defaultValue={s.credit_days ?? ""}
                    onBlur={(e) => save(s, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    inputMode="numeric"
                    placeholder="—"
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                  />
                  <span className="text-gray-400 ml-1">days</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linking && (
        <MargLinkModal
          mfr={linking}
          say={say}
          onClose={() => setLinking(null)}
          onDone={() => {
            setLinking(null);
            forgetManufacturers();
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// Linking a manufacturer to its Marg party (or parties — Marg keeps some
// suppliers twice); optionally taking Marg's name, which its POs follow.
function MargLinkModal({ mfr, say, onClose, onDone }) {
  const [picked, setPicked] = useState(mfr.marg_parties);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [rename, setRename] = useState(true);
  const [name, setName] = useState("");
  const seq = useRef(0);
  const list = q.trim().length < 2 ? [] : found;

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const r = await apiFetch(`/admin/cheques/marg-parties?search=${encodeURIComponent(q.trim())}`);
        if (n === seq.current) setFound(r.parties || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const save = async () => {
    try {
      await apiFetch(`/admin/cheques/suppliers/${mfr.id}/marg`, {
        method: "PUT",
        body: JSON.stringify({ party_codes: picked.map((p) => p.party_code), rename: rename && picked.length > 0, name: rename ? name : "" }),
      });
      say(`${mfr.code} linked${picked.length ? " to Marg " + picked.map((p) => p.party_code).join(", ") : ""}`);
      onDone();
    } catch (e) {
      say(e.message || "Could not link", true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-5">
        <h3 className="text-base font-semibold text-gray-900">Link {mfr.code} to Marg</h3>
        <p className="text-sm text-gray-600 mb-1">{mfr.name} · {mfr.pos} POs</p>
        {mfr.marg_flag && <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 mb-3">{mfr.marg_flag}</p>}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {picked.map((p) => (
            <span key={p.party_code} className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-800">
              {p.party_code} · {p.name}
              <button onClick={() => setPicked(picked.filter((x) => x.party_code !== p.party_code))} className="text-gray-400 hover:text-red-600">✕</button>
            </span>
          ))}
          {!picked.length && <span className="text-xs text-gray-400">No Marg party linked.</span>}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Marg suppliers by name or code" className={inputCls} />
        <ul className="mt-1 max-h-56 overflow-auto divide-y divide-gray-100 text-sm">
          {list.map((p) => (
            <li
              key={p.party_code}
              onClick={() => !picked.some((x) => x.party_code === p.party_code) && setPicked([...picked, p])}
              className="px-2 py-1.5 cursor-pointer hover:bg-gray-50"
            >
              <span className="text-xs text-gray-400 mr-1">{p.party_code}</span>{p.name}{p.city ? <span className="text-gray-400"> · {p.city}</span> : ""}
              {p.manufacturer_code && p.manufacturer_code !== mfr.code && <span className="block text-xs text-amber-700">now linked to {p.manufacturer_code} {p.manufacturer_name} — picking it moves it here</span>}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-3 cursor-pointer select-none">
          <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
          Rename to the Marg name (its POs follow)
        </label>
        {rename && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Full name, only if Marg cut it short — else ${picked[0]?.name || "the first Marg name"}`} className={`${inputCls} mt-2`} />
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={save} className={primaryCls}>Save</button>
          <button onClick={onClose} className={btnCls}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
