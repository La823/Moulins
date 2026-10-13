"use client";

import { useState, useEffect } from "react";

// "grid" = product cards with images, "list" = compact rows without.
// Remembered on this browser only, and shared by every product listing
// (all products and each division page), so picking one sticks everywhere.
const VIEW_KEY = "products_view";

export function useProductView() {
  const [view, setView] = useState("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);
  const changeView = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  return [view, changeView];
}

const OPTIONS = [
  ["grid", "Grid", "M3.75 3.75h6.5v6.5h-6.5zM13.75 3.75h6.5v6.5h-6.5zM3.75 13.75h6.5v6.5h-6.5zM13.75 13.75h6.5v6.5h-6.5z"],
  ["list", "List", "M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.008v.008H3.75zM3.75 12h.008v.008H3.75zM3.75 17.25h.008v.008H3.75z"],
];

export default function ProductViewToggle({ view, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white" role="group" aria-label="Product view">
      {OPTIONS.map(([key, label, d]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={view === key}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            view === key ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}
