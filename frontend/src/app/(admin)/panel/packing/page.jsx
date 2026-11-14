"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Packing: confirmed orders waiting for the dispatch team (who pack them in
// the app with a batch photo per product), and the orders packed lately.
// Each row opens the order, whose Packing section has the photos and log.

const VIEWS = [
  ["to_pack", "To pack"],
  ["packed", "Packed"],
];
const when = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function PackingPage() {
  const [view, setView] = useState("to_pack");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    apiFetch(`/admin/packing/orders?view=${view}`)
      .then((d) => {
        if (off) return;
        setRows(d.orders || []);
        setError("");
      })
      .catch((e) => {
        if (off) return;
        setError(e.message);
        setRows([]);
      });
    return () => {
      off = true;
    };
  }, [view]);

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Packing</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          The dispatch team packs confirmed orders in the app: a photo of each product&apos;s batch, checked against the order, then a tick.
          When every product is ticked the order becomes Packed.
        </p>
      </div>

      <div className="mb-3 inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white">
        {VIEWS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setRows(null);
              setView(k);
            }}
            className={`px-3 py-1.5 text-sm ${view === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!rows ? (
        <Loader />
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          {view === "packed" ? "No packed orders yet." : "Nothing waiting to be packed."}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Customer</th>
                <th className="text-left font-medium px-4 py-2">Ordered</th>
                <th className="text-right font-medium px-4 py-2">Products ticked</th>
                <th className="text-left font-medium px-4 py-2">{view === "packed" ? "Packed" : "Progress"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/panel/orders/${r.id}`} className="text-gray-900 hover:underline">
                      {r.customer || "Unknown"}
                    </Link>
                    {r.city && <span className="block text-[11px] text-gray-400">{r.city}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {r.ticked} / {r.items}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {view === "packed" ? (
                      <>
                        {r.packed_by || "—"} · {when(r.packed_at)}
                      </>
                    ) : r.started ? (
                      <span className="text-teal-700">Being packed</span>
                    ) : (
                      <span className="text-gray-400">Not started</span>
                    )}
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
