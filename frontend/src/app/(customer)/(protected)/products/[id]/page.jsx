"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/context/CartContext";

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addToCart, itemCount } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    apiFetch(`/products/${id}`)
      .then((data) => setProduct(data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = () => {
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
    </div>
  );

  if (!product) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-gray-400">Product not found</p>
    </div>
  );

  const images = product.images || [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 transition mb-10">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Products
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        {/* Images */}
        <div>
          <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden mb-4">
            {images.length > 0 ? (
              <img src={images[activeImage].image_url} alt={product.name} className="w-full h-full object-contain p-8" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                </svg>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-3">
              {images.map((img, i) => (
                <button key={img.id} onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition ${activeImage === i ? "border-gray-900" : "border-gray-200 hover:border-gray-400"}`}>
                  <img src={img.image_url} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {product.categories && product.categories.length > 0 && (
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">{product.categories[0]}</p>
          )}
          <h1 className="text-3xl font-semibold text-gray-900 mb-4 leading-tight">{product.name}</h1>
          <div className="h-px bg-gray-200 mb-6" />

          <p className="text-2xl font-light text-gray-900 mb-6">₹{parseFloat(product.price).toFixed(2)}</p>

          {product.description && (
            <p className="text-gray-500 text-sm leading-relaxed mb-8">{product.description}</p>
          )}

          {/* Details */}
          <div className="space-y-3 mb-8">
            {product.product_form && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Form</span>
                <span className="text-gray-900 font-medium">{product.product_form}</span>
              </div>
            )}
            {product.consume_type && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Type</span>
                <span className="text-gray-900 font-medium">{product.consume_type}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            className="w-full py-4 text-sm font-medium transition-all duration-200"
            style={{ backgroundColor: added ? "#22c55e" : "#1a1a1a", color: "white" }}
          >
            {added ? "Added to Cart ✓" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
