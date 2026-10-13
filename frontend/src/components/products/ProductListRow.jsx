"use client";

import { useRouter } from "next/navigation";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import CartQuantityControl from "@/components/products/CartQuantityControl";

// Compact, image-free row for the products page's list view — same product,
// same actions (favourite, add to cart) as ProductCard, just dense enough to
// scan a long catalogue quickly. Column widths match ProductListHeader.
export const LIST_COLUMNS =
  "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_6.5rem_6.5rem_2.5rem_8.5rem] md:items-center md:gap-4";

export function ProductListHeader() {
  return (
    <div
      className={`hidden ${LIST_COLUMNS} px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-200`}
    >
      <span>Product</span>
      <span className="text-gray-700">Composition</span>
      <span>Pack</span>
      <span>Type</span>
      <span className="text-right">MRP</span>
      <span />
      <span />
    </div>
  );
}

export default function ProductListRow({ product: p, basePath = "/products" }) {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();
  const canOrder = user?.role !== "doctor";
  const favorite = isFavorite(p.id);
  const href = p.is_special ? `/special/${p.id}` : `${basePath}/${p.id}`;
  const mrp = p.mrp ?? p.price;
  // the salt(s) and strength, e.g. "Acotiamide 100 mg"
  const composition = p.key_ingredients || p.strength || "";

  const star = !p.is_special && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(p.id);
      }}
      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
      title={favorite ? "Remove from favorites" : "Add to favorites"}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill={favorite ? "#F5A623" : "none"}
        stroke={favorite ? "#F5A623" : "#9CA3AF"}
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 21.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
    </button>
  );

  return (
    <div
      onClick={() => router.push(href)}
      className={`group cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${LIST_COLUMNS}`}
    >
      {/* Name (+ on phones, the details folded underneath) */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[13px] text-blue-700 leading-snug group-hover:text-blue-900 group-hover:underline underline-offset-2 transition-colors">
            {p.name}
          </h3>
          <span className="md:hidden shrink-0 -mt-1.5 -mr-2">{star}</span>
        </div>
        {p.description && (
          <p className="hidden md:block text-xs text-gray-300 mt-0.5 truncate">{p.description}</p>
        )}
        {composition && <p className="md:hidden text-[15px] font-medium text-gray-900 leading-snug mt-1">{composition}</p>}
        <p className="md:hidden text-xs text-gray-500 mt-0.5">
          {[p.pack_size, p.product_form].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Desktop columns */}
      <span className="hidden md:block text-[15px] font-medium text-gray-900 leading-snug line-clamp-2" title={composition}>
        {composition || "—"}
      </span>
      <span className="hidden md:block text-sm text-gray-500 truncate">{p.pack_size || "—"}</span>
      <span className="hidden md:block text-sm text-gray-500 truncate">{p.product_form || "—"}</span>
      <span className="hidden md:block text-sm text-gray-600 text-right">
        {mrp != null ? `₹${Number(mrp).toFixed(2)}` : "—"}
      </span>
      <span className="hidden md:flex justify-center">{star}</span>

      {/* MRP + cart — own line on phones, last column on desktop */}
      <div className="flex items-center justify-between gap-3 mt-2 md:mt-0 md:justify-end">
        <span className="md:hidden text-sm text-gray-600">
          {mrp != null ? `MRP ₹${Number(mrp).toFixed(2)}` : ""}
        </span>
        {canOrder && (
          <CartQuantityControl
            product={p}
            editable={false}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-md transition-colors"
          />
        )}
      </div>
    </div>
  );
}
