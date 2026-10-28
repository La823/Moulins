"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// Visitors: guests who signed in with Google to look around. Who they are,
// when they come, what products they look at and search for, and their
// partnership requests. Activity is product information only and is kept
// 6 months (see the privacy policy).

const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

function ago(d) {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

// "Chrome on Android" from a browser's user agent — close enough for staff.
function device(ua) {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
    ? "iPhone / iPad"
    : /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua)
    ? "Mac"
    : /Linux/i.test(ua)
    ? "Linux"
    : "Other";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
    ? "Opera"
    : /SamsungBrowser/.test(ua)
    ? "Samsung Internet"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  return `${browser} on ${os}`;
}

const REQUEST_STYLE = {
  new: "bg-blue-50 text-blue-700",
  contacted: "bg-amber-50 text-amber-700",
  converted: "bg-green-50 text-green-700",
  declined: "bg-gray-100 text-gray-500",
};

function RequestBadge({ status }) {
  if (!status) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${REQUEST_STYLE[status] || ""}`}>
      {status}
    </span>
  );
}

function Avatar({ v, size = "w-8 h-8" }) {
  const initial = (v.name || v.email || "?").trim()[0]?.toUpperCase();
  return v.picture_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={v.picture_url} alt="" referrerPolicy="no-referrer" className={`${size} rounded-full object-cover`} />
  ) : (
    <span className={`${size} rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center`}>
      {initial}
    </span>
  );
}

export default function VisitorsPage() {
  const [insights, setInsights] = useState(null);
  const [days, setDays] = useState(30);
  const [data, setData] = useState({ visitors: [], total: 0, page: 1, limit: 50 });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    apiFetch(`/admin/visitors/insights?days=${days}`)
      .then(setInsights)
      .catch((e) => setError(e.message));
  }, [days]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("search", query);
    if (openOnly) params.set("open_requests", "true");
    apiFetch(`/admin/visitors?${params}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, query, openOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Visitors</h2>
        <p className="text-sm text-gray-500">
          Guests who signed in with Google to look around — when they come, what they look at and search for, and
          their requests to become a partner. Activity is kept for 6 months. Requests are handled on{" "}
          <Link href="/panel/partnership-requests" className="text-blue-600 hover:underline">
            Partnership Requests
          </Link>
          .
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <Insights insights={insights} days={days} setDays={setDays} />

      <div className="flex flex-wrap items-center gap-3 mt-8 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          className="w-64 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded border-gray-300"
          />
          Open partnership requests only
        </label>
        <span className="text-xs text-gray-400 ml-auto">
          {data.total} visitor{data.total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Visitor</th>
              <th className="px-3 py-2.5 font-medium">Signed up</th>
              <th className="px-3 py-2.5 font-medium">Last sign-in</th>
              <th className="px-3 py-2.5 font-medium">Last active</th>
              <th className="px-3 py-2.5 font-medium text-right">Sign-ins</th>
              <th className="px-3 py-2.5 font-medium text-right">Views</th>
              <th className="px-3 py-2.5 font-medium text-right">Searches</th>
              <th className="px-3 py-2.5 font-medium">Partner request</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.visitors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : data.visitors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-gray-400">
                  No visitors{query || openOnly ? " match" : " yet"}.
                </td>
              </tr>
            ) : (
              data.visitors.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar v={v} />
                      <div className="min-w-0">
                        <p className="text-gray-900 truncate">{v.name || "—"}</p>
                        <p className="text-xs text-gray-400 truncate">{v.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{ago(v.created_at)}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{ago(v.last_login_at)}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{ago(v.last_seen_at)}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-right">{v.sign_in_count}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-right">{v.product_views}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-right">{v.searches}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <RequestBadge status={v.request_status} />
                      {v.request_firm && <span className="text-xs text-gray-500 truncate max-w-[10rem]">{v.request_firm}</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded-md disabled:opacity-40">
            Previous
          </button>
          <span className="text-gray-500">
            Page {page} of {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded-md disabled:opacity-40">
            Next
          </button>
        </div>
      )}

      {selected && <VisitorDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Insights({ insights, days, setDays }) {
  const stat = (label, value) => (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-light text-gray-900 mt-0.5">{value ?? "—"}</p>
    </div>
  );
  const list = (title, rows, empty, link) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {!rows ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-baseline gap-2 text-sm">
              <span className="text-gray-300 text-xs w-4 text-right">{i + 1}</span>
              {link && r.id ? (
                <Link href={`/panel/products/${r.id}`} className="flex-1 truncate text-gray-800 hover:text-blue-600">
                  {r.name || "(removed product)"}
                </Link>
              ) : (
                <span className="flex-1 truncate text-gray-800">{r.name}</span>
              )}
              <span className="text-xs text-gray-500 whitespace-nowrap" title={`${r.visitors} visitor${r.visitors === 1 ? "" : "s"}`}>
                {r.count} · {r.visitors} ppl
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Last</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-full text-xs border ${
              days === d ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {d} days
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat("All visitors", insights?.total_visitors)}
        {stat(`New, last ${days} days`, insights?.new_visitors)}
        {stat(`Active, last ${days} days`, insights?.active_visitors)}
        {stat("Open partner requests", insights?.open_requests)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {list("Most viewed products", insights?.top_products, "No product views yet.", true)}
        {list("Top searches", insights?.top_searches, "No searches yet.")}
        {list("Searches with no results", insights?.empty_searches, "None — every search found something.")}
      </div>
    </div>
  );
}

function eventText(e) {
  switch (e.kind) {
    case "product_view":
      return { icon: "👁", text: <>Viewed {e.product_id ? <Link href={`/panel/products/${e.product_id}`} className="text-blue-600 hover:underline">{e.product_name || "a product"}</Link> : "a product"}</> };
    case "search":
      return { icon: "🔍", text: <>Searched “{e.query}” <span className="text-gray-400">· {e.result_count ?? "?"} result{e.result_count === 1 ? "" : "s"}</span></> };
    case "division_view":
      return { icon: "📂", text: <>Browsed {e.label}</> };
    case "locked_action":
      return { icon: "🔒", text: <>Tried {e.label}{e.product_name ? ` — ${e.product_name}` : ""} <span className="text-gray-400">(partners only)</span></> };
    case "request_sent":
      return { icon: "✉️", text: <>Sent a partnership request{e.label ? ` for ${e.label}` : ""}</> };
    default:
      return { icon: "•", text: e.kind };
  }
}

function VisitorDrawer({ id, onClose }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("activity");

  useEffect(() => {
    apiFetch(`/admin/visitors/${id}`)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const v = d?.visitor;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          {v ? (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar v={v} size="w-11 h-11" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{v.name || "—"}</p>
                <a href={`mailto:${v.email}`} className="text-sm text-blue-600 hover:underline truncate block">
                  {v.email}
                </a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">{error || "Loading…"}</p>
          )}
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>

        {v && (
          <div className="px-5 py-4 space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Signed up</dt>
              <dd className="text-gray-900">{fmt(v.created_at)}</dd>
              <dt className="text-gray-500">Last sign-in</dt>
              <dd className="text-gray-900">{fmt(v.last_login_at)}</dd>
              <dt className="text-gray-500">Last active</dt>
              <dd className="text-gray-900">{fmt(v.last_seen_at)}</dd>
              <dt className="text-gray-500">Sign-ins</dt>
              <dd className="text-gray-900">{v.sign_in_count}</dd>
              <dt className="text-gray-500">Product views · searches</dt>
              <dd className="text-gray-900">
                {v.product_views} · {v.searches}
              </dd>
              <dt className="text-gray-500">Last device</dt>
              <dd className="text-gray-900">{d.sign_ins[0] ? device(d.sign_ins[0].user_agent) : "—"}</dd>
            </dl>

            <div className="flex gap-1 border-b border-gray-100">
              {[
                ["activity", `Activity (${d.events.length})`],
                ["signins", `Sign-ins (${d.sign_ins.length})`],
                ["requests", `Partner requests (${d.requests.length})`],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-2 text-sm -mb-px border-b-2 ${
                    tab === k ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "activity" &&
              (d.events.length === 0 ? (
                <p className="text-sm text-gray-400">No activity recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {d.events.map((e, i) => {
                    const { icon, text } = eventText(e);
                    return (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="w-5 text-center">{icon}</span>
                        <span className="flex-1 text-gray-800">{text}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmt(e.occurred_at)}</span>
                      </li>
                    );
                  })}
                </ol>
              ))}

            {tab === "signins" &&
              (d.sign_ins.length === 0 ? (
                <p className="text-sm text-gray-400">No sign-ins recorded (the log started on 28 Oct 2026).</p>
              ) : (
                <ol className="space-y-1.5">
                  {d.sign_ins.map((s, i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm">
                      <span className="text-gray-800">{device(s.user_agent)}</span>
                      <span className="text-xs text-gray-400">{fmt(s.signed_in_at)}</span>
                    </li>
                  ))}
                </ol>
              ))}

            {tab === "requests" &&
              (d.requests.length === 0 ? (
                <p className="text-sm text-gray-400">No partnership requests.</p>
              ) : (
                <div className="space-y-3">
                  {d.requests.map((r) => (
                    <div key={r.id} className="border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{r.firm_name}</span>
                        <RequestBadge status={r.status} />
                      </div>
                      <p className="text-gray-700">
                        {r.contact_name || "—"} ·{" "}
                        <a href={`tel:${r.phone}`} className="text-blue-600 hover:underline">
                          {r.phone}
                        </a>
                        {r.city ? ` · ${r.city}` : ""}
                      </p>
                      {r.message && <p className="text-gray-600 whitespace-pre-wrap">{r.message}</p>}
                      {r.staff_note && <p className="text-xs text-gray-500">Staff note: {r.staff_note}</p>}
                      <p className="text-xs text-gray-400">
                        Sent {fmt(r.created_at)}
                        {r.handled_by_name ? ` · updated by ${r.handled_by_name}` : ""}
                      </p>
                    </div>
                  ))}
                  <Link href="/panel/partnership-requests" className="inline-block text-sm text-blue-600 hover:underline">
                    Handle requests on Partnership Requests →
                  </Link>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
