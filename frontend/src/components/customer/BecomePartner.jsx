"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Visitors — people checking the website out, signed up with Google — see
// products without prices and nothing else. Everything they can't use (cart,
// favourites, orders, the other pages) offers "Become a partner" instead,
// which sends staff a partnership request.

export const isVisitor = (user) => user?.role === "visitor";

/** True when prices are hidden from whoever is looking (visitors). */
export function usePricesHidden() {
  const { user } = useAuth();
  return isVisitor(user);
}

/** Opens the "Become a partner" popup from anywhere. */
export function openBecomePartner() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("become-partner"));
}

/** Shown where a price would be. */
export function PartnerRatesNote({ className = "text-xs text-gray-400" }) {
  return (
    <button type="button" onClick={openBecomePartner} className={`${className} hover:text-gray-700 underline-offset-2 hover:underline`}>
      Rates for partners
    </button>
  );
}

const STATUS_TEXT = {
  new: "We've got your request — our team will call you soon.",
  contacted: "Our team has been in touch about your request.",
  converted: "Your partner account is being set up. Log in with the phone number and password our team gives you.",
  declined: "We weren't able to take your last request forward. You're welcome to send a new one.",
};

/**
 * The "Become a partner" form, or the visitor's request status once they've
 * sent one. Used in the popup and on the /become-partner page.
 */
export function BecomePartnerPanel({ onDone }) {
  const { user } = useAuth();
  const [existing, setExisting] = useState(undefined); // undefined = loading
  const [form, setForm] = useState({ firm_name: "", contact_name: user?.username || "", phone: "", city: "", message: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isVisitor(user)) return;
    apiFetch("/visitor/partnership-request")
      .then((r) => setExisting(r))
      .catch(() => setExisting(null));
  }, [user]);

  if (!user) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-gray-600">Log in or sign up to explore our products and become a partner.</p>
        <Link href="/login" className="inline-block px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium">
          Log in / Sign up
        </Link>
      </div>
    );
  }
  if (!isVisitor(user)) return null;
  if (existing === undefined) return <p className="text-sm text-gray-400 text-center py-6">Loading…</p>;

  const open = existing && (existing.status === "new" || existing.status === "contacted");
  if (existing && existing.status !== "declined") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-gray-700">{STATUS_TEXT[existing.status]}</p>
        <p className="text-xs text-gray-400">
          {existing.firm_name} · {existing.phone} · sent {new Date(existing.created_at).toLocaleDateString("en-IN")}
        </p>
        {!open && <p className="text-xs text-gray-400">Questions? Use the Contact page.</p>}
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-gray-500 hover:text-gray-900">
            Keep browsing
          </button>
        )}
      </div>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.firm_name.trim() || !form.phone.trim()) {
      setError("Please fill in your shop / firm name and phone number.");
      return;
    }
    setSending(true);
    try {
      await apiFetch("/visitor/partnership-request", { method: "POST", body: JSON.stringify(form) });
      setExisting(await apiFetch("/visitor/partnership-request"));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };
  const input =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";

  return (
    <form onSubmit={submit} className="space-y-3">
      {existing?.status === "declined" && <p className="text-xs text-gray-500">{STATUS_TEXT.declined}</p>}
      <p className="text-sm text-gray-600">
        Partners order from our full range at partner rates. Tell us about your business and our team will call you.
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Shop / firm name <span className="text-red-500">*</span>
        </label>
        <input value={form.firm_name} onChange={set("firm_name")} className={input} maxLength={200} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Your name</label>
          <input value={form.contact_name} onChange={set("contact_name")} className={input} maxLength={200} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" className={input} maxLength={20} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
        <input value={form.city} onChange={set("city")} className={input} maxLength={100} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Anything you&apos;d like us to know</label>
        <textarea value={form.message} onChange={set("message")} rows={2} className={input} maxLength={2000} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

/** The popup, mounted once in the storefront layout; openBecomePartner() shows it. */
export function BecomePartnerModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("become-partner", show);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("become-partner", show);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Become a partner</h2>
            <p className="text-xs text-gray-500">Ordering, rates and the rest of Moulins are for our partners.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>
        <BecomePartnerPanel onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}

/** A whole page's worth, for pages a visitor can't use. */
export function BecomePartnerPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-light text-gray-900 mb-1">Become a partner</h1>
      <p className="text-sm text-gray-500 mb-6">
        This part of Moulins is for our partners. You can keep{" "}
        <Link href="/products" className="text-gray-900 underline">
          browsing our products
        </Link>
        , or ask to become a partner below.
      </p>
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <BecomePartnerPanel />
      </div>
    </div>
  );
}
