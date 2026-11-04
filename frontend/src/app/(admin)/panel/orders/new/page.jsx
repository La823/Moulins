"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useRateHistory, RateHint } from "@/components/admin/MargRateHistory";
import { visibleImages } from "@/lib/productImages";

// Divisible by 2/3/4/6 so the grid's last row stays full at every breakpoint.
const PRODUCTS_PER_PAGE = 36;
const VIEW_KEY = "staffOrder.view";
const VIEWS = [
  ["grid", "Grid"],
  ["list-img", "List with pictures"],
  ["list", "List"],
];

// Lets staff place an order on behalf of a customer (partner) — mirrors the
// customer's own checkout flow (items + notes + transport), but the
// customer is picked explicitly instead of taken from the logged-in user.
//
// Built for the keyboard, since staff take these orders over the phone:
// pick the customer with the arrows and Enter, type to search, arrows move
// through the products, Enter opens a quantity box (snapped to the nearest
// multiple of the MOQ), Enter again goes to the rate (the partner's last
// rate, else the selling price), Enter again to the batch (earliest expiry
// in stock first, ↑↓ to change), and a last Enter puts it in the cart.

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Quantities move in whole multiples of the product's minimum order
// quantity, so a product sold in boxes of 10 never ends up on the order as
// 7. Products with no MOQ set fall back to a step of 1.
function stepFor(product) {
  const moq = Number(product?.moq);
  return Number.isFinite(moq) && moq > 0 ? moq : 1;
}

// The nearest whole multiple of step, and never less than one step:
// with an MOQ of 10, 14 → 10, 15 → 20, 3 → 10.
function snapNearest(qty, step) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return step;
  return Math.max(step, Math.round(n / step) * step);
}

const parseRate = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

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

  // Product browser — the full catalog, paginated, narrowed by the search box.
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [view, setView] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return VIEWS.some(([k]) => k === v) ? v : "grid";
    } catch {
      return "grid";
    }
  });
  const [active, setActive] = useState(0); // highlighted product on the page
  const [entry, setEntry] = useState(null); // the product being entered: quantity, then rate
  const searchRef = useRef(null);
  const browserRef = useRef(null);
  const itemRefs = useRef([]);
  // where the highlight goes once the next page arrives ("first" or "last")
  const landOn = useRef("first");

  // Order being built
  const [items, setItems] = useState([]); // [{product_id, product_name, quantity, step, rate, batch}]
  const cartIds = items.map((i) => i.product_id);
  const rateHistory = useRateHistory(selectedCustomer?.id, cartIds);
  // the partner's past rates for the products on screen, for the rate box
  const pageHistory = useRateHistory(selectedCustomer?.id, productResults.map((p) => p.id));
  const [notes, setNotes] = useState("");
  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState("");
  const [transports, setTransports] = useState([]);
  const [transportId, setTransportId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    const q = productQuery.trim();
    let off = false;
    const t = setTimeout(() => {
      setLoadingProducts(true);
      apiFetch(`/admin/products?search=${encodeURIComponent(q)}&page=${productPage}&limit=${PRODUCTS_PER_PAGE}`)
        .then((data) => {
          if (off) return;
          const list = data.products || [];
          setProductResults(list);
          setProductTotalPages(data.total_pages || 1);
          setProductTotal(data.total || 0);
          setActive(landOn.current === "last" ? Math.max(0, list.length - 1) : 0);
          landOn.current = "first";
        })
        .catch(() => {
          if (off) return;
          setProductResults([]);
          setProductTotalPages(1);
          setProductTotal(0);
        })
        .finally(() => !off && setLoadingProducts(false));
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [productQuery, productPage]);

  // the highlighted product stays on screen while the keys are moving it
  useLayoutEffect(() => {
    if (document.activeElement === browserRef.current) itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, view, productResults]);

  const chooseView = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  function pickCustomer(c) {
    setSelectedCustomer(c);
    setCustomerQuery("");
    setCustomerResults([]);
    setShowCustomerResults(false);
    // straight on to the products
    setTimeout(() => searchRef.current?.focus(), 0);
  }

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

  const goPage = (page, land) => {
    if (page < 1 || page > productTotalPages || page === productPage) return false;
    landOn.current = land;
    setProductPage(page);
    return true;
  };

  const openEntry = (p) => {
    if (!p) return;
    const inCart = items.find((i) => i.product_id === p.id);
    const last = pageHistory?.products?.[p.id]?.last?.rate;
    setEntry({
      product: p,
      step: stepFor(p),
      qty: String(inCart ? inCart.quantity : stepFor(p)),
      rate: inCart?.rate != null ? String(inCart.rate) : last != null ? String(last) : p.price ? String(p.price) : "",
      rateFrom: inCart?.rate != null ? "cart" : last != null ? "last" : p.price ? "price" : null,
      batchCode: inCart?.batch?.code || null,
      inCart: !!inCart,
    });
  };

  const commitEntry = (qty, rate, batch) => {
    const { product, step } = entry;
    setItems((prev) => {
      const line = {
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        step,
        rate,
        batch: batch ? { code: batch.code, curbatch: batch.curbatch, exp: batch.exp, stock: batch.stock } : null,
      };
      return prev.some((i) => i.product_id === product.id) ? prev.map((i) => (i.product_id === product.id ? { ...i, ...line } : i)) : [...prev, line];
    });
    setEntry(null);
    // on to the next product, ready for the next Enter
    setActive((a) => Math.min(a + 1, productResults.length - 1));
    setTimeout(focusBrowser, 0);
  };

  const closeEntry = () => {
    setEntry(null);
    setTimeout(focusBrowser, 0);
  };

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

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
        if (active === n - 1 && goPage(productPage + 1, "first")) return e.preventDefault();
        return move(active + 1);
      case "ArrowLeft":
        if (active === 0 && goPage(productPage - 1, "last")) return e.preventDefault();
        return move(active - 1);
      case "ArrowDown":
        if (active + cols > n - 1 && goPage(productPage + 1, "first")) return e.preventDefault();
        return move(active + cols);
      case "ArrowUp":
        if (active - cols < 0) {
          e.preventDefault();
          if (!goPage(productPage - 1, "last")) searchRef.current?.focus();
          return;
        }
        return move(active - cols);
      case "PageDown":
        e.preventDefault();
        goPage(productPage + 1, "first");
        return;
      case "PageUp":
        e.preventDefault();
        goPage(productPage - 1, "first");
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
        if (productResults[active]) {
          e.preventDefault();
          removeItem(productResults[active].id);
        }
        return;
      case "Escape":
        e.preventDefault();
        searchRef.current?.focus();
        return;
      default:
        // typing a letter or digit goes to the search box
        if (e.key.length === 1 && e.key !== " ") {
          e.preventDefault();
          setProductQuery((q) => q + e.key);
          setProductPage(1);
          searchRef.current?.focus();
        }
    }
  };

  // "/" from anywhere jumps to the product search; Ctrl+Enter places the order
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !isTyping(document.activeElement) && !entry) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [entry]);

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
        }),
      });
      router.push(`/panel/orders/${res.order_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !entry) {
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
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Create Order on Behalf of a Customer</h2>
        <p className="text-sm text-gray-500">Pick a customer, add products, and place the order for them.</p>
      </div>

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
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <label className="block text-xs font-medium text-gray-500">Add products</label>
            <div className="flex items-center gap-3">
              {!loadingProducts && (
                <span className="text-xs text-gray-400">
                  {productTotal.toLocaleString("en-IN")} product{productTotal !== 1 ? "s" : ""}
                  {productQuery.trim() ? " matching" : ""}
                </span>
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
            Arrows move · Enter adds (quantity → rate → batch, Enter each) · Delete removes · Page Up/Down change page · type to search · Ctrl+Enter places the order
          </p>

          <div ref={browserRef} tabIndex={0} onKeyDown={onBrowserKey} className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
            {loadingProducts && productResults.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-2 animate-pulse">
                    <div className="w-full h-20 bg-gray-100 rounded" />
                    <div className="h-3 bg-gray-100 rounded mt-2" />
                  </div>
                ))}
              </div>
            ) : productResults.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">No products match “{productQuery.trim()}”.</p>
            ) : (
              <ProductList
                view={view}
                products={productResults}
                active={active}
                items={items}
                history={pageHistory}
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
                onClick={() => goPage(productPage - 1, "first")}
                disabled={productPage <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-500 tabular-nums">
                Page {productPage} of {productTotalPages}
              </span>
              <button
                type="button"
                onClick={() => goPage(productPage + 1, "first")}
                disabled={productPage >= productTotalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
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

      {entry && <EntryBox entry={entry} history={pageHistory?.products?.[entry.product.id]} onDone={commitEntry} onCancel={closeEntry} />}
    </div>
  );
}

// The products on one page, as a grid of cards or a list (with or without
// pictures). The highlighted one is what the arrow keys move and Enter adds.
function ProductList({ view, products, active, items, history, itemsRef, onHover, onOpen, dimmed }) {
  const cart = Object.fromEntries(items.map((i) => [i.product_id, i]));
  const last = (p) => history?.products?.[p.id]?.last?.rate;

  if (view === "grid") {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 ${dimmed ? "opacity-60" : ""}`}>
        {products.map((p, i) => {
          const imgs = visibleImages(p.images);
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
              {imgs.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgs[0].image_url} alt={p.name} loading="lazy" className="w-full h-20 object-contain" />
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
      <div className="hidden sm:grid grid-cols-[1fr_70px_90px_90px_80px] gap-2 px-3 py-1.5 text-[11px] text-gray-400 bg-gray-50">
        <span>Product</span>
        <span className="text-right">MOQ</span>
        <span className="text-right">Selling price</span>
        <span className="text-right">Last rate</span>
        <span className="text-right">In order</span>
      </div>
      {products.map((p, i) => {
        const imgs = pics ? visibleImages(p.images) : [];
        const inCart = cart[p.id];
        return (
          <button
            key={p.id}
            type="button"
            tabIndex={-1}
            ref={(el) => (itemsRef.current[i] = el)}
            onMouseEnter={() => onHover(i)}
            onClick={() => onOpen(i)}
            className={`w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_70px_90px_90px_80px] gap-2 items-center px-3 ${pics ? "py-1.5" : "py-1"} text-left text-sm ${
              i === active ? "bg-blue-50 outline outline-2 -outline-offset-2 outline-blue-500" : inCart ? "bg-gray-50" : "hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center gap-3 min-w-0">
              {pics &&
                (imgs.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgs[0].image_url} alt="" loading="lazy" className="w-10 h-10 object-contain flex-shrink-0" />
                ) : (
                  <span className="w-10 h-10 bg-gray-50 rounded flex-shrink-0" />
                ))}
              <span className="truncate text-gray-800">{p.name}</span>
            </span>
            <span className="hidden sm:block text-right text-xs text-gray-500 tabular-nums">{stepFor(p)}</span>
            <span className="hidden sm:block text-right text-xs text-gray-500 tabular-nums">{p.price ? `₹${p.price}` : "—"}</span>
            <span className="hidden sm:block text-right text-xs text-gray-500 tabular-nums">{last(p) != null ? `₹${last(p)}` : "—"}</span>
            <span className={`text-right text-xs tabular-nums ${inCart ? "font-semibold text-gray-900" : "text-gray-300"}`}>{inCart ? inCart.quantity : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

// Marg's raw "YYYYMMDD" expiry, shown as "MM/YYYY".
function fmtExpiry(raw) {
  const t = raw?.trim();
  if (!t || t.length !== 8) return t || "";
  return `${t.slice(4, 6)}/${t.slice(0, 4)}`;
}
const fmtStock = (n) => {
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
function EntryBox({ entry, history, onDone, onCancel }) {
  const { product, step } = entry;
  const [qty, setQty] = useState(entry.qty);
  const [rate, setRate] = useState(entry.rate);
  const [rateTouched, setRateTouched] = useState(false);
  const [field, setField] = useState("qty"); // qty | rate | batch
  const [batches, setBatches] = useState(null); // null while loading
  const [batchPick, setBatchPick] = useState(null); // index into batches
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const batchRef = useRef(null);
  const last = history?.last;
  // the partner's last rate can arrive after the box opens: use it if the
  // rate hasn't been typed yet and nothing better was there
  const shownRate = !rateTouched && entry.rateFrom !== "cart" && entry.rateFrom !== "last" && last?.rate != null ? String(last.rate) : rate;

  useEffect(() => {
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, []);

  useEffect(() => {
    let off = false;
    apiFetch(`/admin/products/${product.id}/batches`)
      .then((d) => !off && setBatches(d.batches || []))
      .catch(() => !off && setBatches([]));
    return () => {
      off = true;
    };
  }, [product.id]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5"
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
          {last ? `Last charged ₹${last.rate}` : "Not bought by this partner"}
          {product.price ? ` · selling price ₹${product.price}` : ""}
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
          {batches === null ? (
            <p className="px-3 py-2 text-xs text-gray-400">Loading batches…</p>
          ) : batches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No Marg batches for this product — it will go on the order without one.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_80px_70px_70px] gap-2 px-3 py-1 text-[11px] text-gray-400 bg-gray-50 sticky top-0">
                <span>Batch</span>
                <span>Expiry</span>
                <span className="text-right">Stock</span>
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
                    className={`w-full grid grid-cols-[1fr_80px_70px_70px] gap-2 px-3 py-1.5 text-left text-xs tabular-nums ${
                      on ? "bg-blue-50 text-gray-900 font-medium" : out ? "text-gray-300" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">
                      {on ? "● " : ""}
                      {b.curbatch || "—"}
                    </span>
                    <span className={!out && expiresSoon(b.exp) ? "text-amber-700" : ""}>{fmtExpiry(b.exp) || "—"}</span>
                    <span className="text-right">{out ? "out" : fmtStock(b.stock)}</span>
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
