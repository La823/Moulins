"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add customer form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phone_number: "", password: "", username: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCustomers = () => {
    setLoading(true);
    apiFetch("/admin/customers")
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await apiFetch("/admin/createuser", {
        method: "POST",
        body: JSON.stringify({
          phone_number: form.phone_number,
          password: form.password,
          username: form.username || undefined,
          role: "customer",
        }),
      });
      setSuccess(`Customer created: ${form.username || form.phone_number}`);
      setForm({ phone_number: "", password: "", username: "" });
      setShowForm(false);
      fetchCustomers();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.username || "").toLowerCase().includes(q) ||
      c.phone_number.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Customers</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add Customer"}
        </button>
      </div>

      {success && (
        <p className="text-sm text-green-600 mb-4 bg-green-50 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}

      {/* Add Customer Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-5 bg-white rounded-xl border border-gray-200 space-y-4 max-w-md"
        >
          <h3 className="text-sm font-semibold text-gray-700">New Customer</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              placeholder="Customer name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number *
            </label>
            <input
              type="text"
              value={form.phone_number}
              onChange={(e) =>
                setForm({ ...form, phone_number: e.target.value })
              }
              required
              placeholder="e.g. +919876543210"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              placeholder="Set a password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              This password will be visible to you in the dashboard
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Customer"}
          </button>
        </form>
      )}

      {/* Search */}
      {!showForm && (
        <div className="mb-5">
          <div className="relative max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </div>
      )}

      {/* Customer List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">
            {search ? "No customers match your search" : "No customers yet"}
          </p>
          {!search && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Create your first customer
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Password
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/admin/users/${c.id}`)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {(c.username || c.phone_number || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">
                        {c.username || "No name"}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                    {c.phone_number}
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                    {c.plain_password || "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {c.last_login_at
                      ? new Date(c.last_login_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
            {search && filtered.length !== customers.length
              ? ` (filtered from ${customers.length})`
              : ""}
          </div>
        </div>
      )}
    </>
  );
}
