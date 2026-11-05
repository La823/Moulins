"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// The product browser staff add products with — on the new-order page and
// on an existing order. Built for the keyboard, since orders are taken over
// the phone: type to search, arrows move through the products, Enter opens
// a quantity box (snapped to the nearest multiple of the MOQ), Enter again
// goes to the rate (the partner's most recent rate, else empty), Enter
// again to the batch (earliest expiry in stock first, ↑↓ to change), and a
// last Enter hands the line to the page (onCommit).
//
// Fast because nothing waits on the server: the whole catalogue with every
// live batch comes once, from Redis, so search and paging run in the
// browser; the partner's last rates come in one request. Only the grid
// shows pictures (small thumbnails) — the plain list, the default, loads no
// images at all.
//
// The past rates drawer (the "Past rates" button, or \ on the products)
// shows what the highlighted product was billed at to this customer, or if
// they have never had it, its latest bills to anyone; it follows the
// highlight. The page owns whether it is open (usePastRatesDrawer), so it
// can make room for it.

// Divisible by 2/3/4/6 so the grid's last row stays full at every breakpoint.
const GRID_PER_PAGE = 36;
const LIST_PER_PAGE = 60;
const VIEW_KEY = "staffOrder.view";
const SALES_KEY = "staffOrder.sales"; // the past rates drawer left open
const VIEWS = [
  ["grid", "Grid"],
  ["list-img", "List with pictures"],
  ["list", "List"],
];

export const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Quantities move in whole multiples of the product's minimum order
// quantity, so a product sold in boxes of 10 never ends up on the order as
// 7. Products with no MOQ set fall back to a step of 1.
export function stepFor(product) {
  const moq = Number(product?.moq);
  return Number.isFinite(moq) && moq > 0 ? moq : 1;
}

// The nearest whole multiple of step, and never less than one step:
// with an MOQ of 10, 14 → 10, 15 → 20, 3 → 10.
export function snapNearest(qty, step) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return step;
  return Math.max(step, Math.round(n / step) * step);
}

export const parseRate = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

// Whether the quantity → rate → batch box is open (for page-wide keys).
export const entryBoxOpen = () => typeof document !== "undefined" && !!document.querySelector("[data-entry-box]");

// The past rates drawer's open state, remembered between visits.
export function usePastRatesDrawer() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SALES_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(
    () =>
      setOpen((o) => {
        try {
          localStorage.setItem(SALES_KEY, o ? "0" : "1");
        } catch {}
        return !o;
      }),
    [],
  );
  return [open, toggle];
}

// lines: what is already on the order, [{product_id, quantity, rate, batch: {code}}]
// onCommit({product, step, qty, rate, batch}): a line entered (rate "" when left empty)
// onRemove(productId): Delete on a product that is on the order
export default function ProductPicker({ customer, lines, onCommit, onRemove, searchRef: outerSearchRef, drawerOpen, onToggleDrawer, hint, autoFocus }) {
  const [catalogue, setCatalogue] = useState(null); // {products, batches}
  const [catalogueError, setCatalogueError] = useState("");
  const [catalogueLoad, setCatalogueLoad] = useState(0); // bumped by Refresh
  const [productQuery, setProductQuery] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [view, setView] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return VIEWS.some(([k]) => k === v) ? v : "list";
    } catch {
      return "list";
    }
  });
  const [active, setActive] = useState(0); // highlighted product on the page
  const [entry, setEntry] = useState(null); // the product being entered: quantity, rate, batch
  // the partner's last rate for every product they have bought: {product_id: {rate, date, source}}
  const [rates, setRates] = useState({ for: null, rates: null });
  const ownSearchRef = useRef(null);
  const searchRef = outerSearchRef || ownSearchRef;
  const browserRef = useRef(null);
  const itemRefs = useRef([]);
  const lastRates = customer && rates.for === customer.id ? rates.rates : null;

  useEffect(() => {
    let off = false;
    apiFetch(`/admin/orders/quick-catalogue${catalogueLoad ? "?fresh=1" : ""}`)
      .then((d) => {
        if (off) return;
        setCatalogue({ products: d.products || [], batches: d.batches || {} });
        setCatalogueError("");
      })
      .catch((e) => !off && setCatalogueError(e.message || "Could not load the products"));
    return () => {
      off = true;
    };
  }, [catalogueLoad]);

  const customerId = customer?.id;
  useEffect(() => {
    if (!customerId) return;
    let off = false;
    apiFetch(`/admin/partners/${customerId}/last-rates`)
      .then((d) => !off && setRates({ for: customerId, rates: d.rates || {} }))
      .catch(() => !off && setRates({ for: customerId, rates: {} }));
    return () => {
      off = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus();
  }, [autoFocus, searchRef]);

  // Search: every word typed must appear in the name (or the Marg code).
  const filtered = useMemo(() => {
    const all = catalogue?.products || [];
    const words = productQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((p) => {
      const hay = `${p.name} ${p.marg_code || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [catalogue, productQuery]);
  const perPage = view === "grid" ? GRID_PER_PAGE : LIST_PER_PAGE;
  const productTotal = filtered.length;
  const productTotalPages = Math.max(1, Math.ceil(productTotal / perPage));
  const page = Math.min(productPage, productTotalPages);
  const productResults = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);
  const loadingProducts = !catalogue;

  // the highlighted product stays on screen while the keys are moving it
  useLayoutEffect(() => {
    if (document.activeElement === browserRef.current) itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, view, productResults]);

  const chooseView = (v) => {
    setView(v);
    setProductPage(1);
    setActive(0);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const focusBrowser = useCallback(() => browserRef.current?.focus(), []);

  // How many products sit in one row of the grid, measured from the cards
  // themselves so it is right at every breakpoint.
  const columns = () => {
    if (view !== "grid") return 1;
    const els = itemRefs.current.slice(0, productResults.length).filter(Boolean);
    if (els.length < 2) return 1;
    const top = els[0].offsetTop;
    const n = els.findIndex((el) => el.offsetTop !== top);
    return n === -1 ? els.length : n;
  };

  // land: where the highlight goes on the new page ("first" or "last")
  const goPage = (to, land) => {
    if (to < 1 || to > productTotalPages || to === page) return false;
    const onPage = Math.min(perPage, productTotal - (to - 1) * perPage);
    setProductPage(to);
    setActive(land === "last" ? Math.max(0, onPage - 1) : 0);
    return true;
  };

  const openEntry = (p) => {
    if (!p) return;
    const inCart = lines.find((i) => i.product_id === p.id);
    const last = lastRates?.[p.id]?.rate;
    const cartRate = inCart?.rate != null && inCart.rate !== "" ? inCart.rate : null;
    setEntry({
      product: p,
      step: stepFor(p),
      qty: String(inCart ? inCart.quantity : stepFor(p)),
      // no selling-price fallback: a product they haven't been charged for starts empty
      rate: cartRate != null ? String(cartRate) : last != null ? String(last) : "",
      rateFrom: cartRate != null ? "cart" : last != null ? "last" : null,
      batchCode: inCart?.batch?.code || null,
      inCart: !!inCart,
    });
  };

  const commitEntry = (qty, rate, batch) => {
    const { product, step } = entry;
    onCommit({ product, step, qty, rate, batch: batch ? { code: batch.code, curbatch: batch.curbatch, exp: batch.exp, stock: batch.stock } : null });
    setEntry(null);
    // on to the next product, ready for the next Enter
    setActive((a) => Math.min(a + 1, productResults.length - 1));
    setTimeout(focusBrowser, 0);
  };

  const closeEntry = () => {
    setEntry(null);
    setTimeout(focusBrowser, 0);
  };

  const onBrowserKey = (e) => {
    if (entry || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = productResults.length;
    const cols = columns();
    const move = (to) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(n - 1, to)));
    };
    switch (e.key) {
      case "ArrowRight":
        if (active === n - 1 && goPage(page + 1, "first")) return e.preventDefault();
        return move(active + 1);
      case "ArrowLeft":
        if (active === 0 && goPage(page - 1, "last")) return e.preventDefault();
        return move(active - 1);
      case "ArrowDown":
        if (active + cols > n - 1 && goPage(page + 1, "first")) return e.preventDefault();
        return move(active + cols);
      case "ArrowUp":
        if (active - cols < 0) {
          e.preventDefault();
          if (!goPage(page - 1, "last")) searchRef.current?.focus();
          return;
        }
        return move(active - cols);
      case "PageDown":
        e.preventDefault();
        goPage(page + 1, "first");
        return;
      case "PageUp":
        e.preventDefault();
        goPage(page - 1, "first");
        return;
      case "Home":
        return move(0);
      case "End":
        return move(n - 1);
      case "Enter":
        e.preventDefault();
        openEntry(productResults[active]);
        return;
      case "Delete":
        if (productResults[active] && onRemove && lines.some((l) => l.product_id === productResults[active].id)) {
          e.preventDefault();
          onRemove(productResults[active].id);
        }
        return;
      case "Escape":
        e.preventDefault();
        searchRef.current?.focus();
        return;
      case "\\":
        e.preventDefault();
        onToggleDrawer?.();
        return;
      default:
        // typing a letter or digit goes to the search box
        if (e.key.length === 1 && e.key !== " ") {
          e.preventDefault();
          setProductQuery((q) => q + e.key);
          setProductPage(1);
          setActive(0);
          searchRef.current?.focus();
        }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <label className="block text-xs font-medium text-gray-500">Add products</label>
        <div className="flex items-center gap-3">
          {!loadingProducts && (
            <span className="text-xs text-gray-400">
              {productTotal.toLocaleString("en-IN")} product{productTotal !== 1 ? "s" : ""}
              {productQuery.trim() ? " matching" : ""} ·{" "}
              <button type="button" onClick={() => setCatalogueLoad((n) => n + 1)} className="hover:text-gray-700 underline decoration-dotted" title="Reload products and stock now">
                refresh stock
              </button>
            </span>
          )}
          {onToggleDrawer && (
            <button
              type="button"
              onClick={onToggleDrawer}
              title="What the highlighted product was billed at before (\ on the products)"
              className={`px-2.5 py-1 text-xs border rounded-lg ${drawerOpen ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              Past rates
            </button>
          )}
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
            {VIEWS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => chooseView(k)}
                className={`px-2.5 py-1 text-xs ${view === k ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={searchRef}
        type="text"
        value={productQuery}
        onChange={(e) => {
          setProductQuery(e.target.value);
          setProductPage(1);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter") {
            e.preventDefault();
            setActive(0);
            focusBrowser();
          }
        }}
        placeholder="Search product name… (↓ or Enter to go to the products, / to come back)"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
      <p className="mt-1.5 text-[11px] text-gray-400">
        Arrows move · Enter adds (quantity → rate → batch, Enter each) · Delete removes · Page Up/Down change page{onToggleDrawer ? " · \\ past rates" : ""} · type to search
        {hint ? ` · ${hint}` : ""}
      </p>

      <div ref={browserRef} tabIndex={0} onKeyDown={onBrowserKey} className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
        {catalogueError ? (
          <p className="text-xs text-red-600 py-6 text-center">
            {catalogueError}{" "}
            <button type="button" onClick={() => setCatalogueLoad((n) => n + 1)} className="underline">
              Try again
            </button>
          </p>
        ) : loadingProducts ? (
          <p className="text-xs text-gray-400 py-6 text-center animate-pulse">Loading the products…</p>
        ) : productResults.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No products match “{productQuery.trim()}”.</p>
        ) : (
          <ProductList
            view={view}
            products={productResults}
            active={active}
            items={lines}
            lastRates={lastRates}
            itemsRef={itemRefs}
            onHover={setActive}
            onOpen={(i) => {
              setActive(i);
              openEntry(productResults[i]);
            }}
            dimmed={loadingProducts}
          />
        )}
      </div>

      {productTotalPages > 1 && (
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => goPage(page - 1, "first")}
            disabled={page <= 1}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500 tabular-nums">
            Page {page} of {productTotalPages}
          </span>
          <button
            type="button"
            onClick={() => goPage(page + 1, "first")}
            disabled={page >= productTotalPages}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}

      {drawerOpen && <RatesDrawer product={entry?.product || productResults[active] || null} customer={customer} onClose={onToggleDrawer} />}

      {entry && (
        <EntryBox
          entry={entry}
          last={lastRates?.[entry.product.id]}
          ratesLoading={!!customer && lastRates === null}
          batches={catalogue?.batches?.[entry.product.id] || []}
          onDone={commitEntry}
          onCancel={closeEntry}
        />
      )}
    </>
  );
}

// The products on one page, as a grid of cards or a list (with or without
// pictures). The highlighted one is what the arrow keys move and Enter adds.
function ProductList({ view, products, active, items, lastRates, itemsRef, onHover, onOpen, dimmed }) {
  const cart = Object.fromEntries(items.map((i) => [i.product_id, i]));
  const last = (p) => lastRates?.[p.id]?.rate;

  if (view === "grid") {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 ${dimmed ? "opacity-60" : ""}`}>
        {products.map((p, i) => {
          const inCart = cart[p.id];
          return (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              ref={(el) => (itemsRef.current[i] = el)}
              onMouseEnter={() => onHover(i)}
              onClick={() => onOpen(i)}
              className={`relative flex flex-col gap-2 p-2 text-left border rounded-lg transition ${
                i === active ? "ring-2 ring-blue-500 border-blue-500" : inCart ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              {inCart && (
                <span className="absolute top-1 right-1 z-10 bg-gray-900 text-white text-[10px] font-semibold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                  {inCart.quantity}
                </span>
              )}
              {p.thumb_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-20 object-contain" />
              ) : (
                <div className="w-full h-20 bg-gray-50 rounded flex items-center justify-center text-[10px] text-gray-300">No image</div>
              )}
              <span className="text-xs text-gray-700 leading-tight line-clamp-2">{p.name}</span>
              <span className="text-[10px] text-gray-400">
                MOQ {stepFor(p)}
                {last(p) != null ? ` · last ₹${last(p)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const pics = view === "list-img";
  return (
    <div className={`border border-gray-200 rounded-lg divide-y divide-gray-100 ${dimmed ? "opacity-60" : ""}`}>
      <div className="hidden sm:grid grid-cols-[1fr_70px_90px_80px] gap-2 px-3 py-1.5 text-[11px] text-gray-400 bg-gray-50">
        <span>Product</span>
        <span className="text-right">MOQ</span>
        <span className="text-right">Last rate</span>
        <span className="text-right">In order</span>
      </div>
      {products.map((p, i) => {
        const inCart = cart[p.id];
        return (
          <button
            key={p.id}
            type="button"
            tabIndex={-1}
            ref={(el) => (itemsRef.current[i] = el)}
            onMouseEnter={() => onHover(i)}
            onClick={() => onOpen(i)}
            className={`w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_70px_90px_80px] gap-2 items-center px-3 ${pics ? "py-1.5" : "py-1"} text-left text-sm ${
              i === active ? "bg-blue-50 outline outline-2 -outline-offset-2 outline-blue-500" : inCart ? "bg-gray-50" : "hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center gap-3 min-w-0">
              {pics &&
                (p.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb_url} alt="" loading="lazy" decoding="async" className="w-10 h-10 object-contain flex-shrink-0" />
                ) : (
                  <span className="w-10 h-10 bg-gray-50 rounded flex-shrink-0" />
                ))}
              <span className={`truncate ${p.is_active ? "text-gray-800" : "text-gray-400"}`}>{p.name}</span>
              {!p.is_active && <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1">inactive</span>}
            </span>
            <span className="hidden sm:block text-right text-xs text-gray-500 tabular-nums">{stepFor(p)}</span>
            <span className="hidden sm:block text-right text-xs text-gray-500 tabular-nums">{last(p) != null ? `₹${last(p)}` : "—"}</span>
            <span className={`text-right text-xs tabular-nums ${inCart ? "font-semibold text-gray-900" : "text-gray-300"}`}>{inCart ? inCart.quantity : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

// Marg's raw "YYYYMMDD" expiry, shown as "MM/YYYY".
export function fmtExpiry(raw) {
  const t = raw?.trim();
  if (!t || t.length !== 8) return t || "";
  return `${t.slice(4, 6)}/${t.slice(0, 4)}`;
}
export const fmtStock = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};
// a batch expiring within three months is worth flagging while choosing
const expiresSoon = (raw) => {
  const t = raw?.trim();
  if (!t || t.length !== 8) return false;
  const d = new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T00:00:00`);
  return d - Date.now() < 90 * 864e5;
};

// The quantity → rate → batch box. Enter on the quantity snaps it to the
// nearest multiple of the MOQ and moves to the rate; Enter on the rate moves
// to the batches (earliest expiry first, the first one in stock chosen);
// ↑↓ pick a batch and Enter adds the line. A product with no Marg batches
// skips the batch step.
function EntryBox({ entry, last, ratesLoading, batches, onDone, onCancel }) {
  const { product, step } = entry;
  const [qty, setQty] = useState(entry.qty);
  const [rate, setRate] = useState(entry.rate);
  const [rateTouched, setRateTouched] = useState(false);
  const [field, setField] = useState("qty"); // qty | rate | batch
  const [batchPick, setBatchPick] = useState(null); // index into batches
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const batchRef = useRef(null);
  // the partner's last rate can arrive after the box opens: use it if the
  // rate hasn't been typed yet and nothing better was there
  const shownRate = !rateTouched && entry.rateFrom !== "cart" && entry.rateFrom !== "last" && last?.rate != null ? String(last.rate) : rate;

  useEffect(() => {
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, []);


  // the batch already on the line, else the earliest-expiring one in stock
  const defaultPick = () => {
    if (!batches?.length) return -1;
    const own = entry.batchCode ? batches.findIndex((b) => b.code === entry.batchCode && b.stock > 0) : -1;
    return own >= 0 ? own : batches.findIndex((b) => b.stock > 0);
  };
  const chosen = batches?.[batchPick ?? defaultPick()];

  const snapped = snapNearest(qty, step);
  const toRate = () => {
    setQty(String(snapped));
    setField("rate");
    rateRef.current?.focus();
    rateRef.current?.select();
  };
  const done = () =>
    onDone(snapNearest(qty, step), parseRate(shownRate) == null ? "" : String(parseRate(shownRate)), chosen && chosen.stock > 0 ? chosen : null);
  const toBatch = () => {
    // nothing to choose from (not in Marg, or none in stock): add straight away
    if (batches && !batches.some((b) => b.stock > 0)) return done();
    setField("batch");
    batchRef.current?.focus();
  };
  const moveBatch = (dir) => {
    if (!batches?.length) return;
    let i = batchPick ?? defaultPick();
    for (let n = 0; n < batches.length; n++) {
      i = (i + dir + batches.length) % batches.length;
      if (batches[i].stock > 0) break;
    }
    setBatchPick(i);
  };

  return (
    <div data-entry-box className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-5"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">{product.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          MOQ {step}
          {product.mrp ? ` · MRP ₹${product.mrp}` : ""}
          {entry.inCart ? " · already in the order" : ""}
        </p>

        <label className="block text-xs font-medium text-gray-500 mt-4 mb-1">
          1 · Quantity {step > 1 && <span className="text-gray-400 font-normal">(multiples of {step})</span>}
        </label>
        <input
          ref={qtyRef}
          type="number"
          min={step}
          step={step}
          value={qty}
          onFocus={() => setField("qty")}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              toRate();
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
        {String(snapped) !== String(qty).trim() && qty !== "" && <p className="text-xs text-amber-700 mt-1">Will be {snapped}</p>}

        <label className="block text-xs font-medium text-gray-500 mt-3 mb-1">2 · Rate (₹ per unit)</label>
        <input
          ref={rateRef}
          inputMode="decimal"
          value={shownRate}
          placeholder="leave empty to price later"
          onFocus={() => setField("rate")}
          onChange={(e) => {
            setRateTouched(true);
            setRate(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              toBatch();
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          {last ? `Last charged ₹${last.rate}` : ratesLoading ? "Checking past rates…" : "Not bought by this partner"}
          {parseRate(shownRate) != null && ` · line ${money(parseRate(shownRate) * snapped)}`}
        </p>

        <div className="flex items-baseline justify-between mt-3 mb-1">
          <label className="text-xs font-medium text-gray-500">3 · Batch</label>
          {batches?.length > 0 && <span className="text-[11px] text-gray-400">↑↓ to choose · earliest expiry first</span>}
        </div>
        <div
          ref={batchRef}
          tabIndex={0}
          onFocus={() => setField("batch")}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              moveBatch(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              moveBatch(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              done();
            }
          }}
          className={`border rounded-lg max-h-44 overflow-y-auto outline-none ${field === "batch" ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300"}`}
        >
          {batches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No Marg batches for this product — it will go on the order without one.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_72px_64px_72px_72px] gap-2 px-3 py-1 text-[11px] text-gray-400 bg-gray-50 sticky top-0">
                <span>Batch</span>
                <span>Expiry</span>
                <span className="text-right">Stock</span>
                <span className="text-right">P. rate</span>
                <span className="text-right">MRP</span>
              </div>
              {batches.map((b) => {
                const on = chosen?.code === b.code;
                const out = !(b.stock > 0);
                return (
                  <button
                    key={b.code}
                    type="button"
                    tabIndex={-1}
                    disabled={out}
                    onClick={() => {
                      setBatchPick(batches.indexOf(b));
                      batchRef.current?.focus();
                    }}
                    className={`w-full grid grid-cols-[1fr_72px_64px_72px_72px] gap-2 px-3 py-1.5 text-left text-xs tabular-nums ${
                      on ? "bg-blue-50 text-gray-900 font-medium" : out ? "text-gray-300" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">
                      {on ? "● " : ""}
                      {b.curbatch || "—"}
                    </span>
                    <span className={!out && expiresSoon(b.exp) ? "text-amber-700" : ""}>{fmtExpiry(b.exp) || "—"}</span>
                    <span className="text-right">{out ? "out" : fmtStock(b.stock)}</span>
                    <span className="text-right">{b.prate ? `₹${b.prate}` : "—"}</span>
                    <span className="text-right">{b.mrp ? `₹${b.mrp}` : "—"}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
        {chosen && chosen.stock > 0 && snapped > chosen.stock && (
          <p className="text-xs text-amber-700 mt-1">
            Only {fmtStock(chosen.stock)} in batch {chosen.curbatch} — the rest would need another batch.
          </p>
        )}
        {batches && batches.length > 0 && !batches.some((b) => b.stock > 0) && <p className="text-xs text-amber-700 mt-1">No batch in stock.</p>}
        {chosen?.prate > 0 && parseRate(shownRate) != null && parseRate(shownRate) < chosen.prate && (
          <p className="text-xs text-red-600 mt-1">
            The rate ₹{parseRate(shownRate)} is below this batch&apos;s purchase rate ₹{chosen.prate}.
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button onClick={done} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            {entry.inCart ? "Update" : "Add to order"}
          </button>
          <button onClick={onCancel} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <span className="ml-auto text-[11px] text-gray-400">Enter · Esc</span>
        </div>
      </div>
    </div>
  );
}

// ---- the past rates drawer ---------------------------------------------------------

const num = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

// What the product was sold at before: to this customer, or — if they have
// never been billed for it — to anyone, latest first. It follows the
// highlighted product as the arrows move.
function RatesDrawer({ product, customer, onClose }) {
  const [results, setResults] = useState({}); // "product/customer" -> response, kept while the page is open
  const key = product ? `${product.id}/${customer?.id || ""}` : null;

  useEffect(() => {
    if (!key || results[key]) return;
    let off = false;
    const t = setTimeout(async () => {
      let d;
      try {
        const qs = customer ? `?partner=${customer.id}` : "";
        d = await apiFetch(`/admin/orders/product-rates/${product.id}${qs}`);
      } catch {
        d = { error: true };
      }
      if (!off) setResults((r) => ({ ...r, [key]: d }));
    }, 200);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [key, product, customer, results]);

  const data = key ? results[key] : null;
  const mine = data?.partner?.points || [];
  const recent = data?.recent || [];

  return (
    <aside className="fixed right-0 top-0 z-[60] h-full w-full max-w-[380px] bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Past rates</div>
          <div className="text-sm font-semibold text-gray-900 leading-snug">{product ? product.name : "Highlight a product"}</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1" title="Close (\)">
          ✕
        </button>
      </div>

      {product && (
        <div className="p-4">
          {!data ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
          ) : data.error ? (
            <p className="text-xs text-red-600">Could not load the rates.</p>
          ) : mine.length > 0 ? (
            <>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Billed to {customer.username || "this customer"}</h4>
              <p className="text-xs text-gray-500 mb-2">
                Last ₹{mine[0].rate} on {day(mine[0].date)}
                {data.partner.times > 1 && data.partner.min_rate != null && ` · ₹${data.partner.min_rate}–${data.partner.max_rate} over ${data.partner.times} times`}
              </p>
              <table className="w-full text-xs">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left font-normal py-1">Date</th>
                    <th className="text-left font-normal py-1">Bill / order</th>
                    <th className="text-right font-normal py-1">Qty</th>
                    <th className="text-right font-normal py-1">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 tabular-nums">
                  {mine.map((p, i) => (
                    <tr key={i}>
                      <td className="py-1.5">{day(p.date)}</td>
                      <td className="py-1.5 text-gray-500">{p.ref}</td>
                      <td className="py-1.5 text-right">
                        {num(p.qty)}
                        {p.free ? <span className="text-gray-400"> +{num(p.free)}</span> : null}
                      </td>
                      <td className="py-1.5 text-right font-medium text-gray-900">₹{num(p.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {customer ? "Not bought by this partner." : "Pick a customer to see their own rates."} Latest bills of this product to anyone:
              </p>
              {recent.length === 0 ? (
                <p className="text-xs text-gray-400">No sale bills for this product yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left font-normal py-1">Date · customer</th>
                      <th className="text-right font-normal py-1">Qty</th>
                      <th className="text-right font-normal py-1">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700 tabular-nums">
                    {recent.map((s, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1.5 pr-2">
                          <div className="text-gray-900">{s.customer}</div>
                          <div className="text-gray-400">
                            {day(s.date)} · {s.bill_no}
                          </div>
                        </td>
                        <td className="py-1.5 text-right">
                          {num(s.qty)}
                          {s.free ? <span className="text-gray-400"> +{num(s.free)}</span> : null}
                        </td>
                        <td className="py-1.5 text-right font-medium text-gray-900">₹{num(s.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
