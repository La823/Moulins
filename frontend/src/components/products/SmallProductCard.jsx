"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";

// Same visual style as ProductCard, sized down for horizontal-scroll rows
// (Recently Viewed / Explore More on the product detail page) — the
// listing page keeps using the original ProductCard unchanged.
export default function SmallProductCard({ product: p }) {
  const router = useRouter();
  const { addToCart } = useCart();

  return (
    <div
      onClick={() => router.push(`/products/${p.id}`)}
      className="group cursor-pointer transition-all duration-300 hover:-translate-y-1"
    >
      {/* Image — proportional (aspect-ratio) instead of ProductCard's fixed
          h-96, since these cards render much narrower in a scroll row. */}
      <div className="relative aspect-[4/5] bg-white overflow-hidden mb-0 flex items-center justify-center pb-4">
        {p.categories && p.categories.length > 0 && (
          <span
            className="absolute top-1 left-0 right-0 z-10 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest bg-white text-left truncate"
            style={{ color: "#2E5B41" }}
          >
            {p.categories[0]}
          </span>
        )}
        {p.images && p.images.length > 0 ? (
          <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
            {/* scaleY only (not a uniform scale) — crops a bit off the top
                and bottom equally while the width always stays fully
                contained, never cropped. */}
            <img
              src={p.images[0].image_url}
              alt={p.name}
              className="w-full h-auto"
              style={{ transform: "scaleY(1.15)" }}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <svg
              className="w-6 h-6 text-gray-200"
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
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium text-white tracking-wide translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
        >
          <svg
            className="w-3 h-3"
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
        <h3 className="text-xs font-normal text-gray-900 leading-snug line-clamp-2 mt-2">
          {p.name}
        </h3>
        {p.description && (
          <p className="text-[11px] text-gray-400 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
            {p.description}
          </p>
        )}
      </div>

      {/* Separator */}
      <div className="h-px bg-gray-200 mt-2 transition-colors duration-300 group-hover:bg-red-400" />
    </div>
  );
}
