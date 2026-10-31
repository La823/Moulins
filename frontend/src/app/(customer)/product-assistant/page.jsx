"use client";

import ProductAssistantChat from "@/components/shared/ProductAssistantChat";

export default function ProductAssistantPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-16 sm:px-8">
      <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-3">Moulins Pharmaceuticals</p>
      <h1 className="text-3xl md:text-4xl font-light text-gray-900">
        Product <span className="font-medium">Assistant</span>
      </h1>
      <p className="mt-3 mb-8 text-gray-500">
        Ask about any of our products — what&apos;s in it, what it&apos;s for, how to use it and pack details.
      </p>
      <ProductAssistantChat endpoint="/public/product-assistant/ask" />
    </div>
  );
}
