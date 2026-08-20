"use client";

// Lightweight toast stack, fixed to the bottom-right of the viewport.
// Usage: const { toasts, pushToast, dismissToast } = useToasts(); render
// <ToastStack toasts={toasts} onDismiss={dismissToast} /> once per page.

import { useCallback, useState } from "react";

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((type, message, duration = 4000) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
  }, [dismissToast]);

  return { toasts, pushToast, dismissToast };
}

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium min-w-[220px] ${
            t.type === "success" ? "bg-gray-900 text-white" : "bg-red-600 text-white"
          }`}
        >
          {t.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-white/70 hover:text-white flex-shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
