"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

const LEVELS = [
  { value: "", label: "All levels" },
  { value: "2", label: "2 — Chapter" },
  { value: "4", label: "4 — Heading" },
  { value: "6", label: "6 — Subheading" },
  { value: "8", label: "8 — Tariff item" },
];

const LEVEL_LABEL = { 2: "Chapter", 4: "Heading", 6: "Subheading", 8: "Tariff item" };
const RATE_COLOUR = {
  0: "bg-gray-100 text-gray-600",
  5: "bg-green-50 text-green-700",
  12: "bg-blue-50 text-blue-700",
  18: "bg-amber-50 text-amber-700",
  28: "bg-red-50 text-red-700",
};

// Browse the full HSN master with the GST rates that apply to each code.
// Rates resolve through the parent chain, matching the single-code lookup —
// they are published at chapter/heading level, so most 8-digit codes have
// none of their own and would otherwise show blank.
export default function HsnCodesPage() {
  const [data, setData] = useState(null);
  const [rateOptions, setRateOptions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [level, setLevel] = useState("");
  const [rate, setRate] = useState("");
  const [hasGst, setHasGst] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) p.set("q", q);
      if (level) p.set("level", level);
      if (rate) p.set("rate", rate);
      if (hasGst) p.set("has_gst", hasGst);
      const res = await apiFetch(`/admin/hsn-codes/browse?${p}`);
      setData(res);
      if (res.rate_options?.length) setRateOptions(res.rate_options);
    } catch (err) {
      setError(err.message);
      setData({ items: [], total: 0, total_pages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, q, level, rate, hasGst]);

  useEffect(() => { load(); }, [load]);
  // Any filter change invalidates the current page number.
  useEffect(() => { setPage(1); }, [q, level, rate, hasGst]);

  if (data === null) return <Loader />;

  const totalPages = data.total_pages || 0;

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">HSN Codes &amp; GST Rates</h2>
        <p className="text-sm text-gray-500">
          The full HSN master with the GST rates published against each code.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(queryInput.trim()); }}
          className="flex items-center gap-2"
        >
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Code prefix or description…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Search
          </button>
          {q && (
            <button
              type="button"
              onClick={() => { setQueryInput(""); setQ(""); }}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </form>

        <select value={level} onChange={(e) => setLevel(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>

        <select value={rate} onChange={(e) => setRate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">All GST rates</option>
          {rateOptions.map((r) => <option key={r} value={String(r)}>{r}%</option>)}
        </select>

        <select value={hasGst} onChange={(e) => setHasGst(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">With or without a rate</option>
          <option value="yes">Has a GST rate</option>
          <option value="no">No GST rate</option>
        </select>

        <span className="text-xs text-gray-400 ml-auto">
          {loading ? "Loading…" : `${data.total.toLocaleString("en-IN")} codes`}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-28">Code</th>
              <th className="text-left font-medium px-4 py-2 w-24">Level</th>
              <th className="text-left font-medium px-4 py-2">Description</th>
              <th className="text-left font-medium px-4 py-2 w-48">GST (IGST)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.items.map((it) => (
              <tr key={it.code} className="text-gray-800 align-top">
                <td className="px-4 py-2 font-mono text-gray-900">{it.code}</td>
                <td className="px-4 py-2 text-xs text-gray-400">
                  {LEVEL_LABEL[it.level] || `${it.level}-digit`}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 leading-snug">
                  {it.description}
                </td>
                <td className="px-4 py-2">
                  {it.rates.length === 0 ? (
                    <span className="text-gray-300 text-xs">—</span>
                  ) : (
                    <div className="flex items-center gap-1 flex-wrap">
                      {it.rates.map((r) => (
                        <span key={r}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${RATE_COLOUR[r] || "bg-gray-100 text-gray-600"}`}>
                          {r}%
                        </span>
                      ))}
                      {/* Which code the rates came from — usually an ancestor,
                          since rates are published at chapter/heading level. */}
                      {it.rate_via && it.rate_via !== it.code && (
                        <span className="text-[10px] text-gray-400">via {it.rate_via}</span>
                      )}
                      {it.rates.length > 1 && (
                        <span className="text-[10px] text-amber-600" title={`${it.entry_count} schedule entries`}>
                          depends on goods
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-xs">
                  No codes match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 mt-3">
          <button
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500 tabular-nums">
            Page {page} of {totalPages.toLocaleString("en-IN")}
          </span>
          <button
            onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
