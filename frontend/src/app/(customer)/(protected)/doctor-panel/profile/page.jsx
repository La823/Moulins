"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function DoctorProfilePage() {
  const [doctor, setDoctor] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/doctor/me")
      .then(setDoctor)
      .catch((err) => setError(err.message || "Could not load profile"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!doctor) return null;

  const fields = [
    ["Name", doctor.name],
    ["Phone", doctor.phone],
    ["Email", doctor.email],
    ["Speciality", doctor.speciality],
    ["Clinic", doctor.clinic_name],
    ["Clinic Address", doctor.clinic_address],
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">My Profile</h1>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {fields.map(([label, value]) => (
          <div key={label} className="px-5 py-3.5 flex items-center justify-between gap-4">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 text-right">{value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
