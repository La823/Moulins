"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// Renders one HSN lookup result: the matched code, or the nearest ancestor
// when the exact code isn't in the master, plus the chain above it.
//
// The chain is the point. An 8-digit code's own description is often just
// "OTHER" — it only means anything read together with its parents, e.g.
// 30049099 "OTHER" under 3004 "MEDICAMENTS...". Showing the code alone
// would look like the lookup had failed.
export function HsnResult({ result, compact = false }) {
  if (!result) return null;

  if (!result.query) {
    return <p className="text-xs text-gray-400">Enter an HSN code.</p>;
  }
  if (!result.nearest) {
    return (
      <p className="text-xs text-red-600">
        No match for <span className="font-mono">{result.query}</span> — not in the HSN master.
      </p>
    );
  }

  const LEVELS = { 2: "Chapter", 4: "Heading", 6: "Subheading", 8: "Tariff item" };
  const exact = result.found;

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div
        className={`rounded-lg border px-3 py-2 ${
          exact ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"
        }`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold text-gray-900">{result.nearest.code}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {LEVELS[result.nearest.level] || `${result.nearest.level}-digit`}
          </span>
          {!exact && (
            <span className="text-[10px] text-amber-700">
              closest match — {result.query} is not itself in the master
            </span>
          )}
        </div>
        <p className="text-gray-700 mt-1 leading-snug">{result.nearest.description}</p>
      </div>

      {/* GST. Shown as candidates, never resolved to one number: a single
          HSN can carry several rates depending on which schedule entry the
          goods fall under (2106 spans 0% to 28%). Picking one for the user
          would be a guess written into a tax field. */}
      {result.gst?.length > 0 && (
        <div className="mt-2">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">
              GST {result.gst_via && result.gst_via !== result.nearest.code && (
                <span className="normal-case tracking-normal">
                  (published under {result.gst_via})
                </span>
              )}
            </span>
            {result.gst.length > 1 && (
              <span className="text-[10px] text-amber-700">
                {result.gst.length} possible rates — depends on the goods
              </span>
            )}
          </div>
          <ul className="space-y-1">
            {result.gst.map((g, i) => (
              <li key={i} className="flex gap-2 items-baseline leading-snug">
                <span
                  className={`font-mono font-semibold flex-shrink-0 w-12 text-right ${
                    g.igst == null ? "text-gray-300" : "text-gray-900"
                  }`}
                >
                  {g.igst == null ? "—" : `${g.igst}%`}
                </span>
                <span className="text-[11px] text-gray-600">
                  {g.description}
                  {g.cgst != null && g.sgst != null && (
                    <span className="text-gray-400">
                      {" "}· CGST {g.cgst}% + SGST {g.sgst}%
                    </span>
                  )}
                  {g.cess && <span className="text-amber-700"> · cess {g.cess}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.parents?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {result.parents
            .filter((p) => p.code !== result.nearest.code)
            .map((p) => (
              <li key={p.code} className="flex gap-2 text-gray-500 leading-snug">
                <span className="font-mono text-gray-400 flex-shrink-0 w-20">{p.code}</span>
                <span className="text-[11px]">{p.description}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// Shared lookup state so the product page and the search page behave
// identically — same endpoint, same error handling, same empty state.
export function useHsnLookup() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async (code) => {
    const q = (code || "").trim();
    if (!q) {
      setResult(null);
      setError("");
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/admin/hsn-codes?code=${encodeURIComponent(q)}`);
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message || "Lookup failed");
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, lookup, reset: () => { setResult(null); setError(""); } };
}
