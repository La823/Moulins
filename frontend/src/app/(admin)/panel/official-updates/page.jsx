"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Official updates from government websites (CDSCO, CBIC GST, GST Council,
// Department of Pharmaceuticals), under the website each came from: its
// heading, linked to the notice itself. The server reads the sites every
// morning and notifies admins and staff of anything new
// (internal/officialupdates); "Check now" reads them at once.

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "";

const fmtWhen = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    : "never";

export default function OfficialUpdatesPage() {
  const [sources, setSources] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState("");
  const [expanded, setExpanded] = useState({}); // key -> all its updates
  const [search, setSearch] = useState("");

  const load = useCallback(
    () =>
      apiFetch("/official-updates")
        .then((list) => {
          setSources(list || []);
          setError("");
        })
        .catch((err) => {
          setError(err.message);
          setSources((s) => s || []);
        }),
    [],
  );

  useEffect(() => {
    let off = false;
    apiFetch("/official-updates")
      .then((list) => !off && setSources(list || []))
      .catch((err) => {
        if (off) return;
        setError(err.message);
        setSources([]);
      });
    return () => {
      off = true;
    };
  }, []);

  // a notification about new updates arriving while the page is open
  useEffect(() => {
    const onLive = (e) => {
      if (e.detail?.deep_link === "/panel/official-updates") load();
    };
    window.addEventListener("live-notification", onLive);
    return () => window.removeEventListener("live-notification", onLive);
  }, [load]);

  const checkNow = async () => {
    setChecking(true);
    setCheckResult("");
    try {
      const res = (await apiFetch("/official-updates/check", { method: "POST" })) || [];
      const fresh = res.reduce((n, r) => n + (r.new?.length || 0), 0);
      const failed = res.filter((r) => r.error).map((r) => r.name);
      setCheckResult(
        `${fresh ? `${fresh} new update${fresh === 1 ? "" : "s"} found.` : "Nothing new."}` +
          (failed.length ? ` Could not read: ${failed.join(", ")}.` : ""),
      );
      setExpanded({});
      await load();
    } catch (err) {
      setCheckResult(`Check failed: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  const showAll = async (key) => {
    if (expanded[key]) {
      setExpanded(({ [key]: _, ...rest }) => rest);
      return;
    }
    try {
      const [one] = (await apiFetch(`/official-updates?source=${key}&limit=2000`)) || [];
      setExpanded((x) => ({ ...x, [key]: one?.updates || [] }));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!sources) return <Loader />;

  const q = search.trim().toLowerCase();
  const matches = (u) => !q || `${u.title} ${u.ref_no || ""} ${u.category || ""}`.toLowerCase().includes(q);
  const totalNew = sources.reduce((n, s) => n + (s.new_count || 0), 0);

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Official Updates</h2>
          <p className="text-sm text-gray-500">
            Notices and notifications from government websites, under the website each came from. Checked every
            morning at 9; everyone in the panel is notified of new ones.
            {totalNew > 0 && <span className="ml-1 font-medium text-emerald-700">{totalNew} new this week.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search headings…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56"
          />
          <button
            type="button"
            onClick={checkNow}
            disabled={checking}
            className="bg-gray-900 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>

      {checking && <p className="text-sm text-gray-500 mb-4">Reading the websites… this can take a minute when a site is slow.</p>}
      {checkResult && <p className="text-sm text-gray-700 mb-4">{checkResult}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="space-y-5">
        {sources.map((s) => {
          const all = expanded[s.key];
          const list = (all || s.updates).filter(matches);
          return (
            <section key={s.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <header className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    {s.new_count > 0 && (
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        {s.new_count} new
                      </span>
                    )}
                  </div>
                  <a
                    href={s.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-teal-700 hover:underline break-all"
                  >
                    {s.site} ↗
                  </a>
                </div>
                <div className="text-xs text-right">
                  {s.last_error ? (
                    <span className="text-red-600" title={s.last_error}>
                      Could not read on {fmtWhen(s.last_checked_at)}
                      {s.last_ok_at && <> · last read {fmtWhen(s.last_ok_at)}</>}
                    </span>
                  ) : (
                    <span className="text-gray-500">Checked {fmtWhen(s.last_checked_at)}</span>
                  )}
                </div>
              </header>

              {s.last_error && <p className="px-4 pt-2 text-xs text-red-600 break-words">{s.last_error}</p>}

              {list.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">
                  {q ? "No headings match." : s.last_checked_at ? "No updates found yet." : "Not checked yet. Press Check now."}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {list.map((u) => (
                    <li key={u.id} className={`px-4 py-2.5 flex gap-3 items-start ${u.is_new ? "bg-emerald-50/50" : ""}`}>
                      <span className="w-24 shrink-0 text-xs text-gray-500 pt-0.5">{fmtDate(u.published_on)}</span>
                      <div className="min-w-0 flex-1">
                        {u.link ? (
                          <a
                            href={u.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-900 hover:text-teal-700 hover:underline"
                          >
                            {u.title}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-900">{u.title}</span>
                        )}
                        {(u.ref_no || u.category) && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {[u.ref_no, u.category].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      {u.is_new && (
                        <span className="text-[11px] font-semibold text-emerald-700 shrink-0 pt-0.5">New</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {s.total > s.updates.length && (
                <button
                  type="button"
                  onClick={() => showAll(s.key)}
                  className="w-full text-xs font-medium text-teal-700 hover:bg-gray-50 py-2 border-t border-gray-100"
                >
                  {all ? "Show fewer" : `Show all ${s.total}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
