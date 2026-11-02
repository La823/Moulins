"use client";

import { useEffect, useRef, useState } from "react";
import { orderCorners, warpToRect } from "@/lib/chequeWriter";

const CORNER_NAMES = ["top-left", "top-right", "bottom-right", "bottom-left"];

// Mark the 4 corners of a photographed cheque; it is straightened and
// stretched to the layout's exact size (8 px per mm) and handed back as a
// JPEG data URL.
export default function WarpModal({ file, width, height, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const src = useRef(null);
  const k = useRef(1);
  const drag = useRef(-1);
  const [pts, setPts] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 2400 / Math.max(img.width, img.height)); // cap working size
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      src.current = c;
      const maxW = (boxRef.current?.clientWidth || 800) - 4, maxH = window.innerHeight * 0.65;
      k.current = Math.min(maxW / c.width, maxH / c.height, 1);
      canvasRef.current.width = Math.round(c.width * k.current);
      canvasRef.current.height = Math.round(c.height * k.current);
      setReady(true);
    };
    img.onerror = () => onCancel("Could not read that image");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onCancel]);

  useEffect(() => {
    if (!ready) return;
    const cv = canvasRef.current, ctx = cv.getContext("2d"), K = k.current;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src.current, 0, 0, cv.width, cv.height);
    const P = pts.length === 4 ? orderCorners(pts) : pts;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2457d6";
    ctx.fillStyle = "rgba(36,87,214,.15)";
    if (P.length > 1) {
      ctx.beginPath();
      P.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](x * K, y * K));
      if (P.length === 4) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    }
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * K, y * K, 7, 0, 7);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
    }
  }, [pts, ready]);

  const at = (e) => {
    const r = e.target.getBoundingClientRect(), sc = e.target.width / r.width;
    return [(e.clientX - r.left) * sc / k.current, (e.clientY - r.top) * sc / k.current];
  };
  const down = (e) => {
    const [x, y] = at(e);
    let i = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) * k.current < 14);
    if (i < 0 && pts.length < 4) {
      i = pts.length;
      setPts([...pts, [x, y]]);
    }
    drag.current = i;
    if (i >= 0) e.target.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (drag.current < 0) return;
    const [x, y] = at(e), S = src.current;
    const next = [...pts];
    next[drag.current] = [Math.max(0, Math.min(S.width, x)), Math.max(0, Math.min(S.height, y))];
    setPts(next);
  };
  const apply = (corners) => {
    const out = warpToRect(src.current, orderCorners(corners), Math.round(width * 8), Math.round(height * 8));
    onDone(out.toDataURL("image/jpeg", 0.82));
  };
  const whole = () => {
    const { width: w, height: h } = src.current;
    apply([[0, 0], [w, 0], [w, h], [0, h]]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
      <div ref={boxRef} className="bg-white rounded-xl p-5 w-full max-w-5xl max-h-full overflow-auto">
        <h2 className="text-base font-semibold text-gray-900">Mark the 4 corners of the cheque</h2>
        <p className="text-xs text-gray-500 mt-1">
          {pts.length < 4
            ? `Click the ${CORNER_NAMES[pts.length]} corner of the cheque paper (${pts.length}/4). Corners can be clicked in any order.`
            : 'Drag any corner to fine-tune it, then press "Straighten & use".'}
        </p>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drag.current = -1)}
          className="block max-w-full my-3 cursor-crosshair touch-none bg-gray-100 rounded-md"
        />
        <div className="flex flex-wrap gap-2">
          <button disabled={pts.length < 4} onClick={() => apply(pts)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40">
            Straighten &amp; use
          </button>
          <button disabled={!ready} onClick={whole} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50">
            Use whole image (already cropped)
          </button>
          <button onClick={() => setPts([])} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50">Start over</button>
          <button onClick={() => onCancel()} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
