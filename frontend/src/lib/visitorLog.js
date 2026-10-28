// The visitors log: what a visitor (a guest signed in with Google) looks at
// on the site — product information only — for the admin Visitors page.
// Events are queued and sent every few seconds in one request, and when the
// tab is hidden, so browsing never waits on it. Does nothing for anyone who
// isn't a visitor. See the privacy policy, "Guest Browsing Activity".
import { apiFetch } from "@/lib/api";

const FLUSH_MS = 5000;
let queue = [];
let timer = null;
const lastSent = new Map(); // same event within 30s counts once

// The role is in the login token itself, so this needs no React context.
function isVisitorSession() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return false;
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "visitor";
  } catch {
    return false;
  }
}

function flush(keepalive = false) {
  clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const events = queue.splice(0, 50);
  apiFetch("/visitor/events", { method: "POST", body: JSON.stringify({ events }), keepalive }).catch(() => {});
  if (queue.length) timer = setTimeout(flush, FLUSH_MS);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

/**
 * Logs one visitor event:
 *   { kind: "product_view", product_id }
 *   { kind: "search", query, result_count }
 *   { kind: "division_view", label }
 *   { kind: "locked_action", label, product_id? }
 */
export function logVisitorEvent(event) {
  if (typeof window === "undefined" || !isVisitorSession()) return;
  const key = JSON.stringify(event);
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < 30000) return;
  lastSent.set(key, now);
  queue.push({ ...event, occurred_at: new Date().toISOString() });
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}
