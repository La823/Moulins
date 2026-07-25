"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import ProductCard from "@/components/products/ProductCard";

// The "Special" division — a private catalog visible only to special-type
// customers. Products here are NOT Moulins products and have no categories,
// so this is a dedicated page rather than the shared CategoryLandingPage.
export default function SpecialProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    apiFetch("/special-products")
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {
        // Non-special customers get a 403 here — send them to the regular catalog.
        router.replace("/products");
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="max-w-[96rem] mx-auto px-10 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">Special</h1>
        {!loading && (
          <p className="text-sm text-gray-400 mt-1">
            {products.length} product{products.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

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
          <p className="text-gray-400 text-sm">No products available yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-12">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} basePath="/special" />
          ))}
        </div>
      )}
    </div>
  );
}
