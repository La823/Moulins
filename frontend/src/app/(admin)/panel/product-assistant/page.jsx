"use client";

import Link from "next/link";
import ProductAssistantChat from "@/components/shared/ProductAssistantChat";

// The same assistant visitors use on /product-assistant, through an admin
// endpoint without the public per-IP question limit — staff share one
// office IP.
export default function ProductAssistantPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Product Assistant</h1>
        <p className="text-sm text-gray-500 mt-1">
          The assistant on the public <Link href="/product-assistant" target="_blank" className="underline hover:text-gray-700">/product-assistant</Link> page.
          It answers from public products only (active, not exclusive) and their PDFs.
        </p>
      </div>
      <ProductAssistantChat endpoint="/admin/product-assistant/ask" productHref={(id) => `/panel/products/${id}`} />
    </div>
  );
}
