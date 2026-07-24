"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import LocationPicker from "@/components/LocationPicker";

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", clinic_name: "", dob: "" });
  const [location, setLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchDoctors = () => {
    apiFetch("/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDoctors(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/doctors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          clinic_name: form.clinic_name.trim() || null,
          dob: form.dob || null,
          clinic_address: location?.address || null,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
        }),
      });
      setForm({ name: "", phone: "", clinic_name: "", dob: "" });
      setLocation(null);
      setShowForm(false);
      setLoading(true);
      fetchDoctors();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this doctor and all assigned products?")) return;
    try {
      await apiFetch(`/doctors/${id}`, { method: "DELETE" });
      setDoctors((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-2xl font-light text-gray-900">My Doctors</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          {showForm ? "Cancel" : "Add Doctor"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 border border-gray-200 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              placeholder="Dr. Name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
            <input
              type="text"
              value={form.clinic_name}
              onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              placeholder="Clinic or hospital name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Location</label>
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              {location ? `📍 ${location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}` : "Set location on map..."}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <input
              type="date"
              value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Adds a yearly birthday reminder to your meetings calendar, with daily notifications in the 10 days before.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Doctor"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-gray-100 rounded-lg p-5">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-400">No doctors added yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Add your first doctor
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <Link href={`/doctors/${doctor.id}`} className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900">{doctor.name}</h3>
                  {doctor.clinic_name && (
                    <p className="text-xs text-gray-500 mt-1">{doctor.clinic_name}</p>
                  )}
                  {doctor.phone && (
                    <p className="text-xs text-gray-400 mt-1">{doctor.phone}</p>
                  )}
                  {doctor.dob && (
                    <p className="text-xs text-gray-400 mt-1">
                      🎂 {new Date(doctor.dob).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                    </p>
                  )}
                  {doctor.clinic_address && (
                    <p className="text-xs text-gray-400 mt-1">📍 {doctor.clinic_address}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Added {new Date(doctor.created_at).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                  {doctor.last_meeting_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last met {new Date(doctor.last_meeting_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                </Link>
                <div className="flex items-center gap-2 ml-4">
                  <Link
                    href={`/doctors/${doctor.id}`}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 transition-colors"
                  >
                    Manage Products
                  </Link>
                  <button
                    onClick={() => handleDelete(doctor.id)}
                    className="text-xs px-3 py-1.5 text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showLocationPicker && (
        <LocationPicker
          initial={location}
          onClose={() => setShowLocationPicker(false)}
          onConfirm={(loc) => {
            setLocation(loc);
            setShowLocationPicker(false);
          }}
        />
      )}
    </div>
  );
}
