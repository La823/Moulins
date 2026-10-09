"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// What's special about this partner's catalogue: products hidden from them,
// and exclusive products they're allowed. Read-only — each product's
// visibility is edited on its own page, linked from here.
export default function PartnerProductVisibilityPanel({ partnerId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/admin/partners/${partnerId}/product-access`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message || "Could not load"));
  }, [partnerId]);

  // a rule that changes nothing (hidden on an exclusive product, or allowed
  // on a normal one) isn't worth showing
  const hidden = (rows || []).filter((r) => !r.visible && !r.exclusive);
  const exclusive = (rows || []).filter((r) => r.visible && r.exclusive);

  const list = (items, tone) => (
    <ul className="space-y-1">
      {items.map((r) => (
        <li key={r.product_id}>
          <Link
            href={`/panel/products/${r.product_id}`}
            className={`text-sm hover:underline ${tone}`}
          >
            {r.name}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Product visibility</h3>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : hidden.length === 0 && exclusive.length === 0 ? (
        <p className="text-sm text-gray-500">Sees the standard catalogue — nothing hidden, no exclusive products.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500 mb-1">Hidden from them ({hidden.length})</p>
            {hidden.length ? list(hidden, "text-red-700") : <p className="text-sm text-gray-400">None</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Exclusive to them ({exclusive.length})</p>
            {exclusive.length ? list(exclusive, "text-green-700") : <p className="text-sm text-gray-400">None</p>}
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">Change these from each product&apos;s page, under &ldquo;Who can see this product&rdquo;.</p>
    </div>
  );
}
