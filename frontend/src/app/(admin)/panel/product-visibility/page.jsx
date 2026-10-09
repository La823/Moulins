"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Product visibility, partner by partner: which products are hidden from
// each partner, and which exclusive products each one is allowed. Every rule
// is stored against the partner's id and the product's id — names are only
// shown — so renaming either never changes who sees what.

const PARTNER_KEY = "partner";

function readPartnerFromUrl() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PARTNER_KEY);
}

export default function ProductVisibilityPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || (user?.permissions || []).includes("products_edit");

  const [partners, setPartners] = useState([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [onlyWithRules, setOnlyWithRules] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  const loadPartners = useCallback(() => {
    return apiFetch("/admin/product-access/partners")
      .then((d) => setPartners(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message || "Could not load partners"))
      .finally(() => setLoadingPartners(false));
  }, []);

  // a partner named in the URL (?partner=<id>) opens once the list is in
  useEffect(() => {
    loadPartners().then(() => setSelectedId((cur) => cur ?? readPartnerFromUrl()));
  }, [loadPartners]);

  const select = (id) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set(PARTNER_KEY, id);
    window.history.replaceState(null, "", url);
  };

  const shownPartners = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    return partners.filter(
      (p) =>
        (!onlyWithRules || p.hidden_count + p.allowed_count > 0) &&
        (!q || p.name.toLowerCase().includes(q) || (p.phone_number || "").includes(q))
    );
  }, [partners, partnerSearch, onlyWithRules]);

  const selected = partners.find((p) => p.partner_id === selectedId) || null;
  const withRules = partners.filter((p) => p.hidden_count + p.allowed_count > 0).length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Product Visibility</h2>
        <p className="text-sm text-gray-500 mt-1">
          Hide products from a partner, or give a partner products nobody else sees.
          {!loadingPartners && ` ${withRules} of ${partners.length} partners have changes.`}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* partners */}
        <aside className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 h-fit">
          <input
            type="text"
            value={partnerSearch}
            onChange={(e) => setPartnerSearch(e.target.value)}
            placeholder="Search partners…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={onlyWithRules} onChange={(e) => setOnlyWithRules(e.target.checked)} className="rounded" />
            Only partners with changes
          </label>
          <div className="max-h-[65vh] overflow-y-auto -mx-1">
            {loadingPartners ? (
              <p className="text-sm text-gray-400 px-1">Loading…</p>
            ) : shownPartners.length === 0 ? (
              <p className="text-sm text-gray-400 px-1">No partners match</p>
            ) : (
              shownPartners.map((p) => (
                <button
                  key={p.partner_id}
                  onClick={() => select(p.partner_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                    p.partner_id === selectedId ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{p.name}</span>
                    <span className={`block text-xs ${p.partner_id === selectedId ? "text-gray-300" : "text-gray-400"}`}>
                      {p.phone_number}
                    </span>
                  </span>
                  {p.hidden_count > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700" title="Products hidden from them">
                      {p.hidden_count} hidden
                    </span>
                  )}
                  {p.allowed_count > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700" title="Exclusive products they can see">
                      {p.allowed_count} exclusive
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* the chosen partner */}
        {selected ? (
          <PartnerRules key={selected.partner_id} partner={selected} canEdit={canEdit} onChanged={loadPartners} />
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 h-fit">
            Choose a partner to see and change which products they can see.
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerRules({ partner, canEdit, onChanged }) {
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(null); // product id being changed
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);

  const load = useCallback(
    () =>
      apiFetch(`/admin/partners/${partner.partner_id}/product-access`)
        .then((d) => setRules(Array.isArray(d) ? d : []))
        .catch((e) => setMessage({ ok: false, text: e.message || "Could not load" })),
    [partner.partner_id]
  );
  useEffect(() => {
    load();
  }, [load]);

  // product search, for adding
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/admin/products?search=${encodeURIComponent(q)}&limit=12&name_only=true`)
        .then((d) => setResults(d?.products || []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const change = async (productId, access, label) => {
    setBusy(productId);
    setMessage(null);
    try {
      await apiFetch(`/admin/partners/${partner.partner_id}/product-access/${productId}`, {
        method: access ? "PUT" : "DELETE",
        ...(access && { body: JSON.stringify({ access }) }),
      });
      await Promise.all([load(), onChanged()]);
      setMessage({ ok: true, text: label });
    } catch (e) {
      setMessage({ ok: false, text: e.message || "Could not save" });
    } finally {
      setBusy(null);
    }
  };

  const ruleFor = useMemo(() => new Map((rules || []).map((r) => [r.product_id, r])), [rules]);
  const hidden = (rules || []).filter((r) => !r.exclusive && r.access === "hidden");
  const exclusive = (rules || []).filter((r) => r.exclusive && r.access === "allowed");
  // left over from a product switching between normal and exclusive
  const noEffect = (rules || []).filter((r) => (r.exclusive && r.access === "hidden") || (!r.exclusive && r.access === "allowed"));

  const productRow = (r, actionLabel, onAction, tone) => (
    <li key={r.product_id} className="flex items-center gap-3 py-2">
      <Link href={`/panel/products/${r.product_id}`} className={`flex-1 text-sm hover:underline truncate ${tone}`}>
        {r.name}
      </Link>
      {canEdit && (
        <button
          onClick={onAction}
          disabled={busy === r.product_id}
          className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 disabled:opacity-40"
        >
          {busy === r.product_id ? "…" : actionLabel}
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{partner.name}</h3>
          <p className="text-xs text-gray-400">{partner.phone_number}</p>
        </div>
        <Link href={`/panel/users/${partner.partner_id}`} className="text-sm text-gray-500 hover:text-gray-900 shrink-0">
          Partner page &rarr;
        </Link>
      </div>

      {message && (
        <p className={`text-sm px-3 py-2 rounded-lg ${message.ok ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
          {message.text}
        </p>
      )}

      {canEdit && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Add a product</h4>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          {results.length > 0 && (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {results.map((p) => {
                const rule = ruleFor.get(p.id);
                const isHidden = !p.exclusive && rule?.access === "hidden";
                const isAllowed = p.exclusive && rule?.access === "allowed";
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    {p.exclusive && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">exclusive</span>
                    )}
                    {isHidden || isAllowed ? (
                      <span className="text-xs text-gray-400">{isHidden ? "Hidden from them" : "They can see it"}</span>
                    ) : p.exclusive ? (
                      <button
                        onClick={() => change(p.id, "allowed", `${p.name} is now visible to ${partner.name}`)}
                        disabled={busy === p.id}
                        className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        Let them see it
                      </button>
                    ) : (
                      <button
                        onClick={() => change(p.id, "hidden", `${p.name} is now hidden from ${partner.name}`)}
                        disabled={busy === p.id}
                        className="text-xs px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        Hide from them
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-gray-400">
            Normal products can be hidden from this partner. Exclusive products — set on a product&apos;s own page —
            can be given to them.
          </p>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Hidden from them {rules && `(${hidden.length})`}
        </h4>
        {rules === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : hidden.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing hidden — they see the whole catalogue.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {hidden.map((r) => productRow(r, "Show again", () => change(r.product_id, null, `${r.name} is visible to them again`), "text-red-700"))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Exclusive products they can see {rules && `(${exclusive.length})`}
        </h4>
        {rules === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : exclusive.length === 0 ? (
          <p className="text-sm text-gray-400">None.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {exclusive.map((r) => productRow(r, "Take away", () => change(r.product_id, null, `${r.name} is no longer visible to them`), "text-green-700"))}
          </ul>
        )}
      </section>

      {noEffect.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Rules with no effect ({noEffect.length})</h4>
          <p className="text-xs text-gray-400 mb-2">
            Left over from a product being switched between normal and exclusive. They change nothing today, and come back
            into force if the product is switched back.
          </p>
          <ul className="divide-y divide-gray-50">
            {noEffect.map((r) => productRow(r, "Remove", () => change(r.product_id, null, "Rule removed"), "text-gray-500"))}
          </ul>
        </section>
      )}
    </div>
  );
}
