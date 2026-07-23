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
  const [videos, setVideos] = useState([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiFetch(`/products/${id}`)
      .then((data) => setProduct(data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
    apiFetch(`/learning/videos?product_id=${id}`)
      .then((data) => setVideos(Array.isArray(data) ? data : []))
      .catch(() => setVideos([]));
  }, [id]);

  const handleAddToCart = () => {
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleDownloadImage = async (imageId) => {
    setDownloading(true);
    try {
      const { download_url } = await apiFetch(`/products/images/${imageId}/download-url`);
      window.location.href = download_url;
    } catch {
      // best-effort
    } finally {
      setDownloading(false);
    }
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
          <div className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden mb-4">
            {images.length > 0 ? (
              <>
                <img src={images[activeImage].image_url} alt={product.name} className="w-full h-full object-contain p-8" />
                <button
                  onClick={() => handleDownloadImage(images[activeImage].id)}
                  disabled={downloading}
                  title="Download image"
                  className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-lg shadow-sm border border-gray-200 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
              </>
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

          {product.description && (
            <p className="text-gray-500 text-sm leading-relaxed mb-8">{product.description}</p>
          )}

          {product.key_ingredients && (
            <div className="mb-8 pb-6 border-b border-gray-200">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Composition</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {product.key_ingredients}
                {product.strength && ` — ${product.strength}`}
              </p>
            </div>
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
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Stock</span>
              <span className="font-medium text-green-600">In Stock</span>
            </div>
          </div>

          <p className="text-2xl font-light text-gray-900 mb-4">
            MRP Rs. {parseFloat(product.mrp ?? product.price).toFixed(2)}
          </p>

          <button
            onClick={handleAddToCart}
            className="w-full py-4 text-sm font-medium transition-all duration-200"
            style={{ backgroundColor: added ? "#22c55e" : "#1a1a1a", color: "white" }}
          >
            {added ? "Added to Cart ✓" : "Add to Cart"}
          </button>

          {/* Documents */}
          {product.documents && product.documents.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Documents</p>
              <div className="space-y-2">
                {product.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors group"
                  >
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1 truncate">{doc.name}</span>
                    <span className="text-xs text-red-600 font-medium flex-shrink-0">View PDF &rarr;</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Related videos */}
          {videos.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Related Videos</p>
              <div className="grid grid-cols-2 gap-3">
                {videos.map((v) => (
                  <a
                    key={v.id}
                    href={v.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 relative">
                      <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{v.title}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
