"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/context/CartContext";

// Category name -> filter icon, matched by keyword since category names carry
// a division nickname plus the specialization in parentheses (e.g. "Gusty (Gastro)").
const CATEGORY_ICONS = [
  { match: /pediatric/i, src: "/filters/Pedia.jpg.jpeg" },
  { match: /gastro/i, src: "/filters/Gastro.jpg.jpeg" },
  { match: /gynaecology/i, src: "/filters/Gynae.jpg.jpeg" },
  { match: /neuro/i, src: "/filters/Neuro.jpg.jpeg" },
  { match: /orthopaedic/i, src: "/filters/Ortho.jpg.jpeg" },
];

function getCategoryIcon(name) {
  const found = CATEGORY_ICONS.find((c) => c.match.test(name));
  return found?.src;
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 20;

  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search") || "");
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");

  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchRef = useRef(null);
  const { addToCart } = useCart();
  const router = useRouter();

  // Fetch categories once
  useEffect(() => {
    apiFetch("/products/categories")
      .then((data) =>
        setCategories(Array.isArray(data) ? data.map((c) => c.name) : [])
      )
      .catch(() => setCategories([]));
  }, []);

  // Pick up ?search= when navigating here again with a new query (e.g. from the navbar search)
  useEffect(() => {
    const q = searchParams.get("search") || "";
    setSearch(q);
    setDebouncedSearch(q);
  }, [searchParams]);

  // Lightweight top-5 suggestions as you type — does NOT reload the full grid
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch(`/products?search=${encodeURIComponent(q)}&limit=5`)
        .then((data) => {
          setSearchSuggestions(data.products || []);
          setShowSuggestions(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const runSearch = (q) => {
    setDebouncedSearch(q);
    setPage(1);
    setShowSuggestions(false);
  };

  // Reset page on category change
  useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  // Fetch products
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeCategory) params.set("category", activeCategory);

    apiFetch(`/products?${params}`)
      .then((data) => {
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, activeCategory]);

  return (
    <div className="max-w-[96rem] mx-auto px-10 py-10">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light text-gray-900">All Products</h1>
          {!loading && (
            <p className="text-sm text-gray-400 mt-1">
              {total} product{total !== 1 ? "s" : ""}
              {activeCategory ? ` in ${activeCategory}` : ""}
              {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
            </p>
          )}
        </div>
        <div className="relative w-full sm:w-72">
          <form onSubmit={(e) => { e.preventDefault(); runSearch(search.trim()); }}>
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => search.trim() && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search products..."
              className="w-full pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 border-b border-gray-200 focus:border-gray-900 outline-none transition-colors bg-transparent"
            />
          </form>

          {/* Top-5 suggestions — clicking a suggestion or "See all" is what actually loads the grid */}
          {showSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 shadow-lg rounded-lg overflow-hidden z-30">
              {searchSuggestions.length > 0 ? (
                <>
                  <div className="divide-y divide-gray-100">
                    {searchSuggestions.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => router.push(`/products/${p.id}`)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                      >
                        {p.images && p.images.length > 0 ? (
                          <img
                            src={p.images[0].image_url}
                            alt={p.name}
                            className="w-8 h-8 object-contain flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-50 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => runSearch(search.trim())}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-red-600 hover:text-red-700 border-t border-gray-100"
                  >
                    See all results for &ldquo;{search.trim()}&rdquo; &rarr;
                  </button>
                </>
              ) : (
                <p className="px-4 py-3 text-sm text-gray-400">No matches found</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10">
          <button
            onClick={() => setActiveCategory("")}
            className="px-4 py-1.5 text-sm font-medium transition-all duration-200"
            style={
              activeCategory === ""
                ? { backgroundColor: "#AC2528", color: "white" }
                : { backgroundColor: "transparent", color: "#6b7280", border: "1px solid #e5e7eb" }
            }
          >
            All
          </button>
          {categories.map((cat) => {
            const icon = getCategoryIcon(cat);
            return (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? "" : cat)
                }
                className="flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition-all duration-200"
                style={
                  activeCategory === cat
                    ? { backgroundColor: "#AC2528", color: "white" }
                    : { backgroundColor: "transparent", color: "#6b7280", border: "1px solid #e5e7eb" }
                }
              >
                {icon && (
                  <img
                    src={icon}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                  />
                )}
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Products grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-96 bg-gray-100 mb-4" />
              <div className="h-px bg-gray-100 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">No products found</p>
          {(debouncedSearch || activeCategory) && (
            <button
              onClick={() => {
                setSearch("");
                setActiveCategory("");
              }}
              className="mt-3 text-xs text-red-600 hover:text-red-700 transition-colors"
            >
              Clear filters
            </button>
          )}
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

      {/* Pagination */}
      {total > 0 && !loading && (
        <div className="flex items-center justify-between mt-14 pt-8 border-t border-gray-200 text-sm text-gray-500">
          <span>
            {(page - 1) * limit + 1}&ndash;{Math.min(page * limit, total)} of{" "}
            {total} products
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              &larr; Previous
            </button>
            <span className="text-gray-400 text-xs">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
