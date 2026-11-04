"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// Unfinished orders: staff orders being built on the new-order page that
// haven't been placed yet. The new-order page saves them as it goes and
// lists them too; this page is the same list on its own, for anyone to
// pick one up. Continue reopens it on the new-order page.

const when = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function OrderDraftsPage() {
  const [data, setData] = useState(null); // {list, at}
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let off = false;
    apiFetch("/admin/order-drafts")
      .then((d) => {
        if (off) return;
        setData({ list: d.drafts || [], at: Date.now() });
        setError("");
      })
      .catch((e) => !off && setError(e.message || "Could not load unfinished orders"));
    return () => {
      off = true;
    };
  }, [reload]);

  const ago = (d) => {
    const m = Math.round((data.at - new Date(d).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
    const days = Math.round(m / 1440);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const discard = async (d) => {
    if (!window.confirm(`Discard the unfinished order for ${d.customer_name || d.customer_phone || "no customer"}?`)) return;
    try {
      await apiFetch(`/admin/order-drafts/${d.id}`, { method: "DELETE" });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message || "Could not discard it");
    }
  };

  const needle = search.trim().toLowerCase();
  const list = (data?.list || []).filter(
    (d) => !needle || `${d.customer_name || ""} ${d.customer_phone || ""} ${d.created_by || ""} ${d.updated_by || ""}`.toLowerCase().includes(needle),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Unfinished Orders</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Orders being built for customers that haven&apos;t been placed yet. They save themselves while being built; placing one removes it from here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <span className="text-sm text-gray-400">{data.list.length} unfinished</span>}
          <Link href="/panel/orders" className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            All orders
          </Link>
          <Link href="/panel/orders/new" className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            Create Order
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone or staff name"
            className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button onClick={() => setReload((n) => n + 1)} className="text-sm text-gray-500 hover:text-gray-800">
            Refresh
          </button>
        </div>

        {!data ? (
          <p className="p-8 text-center text-sm text-gray-400 animate-pulse">Loading…</p>
        ) : list.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            {data.list.length ? "No unfinished orders match." : "No unfinished orders — every order started has been placed or discarded."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Customer</th>
                  <th className="text-right font-medium px-4 py-2">Items</th>
                  <th className="text-left font-medium px-4 py-2">Started</th>
                  <th className="text-left font-medium px-4 py-2">Last changed</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="text-gray-900 font-medium">{d.customer_name || (d.customer_id ? "Unnamed" : "No customer yet")}</div>
                      {d.customer_phone && <div className="text-xs text-gray-400">{d.customer_phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{d.item_count}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{d.created_by || "staff"}</div>
                      <div className="text-xs text-gray-400">{when(d.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>
                        {d.updated_by || d.created_by || "staff"} · {ago(d.updated_at)}
                      </div>
                      <div className="text-xs text-gray-400">{when(d.updated_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/panel/orders/new?draft=${d.id}`}
                        className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800"
                      >
                        Continue
                      </Link>
                      <button onClick={() => discard(d)} className="ml-2 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-white">
                        Discard
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
