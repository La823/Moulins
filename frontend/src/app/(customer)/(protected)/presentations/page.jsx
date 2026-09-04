"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDoctorId, setNewDoctorId] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    apiFetch("/presentations")
      .then((data) => setPresentations(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    apiFetch("/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const createPresentation = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    try {
      const { id } = await apiFetch("/presentations", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), doctor_id: newDoctorId || null }),
      });
      window.location.href = `/presentations/${id}`;
    } catch (err) {
      setError(err.message);
    }
  };

  const deletePresentation = async (id) => {
    if (!confirm("Delete this presentation?")) return;
    try {
      await apiFetch(`/presentations/${id}`, { method: "DELETE" });
      setPresentations((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-2xl font-light text-gray-900">My Presentations</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          {creating ? "Cancel" : "New Presentation"}
        </button>
      </div>

      {creating && (
        <form onSubmit={createPresentation} className="mb-8 border border-gray-200 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Presentation Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              placeholder="e.g. Derma range pitch"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor (optional)</label>
            <select
              value={newDoctorId}
              onChange={(e) => setNewDoctorId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors bg-white"
            >
              <option value="">Not linked to a doctor</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            Create &amp; Build
          </button>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-gray-100 rounded-lg aspect-square" />
          ))}
        </div>
      ) : presentations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-400">No presentations yet</p>
          <button
            onClick={() => setCreating(true)}
            className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Build your first slideshow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {presentations.map((p) => (
            <div key={p.id} className="group relative border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
              <Link href={`/presentations/${p.id}`} className="block">
                <div className="aspect-square bg-gray-50 overflow-hidden">
                  {p.preview_urls?.length > 0 ? (
                    <div
                      className="w-full h-full grid gap-px bg-gray-100"
                      style={{ gridTemplateColumns: p.preview_urls.length > 1 ? "1fr 1fr" : "1fr" }}
                    >
                      {p.preview_urls.slice(0, 4).map((url, i) => (
                        <div key={i} className="bg-gray-50 overflow-hidden flex items-center justify-center">
                          <img src={url} alt="" className="w-full h-full object-contain p-1" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18v12H3v-12zM8 20.5h8M12 16.5v4" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="px-3 py-3">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {p.name}
                    {p.is_default_for_doctor && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 align-middle">Auto</span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.slide_count} slide{p.slide_count !== 1 ? "s" : ""}
                    {p.doctor_name && <> &middot; {p.doctor_name}</>}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => deletePresentation(p.id)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9M4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
