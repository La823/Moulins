"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { playSound } from "@/lib/sounds";
import OrderPlacedOverlay from "@/components/customer/OrderPlacedOverlay";
import { visibleImages, cardImageUrl } from "@/lib/productImages";

const modeLabel = (name) => `By ${name.charAt(0).toUpperCase()}${name.slice(1)}`;

export default function CheckoutPage() {
  const router = useRouter();
  const { items, itemCount, clearCart, clearCartLocal } = useCart();
  const { user } = useAuth();
  // A retailer or a doctor orders from their partner, not Moulins: no
  // transport or address, and the order goes to /retailer-orders.
  const isRetailer = user?.role === "retailer" || user?.role === "doctor";
  // Staff who can place orders (admins, employees with Orders (Edit)) order
  // for a partner from their cart: pick the customer, set a rate per line,
  // and it goes in as POST /admin/orders, like the panel's New order page.
  const forCustomer =
    user?.role === "admin" || (user?.role === "employee" && (user?.permissions || []).includes("orders_edit"));
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [customer, setCustomer] = useState(null); // {id, username, phone_number}
  const [rates, setRates] = useState({}); // product id -> typed rate
  const [notes, setNotes] = useState("");
  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState("courier");
  const [transportOptions, setTransportOptions] = useState([]);
  const [transportId, setTransportId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // after a successful order: the green "Order placed!" screen, then the order
  const [placed, setPlaced] = useState(null); // { href, message }
  const goToOrder = useCallback(() => router.push(placed?.href || "/orders"), [router, placed]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/transport-modes")
      .then((data) => setTransportModes(Array.isArray(data) ? data : []))
      .catch(() => setTransportModes([]));
  }, []);

  useEffect(() => {
    if (user?.default_transport_mode) setTransportMode(user.default_transport_mode);
  }, [user?.default_transport_mode]);

  useEffect(() => {
    setTransportId("");
    apiFetch(`/transports?mode=${transportMode}`)
      .then((data) => setTransportOptions(Array.isArray(data) ? data : []))
      .catch(() => setTransportOptions([]));
  }, [transportMode]);

  // partner search for the customer picker
  useEffect(() => {
    if (!forCustomer || customer) return;
    const q = customerQuery.trim();
    if (!q) return; // the box's onChange clears the results
    let off = false;
    const t = setTimeout(() => {
      apiFetch(`/admin/orders/customers/search?q=${encodeURIComponent(q)}`)
        .then((d) => !off && setCustomerResults(Array.isArray(d) ? d : []))
        .catch(() => !off && setCustomerResults([]));
    }, 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [forCustomer, customer, customerQuery]);

  // a typed rate: blank = none, otherwise a number of zero or more (NaN = invalid)
  const parseRate = (v) => {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const ratesTotal = items.reduce((s, i) => s + (parseRate(rates[i.product.id]) || 0) * i.quantity, 0);

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setError("");
    if (forCustomer) {
      if (!customer) {
        setError("Choose the customer this order is for.");
        return;
      }
      if (items.some((i) => Number.isNaN(parseRate(rates[i.product.id])))) {
        setError("A rate must be a number of zero or more, or left blank.");
        return;
      }
    }
    setSubmitting(true);

    try {
      if (forCustomer) {
        const res = await apiFetch("/admin/orders", {
          method: "POST",
          body: JSON.stringify({
            customer_id: customer.id,
            items: items.map((i) => {
              const rate = parseRate(rates[i.product.id]);
              return {
                product_id: i.product.id,
                product_name: i.product.name,
                quantity: i.quantity,
                ...(rate != null ? { rate } : {}),
              };
            }),
            notes: notes.trim() || undefined,
            transport_mode: transportMode,
            transport_id: transportId || undefined,
          }),
        });
        // the items came from the staff member's own cart: empty it (the
        // customer's own cart is left as it is)
        clearCart();
        playSound("order");
        setPlaced({
          href: `/panel/orders/${res.order_id}`,
          message: `Order placed for ${customer.username || customer.phone_number}.`,
        });
        return;
      }
      if (isRetailer) {
        const res = await apiFetch("/retailer-orders", {
          method: "POST",
          body: JSON.stringify({
            items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
            notes: notes.trim() || undefined,
          }),
        });
        clearCartLocal();
        playSound("order");
        const panel = user?.role === "doctor" ? "/doctor-panel" : "/retailer-panel";
        setPlaced({ href: `${panel}/orders/${res.id}`, message: "Your order has been sent to your partner." });
        return;
      }
      const res = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((i) => ({
            product_id: i.product.id,
            product_name: i.product.name,
            quantity: i.quantity,
          })),
          notes: notes.trim() || undefined,
          transport_mode: transportMode,
          transport_id: transportId || undefined,
        }),
      });
      clearCartLocal();
      playSound("order"); // the order went through
      setPlaced({ href: `/orders/${res.order_id}`, message: "Your order has been sent to Moulins." });
    } catch (err) {
      setError(err.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (placed) return <OrderPlacedOverlay message={placed.message} onDone={goToOrder} />;


  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-20 text-center">
        <p className="text-gray-400 text-sm">Your cart is empty</p>
        <Link
          href="/products"
          className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-2">{forCustomer ? "Order for a customer" : "Checkout"}</h1>
      <p className="text-sm text-gray-400 mb-10">
        {itemCount} item{itemCount !== 1 ? "s" : ""} in your order
      </p>

      {/* Staff: who the order is for */}
      {forCustomer && (
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
          {customer ? (
            <div className="flex items-center justify-between px-4 py-3 border border-gray-900 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{customer.username || "Unnamed partner"}</p>
                {customer.phone_number && <p className="text-xs text-gray-500">{customer.phone_number}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomer(null);
                  setCustomerQuery("");
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  if (!e.target.value.trim()) setCustomerResults([]);
                }}
                placeholder="Type the partner name or phone"
                className="w-full px-4 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg focus:border-gray-500 outline-none"
              />
              {customerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomer(c);
                        setCustomerResults([]);
                      }}
                      className="block w-full text-left px-4 py-2.5 hover:bg-gray-50"
                    >
                      <span className="text-sm text-gray-900">{c.username || "Unnamed partner"}</span>
                      {c.phone_number && <span className="ml-2 text-xs text-gray-500">{c.phone_number}</span>}
                    </button>
                  ))}
                </div>
              )}
              {customerQuery.trim() && customerResults.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">No partner found yet. Keep typing.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Order items */}
      <div className="divide-y divide-gray-100 mb-8">
        {items.map(({ product, quantity }) => {
          const images = visibleImages(product.images);
          return (
          <div key={product.id} className="flex gap-4 py-5">
            <div className="w-16 h-16 rounded-md bg-gray-50 flex-shrink-0 overflow-hidden">
              {images.length > 0 ? (
                <img
                  src={cardImageUrl(product, images)}
                  alt={product.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900">{product.name}</h3>
              {(product.pack_size || product.product_form) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {[product.pack_size, product.product_form].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="text-sm text-gray-500 flex-shrink-0 text-right">
              Qty: {quantity}
              {forCustomer && (
                <div className="mt-1.5 flex items-center gap-1 justify-end">
                  <span className="text-xs text-gray-400">Rate ₹</span>
                  <input
                    inputMode="decimal"
                    value={rates[product.id] ?? ""}
                    onChange={(e) => setRates((r) => ({ ...r, [product.id]: e.target.value }))}
                    placeholder="—"
                    className={`w-20 px-2 py-1 text-sm text-right text-gray-900 border rounded-md outline-none focus:border-gray-500 ${
                      Number.isNaN(parseRate(rates[product.id])) ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {forCustomer && (
        <p className="mb-8 text-sm text-gray-600 text-right">
          Total at these rates: <span className="font-semibold text-gray-900">₹{ratesTotal.toFixed(2)}</span>
          <span className="block text-xs text-gray-400">Lines left blank can be priced later on the order page.</span>
        </p>
      )}

      {isRetailer && (
        <p className="mb-8 text-sm text-gray-600">
          This order will be sent to your partner, who will confirm the rates.
        </p>
      )}

      {/* Transport mode */}
      {!isRetailer && (<>
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Mode of Transportation
        </label>
        <div className="flex gap-3">
          {transportModes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setTransportMode(m.name)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${
                transportMode === m.name
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              {modeLabel(m.name)}
            </button>
          ))}
        </div>
        {transportOptions.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {transportMode.charAt(0).toUpperCase() + transportMode.slice(1)}{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={transportId}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full sm:w-72 px-4 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors"
            >
              <option value="">Select an option...</option>
              {transportOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Billing / Shipping Address — read-only here, edited from Profile
          (not on a staff order: that uses the customer's own address) */}
      {!forCustomer && (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Billing &amp; Shipping Address
          </label>
          <Link href="/profile" className="text-xs text-red-600 hover:underline">
            Edit
          </Link>
        </div>
        {user?.billing_address || user?.shipping_address ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="px-4 py-3 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Billing</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {user?.billing_address || "Not set"}
              </p>
            </div>
            <div className="px-4 py-3 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Shipping</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {user?.shipping_address || "Not set"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No address on file —{" "}
            <Link href="/profile" className="text-red-600 hover:underline">
              add one in your profile
            </Link>
            .
          </p>
        )}
      </div>
      )}
      </>)}

      {/* Notes */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Order notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special instructions or notes for this order..."
          rows={3}
          className="w-full px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <Link
          href="/products"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          &larr; Continue browsing
        </Link>
        <button
          onClick={handlePlaceOrder}
          disabled={submitting}
          className="px-8 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Placing order..." : forCustomer ? "Place order for customer" : "Place Order"}
        </button>
      </div>
    </div>
  );
}
