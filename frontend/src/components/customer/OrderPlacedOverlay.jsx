"use client";

import { useEffect } from "react";

// The moment after an order goes through, like the app's: a full green
// screen, a white circle that pops in with a tick drawing itself, then on to
// the order (after ~2.5s, or on click). The caller plays the order sound.
export default function OrderPlacedOverlay({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      onClick={onDone}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: "#0C9D58", animation: "op-fade .25s ease-out" }}
    >
      <style>{`
        @keyframes op-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes op-pop { 0% { transform: scale(0) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @keyframes op-draw { to { stroke-dashoffset: 0 } }
        @keyframes op-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      `}</style>
      <div
        className="w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-2xl"
        style={{ animation: "op-pop .55s cubic-bezier(.2,.9,.3,1.3) both" }}
      >
        <svg viewBox="0 0 52 52" className="w-20 h-20" fill="none">
          <path
            d="M14 27 l8 8 l16 -17"
            stroke="#0C9D58"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 48, strokeDashoffset: 48, animation: "op-draw .45s .4s ease-out forwards" }}
          />
        </svg>
      </div>
      <div className="text-center mt-8 px-6" style={{ animation: "op-rise .5s .75s ease-out both" }}>
        <p className="text-white text-3xl font-semibold">Order placed!</p>
        {message && <p className="text-white/90 mt-2">{message}</p>}
        <p className="text-white/70 text-sm mt-10">Click to view your order</p>
      </div>
    </div>
  );
}
