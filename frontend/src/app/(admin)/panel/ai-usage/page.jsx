"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// AI usage (backend internal/aiusage, table ai_usage): every Gemini call a
// feature makes, with the tokens Gemini reported, the photo's size and an
// estimated cost at the paid rates. First feature: packing's batch-photo read.

const FEATURES = { packing_batch_read: "Packing: batch photo" };
const n = (v) => Number(v || 0).toLocaleString("en-IN");
const usd = (v, d = 4) => `$${Number(v || 0).toFixed(d)}`;
const bytes = (v) => (v >= 1048576 ? `${(v / 1048576).toFixed(1)} MB` : `${Math.round((v || 0) / 1024)} KB`);
const istDay = (offset = 0) => {
  const d = new Date(Date.now() + 5.5 * 3600e3 - offset * 86400e3);
  return d.toISOString().slice(0, 10);
};
const when = (s) =>
  new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function AIUsagePage() {
  const [from, setFrom] = useState(istDay(29));
  const [to, setTo] = useState(istDay(0));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    apiFetch(`/admin/ai-usage?from=${from}&to=${to}`)
      .then((d) => {
        if (off) return;
        setData(d);
        setError("");
      })
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [from, to]);

  const totals = useMemo(() => {
    const t = { calls: 0, failed: 0, prompt: 0, image: 0, output: 0, thinking: 0, total: 0, cost: 0, bytes: 0 };
    for (const d of data?.days || []) {
      t.calls += d.calls;
      t.failed += d.failed;
      t.prompt += d.prompt_tokens;
      t.image += d.image_tokens;
      t.output += d.output_tokens;
      t.thinking += d.thinking_tokens;
      t.total += d.total_tokens;
      t.cost += d.cost_usd;
      t.bytes += d.image_bytes;
    }
    return t;
  }, [data]);

  return (
    <div className="max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">AI Usage</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Every AI call, with the tokens Gemini reported and the photo sent. Cost is estimated at the paid rates
            {data ? ` ($${data.input_usd_per_million} per million tokens in, $${data.output_usd_per_million} out)` : ""}; on the free tier
            the actual bill is nothing.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!data ? (
        !error && <Loader />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Calls" value={n(totals.calls)} sub={totals.failed ? `${n(totals.failed)} failed` : "none failed"} />
            <Card
              label="Tokens"
              value={n(totals.total)}
              sub={`${n(totals.image)} image · ${n(totals.prompt - totals.image)} text in · ${n(totals.output + totals.thinking)} out`}
            />
            <Card
              label="Estimated cost"
              value={usd(totals.cost, 3)}
              sub={totals.calls ? `${usd(totals.cost / totals.calls)} per call` : "—"}
            />
            <Card label="Photos sent" value={bytes(totals.bytes)} sub={totals.calls ? `${bytes(totals.bytes / totals.calls)} on average` : "—"} />
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">By day</h3>
          <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  {["Day", "Feature", "Calls", "Image tokens", "Text in", "Out", "Thinking", "Total tokens", "Est. cost", "Photos"].map((h, i) => (
                    <th key={h} className={`font-medium px-3 py-2 whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {data.days.map((d) => (
                  <tr key={d.day + d.feature}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{FEATURES[d.feature] || d.feature}</td>
                    <td className="px-3 py-2 text-right">
                      {n(d.calls)}
                      {d.failed > 0 && <span className="text-red-600"> ({d.failed} failed)</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{n(d.image_tokens)}</td>
                    <td className="px-3 py-2 text-right">{n(d.prompt_tokens - d.image_tokens)}</td>
                    <td className="px-3 py-2 text-right">{n(d.output_tokens)}</td>
                    <td className="px-3 py-2 text-right">{n(d.thinking_tokens)}</td>
                    <td className="px-3 py-2 text-right font-medium">{n(d.total_tokens)}</td>
                    <td className="px-3 py-2 text-right">{usd(d.cost_usd)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{bytes(d.image_bytes)}</td>
                  </tr>
                ))}
                {data.days.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                      No AI calls in these dates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Calls{" "}
            <span className="font-normal text-gray-400">
              {data.calls_in_span > data.calls_shown ? `latest ${data.calls_shown} of ${n(data.calls_in_span)}` : ""}
            </span>
          </h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  {["When", "By", "Order / product", "Photo", "Size", "Image tokens", "Total tokens", "Est. cost", "Took"].map((h, i) => (
                    <th key={h} className={`font-medium px-3 py-2 whitespace-nowrap ${i < 4 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {data.calls.map((c, i) => (
                  <tr key={i} className={c.ok ? "" : "bg-red-50/40"}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{when(c.at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.user || "—"}</td>
                    <td className="px-3 py-2 min-w-52">
                      {c.order_id ? (
                        <Link href={`/panel/orders/${c.order_id}`} className="text-gray-900 hover:underline">
                          {c.customer || "Order"}
                        </Link>
                      ) : (
                        <span className="text-gray-400">order deleted</span>
                      )}
                      {c.product && <span className="block text-[11px] text-gray-500">{c.product}</span>}
                      {!c.ok && <span className="block text-[11px] text-red-600">{c.error || "failed"}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {c.photo_url ? (
                        <a href={c.photo_url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline text-xs">
                          view
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {bytes(c.image_bytes)}
                      {c.image_width ? <span className="block text-[11px] text-gray-400">{c.image_width}×{c.image_height}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{n(c.image_tokens)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {n(c.total_tokens)}
                      <span className="block text-[11px] font-normal text-gray-400">
                        {n(c.prompt_tokens)} in · {n(c.output_tokens + c.thinking_tokens)} out
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{usd(c.cost_usd)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{(c.duration_ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
