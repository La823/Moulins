"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/context/CartContext";

export default function CartDrawer() {
  const router = useRouter();
  const { items, itemCount, isOpen, closeCart, removeFromCart, updateQuantity } =
    useCart();

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") closeCart();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, closeCart]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-[60]"
            onClick={closeCart}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[70] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-light text-gray-900">
                Shopping Cart
                <span className="text-gray-400 ml-2">&middot; {itemCount}</span>
              </h2>
              <button
                onClick={closeCart}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
              >
                Dismiss
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <svg
                    className="w-12 h-12 text-gray-200 mb-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </svg>
                  <p className="text-sm text-gray-400">Your cart is empty</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="px-6 py-5">
                      <div className="flex gap-4">
                        {/* Thumbnail */}
                        <div className="w-20 h-20 rounded-md bg-gray-50 flex-shrink-0 overflow-hidden">
                          {product.images && product.images.length > 0 ? (
                            <img
                              src={product.images[0].image_url}
                              alt={product.name}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg
                                className="w-6 h-6 text-gray-200"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 leading-snug">
                                {product.name}
                              </h3>
                              {(product.pack_size || product.product_form) && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {[product.pack_size, product.product_form]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                            {/* Delete */}
                            <button
                              onClick={() => removeFromCart(product.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                                />
                              </svg>
                            </button>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-0 mt-3 w-fit border border-gray-200 rounded-md">
                            <button
                              onClick={() =>
                                quantity > 1
                                  ? updateQuantity(product.id, quantity - 1)
                                  : removeFromCart(product.id)
                              }
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
                            >
                              &minus;
                            </button>
                            <span className="w-8 h-8 flex items-center justify-center text-sm font-medium text-gray-900">
                              {quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(product.id, quantity + 1)
                              }
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checkout button */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-5">
                <button
                  onClick={() => {
                    closeCart();
                    router.push("/checkout");
                  }}
                  className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Checkout &middot; {itemCount} item{itemCount !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
