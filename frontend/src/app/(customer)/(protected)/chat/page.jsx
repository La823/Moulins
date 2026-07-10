"use client";

import { Suspense } from "react";
import ChatPage from "@/components/chat/ChatPage";

export default function CustomerChatPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Messages</h1>
      <Suspense fallback={null}>
        <ChatPage basePath="/chat" />
      </Suspense>
    </div>
  );
}
