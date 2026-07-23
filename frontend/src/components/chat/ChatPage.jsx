"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useChatSocket } from "@/lib/chatSocket";
import { useAuth } from "@/context/AuthContext";

function displayName(u) {
  return u.username || u.phone_number || "Unknown";
}

// Threads have no single "other party" — pick the most useful name for
// *this* viewer: a customer sees their assigned employee's name (or
// "Support" if none is assigned yet); an employee or admin sees the
// customer's name, since that's what actually distinguishes one thread
// from another in their list.
function threadLabel(c, myId) {
  const others = (c.participants || []).filter((p) => p.id !== myId);
  const client = others.find((p) => p.role === "customer");
  if (client) return displayName(client);
  const employee = others.find((p) => p.role === "employee");
  if (employee) return displayName(employee);
  return "Support";
}

// Conversation-list name color: black for group threads, green for a direct
// chat with an admin, blue for a direct chat with an employee.
function nameColorClass(c) {
  if (c.type === "thread") return "text-gray-900";
  if (c.role === "admin") return "text-green-600";
  if (c.role === "employee") return "text-blue-600";
  return "text-gray-900";
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
  const [search, setSearch] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const handlePickImage = () => fileInputRef.current?.click();

  const handleImageSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSend = async () => {
    if ((!draft.trim() && !imageFile) || !active) return;
    const target = active.type === "thread" ? { conversationId: active.id } : { to: active.id };
    const body = draft.trim();

    let imageKey;
    if (imageFile) {
      setUploadingImage(true);
      try {
        const { upload_url, key } = await apiFetch("/messages/upload-url", {
          method: "POST",
          body: JSON.stringify({ filename: imageFile.name }),
        });
        await fetch(upload_url, { method: "PUT", body: imageFile, headers: { "Content-Type": imageFile.type } });
        imageKey = key;
      } catch {
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    const ok = sendMessage(target, body, imageKey);
    if (ok) {
      setDraft("");
      clearImage();
    }
  };

  const directIds = new Set(conversations.filter((c) => c.type === "direct").map((c) => c.id));
  const newContacts = contacts.filter((c) => !directIds.has(c.id));
  const filteredConversations = search.trim()
    ? conversations.filter((c) =>
        (c.type === "thread" ? threadLabel(c, user?.id) : displayName(c)).toLowerCase().includes(search.trim().toLowerCase())
      )
    : conversations;
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

          <div className="p-3 border-b border-gray-200">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-gray-900 placeholder:text-gray-400"
            />
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
            ) : filteredConversations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No chats match &quot;{search}&quot;</p>
            ) : (
              filteredConversations.map((c) => {
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
                      <p className={`text-[13px] font-medium truncate ${nameColorClass(c)}`}>
                        {c.type === "thread" ? threadLabel(c, user?.id) : displayName(c)}
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
                        ? threadLabel(activeThread, user?.id)
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
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                              <img
                                src={m.image_url}
                                alt="Attachment"
                                className="max-w-full max-h-64 rounded-lg object-cover"
                              />
                            </a>
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
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

              <div className="border-t border-gray-200">
                {imagePreview && (
                  <div className="px-4 pt-3 flex items-center gap-2">
                    <div className="relative">
                      <img src={imagePreview} alt="Selected" className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                      <button
                        onClick={clearImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-gray-900 text-white text-xs hover:bg-gray-700"
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                <div className="p-4 flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
                  <button
                    onClick={handlePickImage}
                    disabled={uploadingImage}
                    title="Attach image"
                    className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  </button>
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
                    disabled={(!draft.trim() && !imageFile) || uploadingImage}
                    className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {uploadingImage ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
