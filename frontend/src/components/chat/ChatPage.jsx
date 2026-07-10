"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useChatSocket } from "@/lib/chatSocket";
import { useAuth } from "@/context/AuthContext";

function displayName(u) {
  return u.username || u.phone_number || "Unknown";
}

export default function ChatPage({ basePath }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialWith = searchParams.get("with");

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeId, setActiveId] = useState(initialWith || null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef(null);

  const loadConversations = useCallback(() => {
    apiFetch("/messages/conversations")
      .then((data) => setConversations(data || []))
      .catch(() => setConversations([]));
  }, []);

  useEffect(() => {
    loadConversations();
    apiFetch("/chat-contacts")
      .then((data) => setContacts(data || []))
      .catch(() => setContacts([]));
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    apiFetch(`/messages/${activeId}`)
      .then((data) => setMessages(data || []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));
    router.replace(`${basePath}?with=${activeId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleIncoming = useCallback(
    (msg) => {
      const otherId = msg.sender_id === user?.id ? msg.receiver_id : msg.sender_id;
      if (otherId === activeId) {
        setMessages((prev) => [...prev, msg]);
      }
      loadConversations();
    },
    [activeId, user, loadConversations]
  );

  const { connected, sendMessage } = useChatSocket(handleIncoming);

  const handleSend = () => {
    if (!draft.trim() || !activeId) return;
    const ok = sendMessage(activeId, draft.trim());
    if (ok) setDraft("");
  };

  const conversationIds = new Set(conversations.map((c) => c.user_id));
  const newContacts = contacts.filter((c) => !conversationIds.has(c.id));
  const activePartner =
    conversations.find((c) => c.user_id === activeId) ||
    contacts.find((c) => c.id === activeId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>
      <div className="grid grid-cols-1 md:grid-cols-3 h-full">
        {/* Conversation list */}
        <div className="md:col-span-1 border-r border-gray-200 flex flex-col h-full">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Chats</h2>
            <button
              onClick={() => setShowContacts((s) => !s)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              {showContacts ? "Close" : "+ New chat"}
            </button>
          </div>

          {showContacts && (
            <div className="border-b border-gray-200 max-h-64 overflow-y-auto">
              {newContacts.length === 0 ? (
                <p className="text-xs text-gray-400 italic p-4">No new contacts available</p>
              ) : (
                newContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setShowContacts(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-900">{displayName(c)}</p>
                    <p className="text-xs text-gray-400 capitalize">{c.role}</p>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No conversations yet</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.user_id}
                  onClick={() => setActiveId(c.user_id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 flex items-start justify-between gap-2 ${
                    activeId === c.user_id ? "bg-gray-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{displayName(c)}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[180px]">{c.last_message}</p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold bg-gray-900 text-white rounded-full">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="md:col-span-2 flex flex-col h-full">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Select a conversation or start a new chat
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {activePartner ? displayName(activePartner) : "..."}
                  </p>
                  <p className="text-xs text-gray-400">{connected ? "Connected" : "Connecting..."}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingHistory ? (
                  <p className="text-xs text-gray-400 text-center">Loading...</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center">No messages yet — say hello</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${
                            mine ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`text-[10px] mt-1 ${mine ? "text-gray-300" : "text-gray-400"}`}>
                            {new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="p-4 border-t border-gray-200 flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
