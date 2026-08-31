"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

const CartContext = createContext(null);

// Reshapes a backend cart row (flat product_* fields) into the
// {product, quantity} item shape the cart UI (CartDrawer etc.) already
// expects — keeps this the only place that knows about that mapping.
function toCartItem(row) {
  return {
    quantity: row.quantity,
    product: {
      id: row.product_id,
      name: row.product_name,
      price: row.price,
      mrp: row.mrp,
      stock: row.stock,
      moq: row.moq,
      pack_size: row.pack_size,
      product_form: row.product_form,
      is_active: row.is_active,
      images: [], // not returned by GET /cart — drawer falls back to a placeholder
    },
  };
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  // Load the server cart once a user is actually authenticated. Logging
  // out clears local state too — the cart is per-user, not per-device.
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    apiFetch("/cart")
      .then((data) => setItems((data?.items || []).map(toCartItem)))
      .catch(() => {});
  }, [user]);

  // Doctors can browse the catalog but never order — block at the source
  // so every "Add to cart" entry point across the app is covered without
  // having to gate each one individually.
  const addToCart = useCallback((product) => {
    if (user?.role === "doctor") return;
    const step = product.moq && product.moq > 0 ? product.moq : 1;

    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const quantity = existing ? existing.quantity + step : step;

      apiFetch("/cart/items", {
        method: "POST",
        body: JSON.stringify({ product_id: product.id, quantity }),
      }).catch(() => {});

      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity } : i
        );
      }
      return [...prev, { product, quantity }];
    });
  }, [user?.role]);

  const removeFromCart = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
    apiFetch(`/cart/items/${productId}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      )
    );
    apiFetch(`/cart/items/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }).catch(() => {});
  }, []);

  // Manual full clear (e.g. a "clear cart" button) — actually calls the API.
  const clearCart = useCallback(() => {
    setItems([]);
    apiFetch("/cart", { method: "DELETE" }).catch(() => {});
  }, []);

  // Local-state-only reset, no API call — for checkout, where the backend
  // already cleared cart_items transactionally as part of placing the
  // order. Calling clearCart() there would fire a redundant DELETE /cart
  // that could race with (or mask a bug in) that server-side clear; this
  // just brings the UI in sync with what the server already did.
  const clearCartLocal = useCallback(() => setItems([]), []);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        isOpen,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        clearCartLocal,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
