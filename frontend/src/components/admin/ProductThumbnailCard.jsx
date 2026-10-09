"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

// The small copy of the product's first image that product cards load
// instead of the full-size original. Made automatically the first time a
// product gets an image; this box shows it and remakes it on demand — e.g.
// after the first image changes. The original images are never modified.
export default function ProductThumbnailCard({ productId, thumbUrl, sourceKey, firstImageKey, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const regenerate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/admin/products/${productId}/thumbnail`, { method: "POST" });
      onChange({ url: res.thumb_url, source: res.thumb_source_key });
    } catch (e) {
      setError(e.message || "Could not make the thumbnail");
    } finally {
      setBusy(false);
    }
  };

  const status = !firstImageKey
    ? { text: "Add an image first — the thumbnail is made from the first one.", tone: "text-gray-400" }
    : !thumbUrl
      ? { text: "No thumbnail yet — cards are loading the full-size image.", tone: "text-amber-700" }
      : sourceKey !== firstImageKey
        ? { text: "Made from an earlier first image. Regenerate to match the current one.", tone: "text-amber-700" }
        : { text: "Up to date with the first image.", tone: "text-green-700" };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="w-24 h-24 shrink-0 rounded-md border border-gray-200 bg-white overflow-hidden flex items-center justify-center">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="Card thumbnail" className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-400 text-center px-2">No thumbnail</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">Card thumbnail</p>
        <p className="text-xs text-gray-500">
          A small copy of the first image, used on product cards and lists so pages load faster. The product page and
          visual aids still use the full-size images.
        </p>
        <p className={`text-xs mt-1 ${status.tone}`}>{status.text}</p>
        {error && <p className="text-xs mt-1 text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={regenerate}
        disabled={busy || !firstImageKey}
        className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:border-gray-500 disabled:opacity-40"
      >
        {busy ? "Making…" : thumbUrl ? "Regenerate" : "Generate"}
      </button>
    </div>
  );
}
