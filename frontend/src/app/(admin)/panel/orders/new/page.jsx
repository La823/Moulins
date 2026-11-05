"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useRateHistory, RateHint } from "@/components/admin/MargRateHistory";
import ProductPicker, { entryBoxOpen, fmtExpiry, fmtStock, money, parseRate, snapNearest, usePastRatesDrawer } from "@/components/admin/orders/ProductPicker";

// Lets staff place an order on behalf of a customer (partner) — mirrors the
// customer's own checkout flow (items + notes + transport), but the
// customer is picked explicitly instead of taken from the logged-in user.
//
// Built for the keyboard, since staff take these orders over the phone:
// pick the customer with the arrows and Enter, then add products with the
// product browser (components/admin/orders/ProductPicker.jsx — the same one
// an existing order adds products with), and Ctrl+Enter places the order.
//
// An order not placed yet is a draft: saved by itself a moment after each
// change, listed for every staff member under "Unfinished orders", and
// deleted when the order is placed. ?draft=<id> in the address reopens one.

const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

export default function NewOrderForStaffPage() {
  const router = useRouter();

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [customerActive, setCustomerActive] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const customerBoxRef = useRef(null);
  const customerInputRef = useRef(null);

  const searchRef = useRef(null);

  // Order being built
  const [items, setItems] = useState([]); // [{product_id, product_name, quantity, step, rate, batch}]
  const cartIds = items.map((i) => i.product_id);
  const rateHistory = useRateHistory(selectedCustomer?.id, cartIds);
  const [notes, setNotes] = useState("");
  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState("");
  const [transports, setTransports] = useState([]);
  const [transportId, setTransportId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // The past rates drawer (open or not; the picker draws it)
  const [salesOpen, toggleSales] = usePastRatesDrawer();

  // Drafts
  const [draftId, setDraftId] = useState(null);
  const draftIdRef = useRef(null);
  const draftCreating = useRef(null); // the first save in flight, so a second can't make another draft
  const loadedSnapshot = useRef(""); // what was just loaded, so loading isn't saved straight back
  const [draftStatus, setDraftStatus] = useState(null); // {saving} | {at} | {error}
  const [drafts, setDrafts] = useState({ list: [], at: 0 }); // at: when listed, for "5 min ago"
  const [draftsLoad, setDraftsLoad] = useState(0);

  useEffect(() => {
    function onClickOutside(e) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target)) setShowCustomerResults(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    apiFetch("/transport-modes")
      .then((data) => setTransportModes(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!transportMode) return;
    let off = false;
    apiFetch(`/transports?mode=${encodeURIComponent(transportMode)}`)
      .then((data) => !off && setTransports(data || []))
      .catch(() => !off && setTransports([]));
    return () => {
      off = true;
    };
  }, [transportMode]);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/admin/orders/customers/search?q=${encodeURIComponent(customerQuery.trim())}`)
        .then((data) => {
          setCustomerResults(data || []);
          setCustomerActive(0);
        })
        .catch(() => setCustomerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery]);

  useEffect(() => {
    let off = false;
    apiFetch("/admin/order-drafts")
      .then((d) => !off && setDrafts({ list: d.drafts || [], at: Date.now() }))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [draftsLoad]);

  const snapshot = () =>
    JSON.stringify({
      customer: selectedCustomer ? { id: selectedCustomer.id, username: selectedCustomer.username, phone_number: selectedCustomer.phone_number } : null,
      items,
      notes,
      transportMode,
      transportId,
    });

  const setDraft = (id) => {
    draftIdRef.current = id;
    setDraftId(id);
    try {
      const u = new URL(window.location.href);
      if (id) u.searchParams.set("draft", id);
      else u.searchParams.delete("draft");
      window.history.replaceState(null, "", u);
    } catch {}
  };

  // Saves a moment after the last change, once there is a customer or an item.
  useEffect(() => {
    const snap = snapshot();
    if (snap === loadedSnapshot.current || (!selectedCustomer && items.length === 0)) return;
    const t = setTimeout(async () => {
      setDraftStatus({ saving: true });
      const body = JSON.stringify({ customer_id: selectedCustomer?.id || null, data: JSON.parse(snap), item_count: items.length });
      try {
        if (draftCreating.current) await draftCreating.current;
        if (draftIdRef.current) {
          await apiFetch(`/admin/order-drafts/${draftIdRef.current}`, { method: "PUT", body });
        } else {
          draftCreating.current = apiFetch("/admin/order-drafts", { method: "POST", body });
          const res = await draftCreating.current;
          draftCreating.current = null;
          setDraft(res.id);
        }
        loadedSnapshot.current = snap;
        setDraftStatus({ at: new Date() });
      } catch (e) {
        draftCreating.current = null;
        setDraftStatus({ error: e.message || "Could not save the draft" });
      }
    }, 1200);
    return () => clearTimeout(t);
    // snapshot() reads exactly these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, items, notes, transportMode, transportId]);

  const applyDraft = (d) => {
    const data = d.data || {};
    setSelectedCustomer(data.customer || null);
    setItems(data.items || []);
    setNotes(data.notes || "");
    setTransportMode(data.transportMode || "");
    setTransportId(data.transportId || "");
    loadedSnapshot.current = JSON.stringify({
      customer: data.customer || null,
      items: data.items || [],
      notes: data.notes || "",
      transportMode: data.transportMode || "",
      transportId: data.transportId || "",
    });
    setDraft(d.id);
    setDraftStatus({ at: new Date(d.updated_at) });
  };

  const openDraft = useCallback(async (id) => {
    try {
      applyDraft(await apiFetch(`/admin/order-drafts/${id}`));
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (e) {
      setError(e.message || "Could not open the draft");
      setDraft(null);
    }
    // applyDraft only sets state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?draft=<id> in the address reopens that draft
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("draft");
    if (!id) return;
    let off = false;
    (async () => {
      try {
        const d = await apiFetch(`/admin/order-drafts/${id}`);
        if (!off) applyDraft(d);
      } catch (e) {
        if (!off) setError(e.message || "Could not open the draft");
      }
    })();
    return () => {
      off = true;
    };
    // once, on opening the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newOrder = () => {
    setSelectedCustomer(null);
    setItems([]);
    setNotes("");
    setTransportMode("");
    setTransportId("");
    loadedSnapshot.current = "";
    setDraft(null);
    setDraftStatus(null);
    setDraftsLoad((n) => n + 1);
    setTimeout(() => customerInputRef.current?.focus(), 0);
  };

  const discardDraft = async (id) => {
    if (!window.confirm("Discard this unfinished order?")) return;
    try {
      await apiFetch(`/admin/order-drafts/${id}`, { method: "DELETE" });
      if (id === draftIdRef.current) newOrder();
      else setDraftsLoad((n) => n + 1);
    } catch (e) {
      setError(e.message || "Could not discard the draft");
    }
  };

  function pickCustomer(c) {
    setSelectedCustomer(c);
    setCustomerQuery("");
    setCustomerResults([]);
    setShowCustomerResults(false);
    // straight on to the products
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // a line from the product picker: added, or replacing the product's line
  const commitLine = ({ product, step, qty, rate, batch }) =>
    setItems((prev) => {
      const line = { product_id: product.id, product_name: product.name, quantity: qty, step, rate, batch };
      return prev.some((i) => i.product_id === product.id) ? prev.map((i) => (i.product_id === product.id ? { ...i, ...line } : i)) : [...prev, line];
    });

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  // "/" from anywhere jumps to the product search; Ctrl+Enter places the order
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !isTyping(document.activeElement) && !entryBoxOpen()) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function handleSubmit() {
    setError("");
    if (!selectedCustomer) {
      setError("Pick a customer first.");
      customerInputRef.current?.focus();
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product.");
      return;
    }
    const payloadItems = items.map(({ product_id, product_name, quantity, step, rate, batch }) => ({
      product_id,
      product_name,
      quantity: snapNearest(quantity, step || 1),
      rate: parseRate(rate),
      batch_code: batch?.code || null,
    }));
    setSubmitting(true);
    try {
      const res = await apiFetch("/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          items: payloadItems,
          notes: notes.trim() || null,
          transport_mode: transportMode || null,
          transport_id: transportId || null,
          draft_id: draftIdRef.current,
        }),
      });
      loadedSnapshot.current = snapshot(); // nothing left to save
      router.push(`/panel/orders/${res.order_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !entryBoxOpen()) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const cartTotal = items.reduce((s, i) => s + (parseRate(i.rate) ?? 0) * (Number(i.quantity) || 0), 0);
  const unpriced = items.filter((i) => parseRate(i.rate) == null).length;

  return (
    <div className={`p-6 ${salesOpen ? "lg:pr-[396px]" : ""}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Create Order on Behalf of a Customer</h2>
          <p className="text-sm text-gray-500">Pick a customer, add products, and place the order for them. Unfinished orders save themselves.</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {draftStatus?.saving && <span className="text-gray-400">Saving draft…</span>}
          {draftStatus?.at && <span className="text-gray-500">Draft saved {draftStatus.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
          {draftStatus?.error && <span className="text-red-600">{draftStatus.error}</span>}
          {(draftId || items.length > 0 || selectedCustomer) && (
            <button onClick={newOrder} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              + New order
            </button>
          )}
        </div>
      </div>

      <DraftsPanel drafts={drafts.list.filter((d) => d.id !== draftId)} now={drafts.at} onOpen={openDraft} onDiscard={discardDraft} />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 max-w-3xl">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer</label>
        {selectedCustomer ? (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-sm text-gray-800">
              <span className="font-medium">{selectedCustomer.username || "Unnamed"}</span>{" "}
              <span className="text-gray-500">{selectedCustomer.phone_number}</span>
            </div>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setTimeout(() => customerInputRef.current?.focus(), 0);
              }}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative" ref={customerBoxRef}>
            <input
              ref={customerInputRef}
              autoFocus
              type="text"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setShowCustomerResults(true);
              }}
              onFocus={() => setShowCustomerResults(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setShowCustomerResults(true);
                  setCustomerActive((a) => Math.min(a + 1, customerResults.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCustomerActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && customerResults[customerActive]) {
                  e.preventDefault();
                  pickCustomer(customerResults[customerActive]);
                } else if (e.key === "Escape") {
                  setShowCustomerResults(false);
                }
              }}
              placeholder="Search by name or phone number… (↑↓ to choose, Enter to pick)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {showCustomerResults && customerResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                {customerResults.map((c, i) => (
                  <li
                    key={c.id}
                    onMouseDown={() => pickCustomer(c)}
                    onMouseEnter={() => setCustomerActive(i)}
                    className={`px-3 py-2 cursor-pointer text-gray-800 flex items-center justify-between ${i === customerActive ? "bg-gray-100" : ""}`}
                  >
                    <span>{c.username || "Unnamed"}</span>
                    <span className="text-gray-400 text-xs">{c.phone_number}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Catalog on the left, cart on the right. The cart is second in the
          DOM via `order`, so when this stacks below lg it lands below. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4 items-start">
        <div className="order-2 bg-white border border-gray-200 rounded-xl p-4 lg:sticky lg:top-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">Order items{items.length > 0 ? ` (${items.length})` : ""}</label>
          {items.length > 0 ? (
            <>
              <div className="space-y-2 lg:max-h-[55vh] lg:overflow-y-auto">
                {items.map((i) => {
                  const r = parseRate(i.rate);
                  return (
                    <div key={i.product_id} className="border border-gray-200 rounded-lg px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-800 leading-tight line-clamp-2">{i.product_name}</span>
                        <button onClick={() => removeItem(i.product_id)} className="text-gray-400 hover:text-red-600 text-xs flex-shrink-0 leading-none mt-0.5">
                          ✕
                        </button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                        <input
                          type="number"
                          min={i.step || 1}
                          step={i.step || 1}
                          value={i.quantity}
                          title={i.step > 1 ? `Multiples of ${i.step}` : "Quantity"}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.product_id === i.product_id ? { ...x, quantity: e.target.value } : x)))}
                          onBlur={() => setItems((prev) => prev.map((x) => (x.product_id === i.product_id ? { ...x, quantity: snapNearest(x.quantity, x.step || 1) } : x)))}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                        <span className="text-xs text-gray-400">× ₹</span>
                        <input
                          inputMode="decimal"
                          value={i.rate ?? ""}
                          placeholder="rate"
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.product_id === i.product_id ? { ...x, rate: e.target.value } : x)))}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      </div>
                      {i.batch && (
                        <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                          Batch {i.batch.curbatch || "—"}
                          {fmtExpiry(i.batch.exp) ? ` · exp ${fmtExpiry(i.batch.exp)}` : ""} · stock {fmtStock(i.batch.stock)}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        {selectedCustomer ? <RateHint history={rateHistory?.products?.[i.product_id]} data={rateHistory} /> : <span />}
                        <span className={`text-xs tabular-nums ${r == null ? "text-amber-700" : "text-gray-700"}`}>
                          {r == null ? "no rate" : money(r * (Number(i.quantity) || 0))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-500">Total{unpriced ? ` (${unpriced} without a rate)` : ""}</span>
                <span className="font-semibold text-gray-900 tabular-nums">{money(cartTotal)}</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">Select a product and press Enter to add it.</p>
          )}
        </div>

        <div className="order-1 bg-white border border-gray-200 rounded-xl p-4">
          <ProductPicker
            customer={selectedCustomer}
            lines={items}
            onCommit={commitLine}
            onRemove={removeItem}
            searchRef={searchRef}
            drawerOpen={salesOpen}
            onToggleDrawer={toggleSales}
            hint="Ctrl+Enter places the order"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3 max-w-3xl">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Transport mode (optional)</label>
          <select
            value={transportMode}
            onChange={(e) => {
              setTransportMode(e.target.value);
              setTransports([]);
              setTransportId("");
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— Use customer&apos;s default —</option>
            {transportModes.map((m) => (
              <option key={m.id || m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {transportMode && transports.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Transport (optional)</label>
            <select
              value={transportId}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">— None —</option>
              {transports.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Place Order"}
      </button>
      <span className="ml-3 text-xs text-gray-400">or Ctrl+Enter</span>

    </div>
  );
}

// The unfinished orders, for anyone to pick up.
function DraftsPanel({ drafts, now, onOpen, onDiscard }) {
  if (!drafts.length) return null;
  const ago = (d) => {
    const m = Math.round((now - new Date(d).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  return (
    <details open className="bg-amber-50/60 border border-amber-200 rounded-xl px-4 py-3 mb-4 max-w-3xl">
      <summary className="cursor-pointer select-none text-sm font-medium text-amber-900">Unfinished orders ({drafts.length})</summary>
      <ul className="mt-2 divide-y divide-amber-100">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="font-medium text-gray-900">{d.customer_name || d.customer_phone || "No customer yet"}</span>
            <span className="text-xs text-gray-500">
              {d.item_count} item{d.item_count === 1 ? "" : "s"} · {d.updated_by || d.created_by || "staff"} · {ago(d.updated_at)}
            </span>
            <span className="ml-auto flex gap-2">
              <button onClick={() => onOpen(d.id)} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800">
                Continue
              </button>
              <button onClick={() => onDiscard(d.id)} className="px-3 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-white">
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
