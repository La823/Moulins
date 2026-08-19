"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const CartContext = createContext(null);

const STORAGE_KEY = "moulins_cart";

function loadCart() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setItems(loadCart());
  }, []);

  // Persist on every change (skip initial empty render)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (mounted) saveCart(items);
    else setMounted(true);
  }, [items]);

  // Doctors can browse the catalog but never order — block at the source
  // so every "Add to cart" entry point across the app is covered without
  // having to gate each one individually.
  const addToCart = useCallback((product) => {
    if (user?.role === "doctor") return;
    const step = product.moq && product.moq > 0 ? product.moq : 1;
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + step }
            : i
        );
      }
      return [...prev, { product, quantity: step }];
    });
  }, [user?.role]);

  const removeFromCart = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

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
