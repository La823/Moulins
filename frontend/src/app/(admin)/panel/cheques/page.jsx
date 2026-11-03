"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import ChequeView from "@/components/admin/cheques/ChequeView";
import WarpModal from "@/components/admin/cheques/WarpModal";
import POPicker, { PAY_KEY } from "@/components/admin/cheques/POPicker";
import ManufacturerPicker from "@/components/admin/cheques/ManufacturerPicker";
import {
  MM, BANKS, LABELS, PRESET_OPTIONS, SAMPLE, amountWords, fieldValues, makeProfile, toCents, today, upgradeLayout,
} from "@/lib/chequeWriter";

// Cheque writer (admin only): fill a cheque, see it on the bank's cheque
// image, and print it onto the real cheque. Bank layouts (field positions,
// words format, printer offsets, next cheque no.) are saved on the server
// (backend internal/cheques) so every admin has the same setup. Printing a
// cheque records it in the Cheque Register, linked to the POs it pays.

const ACTIVE_KEY = "cheques.active";
const VIEW_KEY = "cheques.view";
const ROT_KEY = "cheques.previewRot";
const SAVE_DELAY = 700;

const fromServer = (s) => upgradeLayout({ ...s.data, id: s.id, name: s.name });
const toServer = (p) => {
  const { id: _id, name, ...data } = p;
  return { name, data };
};
const getPath = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
function setPath(o, path, val) {
  const ks = path.split("."), last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = val;
}
const readStore = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const writeStore = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";
const btnCls = "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white hover:bg-gray-50";
const primaryCls = "px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800";

export default function ChequesPage() {
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("write");
  // payee: a manufacturer (manufacturerId) or, with otherPayee, anyone (a Marg party or typed)
  const [form, setForm] = useState({ no: "", date: today(), payee: "", partyCode: null, manufacturerId: null, otherPayee: false, amount: "", acPayee: true, memo: "" });
  // the POs this cheque pays: [{ po, amount, own }] (see POPicker)
  const [links, setLinks] = useState([]);
  const [sel, setSel] = useState("payee");
  const [view, setView] = useState(() => (typeof window === "undefined" ? "cheque" : readStore(VIEW_KEY, "cheque")));
  const [saveState, setSaveState] = useState("");
  const [printJob, setPrintJob] = useState(null);
  const [warpFile, setWarpFile] = useState(null);
  const [toast, setToast] = useState(null);
  const profilesRef = useRef(null);
  const timers = useRef({});
  const inputs = useRef({});
  const toastTimer = useRef(null);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  const say = useCallback((msg, err) => {
    setToast({ msg, err });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Load the layouts; the first time ever, add one per bank.
  useEffect(() => {
    (async () => {
      try {
        let list = (await apiFetch("/admin/cheques/profiles")).profiles;
        if (!list.length) {
          const seed = Object.keys(BANKS).map((k, i) => ({ ...toServer(makeProfile("bank:" + k)), sort_order: i }));
          list = (await apiFetch("/admin/cheques/profiles", { method: "POST", body: JSON.stringify({ profiles: seed }) })).profiles;
        }
        const ps = list.map(fromServer);
        const saved = Number(readStore(ACTIVE_KEY, ""));
        const p = ps.find((x) => x.id === saved) || ps[0];
        setProfiles(ps);
        setActiveId(p.id);
        let pay = null;
        try {
          pay = JSON.parse(sessionStorage.getItem(PAY_KEY) || "null");
          sessionStorage.removeItem(PAY_KEY);
        } catch {}
        setForm((f) => ({
          ...f, no: String(p.nextNo ?? ""), acPayee: !!p.acPayeeDefault,
          ...(pay && { payee: pay.payee || "", manufacturerId: pay.manufacturer_id || null, otherPayee: false, amount: pay.amount || "" }),
        }));
        if (pay?.pos?.length) setLinks(pay.pos.map((po) => ({ po, amount: Math.max(0, po.owed - po.paid).toFixed(2), own: 0 })));
      } catch (e) {
        setError(e.message || "Could not load cheque layouts");
      }
    })();
  }, []);

  // Saves a layout a moment after the last change to it.
  const saveNow = useCallback(async (id) => {
    delete timers.current[id];
    const p = profilesRef.current?.find((x) => x.id === id);
    if (!p) return;
    try {
      await apiFetch(`/admin/cheques/profiles/${id}`, { method: "PUT", body: JSON.stringify(toServer(p)) });
      if (!Object.keys(timers.current).length) setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);
  const updateProfile = useCallback((id, fn) => {
    setProfiles((ps) => ps.map((p) => (p.id === id ? fn(structuredClone(p)) : p)));
    setSaveState("saving");
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => saveNow(id), SAVE_DELAY);
  }, [saveNow]);
  // Leaving the page doesn't drop a change still waiting to be saved.
  useEffect(() => () => {
    for (const id of Object.keys(timers.current)) {
      clearTimeout(timers.current[id]);
      saveNow(Number(id));
    }
  }, [saveNow]);

  const p = profiles?.find((x) => x.id === activeId);
  const setActive = (fn) => updateProfile(activeId, fn);

  const switchProfile = (id) => {
    const np = profiles.find((x) => x.id === id);
    setActiveId(id);
    writeStore(ACTIVE_KEY, String(id));
    setForm((f) => ({ ...f, no: String(np.nextNo ?? ""), acPayee: !!np.acPayeeDefault }));
  };

  // ---- printing: the cheque goes into a portal that is all the page prints.
  useEffect(() => {
    if (!printJob) return;
    const done = () => setPrintJob(null);
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printJob]);

  const clearForm = (np = p) => {
    setForm({ no: String(np.nextNo ?? ""), date: today(), payee: "", partyCode: null, manufacturerId: null, otherPayee: false, amount: "", acPayee: !!np.acPayeeDefault, memo: "" });
    setLinks([]);
  };

  // Records a printed cheque in the register; printing goes ahead either way.
  const record = async (f, ls) => {
    if (!f.no.trim()) return say("Printed, but not added to the register: no cheque number", true);
    try {
      await apiFetch("/admin/cheques/register", {
        method: "POST",
        body: JSON.stringify({
          method: "cheque", bank: p.name, cheque_no: f.no.trim(), payment_date: f.date || null, payee: f.payee.trim(),
          amount: toCents(f.amount) / 100, status: "made", source: "print", cheque_profile_id: p.id,
          manufacturer_id: f.otherPayee ? null : f.manufacturerId, other_payee: f.otherPayee,
          allocations: ls.map((l) => ({ po_id: l.po.po_id, amount: Number(l.amount) || 0 })),
        }),
      });
      say(`Cheque ${f.no.trim()} added to the register${ls.length ? `, paying ${ls.length} PO${ls.length > 1 ? "s" : ""}` : ""}`);
    } catch (e) {
      say(`Printed, but not added to the register: ${e.message || "error"}`, true);
    }
  };

  const print = () => {
    if (!form.payee.trim()) return say(form.otherPayee ? "Enter a payee" : "Pick the manufacturer, or tick Other payee", true);
    if (!toCents(form.amount)) return say("Enter a valid amount", true);
    const split = links.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    if (split > toCents(form.amount) / 100 + 0.005) return say("The amounts split over the POs add up to more than the cheque", true);
    setPrintJob({ p, d: { ...form, payee: form.payee.trim() }, mode: "print" });
    record(form, links);
    const n = parseInt(form.no, 10);
    if (!isNaN(n) && n >= (p.nextNo || 0)) {
      setActive((q) => ({ ...q, nextNo: n + 1 }));
      clearForm({ ...p, nextNo: n + 1 });
    } else clearForm();
  };

  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>;
  if (!p) return <Loader />;

  const d = tab === "layout" && !toCents(form.amount) ? SAMPLE() : form;
  const { warn, cents } = fieldValues(p, form);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Cheques</h2>
          <p className="text-xs text-gray-400 mt-0.5">Write and print cheques on your bank&apos;s cheque leaf. Layouts are shared by every admin.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-gray-400"}`}>
            {saveState === "saving" ? "Saving layout…" : saveState === "saved" ? "Layout saved" : saveState === "error" ? "Could not save layout" : ""}
          </span>
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white">
            {[["write", "Write cheque"], ["layout", "Layout & bank"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm ${tab === k ? "bg-gray-900 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* min-w-0: the preview is drawn at full cheque size and scaled down,
          and must not widen the page past the screen */}
      <div className="grid gap-5 lg:grid-cols-[minmax(320px,430px)_minmax(0,1fr)] items-start">
        <div className="order-2 lg:order-1 min-w-0">
          {tab === "write" ? (
            <WritePanel
              profiles={profiles} p={p} form={form} setForm={setForm} cents={cents} warn={warn} inputs={inputs} links={links} setLinks={setLinks}
              onProfile={switchProfile} onPrint={print} onClear={() => clearForm()}
            />
          ) : (
            <LayoutPanel
              profiles={profiles} p={p} sel={sel} setSel={setSel} setActive={setActive} onProfile={switchProfile}
              onWarp={setWarpFile} onTest={() => setPrintJob({ p, d: SAMPLE(), mode: "test" })}
              onAdd={async (kind) => {
                try {
                  const base = kind === "dup" ? { ...structuredClone(p), name: p.name + " (copy)" } : makeProfile(kind);
                  const res = await apiFetch("/admin/cheques/profiles", { method: "POST", body: JSON.stringify({ profiles: [{ ...toServer(base), sort_order: profiles.length }] }) });
                  const np = fromServer(res.profiles[0]);
                  setProfiles((ps) => [...ps, np]);
                  setActiveId(np.id);
                  writeStore(ACTIVE_KEY, String(np.id));
                  say("Layout added");
                } catch (e) {
                  say(e.message || "Could not add layout", true);
                }
              }}
              onDelete={async () => {
                if (profiles.length < 2) return say("You need at least one layout", true);
                if (!confirm(`Delete layout "${p.name}"?`)) return;
                try {
                  clearTimeout(timers.current[p.id]);
                  delete timers.current[p.id];
                  await apiFetch(`/admin/cheques/profiles/${p.id}`, { method: "DELETE" });
                  const rest = profiles.filter((x) => x.id !== p.id);
                  setProfiles(rest);
                  switchProfile(rest[0].id);
                } catch (e) {
                  say(e.message || "Could not delete layout", true);
                }
              }}
            />
          )}
        </div>
        <div className="order-1 lg:order-2 lg:sticky lg:top-4 min-w-0">
          <Preview
            p={p} d={d} tab={tab} sel={sel} view={view}
            setView={(v) => {
              setView(v);
              writeStore(VIEW_KEY, v);
            }}
            onFieldPointerDown={(e, k) => {
              if (tab === "write") {
                inputs.current[{ words1: "amount", words2: "amount" }[k] || k]?.focus();
                return;
              }
              e.preventDefault();
              setSel(k);
              return k;
            }}
            moveField={(k, x, y) => setActive((q) => {
              q.fields[k].x = x;
              q.fields[k].y = y;
              return q;
            })}
          />
        </div>
      </div>

      {tab === "layout" && <ArrowKeys sel={sel} setActive={setActive} />}

      {warpFile && (
        <WarpModal
          file={warpFile} width={p.width} height={p.height}
          onDone={(bg) => {
            setActive((q) => ({ ...q, bg }));
            setWarpFile(null);
            say(`Cheque image straightened to ${p.width} × ${p.height} mm`);
          }}
          onCancel={(msg) => {
            setWarpFile(null);
            if (msg) say(msg, true);
          }}
        />
      )}

      {printJob && createPortal(<PrintRoot job={printJob} />, document.body)}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm text-white ${toast.err ? "bg-red-600" : "bg-gray-900"}`}>{toast.msg}</div>
      )}
    </>
  );
}

// ---- write -------------------------------------------------------------------

function WritePanel({ profiles, p, form, setForm, cents, warn, inputs, links, setLinks, onProfile, onPrint, onClear }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const ref = (k) => (el) => (inputs.current[k] = el);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <Field label="Bank / cheque layout">
        <select value={p.id} onChange={(e) => onProfile(Number(e.target.value))} className={inputCls}>
          {profiles.map((x) => (
            <option key={x.id} value={x.id}>{x.name}{x.account ? ` · ${x.account}` : ""}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cheque no.">
          <input value={form.no} onChange={set("no")} inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Date">
          <input ref={ref("date")} type="date" value={form.date} onChange={set("date")} className={inputCls} />
        </Field>
      </div>
      <Field label="Pay to">
        <ManufacturerPicker
          value={{ manufacturer_id: form.manufacturerId, payee: form.payee, other_payee: form.otherPayee }}
          onChange={(v) => setForm((f) => ({ ...f, manufacturerId: v.manufacturer_id, payee: v.payee, otherPayee: v.other_payee, partyCode: null }))}
          otherInput={
            <PayeeInput
              inputRef={ref("payee")} value={form.payee} partyCode={form.partyCode}
              onChange={(payee, partyCode) => setForm((f) => ({ ...f, payee, partyCode }))}
            />
          }
        />
      </Field>
      <Field label="Amount">
        <input ref={ref("amount")} value={form.amount} onChange={set("amount")} inputMode="decimal" placeholder="0.00" autoComplete="off" className={inputCls} />
      </Field>
      <Field label="Amount in words">
        <div className="min-h-10 px-3 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-sm text-gray-800">{cents ? amountWords(cents, p.lang) : "—"}</div>
      </Field>
      <Field label="Pays POs" hint="recorded with the cheque in the Cheque Register">
        <POPicker links={links} setLinks={setLinks} total={cents / 100} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-800 mb-3 cursor-pointer select-none">
        <input ref={ref("acpayee")} type="checkbox" checked={form.acPayee} onChange={set("acPayee")} />
        Account payee crossing (A/C PAYEE)
      </label>
      <Field label="Memo / notes" hint="printed only if the memo field is switched on in Layout">
        <input ref={ref("memo")} value={form.memo} onChange={set("memo")} autoComplete="off" className={inputCls} />
      </Field>
      <div className="flex flex-wrap gap-2 mt-1">
        <button onClick={onPrint} className={primaryCls}>Print cheque</button>
        <button onClick={onClear} className={btnCls}>Clear</button>
      </div>
      {warn.length > 0 && <div className="mt-3 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 text-sm">{warn.join(" ")}</div>}
      <p className="text-xs text-gray-400 mt-3">
        Printing adds the cheque to the Cheque Register and moves the next cheque no. on by one. In the print dialog set Margins: None, Scale: 100% and turn off headers and footers.
      </p>
    </div>
  );
}

const KIND_NAMES = { supplier: "Supplier", manufacturer: "Manufacturer", expense_vendor: "Vendor", staff: "Staff", customer: "Customer", other: "Other" };

// Payee box that suggests Marg ledger parties as you type; picking one
// fills the name Marg prints for it and remembers its party code.
function PayeeInput({ value, partyCode, onChange, inputRef }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef(null);
  const seq = useRef(0);

  const search = (text) => {
    clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setList([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const res = await apiFetch(`/admin/cheques/payees?search=${encodeURIComponent(text.trim())}`);
        if (n === seq.current) {
          setList(res.payees || []);
          setHi(0);
        }
      } catch {
        if (n === seq.current) setList([]);
      }
    }, 250);
  };
  const pick = (x) => {
    onChange(x.name, x.party_code);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        autoComplete="off"
        placeholder="Payee name — type to search Marg parties"
        className={inputCls}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(list.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(list[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {partyCode && <p className="text-xs text-gray-500 mt-1">Marg party <span className="font-medium text-gray-700">{partyCode}</span></p>}
      {open && list.length > 0 && !partyCode && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto text-sm">
          {list.map((x, i) => (
            <li
              key={x.party_code}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(x);
              }}
              onMouseEnter={() => setHi(i)}
              className={`px-3 py-2 cursor-pointer ${i === hi ? "bg-gray-100" : ""}`}
            >
              <span className="text-gray-900">{x.name}</span>
              <span className="block text-xs text-gray-400">
                {x.party_code}
                {x.city ? ` · ${x.city}` : ""} · {KIND_NAMES[x.kind] || x.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- layout ------------------------------------------------------------------

function LayoutPanel({ profiles, p, sel, setSel, setActive, onProfile, onAdd, onDelete, onWarp, onTest }) {
  const [preset, setPreset] = useState("bank:sbi");
  const f = p.fields[sel];
  // Inputs bound to a setting of the layout (path) or of the selected field (f:key).
  const val = (path) => (path.startsWith("f:") ? f[path.slice(2)] : getPath(p, path));
  const put = (path, v) =>
    setActive((q) => {
      if (path.startsWith("f:")) q.fields[sel][path.slice(2)] = v;
      else setPath(q, path, v);
      return q;
    });
  const text = (path, props) => <input value={val(path) ?? ""} onChange={(e) => put(path, e.target.value)} className={inputCls} {...props} />;
  const num = (path, step = 0.5, props) => <NumInput value={val(path)} step={step} onChange={(v) => put(path, v)} {...props} />;
  const check = (path, label) => (
    <label className="flex items-center gap-2 text-sm text-gray-800 mb-2 cursor-pointer select-none">
      <input type="checkbox" checked={!!val(path)} onChange={(e) => put(path, e.target.checked)} />
      {label}
    </label>
  );
  const select = (path, options) => (
    <select value={val(path) ?? ""} onChange={(e) => put(path, e.target.value)} className={inputCls}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <>
      <Card title="Bank layout">
        <Field label="Layout">
          <select value={p.id} onChange={(e) => onProfile(Number(e.target.value))} className={inputCls}>
            {profiles.map((x) => <option key={x.id} value={x.id}>{x.name}{x.account ? ` · ${x.account}` : ""}</option>)}
          </select>
        </Field>
        <Field label="New from preset">
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={inputCls}>
            <optgroup label="Indian banks (with cheque image)">
              {Object.entries(BANKS).map(([k, b]) => <option key={k} value={"bank:" + k}>{b.name}</option>)}
            </optgroup>
            {PRESET_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAdd(preset)} className={btnCls}>Add layout</button>
          <button onClick={() => onAdd("dup")} className={btnCls}>Duplicate</button>
          <button onClick={onDelete} className={`${btnCls} text-red-600`}>Delete</button>
        </div>
      </Card>

      <Card title="Details">
        <Field label="Layout name">{text("name")}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account label" hint="not printed">{text("account")}</Field>
          <Field label="Next cheque no.">{num("nextNo", 1)}</Field>
          <Field label="Cheque width (mm)">{num("width", 0.1)}</Field>
          <Field label="Cheque height (mm)">{num("height", 0.1)}</Field>
        </div>
        <Field label="Font">
          {select("fontFamily", [
            ["Arial, Helvetica, sans-serif", "Arial"], ["'Courier New', monospace", "Courier New"], ["'Times New Roman', serif", "Times New Roman"],
            ["Verdana, sans-serif", "Verdana"], ["Tahoma, sans-serif", "Tahoma"],
          ])}
        </Field>
        {check("acPayeeDefault", "A/C PAYEE ticked by default")}
        <Field label="Signatory label" hint='e.g. "For Moulins Pharma Pvt Ltd"'>{text("signLabelText")}</Field>
      </Card>

      <Card title="Field positions" note="drag in the preview, or use the arrow keys (Shift = 5 mm)">
        <Field label="Field">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
            {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {check("f:show", "Print this field")}
        <div className="grid grid-cols-3 gap-3">
          <Field label="X (mm)">{num("f:x")}</Field>
          <Field label="Y (mm)">{num("f:y")}</Field>
          <Field label="Width (mm)">{num("f:w")}</Field>
          <Field label="Font size (pt)">{num("f:size")}</Field>
          <Field label="Align">{select("f:align", [["left", "left"], ["center", "center"], ["right", "right"]])}</Field>
          <Field label="Rotate (°)">{num("f:rot", 1)}</Field>
        </div>
      </Card>

      <Card title="Amount & date format">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number system">{select("lang.system", [["indian", "Indian (lakh, crore)"], ["intl", "International (million)"]])}</Field>
          <Field label="Figures decimals">{select("lang.decimals", [["auto", "Only if paise"], ["always", "Always"]])}</Field>
        </div>
        <Field label="Words template — {major}, {minorPart}, {minor}, {cents}">{text("lang.wordsTemplate")}</Field>
        <Field label="Paise template (used when paise ≠ 0) — {minor}, {cents}">{text("lang.minorTemplate")}</Field>
        <Field label="Figures template — {amount}">{text("lang.amountTemplate")}</Field>
        {check("lang.upper", "UPPERCASE words")}
        {check("lang.hyphen", "Hyphenate (Twenty-Five)")}
        {check("lang.useAnd", 'Use "and" after hundred (One Hundred and Five)')}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date format">{text("date.format", { placeholder: "DDMMYYYY" })}</Field>
          <Field label="Box pitch (mm)">{num("date.pitch", 0.1)}</Field>
        </div>
        {check("date.boxed", "Print date into boxes (one digit per box)")}
      </Card>

      <Card title="Scanned cheque background" note="preview only, never printed">
        <Field label="Upload a photo or scan of your blank cheque">
          <input
            type="file" accept="image/*" className="text-sm text-gray-700"
            onChange={(e) => {
              if (e.target.files[0]) onWarp(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </Field>
        <Field label="Opacity">
          <input type="range" min="0.1" max="1" step="0.05" value={p.bgOpacity ?? 0.5} onChange={(e) => put("bgOpacity", Number(e.target.value))} className="w-full" />
        </Field>
        <button onClick={() => put("bg", null)} className={btnCls}>Remove background</button>
        <p className="text-xs text-gray-400 mt-2">
          After uploading, click the cheque&apos;s 4 corners and the photo is straightened and stretched to the exact cheque size, so any angle works. Then drag each field onto its line.
        </p>
      </Card>

      <Card title="Printing">
        <Field label="Paper">
          {select("pageMode", [["cheque", "Cheque-sized page (feed cheque directly)"], ["a4", "A4 sheet (cheque placed at offset)"], ["letter", "US Letter sheet (cheque placed at offset)"]])}
        </Field>
        <Field label="Cheque goes into the printer" hint="the offsets are to the turned cheque's top-left corner">
          {select("orient", [["h", "Lying flat (horizontal)"], ["left", "Upright, top edge on the left"], ["right", "Upright, top edge on the right"]])}
        </Field>
        {check("feedCentre", "Centre the cheque left to right on the sheet")}
        <div className="grid grid-cols-2 gap-3">
          {!p.feedCentre && <Field label="Cheque offset X on sheet (mm)">{num("feedX")}</Field>}
          <Field label="Cheque offset Y on sheet (mm)">{num("feedY")}</Field>
          <Field label="Printer calibration X (mm)">{num("calX")}</Field>
          <Field label="Printer calibration Y (mm)">{num("calY")}</Field>
        </div>
        <Field label="Printer scale (%)" hint="if the printer shrinks the page, e.g. 97.6 when prints come out 97.6% of real size">{num("printScale", 0.1)}</Field>
        <button onClick={onTest} className={btnCls}>Print alignment test</button>
        <p className="text-xs text-gray-400 mt-2">
          In the print dialog set <b>Margins: None</b>, <b>Scale: 100%</b> and turn off headers/footers. Print the test on plain paper and hold it over a real cheque against the light. If everything is shifted, change the calibration. If only one field is off, move that field.
        </p>
      </Card>
    </>
  );
}

// Moves the selected field with the arrow keys (Shift = 5 mm).
function ArrowKeys({ sel, setActive }) {
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : 0.5;
      setActive((q) => {
        const f = q.fields[sel];
        f.x = +(f.x + d[0] * step).toFixed(1);
        f.y = +(f.y + d[1] * step).toFixed(1);
        return q;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel, setActive]);
  return null;
}

// ---- preview -----------------------------------------------------------------

function Preview({ p, d, tab, sel, view, setView, onFieldPointerDown, moveField }) {
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWrapW(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // the cheque view can be turned in 90° steps (on screen only — printing
  // follows the layout's printer setting)
  const [rot, setRot] = useState(() => (typeof window === "undefined" ? 0 : Number(readStore(ROT_KEY, 0)) || 0));
  const turnPreview = () => {
    const r = (rot + 90) % 360;
    setRot(r);
    writeStore(ROT_KEY, String(r));
  };

  const sheet = view === "sheet", letter = p.pageMode === "letter";
  const turned = !sheet && rot % 180 !== 0;
  const [w, h] = sheet ? (letter ? [215.9, 279.4] : [210, 297]) : turned ? [p.height, p.width] : [p.width, p.height];
  const scale = wrapW ? Math.min(1.6, (wrapW - 2) / (w * MM), sheet || turned ? 640 / (h * MM) : Infinity) : 1;

  const down = (e, k) => {
    if (onFieldPointerDown(e, k) !== k) return;
    const f = p.fields[k], start = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y }, k2 = MM * scale;
    const round = (v) => Math.round(v * 2) / 2;
    // a drag on screen, turned back into the cheque's own directions
    const a = (-rot * Math.PI) / 180, cos = Math.round(Math.cos(a)), sin = Math.round(Math.sin(a));
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / k2, dy = (ev.clientY - start.y) / k2;
      moveField(k, round(start.fx + dx * cos - dy * sin), round(start.fy + dx * sin + dy * cos));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // fields are dragged in the flat cheque view; on the sheet the cheque may
  // be turned, so dragging there is off
  const cheque = sheet ? (
    <OnSheet p={p} left={feedAt(p)[0] + p.calX} top={feedAt(p)[1] + p.calY}>
      <ChequeView p={p} d={d} mode="preview" />
    </OnSheet>
  ) : (
    <div style={{ transformOrigin: "0 0", transform: { 90: `translateX(${p.height}mm) rotate(90deg)`, 180: `translate(${p.width}mm, ${p.height}mm) rotate(180deg)`, 270: `translateY(${p.width}mm) rotate(270deg)` }[rot] }}>
      <ChequeView p={p} d={d} mode="preview" sel={tab === "layout" ? sel : null} onFieldPointerDown={down} />
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
        <div className="flex items-center gap-2">
          {!sheet && (
            <button onClick={turnPreview} title="Turn the preview 90° clockwise" className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              ↻ Rotate{rot ? ` (${rot}°)` : ""}
            </button>
          )}
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
            {[["cheque", "Cheque"], ["sheet", letter ? "On Letter sheet" : "On A4 sheet"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`px-3 py-1 text-xs ${view === k ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div ref={wrapRef} className="relative overflow-hidden" style={{ height: h * MM * scale + 2 }}>
        <div
          style={{
            width: `${w}mm`, height: `${h}mm`, transform: `scale(${scale})`, transformOrigin: "0 0",
            marginLeft: Math.max(0, (wrapW - w * MM * scale) / 2),
          }}
          className={sheet ? "relative bg-white shadow-[0_0_0_1px_#c9ced8,0_2px_12px_rgba(0,0,0,.08)]" : ""}
        >
          {cheque}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {sheet
          ? `${letter ? "US Letter" : "A4"} sheet (${w} × ${h} mm) · cheque ${p.width} × ${p.height} mm${upright(p) ? ", upright" : ""}${p.feedCentre ? ", centred" : ""} at ${+(feedAt(p)[0] + p.calX).toFixed(2)}, ${+(feedAt(p)[1] + p.calY).toFixed(2)} mm from top-left${p.pageMode === "cheque" ? " · paper is set to cheque-sized, so this view is only for reference" : ""}`
          : `${p.width} × ${p.height} mm`}
        {sheet ? "" : tab === "layout" ? " · drag fields to position them" : " · click a field to edit it"}
      </p>
    </div>
  );
}

// The only thing on the page when printing: the cheque at its real size,
// placed where the layout's paper, offsets and calibration put it.
function PrintRoot({ job }) {
  const { p, d, mode } = job;
  const [pw, ph] = upright(p) ? [p.height, p.width] : [p.width, p.height];
  const page = p.pageMode === "cheque" ? `${pw}mm ${ph}mm` : p.pageMode === "a4" ? "A4" : "letter";
  const onSheet = p.pageMode !== "cheque";
  return (
    <div id="cheque-print-root">
      <style>{`
        @page { size: ${page}; margin: 0; }
        @media screen { #cheque-print-root { display: none; } }
        @media print {
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          body > *:not(#cheque-print-root) { display: none !important; }
          #cheque-print-root { display: block; position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {/* enlarged by as much as the printer shrinks, so it comes out 1:1 */}
      <div style={{ transformOrigin: "0 0", transform: p.printScale && p.printScale !== 100 ? `scale(${100 / p.printScale})` : undefined }}>
        <OnSheet p={p} left={(onSheet ? feedAt(p)[0] : 0) + p.calX} top={(onSheet ? feedAt(p)[1] : 0) + p.calY}>
          <ChequeView p={p} d={d} mode={mode} />
        </OnSheet>
      </div>
    </div>
  );
}

const upright = (p) => p.orient === "left" || p.orient === "right";

const SHEETS = { a4: [210, 297], letter: [215.9, 279.4] };
// Where the cheque's top-left corner sits on the sheet, in mm, before
// printer calibration: the set offsets, or centred left to right at the
// set offset from the top.
function feedAt(p) {
  if (!p.feedCentre) return [p.feedX, p.feedY];
  const sw = (SHEETS[p.pageMode] || SHEETS.a4)[0];
  return [(sw - (upright(p) ? p.height : p.width)) / 2, p.feedY];
}

// Places the cheque with its top-left corner `left`, `top` mm from the
// paper's, turned the way it goes into the printer. Upright with the top
// edge on the left, the cheque reads bottom to top; on the right, top to
// bottom.
function OnSheet({ p, left, top, children }) {
  const turn = p.orient === "left" ? { top: `${p.width}mm`, transform: "rotate(-90deg)" }
    : p.orient === "right" ? { left: `${p.height}mm`, transform: "rotate(90deg)" } : null;
  const [w, h] = upright(p) ? [p.height, p.width] : [p.width, p.height];
  return (
    <div style={{ position: "absolute", left: `${left}mm`, top: `${top}mm`, width: `${w}mm`, height: `${h}mm` }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", ...turn }}>{children}</div>
    </div>
  );
}

// ---- small parts -------------------------------------------------------------

function Card({ title, note, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {title}
        {note && <span className="font-normal text-gray-400"> — {note}</span>}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-500 mb-1">
        {label}
        {hint && <span className="text-gray-400"> ({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// A number box that lets "12." or "" be typed on the way to a number: it
// shows the draft while focused and the saved value otherwise.
function NumInput({ value, onChange, step }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      type="number"
      step={step}
      value={draft ?? (value ?? "")}
      onFocus={() => setDraft(String(value ?? ""))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && isFinite(n)) onChange(n);
      }}
      className={inputCls}
    />
  );
}
