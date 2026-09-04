"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch } from "@/lib/api";

function SlideThumb({ slide, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.product_image_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative aspect-square bg-gray-50 border border-gray-200 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing group"
    >
      <img src={slide.image_url} alt={slide.product_name} className="w-full h-full object-contain p-1 pointer-events-none" />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(slide.product_image_id);
        }}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
        {slide.product_name}
      </div>
    </div>
  );
}

export default function PresentationBuilderPage() {
  const { id } = useParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [slides, setSlides] = useState([]); // ordered [{product_image_id, image_url, product_name}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Product picker
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);
  const [visualAidOnly, setVisualAidOnly] = useState(false);

  // Presentation ("Present") viewer
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    apiFetch(`/presentations/${id}`)
      .then((data) => {
        setName(data.name);
        setDoctorId(data.doctor_id || "");
        setSlides(
          (data.slides || []).map((s) => ({
            product_image_id: s.product_image_id,
            image_url: s.image_url,
            product_id: s.product_id,
            product_name: s.product_name,
          }))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    apiFetch("/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setProducts([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/products?search=${encodeURIComponent(q)}&limit=10&name_only=true`)
        .then((data) => setProducts(data.products || []))
        .catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const openProduct = async (p) => {
    try {
      const full = await apiFetch(`/products/${p.id}`);
      setActiveProduct(full);
    } catch (err) {
      console.error(err);
    }
  };

  const addImage = (img, product) => {
    setSlides((prev) => {
      if (prev.some((s) => s.product_image_id === img.id)) return prev;
      setDirty(true);
      return [...prev, { product_image_id: img.id, image_url: img.image_url, product_id: product.id, product_name: product.name }];
    });
  };

  const removeSlide = useCallback((productImageId) => {
    setSlides((prev) => prev.filter((s) => s.product_image_id !== productImageId));
    setDirty(true);
  }, []);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlides((prev) => {
      const oldIndex = prev.findIndex((s) => s.product_image_id === active.id);
      const newIndex = prev.findIndex((s) => s.product_image_id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/presentations/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, doctor_id: doctorId || null }),
      });
      await apiFetch(`/presentations/${id}/slides`, {
        method: "PUT",
        body: JSON.stringify({ product_image_ids: slides.map((s) => s.product_image_id) }),
      });
      setDirty(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPresenting(false);
      else if (e.key === "ArrowRight") setPresentIndex((i) => Math.min(i + 1, slides.length - 1));
      else if (e.key === "ArrowLeft") setPresentIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slides.length]);

  const visibleImages = activeProduct?.images?.filter((img) => !visualAidOnly || img.visual_aid) || [];

  // Distinct products represented among the current slides, in the order
  // they first appear, with how many slides each contributes.
  const productsInDeck = useMemo(() => {
    const byId = new Map();
    for (const s of slides) {
      if (!s.product_id) continue;
      const entry = byId.get(s.product_id);
      if (entry) entry.count += 1;
      else byId.set(s.product_id, { id: s.product_id, name: s.product_name, count: 1 });
    }
    return [...byId.values()];
  }, [slides]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-2 gap-4">
        <button onClick={() => router.push("/presentations")} className="text-sm text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0">
          &larr; Back
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="flex-1 text-xl font-light text-gray-900 outline-none border-b border-transparent focus:border-gray-300 transition-colors px-1"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => {
              setPresentIndex(0);
              setPresenting(true);
            }}
            disabled={slides.length === 0}
            className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
          >
            Present
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <label className="text-xs text-gray-400">Doctor:</label>
        <select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value);
            setDirty(true);
          }}
          className="text-sm border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400 transition-colors bg-white"
        >
          <option value="">Not linked to a doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
          {/* Deck */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Slides {slides.length > 0 && <span className="text-gray-400 font-normal">&middot; drag to reorder</span>}
            </h2>
            {slides.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-lg py-16 text-center text-sm text-gray-400">
                Pick images from the right panel to add slides
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={slides.map((s) => s.product_image_id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {slides.map((s) => (
                      <SlideThumb key={s.product_image_id} slide={s} onRemove={removeSlide} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="space-y-6">
            {/* Products in this deck */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Products {productsInDeck.length > 0 && <span className="text-gray-400 font-normal">({productsInDeck.length})</span>}
              </h2>
              {productsInDeck.length === 0 ? (
                <p className="text-xs text-gray-400">No products yet — add images below</p>
              ) : (
                <ul className="space-y-1.5">
                  {productsInDeck.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={`/products/${p.id}`}
                        target="_blank"
                        className="text-gray-700 hover:text-red-600 hover:underline transition-colors truncate"
                      >
                        {p.name}
                      </Link>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {p.count} slide{p.count !== 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Product picker */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Images</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors mb-3"
            />
            {!activeProduct && products.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-50 transition-colors truncate"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {activeProduct && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setActiveProduct(null)}
                    className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    &larr; {activeProduct.name}
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualAidOnly}
                      onChange={(e) => setVisualAidOnly(e.target.checked)}
                      className="rounded"
                    />
                    Visual aid only
                  </label>
                </div>
                {visibleImages.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No images{visualAidOnly ? " flagged for visual aid" : ""}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {visibleImages.map((img) => {
                      const added = slides.some((s) => s.product_image_id === img.id);
                      return (
                        <button
                          key={img.id}
                          onClick={() => addImage(img, activeProduct)}
                          disabled={added}
                          className="relative aspect-square bg-gray-50 border border-gray-200 rounded-md overflow-hidden disabled:opacity-40"
                        >
                          <img src={img.image_url} alt="" className="w-full h-full object-contain p-1" />
                          {added && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-medium">
                              Added
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {presenting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[100] flex items-center justify-center"
            onClick={() => setPresenting(false)}
          >
            <button
              onClick={() => setPresenting(false)}
              className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            {presentIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPresentIndex((i) => i - 1);
                }}
                className="absolute left-4 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <motion.img
              key={presentIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              src={slides[presentIndex]?.image_url}
              alt=""
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {presentIndex < slides.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPresentIndex((i) => i + 1);
                }}
                className="absolute right-4 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            <div className="absolute bottom-6 text-white/50 text-sm">
              {presentIndex + 1} / {slides.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
