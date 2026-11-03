"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Choosing who a payment goes to: one of our manufacturers (searched by
// name, MFR code or Marg party code), or — ticked — someone else, typed in.
// Manufacturer names follow Marg's, so the name filled in is the one on the
// supplier's bills. Used by the cheque register and the cheque writer.

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";

let cache = null; // the manufacturer list, loaded once per page visit

// After a manufacturer changes (linked to Marg, renamed), the next picker reloads.
export function forgetManufacturers() {
  cache = null;
}

export function useManufacturers() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    if (cache) return;
    let off = false;
    apiFetch("/admin/cheques/suppliers")
      .then((r) => {
        cache = r.suppliers;
        if (!off) setList(cache);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  return list;
}

export const mfrLabel = (m) => `${m.code ? m.code + " · " : ""}${m.name}`;

// value: { manufacturer_id, payee, other_payee }; onChange gets the same shape.
// otherInput renders the free-text box for Other payee (defaults to a plain input).
export default function ManufacturerPicker({ value, onChange, otherInput }) {
  const list = useManufacturers();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const picked = list?.find((m) => m.id === value.manufacturer_id);

  const needle = q.trim().toLowerCase();
  const shown = !list || !needle ? [] : list.filter((m) =>
    m.name.toLowerCase().includes(needle) || (m.code || "").toLowerCase().includes(needle) ||
    m.marg_parties.some((p) => p.party_code.toLowerCase() === needle || p.name.toLowerCase().includes(needle))
  ).slice(0, 15);

  return (
    <div>
      {value.other_payee ? (
        otherInput || <input value={value.payee} onChange={(e) => onChange({ ...value, payee: e.target.value })} placeholder="Name on the cheque" className={inputCls} />
      ) : picked ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50">
          <div className="flex-1 min-w-0">
            <div className="text-gray-900 truncate">{picked.name}</div>
            <div className="text-xs text-gray-400">
              {picked.code}{picked.marg_parties.length ? ` · Marg ${picked.marg_parties.map((p) => p.party_code).join(", ")}` : " · not linked to Marg"}
            </div>
          </div>
          <button type="button" onClick={() => onChange({ ...value, manufacturer_id: null, payee: "" })} className="text-gray-400 hover:text-gray-700 px-1" title="Change">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={q}
            autoComplete="off"
            placeholder="Manufacturer — type name, MFR code or Marg code"
            className={inputCls}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {value.payee && <p className="text-xs text-amber-700 mt-1">Recorded as “{value.payee}” — pick the manufacturer it is.</p>}
          {open && shown.length > 0 && (
            <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto text-sm">
              {shown.map((m) => (
                <li
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ manufacturer_id: m.id, payee: m.name, other_payee: false });
                    setQ("");
                    setOpen(false);
                  }}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <span className="text-gray-900">{m.name}</span>
                  <span className="block text-xs text-gray-400">
                    {m.code}{m.marg_parties.length ? ` · Marg ${m.marg_parties.map((p) => p.party_code).join(", ")}` : ""}{m.marg_flag ? " · needs linking" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-600 mt-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!value.other_payee}
          onChange={(e) => onChange({ manufacturer_id: null, payee: e.target.checked ? value.payee : "", other_payee: e.target.checked })}
        />
        Other payee — not a manufacturer (rent, salary, services…)
      </label>
    </div>
  );
}
