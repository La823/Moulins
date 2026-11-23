"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ProductHistoryPanel } from "@/components/admin/MargRateHistory";

// Quotations: a register of prices quoted, one product per entry — who it
// was for (an existing customer, a new customer or a third party), the
// product, the price, remarks, when, and the staff account that gave it.
// Entry only: nothing else is made from a quotation. quotations_view sees
// the list; quotations_edit (and admins) add, change and remove entries.

const KINDS = [
  { value: "existing", label: "Existing customer" },
  { value: "new", label: "New customer" },
  { value: "third_party", label: "Third party" },
];
const KIND_STYLE = {
  existing: "bg-blue-50 text-blue-700",
  new: "bg-emerald-50 text-emerald-700",
  third_party: "bg-amber-50 text-amber-700",
};
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || k;

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (v) =>
  new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// "YYYY-MM-DDTHH:mm" in the browser's time, for a datetime-local box
const toLocalInput = (d) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

export default function QuotationsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | "new" | a quotation
  const [confirmDelete, setConfirmDelete] = useState(null); // id
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (search) p.set("search", search);
    if (kind) p.set("kind", kind);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return apiFetch(`/admin/quotations?${p}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message || "Could not load quotations"));
  }, [page, search, kind, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    try {
      await apiFetch(`/admin/quotations/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setNotice("Quotation removed");
      load();
    } catch (e) {
      setError(e.message || "Could not remove the quotation");
    }
  };

  const list = data?.quotations || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const filtered = search || kind || from || to;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Quotations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Prices quoted to customers and third parties, one product per entry.</p>
        </div>
        {data?.can_edit && (
          <button
            onClick={() => {
              setNotice("");
              setEditing("new");
            }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            + New quotation
          </button>
        )}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[14rem]">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Customer, product or remarks…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">For</label>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">Everyone</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        {filtered && (
          <button
            onClick={() => {
              setSearchInput("");
              setKind("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Clear
          </button>
        )}
      </div>

      {notice && <p className="text-sm text-green-700 mb-3">{notice}</p>}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {!data ? (
          <p className="p-6 text-sm text-gray-400">Loading…</p>
        ) : list.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">{filtered ? "No quotations match these filters." : "No quotations yet."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Date &amp; time</th>
                <th className="px-4 py-3">For</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3">Given by</th>
                {data.can_edit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{when(q.quoted_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{q.customer_name}</div>
                    <span className={`mt-1 inline-block text-[11px] px-2 py-0.5 rounded-full ${KIND_STYLE[q.customer_kind] || "bg-gray-100 text-gray-600"}`}>
                      {kindLabel(q.customer_kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{q.product_name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{money(q.rate)}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs whitespace-pre-wrap">{q.remarks || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.given_by_name || <span className="text-gray-300">—</span>}</td>
                  {data.can_edit && (
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {confirmDelete === q.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Remove?</span>
                          <button onClick={() => remove(q.id)} className="text-red-600 font-medium hover:underline">
                            Yes
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="text-gray-500 hover:underline">
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-3 text-xs">
                          <button
                            onClick={() => {
                              setNotice("");
                              setEditing(q);
                            }}
                            className="text-gray-600 hover:text-gray-900 hover:underline"
                          >
                            Edit
                          </button>
                          <button onClick={() => setConfirmDelete(q.id)} className="text-gray-400 hover:text-red-600 hover:underline">
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <span>
              {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300">
                Previous
              </button>
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-2 py-1 hover:text-gray-900 disabled:text-gray-300">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <QuotationForm
          quotation={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            load();
          }}
        />
      )}
    </>
  );
}

// The add / edit form, in a dialog.
function QuotationForm({ quotation, onClose, onSaved }) {
  const { user } = useAuth();
  const [kind, setKind] = useState(quotation?.customer_kind || "existing");
  const [customer, setCustomer] = useState(
    quotation?.customer_kind === "existing" && quotation.customer_id ? { id: quotation.customer_id, name: quotation.customer_name } : null,
  );
  const [customerName, setCustomerName] = useState(quotation && quotation.customer_kind !== "existing" ? quotation.customer_name : "");
  const [product, setProduct] = useState(quotation?.product_id ? { id: quotation.product_id, name: quotation.product_name } : null);
  const [rate, setRate] = useState(quotation ? String(quotation.rate) : "");
  const [quotedAt, setQuotedAt] = useState(toLocalInput(quotation?.quoted_at || new Date()));
  // "" until changed: then it is the logged-in account (once it's known)
  const [givenByPick, setGivenBy] = useState(quotation?.given_by || "");
  const givenBy = givenByPick || user?.id || "";
  const [remarks, setRemarks] = useState(quotation?.remarks || "");
  const [staff, setStaff] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The order page's sale history panel for the chosen product: with an
  // existing customer, their history with it; for a new customer or a third
  // party, the product's own (its last bills to anyone, purchases, batch
  // average selling price), asked for with no partner (the nil id).
  const NO_PARTNER = "00000000-0000-0000-0000-000000000000";
  const partnerId = kind === "existing" ? customer?.id || null : NO_PARTNER;
  const historyKey = product?.id && partnerId ? `${partnerId}/${product.id}` : null;
  const [histories, setHistories] = useState({}); // key -> rate-history response
  useEffect(() => {
    if (!historyKey || histories[historyKey]) return;
    let off = false;
    apiFetch(`/admin/partners/${partnerId}/rate-history?products=${product.id}`)
      .then((d) => !off && setHistories((h) => ({ ...h, [historyKey]: d })))
      .catch(() => !off && setHistories((h) => ({ ...h, [historyKey]: { unavailable: true, products: {} } })));
    return () => {
      off = true;
    };
  }, [historyKey, histories, partnerId, product?.id]);
  const historyData = historyKey ? histories[historyKey] || null : null;

  useEffect(() => {
    apiFetch("/admin/quotations/options?staff=1")
      .then((s) => setStaff(s || []))
      .catch(() => setStaff([]));
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const r = Number(String(rate).trim());
    if (String(rate).trim() === "" || !Number.isFinite(r) || r < 0) return setError("Enter the price quoted.");
    const body = {
      customer_kind: kind,
      customer_id: kind === "existing" ? customer?.id || null : null,
      customer_name: kind === "existing" ? "" : customerName,
      product_id: product?.id || null,
      rate: r,
      remarks,
      quoted_at: quotedAt ? new Date(quotedAt).toISOString() : null,
      given_by: givenBy || null,
    };
    setSaving(true);
    try {
      if (quotation) {
        await apiFetch(`/admin/quotations/${quotation.id}`, { method: "PUT", body: JSON.stringify(body) });
        onSaved("Quotation saved");
      } else {
        await apiFetch("/admin/quotations", { method: "POST", body: JSON.stringify(body) });
        onSaved("Quotation added");
      }
    } catch (err) {
      setError(err.message || "Could not save the quotation");
      setSaving(false);
    }
  };

  const field = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${product ? "max-w-5xl" : "max-w-lg"} my-8 flex flex-col lg:flex-row gap-4 items-start`}>
      <form onSubmit={save} className="w-full lg:max-w-lg bg-white rounded-xl shadow-2xl p-5 space-y-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{quotation ? "Edit quotation" : "New quotation"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1" aria-label="Close">
            ✕
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Quotation for</label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition ${kind === k.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {kind === "existing" ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer</label>
            <SearchPick value={customer} onChange={setCustomer} param="customers" placeholder="Search by name or phone…" autoFocus={!quotation} />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{kind === "new" ? "New customer's name" : "Third party's name"}</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={field} autoFocus={!quotation} />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Product</label>
          <SearchPick value={product} onChange={setProduct} param="products" placeholder="Search by name or salt…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Price quoted (₹)</label>
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Date &amp; time</label>
            <input type="datetime-local" value={quotedAt} onChange={(e) => setQuotedAt(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Given by</label>
          <select value={givenBy} onChange={(e) => setGivenBy(e.target.value)} className={`${field} bg-white`}>
            {staff.length === 0 && <option value={givenBy}>You</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === user?.id ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Remarks</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={field} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {saving ? "Saving…" : quotation ? "Save" : "Add quotation"}
          </button>
        </div>
      </form>
      {product && (
        <aside className="w-full lg:flex-1 min-w-0 bg-white rounded-xl shadow-2xl p-4 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
          {kind === "existing" && !customer ? (
            <p className="text-xs text-gray-400">Pick the customer to see their history with {product.name}.</p>
          ) : (
            <ProductHistoryPanel
              key={historyKey}
              productName={product.name}
              history={historyData?.products?.[product.id]}
              data={historyData}
              noParty={kind !== "existing"}
            />
          )}
        </aside>
      )}
      </div>
    </div>
  );
}

// A search box that picks one option (a customer or a product) from
// /admin/quotations/options?<param>=<typed>. Arrow keys and Enter work.
function SearchPick({ value, onChange, param, placeholder, autoFocus }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let off = false;
    const t = setTimeout(() => {
      apiFetch(`/admin/quotations/options?${param}=${encodeURIComponent(q.trim())}`)
        .then((d) => {
          if (off) return;
          setOptions(d || []);
          setActive(0);
        })
        .catch(() => !off && setOptions([]));
    }, 200);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [q, open, param]);

  useEffect(() => {
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (o) => {
    onChange(o);
    setQ("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
        <span className="text-gray-900 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-500 hover:text-gray-800 underline flex-shrink-0">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            pick(options[active]);
          }
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
          {options.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${i === active ? "bg-gray-100" : ""}`}
            >
              <div className="text-gray-900">{o.name}</div>
              {o.sub && <div className="text-xs text-gray-400 truncate">{o.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
