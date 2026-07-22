"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useChatSocket } from "@/lib/chatSocket";
import { useAuth } from "@/context/AuthContext";

function displayName(u) {
  return u.username || u.phone_number || "Unknown";
}

// Threads have no single "other party" — label them by their participants
// (the customer + whichever employee, if any) instead.
function threadLabel(c) {
  if (!c.participants || c.participants.length === 0) return "Care Team";
  return c.participants
    .map((p) => `${displayName(p)}${p.role === "employee" ? " (Employee)" : ""}`)
    .join(" · ");
}

export default function ChatPage({ basePath }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialWith = searchParams.get("with");
  const initialThread = searchParams.get("thread");

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  // active = { type: "direct"|"thread", id: <userId or conversationId> }
  const [active, setActive] = useState(
    initialThread ? { type: "thread", id: initialThread } : initialWith ? { type: "direct", id: initialWith } : null
  );
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
    if (!active) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    const path = active.type === "thread" ? `/messages/thread/${active.id}` : `/messages/${active.id}`;
    apiFetch(path)
      .then((data) => setMessages(data || []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));
    const param = active.type === "thread" ? `thread=${active.id}` : `with=${active.id}`;
    router.replace(`${basePath}?${param}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleIncoming = useCallback(
    (msg) => {
      if (active?.type === "thread" && msg.conversation_id === active.id) {
        setMessages((prev) => [...prev, msg]);
      } else if (active?.type === "direct" && msg.conversation_id && msg.sender_id === user?.id) {
        // First message to a raw contact (employee/customer/admin) resolves
        // server-side into a group thread — follow the echo into that thread.
        setActive({ type: "thread", id: msg.conversation_id });
        setMessages((prev) => [...prev, msg]);
      } else if (active?.type === "direct" && !msg.conversation_id) {
        const otherId = msg.sender_id === user?.id ? msg.receiver_id : msg.sender_id;
        if (otherId === active.id) setMessages((prev) => [...prev, msg]);
      }
      loadConversations();
    },
    [active, user, loadConversations]
  );

  const { connected, sendMessage } = useChatSocket(handleIncoming);

  const handleSend = () => {
    if (!draft.trim() || !active) return;
    const target = active.type === "thread" ? { conversationId: active.id } : { to: active.id };
    const ok = sendMessage(target, draft.trim());
    if (ok) setDraft("");
  };

  const directIds = new Set(conversations.filter((c) => c.type === "direct").map((c) => c.id));
  const newContacts = contacts.filter((c) => !directIds.has(c.id));
  const activeThread = active?.type === "thread" ? conversations.find((c) => c.type === "thread" && c.id === active.id) : null;
  const activeDirectPartner =
    active?.type === "direct"
      ? conversations.find((c) => c.type === "direct" && c.id === active.id) || contacts.find((c) => c.id === active.id)
      : null;

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
                      setActive({ type: "direct", id: c.id });
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
              conversations.map((c) => {
                const isActive = active?.type === c.type && active.id === c.id;
                return (
                  <button
                    key={`${c.type}-${c.id}`}
                    onClick={() => setActive({ type: c.type, id: c.id })}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 flex items-start justify-between gap-2 ${
                      isActive ? "bg-gray-50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.type === "thread" ? threadLabel(c) : displayName(c)}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-[180px]">{c.last_message}</p>
                    </div>
                    {c.unread_count > 0 && (
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold bg-gray-900 text-white rounded-full">
                        {c.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="md:col-span-2 flex flex-col h-full">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Select a conversation or start a new chat
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {active.type === "thread"
                      ? activeThread
                        ? threadLabel(activeThread)
                        : "..."
                      : activeDirectPartner
                        ? displayName(activeDirectPartner)
                        : "..."}
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
                          {!mine && active.type === "thread" && m.sender_name && (
                            <p className="text-[10px] font-semibold mb-0.5 text-gray-500 capitalize">
                              {m.sender_name}
                              {m.sender_role === "admin" ? " · Admin" : m.sender_role === "employee" ? " · Employee" : ""}
                            </p>
                          )}
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
