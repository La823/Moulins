"use client";

import { LABELS, fieldValues } from "@/lib/chequeWriter";

// One cheque drawn at its real size in mm, for the preview and for printing.
// mode: "preview" (scanned background, empty fields shown by name),
// "print" (filled fields only), "test" (alignment test: outlines).
export default function ChequeView({ p, d, mode, sel, onFieldPointerDown, style }) {
  const { v } = fieldValues(p, d);
  const preview = mode === "preview";
  return (
    <div
      className="relative bg-white overflow-hidden text-black"
      style={{
        width: `${p.width}mm`, height: `${p.height}mm`, fontFamily: p.fontFamily,
        boxShadow: preview ? "0 0 0 1px #c9ced8, 0 2px 10px rgba(0,0,0,.06)" : undefined,
        outline: mode === "test" ? "0.25mm dashed #000" : undefined, outlineOffset: mode === "test" ? "-0.25mm" : undefined,
        ...style,
      }}
    >
      {preview && p.bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bg} alt="" className="absolute inset-0 w-full h-full pointer-events-none select-none" style={{ opacity: p.bgOpacity }} />
      )}
      {Object.entries(p.fields).map(([k, f]) => {
        const val = v[k];
        if (!f.show || (!val && !preview)) return null;
        const acpayee = k === "acpayee";
        const boxed = k === "date" && p.date.boxed && val;
        return (
          <div
            key={k}
            data-key={k}
            onPointerDown={onFieldPointerDown ? (e) => onFieldPointerDown(e, k) : undefined}
            className={`absolute whitespace-nowrap ${preview && !val ? "text-gray-400 italic" : ""} ${preview && onFieldPointerDown ? "cursor-move" : ""}`}
            style={{
              left: `${f.x}mm`, top: `${f.y}mm`, fontSize: `${f.size}pt`, textAlign: f.align, lineHeight: 1.05,
              // the crossing turns about its middle so a slant keeps it in its corner
              transform: f.rot ? `rotate(${f.rot}deg)` : undefined, transformOrigin: acpayee ? "50% 50%" : "0 50%",
              width: boxed ? undefined : `${f.w}mm`,
              outline: sel === k ? "1.5px solid #2457d6" : preview && onFieldPointerDown ? "1px dashed rgba(36,87,214,.45)" : mode === "test" ? "0.15mm dotted #666" : undefined,
              background: sel === k ? "rgba(36,87,214,.1)" : undefined,
              ...(acpayee && {
                borderTop: `0.3mm solid ${val ? "#000" : "#c4c9d3"}`, borderBottom: `0.3mm solid ${val ? "#000" : "#c4c9d3"}`,
                padding: "0.6mm 0", fontWeight: 700, letterSpacing: "0.3mm",
              }),
            }}
          >
            {boxed
              ? [...val].map((ch, i) => (
                  <span key={i} className="inline-block text-center" style={{ width: `${p.date.pitch}mm` }}>{ch}</span>
                ))
              : val || LABELS[k]}
          </div>
        );
      })}
    </div>
  );
}
