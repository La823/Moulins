"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";

// Shared product card — used on the products listing page and the
// Recently Viewed / Explore More sections on the product detail page, so
// they all look and behave identically.
export default function ProductCard({ product: p, basePath = "/products" }) {
  const router = useRouter();
  const { addToCart } = useCart();

  return (
    <div
      onClick={() => router.push(`${basePath}/${p.id}`)}
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
  );
}
