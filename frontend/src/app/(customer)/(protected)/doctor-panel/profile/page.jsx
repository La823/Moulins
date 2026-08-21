"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function DoctorProfilePage() {
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDoctor = () =>
    apiFetch("/doctor/me")
      .then((data) => {
        setDoctor(data);
        setName(data.name || "");
        setEmail(data.email || "");
        setClinicName(data.clinic_name || "");
        setClinicAddress(data.clinic_address || "");
      })
      .catch((err) => setLoadError(err.message || "Could not load profile"))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadDoctor();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch("/doctor/me", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          clinic_name: clinicName.trim() || undefined,
          clinic_address: clinicAddress.trim() || undefined,
        }),
      });
      setSuccess("Profile updated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (loadError || !doctor) {
    return <p className="text-sm text-red-600">{loadError || "Profile not found"}</p>;
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-light text-gray-900 mb-1">My Profile</h1>
      <p className="text-sm text-gray-400 mb-8">Keep your contact and clinic details up to date</p>

      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
        {/* Identity */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <p className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-500">
                {doctor.phone || "—"}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">This is your login and can&apos;t be changed here.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Clinic */}
        <div className="pt-6 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Clinic</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Address</label>
              <textarea
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                rows={2}
                placeholder="Clinic address"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
