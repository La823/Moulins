"use client";

import ProductAssistantChat from "@/components/shared/ProductAssistantChat";

export default function ProductAssistantPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-6">Product Assistant</h1>
      <ProductAssistantChat endpoint="/admin/product-assistant/ask" productHref={(id) => `/panel/products/${id}`} />
    </div>
  );
}
