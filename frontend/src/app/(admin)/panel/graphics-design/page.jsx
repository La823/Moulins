"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function GraphicsDesignHome() {
  return (
    <Suspense fallback={null}>
      <GraphicsDesignHomeInner />
    </Suspense>
  );
}

function GraphicsDesignHomeInner() {
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cdrFilter, setCdrFilter] = useState("all"); // all | missing | has
  const searchTimer = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(
        `/admin/products?limit=0&name_only=true${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
      apiFetch("/admin/design-files/counts"),
    ])
      .then(([productsRes, countsRes]) => {
        setProducts(productsRes.products || []);
        setCounts(countsRes || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search]);

  const handleSearchChange = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 300);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Graphics Design</h1>
          <p className="text-sm text-gray-500 mt-1">
            Design files organized per product — open a product to view or upload files.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search products..."
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        />
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: "all", label: "All" },
            { key: "missing", label: "Missing CDR" },
            { key: "has", label: "Has CDR" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setCdrFilter(opt.key)}
              className={`text-sm px-3 py-1.5 rounded-md font-medium transition ${
                cdrFilter === opt.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-gray-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products
            .filter((p) => {
              const cdr = (counts[p.id] || { cdr: 0 }).cdr;
              if (cdrFilter === "missing") return cdr === 0;
              if (cdrFilter === "has") return cdr > 0;
              return true;
            })
            .map((p) => {
            const c = counts[p.id] || { total: 0, cdr: 0 };
            return (
              <Link
                key={p.id}
                href={`/panel/graphics-design/${p.id}`}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    #{p.product_id} &middot; {c.total} file{c.total === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono font-bold flex-shrink-0 px-2 py-1 rounded-md ${
                    c.cdr > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}
                  title={`${c.cdr} CDR file${c.cdr === 1 ? "" : "s"}`}
                >
                  CDR &middot; {c.cdr}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
