"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LocationPicker from "@/components/LocationPicker";

const emptyForm = { name: "", phone: "", email: "", speciality: "", clinic_name: "", dob: "", anniversary: "" };

function initials(name) {
  if (!name) return "?";
  const parts = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

export default function DoctorsPage() {
  const { user } = useAuth();
  const canDelete = user?.role !== "team_member";
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef(null);

  const fetchDoctors = () => {
    apiFetch("/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDoctors(); }, []);

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setLocation(null);
    setShowForm(true);
  };

  const startEdit = (doctor) => {
    setEditingId(doctor.id);
    setForm({
      name: doctor.name || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      speciality: doctor.speciality || "",
      clinic_name: doctor.clinic_name || "",
      dob: doctor.dob ? doctor.dob.slice(0, 10) : "",
      anniversary: doctor.anniversary ? doctor.anniversary.slice(0, 10) : "",
    });
    setLocation(
      doctor.latitude != null && doctor.longitude != null
        ? { lat: doctor.latitude, lng: doctor.longitude, address: doctor.clinic_address }
        : null
    );
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setLocation(null);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSubmitting(true);
    setError("");
    const body = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      speciality: form.speciality.trim() || null,
      clinic_name: form.clinic_name.trim() || null,
      dob: form.dob || null,
      anniversary: form.anniversary || null,
      clinic_address: location?.address || null,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
    };
    try {
      if (editingId) {
        await apiFetch(`/doctors/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/doctors", { method: "POST", body: JSON.stringify(body) });
      }
      cancelForm();
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
          onClick={() => (showForm ? cancelForm() : startAdd())}
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          {showForm ? "Cancel" : "Add Doctor"}
        </button>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="mb-8 border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{editingId ? "Edit Doctor" : "Add Doctor"}</h2>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                placeholder="Phone number"
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Used as the doctor&apos;s login — they can sign in with this phone number as both username and default password.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                placeholder="doctor@email.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Speciality</label>
            <input
              type="text"
              value={form.speciality}
              onChange={(e) => setForm({ ...form, speciality: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
              placeholder="e.g. Dermatologist"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anniversary</label>
            <input
              type="date"
              value={form.anniversary}
              onChange={(e) => setForm({ ...form, anniversary: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Adds a yearly anniversary reminder to your meetings calendar, with daily notifications in the 10 days before.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : editingId ? "Save Changes" : "Add Doctor"}
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
            onClick={startAdd}
            className="inline-block mt-4 text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Add your first doctor
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              onClick={() => startEdit(doctor)}
              className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors cursor-pointer"
            >
              {/* Header: avatar, name, speciality, status */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {initials(doctor.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{doctor.name}</h3>
                  {doctor.speciality && (
                    <p className="text-xs text-gray-500 mt-0.5">{doctor.speciality}</p>
                  )}
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700 flex-shrink-0">
                  Active
                </span>
              </div>

              <div className="border-t border-gray-100" />

              {/* Fields */}
              <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Field label="Phone" value={doctor.phone} />
                <Field label="Email" value={doctor.email} />
                <Field
                  label="Birthday"
                  value={doctor.dob ? new Date(doctor.dob).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : null}
                />
                <Field
                  label="Anniversary"
                  value={doctor.anniversary ? new Date(doctor.anniversary).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : null}
                />
                <Field label="Clinic" value={doctor.clinic_name || doctor.clinic_address} />
                <Field
                  label="Joined"
                  value={new Date(doctor.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                />
                <Field label="Products" value={String(doctor.product_count ?? 0)} />
              </div>

              <div className="border-t border-gray-100" />

              {/* Actions */}
              <div className="flex items-center gap-5 px-5 py-3">
                <Link
                  href={`/doctors/${doctor.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Manage Products
                </Link>
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doctor.id);
                    }}
                    className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors ml-auto"
                  >
                    Delete
                  </button>
                )}
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

function Field({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 text-right truncate">{value || "—"}</span>
    </div>
  );
}
