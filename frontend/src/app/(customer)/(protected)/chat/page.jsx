"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import ChatPage from "@/components/chat/ChatPage";

export default function CustomerChatPage() {
  // Reused as-is under /partner-panel/chat and /team-panel/chat (see those
  // routes' page.jsx) — those shells have no Navbar/Footer around them,
  // unlike the standalone storefront route, so they need a smaller
  // reserved offset to fit the chat box within the viewport without
  // forcing a page-level scroll.
  const pathname = usePathname();
  const isPanel = pathname?.startsWith("/partner-panel") || pathname?.startsWith("/team-panel");
  const basePath = pathname?.startsWith("/team-panel") ? "/team-panel/chat" : isPanel ? "/partner-panel/chat" : "/chat";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Messages</h1>
      <Suspense fallback={null}>
        <ChatPage basePath={basePath} heightOffsetPx={isPanel ? 160 : 220} />
      </Suspense>
    </div>
  );
}
