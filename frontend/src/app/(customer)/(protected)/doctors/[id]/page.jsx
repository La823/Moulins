"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import LocationPicker from "@/components/LocationPicker";

const emptyProfileForm = { name: "", phone: "", email: "", speciality: "", clinic_name: "", dob: "", anniversary: "" };

export default function DoctorDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doctor, setDoctor] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [assignedProducts, setAssignedProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profileLocation, setProfileLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [doc, meetingList, products, catalog] = await Promise.all([
        apiFetch(`/doctors/${id}`),
        apiFetch(`/meetings?doctor_id=${id}`),
        apiFetch(`/doctors/${id}/products`),
        apiFetch("/products"),
      ]);
      setDoctor(doc);
      setMeetings(Array.isArray(meetingList) ? meetingList : []);
      setAssignedProducts(Array.isArray(products) ? products : []);
      const productList = catalog?.products || catalog || [];
      setAllProducts(Array.isArray(productList) ? productList : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addProduct = async (productId) => {
    setAdding(productId);
    try {
      await apiFetch(`/doctors/${id}/products`, {
        method: "POST",
        body: JSON.stringify({ product_id: productId }),
      });
      const products = await apiFetch(`/doctors/${id}/products`);
      setAssignedProducts(Array.isArray(products) ? products : []);
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(null);
    }
  };

  const removeProduct = async (productId) => {
    if (removing) return;
    setRemoving(productId);
    try {
      await apiFetch(`/doctors/${id}/products/${productId}`, { method: "DELETE" });
      setAssignedProducts((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (err) {
      alert(err.message);
    } finally {
      setRemoving(null);
    }
  };

  const startEditMeeting = () => {
    setMeetingDate(doctor.last_meeting_at ? doctor.last_meeting_at.slice(0, 10) : "");
    setMeetingNotes(doctor.last_meeting_notes || "");
    setEditingMeeting(true);
  };

  const saveMeeting = async () => {
    setSavingMeeting(true);
    try {
      await apiFetch(`/doctors/${id}/last-meeting`, {
        method: "PUT",
        body: JSON.stringify({
          last_meeting_at: meetingDate ? new Date(meetingDate).toISOString() : null,
          last_meeting_notes: meetingNotes || null,
        }),
      });
      setDoctor((prev) => ({
        ...prev,
        last_meeting_at: meetingDate ? new Date(meetingDate).toISOString() : null,
        last_meeting_notes: meetingNotes || null,
      }));
      setEditingMeeting(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMeeting(false);
    }
  };

  const startEditProfile = () => {
    setProfileForm({
      name: doctor.name || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      speciality: doctor.speciality || "",
      clinic_name: doctor.clinic_name || "",
      dob: doctor.dob ? doctor.dob.slice(0, 10) : "",
      anniversary: doctor.anniversary ? doctor.anniversary.slice(0, 10) : "",
    });
    setProfileLocation(
      doctor.latitude != null && doctor.longitude != null
        ? { lat: doctor.latitude, lng: doctor.longitude, address: doctor.clinic_address }
        : null
    );
    setProfileError("");
    setEditingProfile(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim() || !profileForm.phone.trim()) return;
    setSavingProfile(true);
    setProfileError("");
    const body = {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      email: profileForm.email.trim() || null,
      speciality: profileForm.speciality.trim() || null,
      clinic_name: profileForm.clinic_name.trim() || null,
      dob: profileForm.dob || null,
      anniversary: profileForm.anniversary || null,
      clinic_address: profileLocation?.address || null,
      latitude: profileLocation?.lat ?? null,
      longitude: profileLocation?.lng ?? null,
    };
    try {
      await apiFetch(`/doctors/${id}`, { method: "PUT", body: JSON.stringify(body) });
      setDoctor((prev) => ({ ...prev, ...body }));
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const assignedIds = new Set(assignedProducts.map((p) => p.product_id));

  const filteredProducts = allProducts.filter(
    (p) =>
      !assignedIds.has(p.id) &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-40 bg-gray-100 rounded mt-8" />
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10 text-center">
        <p className="text-gray-400">Doctor not found</p>
        <button onClick={() => router.back()} className="text-sm text-red-600 mt-4 inline-block">
          Back to doctors
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          &larr; Back to doctors
        </button>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-2xl font-light text-gray-900">{doctor.name}</h1>
            {doctor.speciality && (
              <p className="text-sm text-gray-500 mt-1">{doctor.speciality}</p>
            )}
            {doctor.clinic_name && (
              <p className="text-sm text-gray-500 mt-1">{doctor.clinic_name}</p>
            )}
            {doctor.phone && (
              <p className="text-sm text-gray-400 mt-1">{doctor.phone}</p>
            )}
            {doctor.email && (
              <p className="text-sm text-gray-400 mt-1">{doctor.email}</p>
            )}
            {doctor.dob && (
              <p className="text-sm text-gray-400 mt-1">
                🎂 {new Date(doctor.dob).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
              </p>
            )}
            {doctor.anniversary && (
              <p className="text-sm text-gray-400 mt-1">
                🎉 {new Date(doctor.anniversary).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={startEditProfile}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500 transition-colors"
            >
              Edit Profile
            </button>
            <Link
              href={`/meetings?doctor_id=${doctor.id}`}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500 transition-colors"
            >
              Schedule Meeting
            </Link>
          </div>
        </div>

        {editingProfile && (
          <form onSubmit={saveProfile} className="mt-6 border border-gray-200 rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Edit Doctor</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
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
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                  placeholder="Phone number"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                  placeholder="doctor@email.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Speciality</label>
              <input
                type="text"
                value={profileForm.speciality}
                onChange={(e) => setProfileForm({ ...profileForm, speciality: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                placeholder="e.g. Dermatologist"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
              <input
                type="text"
                value={profileForm.clinic_name}
                onChange={(e) => setProfileForm({ ...profileForm, clinic_name: e.target.value })}
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
                {profileLocation
                  ? `📍 ${profileLocation.address || `${profileLocation.lat.toFixed(5)}, ${profileLocation.lng.toFixed(5)}`}`
                  : "Set location on map..."}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={profileForm.dob}
                  onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anniversary</label>
                <input
                  type="date"
                  value={profileForm.anniversary}
                  onChange={(e) => setProfileForm({ ...profileForm, anniversary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
                />
              </div>
            </div>
            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="px-5 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showLocationPicker && (
          <LocationPicker
            initial={profileLocation}
            onClose={() => setShowLocationPicker(false)}
            onConfirm={(loc) => {
              setProfileLocation(loc);
              setShowLocationPicker(false);
            }}
          />
        )}
      </div>

      {/* Last Meeting */}
      <div className="mb-8 border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Last Meeting</h2>
          {!editingMeeting && (
            <button
              onClick={startEditMeeting}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              {doctor.last_meeting_at ? "Edit" : "+ Add"}
            </button>
          )}
        </div>

        {editingMeeting ? (
          <div className="space-y-3">
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors"
            />
            <textarea
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              placeholder="Notes from the meeting..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveMeeting}
                disabled={savingMeeting}
                className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {savingMeeting ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingMeeting(false)}
                className="text-sm px-4 py-2 text-gray-500 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : doctor.last_meeting_at ? (
          <div>
            <p className="text-sm text-gray-900">
              {new Date(doctor.last_meeting_at).toLocaleDateString(undefined, { dateStyle: "long" })}
            </p>
            {doctor.last_meeting_notes && (
              <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{doctor.last_meeting_notes}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              Auto-updates when you mark a meeting with this doctor as completed — edit anytime to correct it.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No meeting recorded yet</p>
        )}
      </div>

      {/* Meetings with this doctor */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-900 mb-3">
          Meetings with this Doctor {meetings.length > 0 && `(${meetings.length})`}
        </h2>
        {meetings.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-400">No meetings booked yet</p>
            <Link
              href={`/meetings?doctor_id=${doctor.id}`}
              className="text-sm text-red-600 hover:text-red-700 mt-2 inline-block transition-colors"
            >
              Schedule one
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/meetings?doctor_id=${doctor.id}`}
                className="block border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-400 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      {new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {m.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{m.notes}</p>}
                  </div>
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full flex-shrink-0 capitalize ${
                      m.status === "completed"
                        ? "bg-green-50 text-green-700"
                        : m.status === "cancelled"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Products */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-light text-gray-900">
            Assigned Products ({assignedProducts.length})
          </h2>
          <button
            onClick={() => setShowProductPicker(!showProductPicker)}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            {showProductPicker ? "Done" : "Add Products"}
          </button>
        </div>

        {assignedProducts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-400">No products assigned yet</p>
            <button
              onClick={() => setShowProductPicker(true)}
              className="text-sm text-red-600 hover:text-red-700 mt-2 transition-colors"
            >
              Add products from catalog
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {assignedProducts.map((dp) => (
              <div
                key={dp.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
              >
                <Link
                  href={`/products/${dp.product_id}`}
                  className="text-sm text-red-600 hover:text-red-700 hover:underline transition-colors"
                >
                  {dp.product_name}
                </Link>
                <button
                  onClick={() => removeProduct(dp.product_id)}
                  disabled={removing === dp.product_id}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                >
                  {removing === dp.product_id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Picker */}
      {showProductPicker && (
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Add from catalog</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 transition-colors mb-4"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filteredProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">
                {search ? "No matching products" : "All products are assigned"}
              </p>
            ) : (
              filteredProducts.slice(0, 50).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{product.name}</p>
                    {(product.mrp ?? product.price) != null && (
                      <p className="text-xs text-gray-400">
                        MRP Rs. {Number(product.mrp ?? product.price).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => addProduct(product.id)}
                    disabled={adding === product.id}
                    className="ml-3 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    {adding === product.id ? "Adding..." : "Add"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
