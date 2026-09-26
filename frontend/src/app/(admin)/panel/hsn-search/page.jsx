"use client";

import { useState } from "react";
import { HsnResult, useHsnLookup } from "@/components/admin/HsnLookup";

// Lookup against the HSN/SAC master (~22k codes). Code only — no description
// search — matching the endpoint.
export default function HsnSearchPage() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]); // recent lookups, newest first
  const { result, loading, error, lookup } = useHsnLookup();

  const run = async (e) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q) return;
    const data = await lookup(q);
    if (data?.nearest) {
      setHistory((prev) => [
        { query: data.query, code: data.nearest.code, desc: data.nearest.description, found: data.found },
        ...prev.filter((h) => h.query !== data.query),
      ].slice(0, 8));
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">HSN Code Search</h2>
        <p className="text-sm text-gray-500">
          Look up any HSN code from the master. Dots and spaces are ignored, so
          3004.90.99 works the same as 30049099.
        </p>
      </div>

      <form onSubmit={run} className="flex items-center gap-2 mb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. 30049099, 3004, or 30"
          autoFocus
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {result && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <HsnResult result={result} />
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="text-xs font-medium text-gray-500">Recent lookups</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr
                  key={h.query}
                  onClick={() => { setInput(h.query); lookup(h.query); }}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-2 font-mono text-gray-800 w-28">{h.query}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {!h.found && (
                      <span className="text-amber-600 mr-1">→ {h.code}</span>
                    )}
                    {h.desc.length > 80 ? h.desc.slice(0, 80) + "…" : h.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
