"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

// Who can see a product: everyone, everyone except chosen partners, or only
// chosen partners. Partners are always identified by id — names are shown
// for reading only, so renaming a partner never changes who sees what.
// Saves on its own, separately from the product form above it.

const MODES = [
  { value: "everyone", label: "Everyone", hint: "In every partner's catalogue and on the public website." },
  { value: "except", label: "Everyone except…", hint: "Hidden from the partners you choose. Everyone else sees it." },
  { value: "only", label: "Only…", hint: "Only the partners you choose see it — not other partners, not the public website." },
];

const partnerName = (p) => (p.username && p.username.trim()) || p.phone_number || "Unnamed partner";

export default function ProductVisibilityPanel({ productId }) {
  const [partners, setPartners] = useState([]);
  const [mode, setMode] = useState("everyone");
  const [chosen, setChosen] = useState(new Set()); // partner ids
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(null); // {ok, text}

  const applyAccess = (a) => {
    const hidden = a.partners.filter((p) => p.access === "hidden").map((p) => p.partner_id);
    const allowed = a.partners.filter((p) => p.access === "allowed").map((p) => p.partner_id);
    if (a.exclusive) {
      setMode("only");
      setChosen(new Set(allowed));
    } else if (hidden.length) {
      setMode("except");
      setChosen(new Set(hidden));
    } else {
      setMode("everyone");
      setChosen(new Set());
    }
    setDirty(false);
  };

  useEffect(() => {
    Promise.all([apiFetch(`/admin/products/${productId}/access`), apiFetch("/admin/partners")])
      .then(([access, list]) => {
        setPartners(Array.isArray(list) ? list : []);
        applyAccess(access);
      })
      .catch((e) => setMessage({ ok: false, text: e.message || "Could not load visibility" }))
      .finally(() => setLoading(false));
  }, [productId]);

  const byId = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? partners.filter((p) => partnerName(p).toLowerCase().includes(q) || (p.phone_number || "").includes(q))
      : partners;
    return [...list].sort((a, b) => partnerName(a).localeCompare(partnerName(b)));
  }, [partners, search]);

  const toggle = (id) => {
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const ids = [...chosen];
    try {
      const saved = await apiFetch(`/admin/products/${productId}/access`, {
        method: "PUT",
        body: JSON.stringify({
          exclusive: mode === "only",
          hidden_for: mode === "except" ? ids : [],
          allowed_for: mode === "only" ? ids : [],
        }),
      });
      if (saved) applyAccess(saved);
      else setDirty(false);
      setMessage({ ok: true, text: "Visibility saved" });
    } catch (e) {
      setMessage({ ok: false, text: e.message || "Could not save visibility" });
    } finally {
      setSaving(false);
    }
  };

  const picking = mode !== "everyone";

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Who can see this product</h3>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || loading}
          className="text-sm px-4 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save visibility"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                  mode === m.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <input
                  type="radio"
                  name="product-visibility"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => {
                    setMode(m.value);
                    setDirty(true);
                    setMessage(null);
                  }}
                  className="sr-only"
                />
                <span className="block font-medium text-gray-900">{m.label}</span>
                <span className="block text-xs text-gray-500 mt-1">{m.hint}</span>
              </label>
            ))}
          </div>

          {picking && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {chosen.size === 0 ? (
                  <span className="text-xs text-gray-400 py-1">
                    {mode === "only"
                      ? "No partners chosen — only staff will see this product."
                      : "No partners chosen — everyone will see this product."}
                  </span>
                ) : (
                  [...chosen].map((id) => (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        mode === "only" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                      }`}
                    >
                      {byId.has(id) ? partnerName(byId.get(id)) : "Unknown partner"}
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        className="opacity-60 hover:opacity-100"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search partners by name or phone…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              />
              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {matches.length === 0 ? (
                  <p className="text-xs text-gray-400 p-3">No partners match</p>
                ) : (
                  matches.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} className="rounded" />
                      <span className="flex-1 truncate text-gray-800">{partnerName(p)}</span>
                      <span className="text-xs text-gray-400">{p.phone_number}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p className={`text-sm px-3 py-2 rounded-lg ${message.ok ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
