"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useChatSocket } from "@/lib/chatSocket";
import { playSound, setSoundMuted, soundMuted } from "@/lib/sounds";

// Live alerts on the website: when a chat message or a notification (a
// broadcast, a new order, a ledger update…) arrives over the chat socket,
// play a sound and show a card in the corner that opens it. A new order
// (staff) plays the order sound and its card stays until dismissed; the
// rest chime and fade. Sounds: lib/sounds.js.
// Mounted once in the admin panel and the customer site, for logged-in
// users. Quiet for your own messages and for the chat you are looking at.
// Other parts of the page can refresh on the "live-notification" window event.

const SHOW_MS = 7000;

// Where a chat lives for this user: the admin panel or the customer site's panels.
function chatBase(pathname, role) {
  if (pathname?.startsWith("/panel") || role === "admin" || role === "employee") return "/panel/chat";
  if (pathname?.startsWith("/team-panel")) return "/team-panel/chat";
  if (pathname?.startsWith("/partner-panel")) return "/partner-panel/chat";
  return "/chat";
}

export default function LiveNotifications() {
  const { user } = useAuth();
  if (!user || user.role === "visitor") return null;
  return <Listener user={user} />;
}

function Listener({ user }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cards, setCards] = useState([]); // [{key, title, body, href, order}]
  const [muted, setMuted] = useState(soundMuted);

  // an order card stays until dismissed; others fade
  const show = useCallback((card) => {
    const key = `${Date.now()}-${Math.random()}`;
    setCards((cs) => [...cs.slice(-4), { ...card, key }]);
    if (!card.order) setTimeout(() => setCards((cs) => cs.filter((c) => c.key !== key)), SHOW_MS);
  }, []);

  const onMessage = useCallback(
    (m) => {
      if (!m || m.sender_id === user.id) return;
      // already looking at this chat: the chat itself shows it
      const query = typeof window !== "undefined" ? window.location.search : "";
      const here =
        pathname?.endsWith("/chat") &&
        ((m.conversation_id && query.includes(`thread=${m.conversation_id}`)) || (!m.conversation_id && query.includes(`with=${m.sender_id}`)));
      if (here && document.visibilityState === "visible") return;
      playSound("message");
      const base = chatBase(pathname, user.role);
      show({
        title: `New message${m.sender_name ? ` from ${m.sender_name}` : ""}`,
        body: m.body || (m.image_url ? "📷 Photo" : ""),
        href: m.conversation_id ? `${base}?thread=${m.conversation_id}` : `${base}?with=${m.sender_id}`,
      });
    },
    [pathname, show, user.id, user.role],
  );

  const onNotification = useCallback(
    (n) => {
      if (!n) return;
      // a new order for staff links to it in the panel
      const order = !!n.deep_link?.startsWith("/panel/orders/");
      playSound(order ? "order" : "notification");
      show({ title: n.title, body: n.body, href: n.deep_link || null, order });
      window.dispatchEvent(new CustomEvent("live-notification", { detail: n }));
    },
    [show],
  );

  useChatSocket(onMessage, onNotification);

  const toggleMute = () =>
    setMuted((m) => {
      setSoundMuted(!m);
      return !m;
    });

  useEffect(() => {
    // count unseen alerts in the tab title while the tab is in the background
    if (!cards.length || document.visibilityState === "visible") return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = `(${cards.length}) ${base}`;
    const back = () => {
      if (document.visibilityState === "visible") document.title = base;
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [cards]);

  if (!cards.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
      {cards.map((c) => (
        <div
          key={c.key}
          className={`bg-white rounded-xl shadow-xl p-3 flex gap-3 items-start border ${c.order ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-200"}`}
        >
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c.order ? "bg-emerald-500" : "bg-teal-500"}`} />
          <button
            type="button"
            onClick={() => {
              setCards((cs) => cs.filter((x) => x.key !== c.key));
              if (c.href) router.push(c.href);
            }}
            className="flex-1 min-w-0 text-left"
          >
            <div className="text-sm font-semibold text-gray-900 truncate">{c.title}</div>
            {c.body && <div className="text-xs text-gray-600 line-clamp-2 mt-0.5">{c.body}</div>}
          </button>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button type="button" onClick={() => setCards((cs) => cs.filter((x) => x.key !== c.key))} className="text-gray-400 hover:text-gray-700 leading-none" aria-label="Dismiss">
              ✕
            </button>
            <button type="button" onClick={toggleMute} className="text-[10px] text-gray-400 hover:text-gray-700" title="Sound for these alerts">
              {muted ? "🔇 unmute" : "🔔 mute"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
