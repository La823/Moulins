"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { visibleImages } from "@/lib/productImages";

// Divisible by 2/3/4/6 so the grid's last row stays full at every breakpoint.
const PRODUCTS_PER_PAGE = 36;

// Lets staff place an order on behalf of a customer (partner) — mirrors the
// customer's own checkout flow (items + notes + transport), but the
// customer is picked explicitly instead of taken from the logged-in user.
export default function NewOrderForStaffPage() {
  const router = useRouter();

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const customerBoxRef = useRef(null);

  // Product browser — the full catalog, paginated, narrowed by the search
  // box. Staff placing an order for a customer over the phone generally
  // don't know the exact product name to type, so browsing the actual
  // catalog with pictures beats a search-only dropdown.
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Order being built
  const [items, setItems] = useState([]); // [{product_id, product_name, quantity}]
  const [notes, setNotes] = useState("");
  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState("");
  const [transports, setTransports] = useState([]);
  const [transportId, setTransportId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onClickOutside(e) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target))
        setShowCustomerResults(false);
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
    if (!transportMode) {
      setTransports([]);
      setTransportId("");
      return;
    }
    apiFetch(`/transports?mode=${encodeURIComponent(transportMode)}`)
      .then((data) => setTransports(data || []))
      .catch(() => setTransports([]));
    setTransportId("");
  }, [transportMode]);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(
        `/admin/orders/customers/search?q=${encodeURIComponent(customerQuery.trim())}`,
      )
        .then((data) => setCustomerResults(data || []))
        .catch(() => setCustomerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery]);

  // A new search starts back at page 1 — otherwise searching while on page 7
  // lands on an empty page of a much shorter result set.
  useEffect(() => {
    setProductPage(1);
  }, [productQuery]);

  useEffect(() => {
    const q = productQuery.trim();
    setLoadingProducts(true);
    const t = setTimeout(() => {
      apiFetch(
        `/admin/products?search=${encodeURIComponent(q)}&page=${productPage}&limit=${PRODUCTS_PER_PAGE}`,
      )
        .then((data) => {
          setProductResults(data.products || []);
          setProductTotalPages(data.total_pages || 1);
          setProductTotal(data.total || 0);
        })
        .catch(() => {
          setProductResults([]);
          setProductTotalPages(1);
          setProductTotal(0);
        })
        .finally(() => setLoadingProducts(false));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery, productPage]);

  function pickCustomer(c) {
    setSelectedCustomer(c);
    setCustomerQuery("");
    setCustomerResults([]);
    setShowCustomerResults(false);
  }

  // Quantities move in whole multiples of the product's minimum order
  // quantity, so a product sold in boxes of 10 never ends up on the order
  // as 7. Products with no MOQ set fall back to a step of 1.
  function stepFor(product) {
    const moq = Number(product?.moq);
    return Number.isFinite(moq) && moq > 0 ? moq : 1;
  }

  // Rounds UP to the next whole multiple of step. Anything unparseable or
  // below one MOQ becomes exactly one MOQ.
  function snapUp(qty, step) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n < 1) return step;
    return Math.ceil(n / step) * step;
  }

  function addItem(product) {
    const step = stepFor(product);
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        // +1 then snap up, so an off-multiple quantity (typed before it was
        // snapped) climbs to the next clean multiple rather than staying
        // off-grid: 15 -> 20, and 20 -> 30.
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: snapUp(Number(i.quantity) + 1, step) }
            : i,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: step,
          step,
        },
      ];
    });
    // The grid and the search term deliberately stay put — staff usually add
    // several products in a row, and clearing the browse state after every
    // click would send them back to page 1 each time.
  }

  // Removes the item entirely once one more decrement would drop it below a
  // single MOQ — leaving a 0-quantity row behind would just fail validation
  // on submit.
  function subtractItem(product) {
    const step = stepFor(product);
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (!existing) return prev;
      // Mirror of addItem: step down to the next clean multiple below the
      // current value, so 15 -> 10 and 20 -> 10.
      const next = Math.floor((Number(existing.quantity) - 1) / step) * step;
      if (next < step) return prev.filter((i) => i.product_id !== product.id);
      return prev.map((i) =>
        i.product_id === product.id ? { ...i, quantity: next } : i,
      );
    });
  }

  // Held raw (possibly "" or an off-multiple number) while the field has
  // focus — snapping on every keystroke would rewrite "1" to a full MOQ
  // before the "5" of "15" is even typed. snapItemQuantity runs on blur.
  function setItemQuantity(productId, qty) {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId ? { ...i, quantity: qty } : i,
      ),
    );
  }

  function snapItemQuantity(productId) {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: snapUp(i.quantity, i.step || 1) }
          : i,
      ),
    );
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  async function handleSubmit() {
    setError("");
    if (!selectedCustomer) {
      setError("Pick a customer first.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product.");
      return;
    }
    // Final snap before sending: a field left focused and empty never got
    // its blur, so this is the one place guaranteed to run. It also makes
    // the payload numeric — `quantity` can be "" while being edited.
    const payloadItems = items.map(
      ({ product_id, product_name, quantity, step }) => ({
        product_id,
        product_name,
        quantity: snapUp(quantity, step || 1),
      }),
    );
    setItems((prev) =>
      prev.map((i) => ({ ...i, quantity: snapUp(i.quantity, i.step || 1) })),
    );

    setSubmitting(true);
    try {
      const res = await apiFetch("/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          // `step` is UI-only bookkeeping — don't send it to the API.
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

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Create Order on Behalf of a Customer
        </h2>
        <p className="text-sm text-gray-500">
          Pick a customer, add products, and place the order for them.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Form cards stay narrow — a single text field stretched across a
          27" monitor is harder to read, not easier. Only the product
          browser below actually benefits from the full width. */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 max-w-3xl">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Customer
        </label>
        {selectedCustomer ? (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-sm text-gray-800">
              <span className="font-medium">
                {selectedCustomer.username || "Unnamed"}
              </span>{" "}
              <span className="text-gray-500">
                {selectedCustomer.phone_number}
              </span>
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative" ref={customerBoxRef}>
            <input
              type="text"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              onFocus={() => setShowCustomerResults(true)}
              placeholder="Search by name or phone number…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {showCustomerResults && customerResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                {customerResults.map((c) => (
                  <li
                    key={c.id}
                    onMouseDown={() => pickCustomer(c)}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-800 flex items-center justify-between"
                  >
                    <span>{c.username || "Unnamed"}</span>
                    <span className="text-gray-400 text-xs">
                      {c.phone_number}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Catalog on the left, cart on the right — staff can see what they've
          already added while they keep browsing, rather than scrolling past
          the whole grid to check. The cart is second in the DOM via `order`
          rather than moved, so when this stacks into one column below lg it
          still lands below the grid. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4 items-start">
        <div className="order-2 bg-white border border-gray-200 rounded-xl p-4 lg:sticky lg:top-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Order items{items.length > 0 ? ` (${items.length})` : ""}
          </label>
          {items.length > 0 ? (
            <div className="space-y-2 lg:max-h-[60vh] lg:overflow-y-auto">
              {items.map((i) => (
                <div
                  key={i.product_id}
                  className="border border-gray-200 rounded-lg px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-gray-800 leading-tight line-clamp-2">
                      {i.product_name}
                    </span>
                    <button
                      onClick={() => removeItem(i.product_id)}
                      className="text-gray-400 hover:text-red-600 text-xs flex-shrink-0 leading-none mt-0.5"
                    >
                      ✕
                    </button>
                  </div>
                  {/* min/step drive the native spinner; a typed value is
                      snapped up to the next multiple on blur (or Enter). */}
                  <input
                    type="number"
                    min={i.step || 1}
                    step={i.step || 1}
                    value={i.quantity}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = parseInt(raw, 10);
                      setItemQuantity(
                        i.product_id,
                        raw === "" || Number.isNaN(n) ? "" : n,
                      );
                    }}
                    onBlur={() => snapItemQuantity(i.product_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="mt-1.5 w-full px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Click a product to add it.</p>
          )}
        </div>

        <div className="order-1 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <label className="block text-xs font-medium text-gray-500">
              Add products
            </label>
            {!loadingProducts && (
              <span className="text-xs text-gray-400">
                {productTotal.toLocaleString("en-IN")} product
                {productTotal !== 1 ? "s" : ""}
                {productQuery.trim() ? " matching" : ""}
              </span>
            )}
          </div>

          <input
            type="text"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Search product name…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />

          <div className="mt-3">
            {loadingProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="border border-gray-100 rounded-lg p-2 animate-pulse"
                  >
                    <div className="w-full h-20 bg-gray-100 rounded" />
                    <div className="h-3 bg-gray-100 rounded mt-2" />
                    <div className="h-3 bg-gray-100 rounded mt-1 w-2/3" />
                  </div>
                ))}
              </div>
            ) : productResults.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                No products match “{productQuery.trim()}”.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {productResults.map((p) => {
                  const imgs = visibleImages(p.images);
                  const inCart = items.find((i) => i.product_id === p.id);
                  const step = stepFor(p);
                  return (
                    // A plain div, not a button: the +/- controls below are
                    // themselves buttons, and nesting a button inside a
                    // button is invalid HTML. The card's own click target is
                    // the inner button wrapping the image and name.
                    <div
                      key={p.id}
                      className={`group relative flex flex-col border rounded-lg transition hover:border-gray-400 hover:shadow-sm ${
                        inCart
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200"
                      }`}
                    >
                      {inCart && (
                        <span className="absolute top-1 right-1 z-10 bg-gray-900 text-white text-[10px] font-semibold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                          {inCart.quantity}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => addItem(p)}
                        title={
                          step > 1
                            ? `${p.name} — adds ${step} at a time`
                            : p.name
                        }
                        className="flex flex-col gap-2 p-2 text-left"
                      >
                        {imgs.length > 0 ? (
                          <img
                            src={imgs[0].image_url}
                            alt={p.name}
                            loading="lazy"
                            className="w-full h-20 object-contain"
                          />
                        ) : (
                          <div className="w-full h-20 bg-gray-50 rounded flex items-center justify-center text-[10px] text-gray-300">
                            No image
                          </div>
                        )}
                        <span className="text-xs text-gray-700 leading-tight line-clamp-2">
                          {p.name}
                        </span>
                      </button>

                      {/* Revealed on hover, and on keyboard focus too —
                          otherwise these controls would be unreachable
                          without a mouse. */}
                      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-md border border-gray-200 bg-white/95 px-1 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => subtractItem(p)}
                          disabled={!inCart}
                          aria-label={`Remove ${step} from ${p.name}`}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          −
                        </button>
                        <span className="text-[11px] text-gray-600 tabular-nums">
                          {inCart ? inCart.quantity : step > 1 ? `×${step}` : 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItem(p)}
                          aria-label={`Add ${step} of ${p.name}`}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {productTotalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setProductPage((n) => Math.max(1, n - 1))}
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
                onClick={() =>
                  setProductPage((n) => Math.min(productTotalPages, n + 1))
                }
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
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Transport mode (optional)
          </label>
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— Use customer's default —</option>
            {transportModes.map((m) => (
              <option key={m.id || m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {transportMode && transports.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Transport (optional)
            </label>
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
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Notes (optional)
          </label>
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
    </div>
  );
}
