"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { visibleImages } from "@/lib/productImages";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SmallProductCard from "@/components/products/SmallProductCard";
import { divisionRouteForCategory } from "@/lib/divisionRoutes";
import { DIVISIONS } from "@/lib/divisions";

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addToCart, itemCount } = useCart();
  const { user } = useAuth();
  const canOrder = user?.role !== "doctor";
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [videos, setVideos] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [sameCategory, setSameCategory] = useState([]);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    if (audioPlaying) {
      el.pause();
    } else {
      el.play();
    }
  };

  useEffect(() => {
    apiFetch(`/products/${id}`)
      .then((data) => {
        setProduct(data);
        const category = data.categories && data.categories[0];
        if (category) {
          apiFetch(`/products?category=${encodeURIComponent(category)}&limit=13`)
            .then((res) => setSameCategory((res.products || []).filter((p) => p.id !== id).slice(0, 12)))
            .catch(() => setSameCategory([]));
        }
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
    apiFetch(`/learning/videos?product_id=${id}`)
      .then((data) => setVideos(Array.isArray(data) ? data : []))
      .catch(() => setVideos([]));
    // Fire-and-forget — track the view, then refresh the queue for display.
    apiFetch(`/products/${id}/view`, { method: "POST" })
      .catch(() => {})
      .finally(() => {
        apiFetch("/recently-viewed")
          .then((data) => setRecentlyViewed(Array.isArray(data) ? data.filter((p) => p.id !== id) : []))
          .catch(() => setRecentlyViewed([]));
      });
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

  const images = visibleImages(product.images);

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
                {product.audio_url && (
                  <>
                    <button
                      onClick={toggleAudio}
                      title={audioPlaying ? "Pause audio" : "Play audio"}
                      className="absolute top-3 left-3 p-2 bg-white/90 hover:bg-white rounded-lg shadow-sm border border-gray-200 transition-colors"
                    >
                      {audioPlaying ? (
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                      )}
                    </button>
                    <audio
                      ref={audioRef}
                      src={product.audio_url}
                      onPlay={() => setAudioPlaying(true)}
                      onPause={() => setAudioPlaying(false)}
                      onEnded={() => setAudioPlaying(false)}
                      className="hidden"
                    />
                  </>
                )}
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
            <CollapsibleSection title="Composition" defaultOpen>
              {product.key_ingredients}
            </CollapsibleSection>
          )}

          {product.direction_for_use && (
            <CollapsibleSection title="Directions For Use">
              {product.direction_for_use}
            </CollapsibleSection>
          )}

          {product.safety_information && (
            <CollapsibleSection title="Safety Information">
              {product.safety_information}
            </CollapsibleSection>
          )}

          {product.edetailing && (
            <CollapsibleSection title="E-Detailing">
              {product.edetailing}
            </CollapsibleSection>
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
            {product.moq > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Minimum Quantity</span>
                <span className="text-gray-900 font-medium">{product.moq}</span>
              </div>
            )}
          </div>

          <p className="text-2xl font-light text-gray-900 mb-4">
            MRP Rs. {parseFloat(product.mrp ?? product.price).toFixed(2)}
            {product.mrp_unit && (
              <span className="text-sm text-gray-400 font-normal"> / {product.mrp_unit}</span>
            )}
          </p>

          {canOrder && (
            <button
              onClick={handleAddToCart}
              className="w-full py-4 text-sm font-medium transition-all duration-200"
              style={{ backgroundColor: added ? "#22c55e" : "#1a1a1a", color: "white" }}
            >
              {added ? "Added to Cart ✓" : "Add to Cart"}
            </button>
          )}

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

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <>
          <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen mt-16 border-t border-gray-200" />
        <div className="mt-8 bg-gray-100 rounded-2xl px-6 py-8 md:px-10">
          <p className="text-base md:text-lg font-semibold text-gray-900 mb-6">Recently Viewed</p>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {recentlyViewed.map((p) => (
              <div key={p.id} className="flex-shrink-0 w-64">
                <SmallProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {/* Explore more in this category */}
      {sameCategory.length > 0 && (
        <div className="mt-8 bg-gray-100 rounded-2xl px-6 py-8 md:px-10">
          <Link
            href={divisionRouteForCategory(product.categories[0])}
            className="inline-block text-base md:text-lg font-semibold text-gray-900 hover:text-red-600 transition-colors mb-6"
          >
            Explore more in &ldquo;{product.categories[0]}&rdquo; &rarr;
          </Link>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {sameCategory.map((p) => (
              <div key={p.id} className="flex-shrink-0 w-64">
                <SmallProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explore Our Portfolio */}
      <div className="mt-8 bg-white rounded-2xl px-6 py-8 md:px-10">
        <p className="text-base md:text-lg font-semibold text-gray-900 mb-6">Explore Our Portfolio</p>
        <div className="grid grid-cols-3 gap-4">
          {DIVISIONS.map((d) => (
            <Link
              key={d.route}
              href={d.route}
              className="group relative overflow-hidden bg-white"
              style={{ height: "15vh" }}
            >
              {/* Fixed height, full width — object-cover crops whatever
                  overflows so the image always fills the box. Shorter than
                  the 2-column layout since columns are narrower here. */}
              <img
                src={d.heroImage}
                alt={d.label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/35 group-hover:bg-black/45 transition-colors" />
              <div className="absolute bottom-3 left-3">
                <span className="block text-white text-xl md:text-2xl font-semibold tracking-wide">
                  {d.label}
                </span>
                {d.desc && (
                  <span className="block text-white/70 text-[10px] font-medium uppercase tracking-widest mt-0.5">
                    {d.desc}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }) {
  return (
    <details className="mb-8 pb-6 border-b border-gray-200 group" open={defaultOpen}>
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <p className="text-xs uppercase tracking-widest text-gray-400">{title}</p>
        <svg
          className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </summary>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mt-2">{children}</p>
    </details>
  );
}
