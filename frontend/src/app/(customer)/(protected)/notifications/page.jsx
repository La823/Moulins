"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerUrl, setViewerUrl] = useState(null);
  const router = useRouter();

  useEffect(() => {
    apiFetch("/notifications?limit=50")
      .then((data) => setItems(data.notifications || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (recipientId) => {
    setItems((prev) =>
      prev.map((n) => (n.recipient_id === recipientId ? { ...n, is_read: true } : n))
    );
    try {
      await apiFetch(`/notifications/${recipientId}/read`, { method: "PUT" });
    } catch (err) {
      console.error(err);
    }
  };

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.recipient_id);
    if (n.deep_link) {
      router.push(n.deep_link);
    } else if (n.image_url) {
      setViewerUrl(n.image_url);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Notifications</h1>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div
              key={n.recipient_id}
              className={`rounded-xl border overflow-hidden ${
                n.is_read ? "bg-white border-gray-200" : "bg-teal-50/60 border-teal-200"
              }`}
            >
              {n.image_url && (
                <button
                  type="button"
                  onClick={() => {
                    if (!n.is_read) markRead(n.recipient_id);
                    setViewerUrl(n.image_url);
                  }}
                  className="block w-full bg-gray-100"
                >
                  <img src={n.image_url} alt="" className="w-full h-auto max-h-80 object-contain" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleClick(n)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.is_read ? "font-medium text-gray-800" : "font-semibold text-gray-900"}`}>
                    {n.title}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                  </p>
                </div>
                {!n.is_read && (
                  <span className="w-2 h-2 mt-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {viewerUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}
        >
          <button
            onClick={() => setViewerUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
          <img
            src={viewerUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
