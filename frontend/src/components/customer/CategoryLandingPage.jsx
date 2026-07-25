"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/context/CartContext";

export default function CategoryLandingPage({ categoryName, heroImage, heroLabel, heroTitle }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState([]);
  const [activeForm, setActiveForm] = useState("");
  const { addToCart } = useCart();
  const router = useRouter();

  useEffect(() => {
    apiFetch("/products/forms")
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch(() => setForms([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ category: categoryName, limit: "100" });
    if (activeForm) params.set("form", activeForm);
    apiFetch(`/products?${params}`)
      .then((data) => setProducts(data.products || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [categoryName, activeForm]);

  return (
    <div>
      {/* Landing */}
      <section className="relative h-[60vh] min-h-[380px] flex items-end overflow-hidden">
        <img
          src={heroImage}
          alt={heroTitle}
          className="absolute inset-0 w-full h-full object-cover object-[center_15%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative z-10 max-w-[96rem] w-full mx-auto px-10 pb-14">
          <h1 className="text-4xl md:text-5xl text-white leading-tight mb-3">
            {heroLabel}
          </h1>
          <p className="text-sm md:text-base uppercase tracking-[0.2em] text-white/70">
            {heroTitle}
          </p>
        </div>
      </section>

      {/* Products */}
      <div className="max-w-[96rem] mx-auto px-10 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-light text-gray-900">{heroTitle} Products</h2>
            {!loading && (
              <p className="text-sm text-gray-400 mt-1">
                {products.length} product{products.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {forms.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="type-filter" className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Type
              </label>
              <select
                id="type-filter"
                value={activeForm}
                onChange={(e) => setActiveForm(e.target.value)}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400 transition-colors"
              >
                <option value="">All</option>
                {forms.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-12">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-96 bg-gray-100 mb-4" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">No products found in this category yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-12">
            {products.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/products/${p.id}`)}
                className="group cursor-pointer transition-all duration-300 hover:-translate-y-1"
              >
                {p.categories && p.categories.length > 0 && (
                  <span
                    className="block text-[10px] font-bold uppercase tracking-widest mb-3"
                    style={{ color: "#2E5B41" }}
                  >
                    {p.categories[0]}
                  </span>
                )}

                {/* Image */}
                <div className="relative h-96 bg-white overflow-hidden mb-0 flex items-center justify-center pb-6">
                  {p.images && p.images.length > 0 ? (
                    <img
                      src={p.images[0].image_url}
                      alt={p.name}
                      className="max-h-full max-w-full object-contain scale-[1.06] origin-bottom"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <svg
                        className="w-8 h-8 text-gray-200"
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

                  {/* Add to cart bar — slides up from the bottom edge of the image on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(p);
                    }}
                    style={{ backgroundColor: "#AC2528" }}
                    className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 py-3 text-xs font-medium text-white tracking-wide translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    Add to Cart
                  </button>
                </div>

                {/* Info */}
                <div>
                  <h3 className="text-sm font-normal text-gray-900 leading-snug line-clamp-2 mt-3">
                    {p.name}
                  </h3>
                  {p.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
                      {p.description}
                    </p>
                  )}
                </div>

                {/* Separator */}
                <div className="h-px bg-gray-200 mt-3 transition-colors duration-300 group-hover:bg-red-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
