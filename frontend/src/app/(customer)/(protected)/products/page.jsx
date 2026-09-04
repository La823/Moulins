"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { visibleImages } from "@/lib/productImages";
import ProductCard from "@/components/products/ProductCard";
import { useAuth } from "@/context/AuthContext";

// Category name (as stored in the DB) -> its division banner image.
const CATEGORY_ICONS = {
  "Aerozone(Respiratory & ENT)": "/moulins divisions/Aerozone.jpg.jpeg",
  "Bone Voyage (Orthopaedics)": "/moulins divisions/Bone Voyage.jpg.jpeg",
  "Fluidity (Urology and renal)": "/moulins divisions/Fluidity.jpg.jpeg",
  "Gutsy (Gastro)": "/moulins divisions/GUTSY.jpg.jpeg",
  "Jivya (Cardio Diabetic Division)": "/moulins divisions/Jivvya.jpg.jpeg",
  "Life Gard (Antibiotics/ Trauma)": "/moulins divisions/Lifegard.jpg.jpeg",
  "Little Planet (Pediatric)": "/moulins divisions/Little Planet.jpg.jpeg",
  "Matrix": "/moulins divisions/Matrix.jpg.jpeg",
  "Mindset (Neuro/Psychiatry)": "/moulins divisions/Mindset.jpg.jpeg",
  "Missbella(Derma and Skin Wellness)": "/moulins divisions/Misbella.jpg.jpeg",
  "Srishti (Gynaecology)": "/moulins divisions/Srishti.jpg.jpeg",
  "View Point (Ophthalmology)": "/moulins divisions/View Point.jpg.jpeg",
};

function getCategoryIcon(name) {
  return CATEGORY_ICONS[name];
}

// Sentinel activeCategory value for the "Special" filter tile — special
// products aren't categorized/paginated server-side like regular products,
// so this branches the fetch/merge logic below instead of ever being sent
// to the backend as a real category name.
const SPECIAL_FILTER = "__special__";

function matchesSpecialFilters(sp, search, form) {
  if (search) {
    const q = search.toLowerCase();
    const hay = `${sp.name || ""} ${sp.description || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (form) {
    if ((sp.product_form || "").trim().toLowerCase() !== form.trim().toLowerCase()) return false;
  }
  return true;
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const { user } = useAuth();
  const isSpecialCustomer = user?.customer_type === "special";

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
  const [activeCategory, setActiveCategory] = useState(searchParams.get("category") || "");
  const [forms, setForms] = useState([]);
  const [activeForm, setActiveForm] = useState(searchParams.get("form") || "");
  const activeTag = searchParams.get("tag") || "";

  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [spellingSuggestions, setSpellingSuggestions] = useState([]);
  // True only when the active search came from clicking a "did you mean"
  // salt suggestion — restricts matching to key_ingredients so the result
  // list is products that actually contain that salt, not a loose name match.
  const [saltOnly, setSaltOnly] = useState(false);

  const [specialProducts, setSpecialProducts] = useState([]);

  const searchRef = useRef(null);
  const router = useRouter();

  // Fetch this customer's own private catalog once — small list, no
  // pagination needed. Tagged is_special so ProductCard routes to /special
  // instead of /products, and so it can be merged into (or exclusively
  // shown for) the regular grid below.
  useEffect(() => {
    if (!isSpecialCustomer) return;
    apiFetch("/special-products")
      .then((data) =>
        setSpecialProducts(
          (Array.isArray(data) ? data : []).map((p) => ({ ...p, is_special: true }))
        )
      )
      .catch(() => setSpecialProducts([]));
  }, [isSpecialCustomer]);

  // Fetch categories once
  useEffect(() => {
    apiFetch("/products/categories")
      .then((data) =>
        setCategories(Array.isArray(data) ? data.map((c) => c.name) : [])
      )
      .catch(() => setCategories([]));
  }, []);

  // Fetch the distinct product types (forms) once
  useEffect(() => {
    apiFetch("/products/forms")
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch(() => setForms([]));
  }, []);

  // Pick up ?search= / ?category= / ?form= when navigating here again with a
  // new query (e.g. from the navbar search, or "Explore more in <category>")
  useEffect(() => {
    const q = searchParams.get("search") || "";
    setSearch(q);
    setDebouncedSearch(q);
    setSaltOnly(searchParams.get("salt_only") === "true");
    setActiveCategory(searchParams.get("category") || "");
    setActiveForm(searchParams.get("form") || "");
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
          setSpellingSuggestions(data.suggestions || []);
          setShowSuggestions(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const runSearch = (q, options = {}) => {
    setDebouncedSearch(q);
    setSaltOnly(!!options.saltOnly);
    setPage(1);
    setShowSuggestions(false);
  };

  const searchBySalt = (s) => {
    setSearch(s);
    runSearch(s, { saltOnly: true });
  };

  // Reset page on category/type change
  useEffect(() => {
    setPage(1);
  }, [activeCategory, activeForm]);

  // Fetch products
  useEffect(() => {
    // "Special" tile selected — special products aren't a real backend
    // category, so just show this customer's own catalog, filtered
    // client-side, no pagination (the list is always small).
    if (activeCategory === SPECIAL_FILTER) {
      const filtered = specialProducts.filter((sp) =>
        matchesSpecialFilters(sp, debouncedSearch, activeForm)
      );
      setProducts(filtered);
      setTotal(filtered.length);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (debouncedSearch && saltOnly) params.set("salt_only", "true");
    if (activeCategory) params.set("category", activeCategory);
    if (activeForm) params.set("form", activeForm);
    if (activeTag) params.set("tag", activeTag);

    apiFetch(`/products?${params}`)
      .then((data) => {
        let list = data.products || [];
        let combinedTotal = data.total || 0;

        // "All" (no category picked): fold this customer's own special
        // products in alongside the regular Moulins catalog — only on page
        // 1, so the merged extras don't duplicate across pages.
        if (!activeCategory && isSpecialCustomer && page === 1) {
          const extras = specialProducts.filter((sp) =>
            matchesSpecialFilters(sp, debouncedSearch, activeForm)
          );
          list = [...extras, ...list];
          combinedTotal += extras.length;
        }

        setProducts(list);
        setTotal(combinedTotal);
        setTotalPages(data.total_pages || 0);
        setSpellingSuggestions(data.suggestions || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, saltOnly, activeCategory, activeForm, activeTag, specialProducts, isSpecialCustomer]);

  return (
    <div className="max-w-[96rem] mx-auto px-10 py-10">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light text-gray-900">All Products</h1>
          {!loading && (
            <p className="text-sm text-gray-400 mt-1">
              {total} product{total !== 1 ? "s" : ""}
              {activeCategory === SPECIAL_FILTER
                ? " in your 13 Alpha Unit catalog"
                : activeCategory
                ? ` in ${activeCategory}`
                : ""}
              {activeForm ? ` (${activeForm})` : ""}
              {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
            </p>
          )}
          {!loading && spellingSuggestions.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Did you mean{" "}
              {spellingSuggestions.map((s, i) => (
                <span key={s}>
                  <button
                    type="button"
                    onClick={() => searchBySalt(s)}
                    className="text-gray-900 underline underline-offset-2 hover:text-gray-600"
                  >
                    {s}
                  </button>
                  {i < spellingSuggestions.length - 1 ? ", " : ""}
                </span>
              ))}
              ?
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
                  {spellingSuggestions.length > 0 && (
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                      Did you mean{" "}
                      {spellingSuggestions.map((s, i) => (
                        <span key={s}>
                          <button
                            onMouseDown={(e) => { e.preventDefault(); searchBySalt(s); }}
                            className="text-gray-900 underline underline-offset-2 hover:text-gray-600"
                          >
                            {s}
                          </button>
                          {i < spellingSuggestions.length - 1 ? ", " : ""}
                        </span>
                      ))}
                      ?
                    </div>
                  )}
                  <div className="divide-y divide-gray-100">
                    {searchSuggestions.map((p) => {
                      const images = visibleImages(p.images);
                      return (
                      <button
                        key={p.id}
                        onMouseDown={(e) => { e.preventDefault(); router.push(`/products/${p.id}`); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                      >
                        {images.length > 0 ? (
                          <img
                            src={images[0].image_url}
                            alt={p.name}
                            className="w-8 h-8 object-contain flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-50 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 truncate">{p.name}</span>
                      </button>
                      );
                    })}
                  </div>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); runSearch(search.trim()); }}
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
        <div
          className="grid grid-flow-col grid-rows-2 justify-between gap-3 mb-10 w-full p-3 border border-gray-200 rounded-xl bg-gray-200"
          style={{
            gridTemplateColumns: `repeat(${Math.ceil((categories.length + 1 + (isSpecialCustomer ? 1 : 0)) / 2)}, 1fr)`,
          }}
        >
          <button
            onClick={() => setActiveCategory("")}
            className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 min-w-0 border-4 rounded-md ${
              activeCategory === ""
                ? "border-transparent"
                : "border-gray-200 hover:border-[#AC2528]"
            }`}
            style={
              activeCategory === ""
                ? { backgroundColor: "#AC2528", color: "white" }
                : { backgroundColor: "transparent", color: "#6b7280" }
            }
          >
            All
          </button>
          {categories.map((cat) => {
            const icon = getCategoryIcon(cat);
            const isActive = activeCategory === cat;

            if (icon) {
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? "" : cat)}
                  title={cat}
                  className={`group/icon rounded-md overflow-hidden transition-all duration-200 w-full h-full min-w-0 bg-gray-50 hover:scale-[1.02] border-4 ${
                    isActive
                      ? "border-[#AC2528]"
                      : "border-transparent hover:border-[#AC2528]"
                  }`}
                  style={{ padding: 2 }}
                >
                  <img
                    src={icon}
                    alt={cat}
                    className="w-full h-full rounded-md object-contain transition-transform duration-200 group-hover/icon:scale-105"
                  />
                </button>
              );
            }

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? "" : cat)}
                className="flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition-all duration-200 min-w-0"
                style={
                  isActive
                    ? { backgroundColor: "#AC2528", color: "white" }
                    : { backgroundColor: "transparent", color: "#6b7280", border: "1px solid #e5e7eb" }
                }
              >
                {cat}
              </button>
            );
          })}
          {isSpecialCustomer && (user?.special_tile_image_url ? (
            <button
              onClick={() => setActiveCategory(activeCategory === SPECIAL_FILTER ? "" : SPECIAL_FILTER)}
              title="Your private product catalog"
              className={`group/icon relative rounded-md overflow-hidden transition-all duration-200 w-full h-full min-w-0 bg-gray-50 hover:scale-[1.02] border-4 ${
                activeCategory === SPECIAL_FILTER ? "border-[#00A6A4]" : "border-transparent hover:border-[#00A6A4]"
              }`}
              style={{ padding: 2 }}
            >
              <img
                src={user.special_tile_image_url}
                alt="13 Alpha Unit"
                className="w-full h-full rounded-md object-contain transition-transform duration-200 group-hover/icon:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[11px] font-medium py-0.5">
                13 Alpha Unit
              </span>
            </button>
          ) : (
            <button
              onClick={() => setActiveCategory(activeCategory === SPECIAL_FILTER ? "" : SPECIAL_FILTER)}
              title="Your private product catalog"
              className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 min-w-0 border-4 rounded-md ${
                activeCategory === SPECIAL_FILTER ? "border-transparent" : "border-transparent hover:border-[#00A6A4]"
              }`}
              style={{ backgroundColor: "#00A6A4", color: "white", opacity: activeCategory === SPECIAL_FILTER ? 1 : 0.85 }}
            >
              13 Alpha Unit
            </button>
          ))}
        </div>
      )}

      {/* Type (product form) filter — small pills on larger screens, a
          dropdown only below sm where pills would wrap/overflow awkwardly */}
      {forms.length > 0 && (
        <div className="mb-8">
          {/* Mobile: dropdown */}
          <div className="flex sm:hidden items-center gap-2">
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

          {/* Desktop/tablet: pills */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-1">
              Type
            </span>
            <button
              onClick={() => setActiveForm("")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                activeForm === ""
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              All
            </button>
            {forms.map((f) => (
              <button
                key={f}
                onClick={() => setActiveForm(activeForm === f ? "" : f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  activeForm === f
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
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
          {(debouncedSearch || activeCategory || activeForm) && (
            <button
              onClick={() => {
                setSearch("");
                setActiveCategory("");
                setActiveForm("");
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
            <ProductCard key={p.id} product={p} />
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
