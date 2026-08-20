"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

// Generates a password that always satisfies the backend's strength rule
// (8+ chars, at least one upper/lower/digit) by guaranteeing one of each
// then filling the rest randomly and shuffling.
function generatePassword(length = 12) {
  const all = UPPER + LOWER + DIGITS;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export default function CreatePartnerFromMargPartyModal({ party, onClose, onCreated }) {
  const [form, setForm] = useState({
    username: party.name?.trim() || "",
    phone_number: party.phone1?.trim() || "",
    email: party.email1?.trim() || "",
    password: generatePassword(),
    billing_address: party.address?.trim() || "",
    shipping_address: party.address?.trim() || "",
  });
  const [showPassword, setShowPassword] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.phone_number.trim() || !form.email.trim() || !form.password.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/admin/marg-parties/${encodeURIComponent(party.rid)}/create-partner`, {
        method: "POST",
        body: JSON.stringify({
          phone_number: form.phone_number.trim(),
          password: form.password,
          email: form.email.trim(),
          username: form.username.trim() || undefined,
          billing_address: form.billing_address.trim() || undefined,
          shipping_address: form.shipping_address.trim() || undefined,
        }),
      });
      onCreated?.();
    } catch (err) {
      setError(err.message || "Could not create partner account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Create Partner Account</h3>
            <p className="text-xs text-gray-400 mt-0.5">From Marg party RID {party.rid}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.username}
              onChange={set("username")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Partner / business name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="text"
                value={form.phone_number}
                onChange={set("phone_number")}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                placeholder="Email address"
              />
              {!party.email1?.trim() && (
                <p className="text-[11px] text-amber-600 mt-1">Not on the Marg record — enter manually.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                required
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
                className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Regenerate
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Randomly generated — edit if you want, or share this with the partner as-is.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
            <textarea
              value={form.billing_address}
              onChange={set("billing_address")}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
            <textarea
              value={form.shipping_address}
              onChange={set("shipping_address")}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Partner Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
