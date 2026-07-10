"use client";

import { Suspense } from "react";
import ChatPage from "@/components/chat/ChatPage";

export default function AdminChatPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Messages</h1>
      <Suspense fallback={null}>
        <ChatPage basePath="/admin/chat" />
      </Suspense>
    </>
  );
}
