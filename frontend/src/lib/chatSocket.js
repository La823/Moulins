"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WS_URL = API_URL.replace(/^http/, "ws");

// Maintains one live WebSocket connection to the chat backend for the
// lifetime of the page, reconnecting on drop. onMessage fires for every
// {type:"message", message:{...}} frame the server pushes.
export function useChatSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let cancelled = false;
    let retryTimer = null;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "message") onMessageRef.current?.(data.message);
        } catch {
          // ignore malformed frames
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  // target is either { to: <userId> } (start/continue by user id — resolved
  // server-side into a group thread or the legacy direct path depending on
  // roles) or { conversationId: <id> } (continue a known group thread).
  const sendMessage = useCallback((target, body) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload =
        target && target.conversationId
          ? { conversation_id: target.conversationId, body }
          : { to: target?.to ?? target, body };
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { connected, sendMessage };
}
