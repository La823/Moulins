"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function DoctorDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doctor, setDoctor] = useState(null);
  const [assignedProducts, setAssignedProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [adding, setAdding] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [doc, products, catalog] = await Promise.all([
        apiFetch(`/doctors/${id}`),
        apiFetch(`/doctors/${id}/products`),
        apiFetch("/products"),
      ]);
      setDoctor(doc);
      setAssignedProducts(Array.isArray(products) ? products : []);
      const productList = catalog?.products || catalog || [];
      setAllProducts(Array.isArray(productList) ? productList : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addProduct = async (productId) => {
    setAdding(productId);
    try {
      await apiFetch(`/doctors/${id}/products`, {
        method: "POST",
        body: JSON.stringify({ product_id: productId }),
      });
      const products = await apiFetch(`/doctors/${id}/products`);
      setAssignedProducts(Array.isArray(products) ? products : []);
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(null);
    }
  };

  const removeProduct = async (productId) => {
    try {
      await apiFetch(`/doctors/${id}/products/${productId}`, { method: "DELETE" });
      setAssignedProducts((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (err) {
      alert(err.message);
    }
  };

  const assignedIds = new Set(assignedProducts.map((p) => p.product_id));

  const filteredProducts = allProducts.filter(
    (p) =>
      !assignedIds.has(p.id) &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-40 bg-gray-100 rounded mt-8" />
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10 text-center">
        <p className="text-gray-400">Doctor not found</p>
        <Link href="/doctors" className="text-sm text-red-600 mt-4 inline-block">
          Back to doctors
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/doctors" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          &larr; Back to doctors
        </Link>
        <h1 className="text-2xl font-light text-gray-900 mt-3">{doctor.name}</h1>
        {doctor.clinic_name && (
          <p className="text-sm text-gray-500 mt-1">{doctor.clinic_name}</p>
        )}
        {doctor.phone && (
          <p className="text-sm text-gray-400 mt-1">{doctor.phone}</p>
        )}
      </div>

      {/* Assigned Products */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-light text-gray-900">
            Assigned Products ({assignedProducts.length})
          </h2>
          <button
            onClick={() => setShowProductPicker(!showProductPicker)}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            {showProductPicker ? "Done" : "Add Products"}
          </button>
        </div>

        {assignedProducts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-400">No products assigned yet</p>
            <button
              onClick={() => setShowProductPicker(true)}
              className="text-sm text-red-600 hover:text-red-700 mt-2 transition-colors"
            >
              Add products from catalog
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {assignedProducts.map((dp) => (
              <div
                key={dp.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
              >
                <span className="text-sm text-gray-900">{dp.product_name}</span>
                <button
                  onClick={() => removeProduct(dp.product_id)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Picker */}
      {showProductPicker && (
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Add from catalog</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors mb-4"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filteredProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">
                {search ? "No matching products" : "All products are assigned"}
              </p>
            ) : (
              filteredProducts.slice(0, 50).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{product.name}</p>
                    {product.price != null && (
                      <p className="text-xs text-gray-400">
                        &#8377;{Number(product.price).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => addProduct(product.id)}
                    disabled={adding === product.id}
                    className="ml-3 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    {adding === product.id ? "Adding..." : "Add"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
