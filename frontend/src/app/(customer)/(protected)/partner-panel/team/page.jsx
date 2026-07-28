"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

export default function TeamPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phone_number: "", password: "", username: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.role !== "partner") {
      router.push("/dashboard");
    }
  }, [user, router]);

  const fetchMembers = () => {
    setLoading(true);
    apiFetch("/team")
      .then((data) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === "partner") fetchMembers();
  }, [user]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/team", {
        method: "POST",
        body: JSON.stringify({
          phone_number: form.phone_number,
          password: form.password,
          username: form.username || null,
        }),
      });
      setForm({ phone_number: "", password: "", username: "" });
      setShowForm(false);
      fetchMembers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this team member? Their account will be deleted.")) return;
    try {
      await apiFetch(`/team/${id}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  if (user && user.role !== "partner") return null;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-gray-900">My Team</h1>
          <p className="text-sm text-gray-400 mt-1">
            Give your team members their own login, track attendance, and review their daily logs.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add Team Member"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 p-6 bg-white rounded-xl border border-gray-200 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Team Member"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-400">No team members yet. Add your first one above.</p>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4"
            >
              <Link href={`/partner-panel/team/${m.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{m.username || m.phone_number}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.phone_number}</p>
              </Link>
              <div className="flex items-center gap-3">
                <Link href={`/partner-panel/team/${m.id}`} className="text-xs text-blue-600 hover:underline">
                  View
                </Link>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
