"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";

// Rounds a typed quantity up to the nearest multiple of the product's MOQ
// (e.g. typing 7 with an MOQ of 5 commits as 10), and never below one MOQ.
export function roundUpToMoq(quantity, moq) {
  const step = moq && moq > 0 ? moq : 1;
  return Math.max(step, Math.ceil(quantity / step) * step);
}

// Free-text quantity field — lets the shopper type any number, then on
// blur/Enter rounds it up to the nearest MOQ multiple and commits. Keeps
// its own draft state so typing doesn't fight the cart's actual quantity
// on every keystroke.
export function QuantityInput({ quantity, moq, onCommit, className = "" }) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setDraft(String(quantity));
      return;
    }
    const rounded = roundUpToMoq(parsed, moq);
    setDraft(String(rounded));
    if (rounded !== quantity) onCommit(rounded);
  };

  return (
    <input
      type="number"
      min={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`w-10 h-8 text-center text-sm font-medium text-gray-900 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
    />
  );
}

// The +/- quantity control shown once a product is already in the cart —
// same shape as the CartDrawer's control, reused on product cards and the
// product detail page so quantity can be adjusted without opening the cart.
// Steps by the product's MOQ (default 1); dropping to zero removes the item.
export default function CartQuantityControl({ product, editable = true, className = "" }) {
  const { items, addToCart, updateQuantity, removeFromCart } = useCart();
  const item = items.find((i) => i.product.id === product.id);
  const step = product.moq && product.moq > 0 ? product.moq : 1;

  if (!item) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          addToCart(product);
        }}
        className={className || "px-3 py-1.5 text-xs font-medium text-white rounded-md"}
        style={className ? undefined : { backgroundColor: "#AC2528" }}
      >
        Add to Cart
      </button>
    );
  }

  const { quantity } = item;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-0 w-fit border border-gray-200 rounded-md bg-white"
    >
      <button
        onClick={() => (quantity > step ? updateQuantity(product.id, quantity - step) : removeFromCart(product.id))}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
      >
        &minus;
      </button>
      {editable ? (
        <QuantityInput quantity={quantity} moq={product.moq} onCommit={(next) => updateQuantity(product.id, next)} />
      ) : (
        <span className="w-10 h-8 flex items-center justify-center text-sm font-medium text-gray-900">{quantity}</span>
      )}
      <button
        onClick={() => updateQuantity(product.id, quantity + step)}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
      >
        +
      </button>
    </div>
  );
}
