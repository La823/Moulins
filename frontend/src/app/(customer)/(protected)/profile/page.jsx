"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

async function uploadFileToS3(file) {
  const { upload_url, public_url } = await apiFetch("/onboarding/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename: file.name }),
  });
  await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return public_url;
}

const modeLabel = (name) => `By ${name.charAt(0).toUpperCase()}${name.slice(1)}`;

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [transportModes, setTransportModes] = useState([]);
  const [transportMode, setTransportMode] = useState(user?.default_transport_mode || "courier");
  const [savingTransport, setSavingTransport] = useState(false);

  useEffect(() => {
    apiFetch("/transport-modes")
      .then((data) => setTransportModes(Array.isArray(data) ? data : []))
      .catch(() => setTransportModes([]));
  }, []);

  useEffect(() => {
    if (user?.default_transport_mode) setTransportMode(user.default_transport_mode);
  }, [user?.default_transport_mode]);

  const saveTransportMode = async (mode) => {
    setTransportMode(mode);
    setSavingTransport(true);
    try {
      await apiFetch("/profile/transport-mode", {
        method: "PUT",
        body: JSON.stringify({ default_transport_mode: mode }),
      });
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTransport(false);
    }
  };

  const [email, setEmail] = useState(user?.email || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [emailSuccess, setEmailSuccess] = useState(null);

  useEffect(() => {
    setEmail(user?.email || "");
  }, [user?.email]);

  const saveEmail = async (e) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      await apiFetch("/profile/email", {
        method: "PUT",
        body: JSON.stringify({ email: email.trim() }),
      });
      await refreshUser();
      setEmailSuccess("Email updated");
      setTimeout(() => setEmailSuccess(null), 3000);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setSavingEmail(false);
    }
  };

  const [billingAddress, setBillingAddress] = useState(user?.billing_address || "");
  const [shippingAddress, setShippingAddress] = useState(user?.shipping_address || "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressError, setAddressError] = useState(null);

  useEffect(() => {
    setBillingAddress(user?.billing_address || "");
    setShippingAddress(user?.shipping_address || "");
  }, [user?.billing_address, user?.shipping_address]);

  const startEditingAddress = () => {
    setBillingAddress(user?.billing_address || "");
    setShippingAddress(user?.shipping_address || "");
    setAddressError(null);
    setEditingAddress(true);
  };

  const cancelEditingAddress = () => {
    setBillingAddress(user?.billing_address || "");
    setShippingAddress(user?.shipping_address || "");
    setAddressError(null);
    setEditingAddress(false);
  };

  const saveAddress = async (e) => {
    e.preventDefault();
    setSavingAddress(true);
    setAddressError(null);
    try {
      await apiFetch("/profile/address", {
        method: "PUT",
        body: JSON.stringify({ billing_address: billingAddress, shipping_address: shippingAddress }),
      });
      await refreshUser();
      setEditingAddress(false);
      setSuccess("Address updated");
    } catch (err) {
      setAddressError(err.message);
    } finally {
      setSavingAddress(false);
    }
  };

  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licensePhotoFile, setLicensePhotoFile] = useState(null);
  const [gstNumber, setGstNumber] = useState("");
  const [gstPhotoFile, setGstPhotoFile] = useState(null);
  const licenseFileRef = useRef(null);
  const gstFileRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const data = await apiFetch("/onboarding/status");
      setStatus(data);
    } catch {
      // Not critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleUpload = async (e, docType) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const file = docType === "LICENSE" ? licensePhotoFile : gstPhotoFile;
    if (!file) { setError("Please select a photo"); return; }

    setUploading(docType);
    try {
      // Step 1: upload photo to S3
      let photoUrl;
      try {
        photoUrl = await uploadFileToS3(file);
      } catch (err) {
        throw new Error("Photo upload failed: " + err.message);
      }

      // Step 2: save document record
      const payload = docType === "LICENSE"
        ? { doc_type: "LICENSE", doc_number: licenseNumber, expiry_date: licenseExpiry, photo_url: photoUrl }
        : { doc_type: "GST", doc_number: gstNumber, photo_url: photoUrl };
      await apiFetch("/onboarding/documents", { method: "POST", body: JSON.stringify(payload) });
      setSuccess(`${docType === "LICENSE" ? "Drug license" : "GST certificate"} submitted for verification.`);
      if (docType === "LICENSE") { setLicenseNumber(""); setLicenseExpiry(""); setLicensePhotoFile(null); licenseFileRef.current.value = ""; }
      else { setGstNumber(""); setGstPhotoFile(null); gstFileRef.current.value = ""; }
      fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(null);
    }
  };

  const licenseDoc = status?.documents?.find((d) => d.doc_type === "LICENSE");
  const gstDoc = status?.documents?.find((d) => d.doc_type === "GST");

  const STEPS = [
    { n: 1, label: "Account Created" },
    { n: 2, label: "License Verified" },
    { n: 3, label: "GST Verified" },
    { n: 4, label: "Fully Verified" },
  ];
  const currentStep = status?.onboarding_step || 1;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">{user?.username || user?.phone_number}</p>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
      </div>

      {/* Default Transport Mode */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Default Transport Mode</h2>
        <p className="text-xs text-gray-500 mb-4">Used to pre-fill your order&apos;s shipping method at checkout — you can still change it per order.</p>
        <div className="flex gap-3">
          {transportModes.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={savingTransport}
              onClick={() => saveTransportMode(m.name)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition disabled:opacity-50 ${
                transportMode === m.name
                  ? "border-[#00A6A4] bg-[#00A6A4]/10 text-[#00A6A4]"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              {modeLabel(m.name)}
            </button>
          ))}
        </div>
      </div>

      {/* Email — optional at signup, so nudge partners to add it themselves
          once they're in (order status updates get emailed here). */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Email</h2>
        <p className="text-xs text-gray-500 mb-4">
          {user?.email
            ? "Order confirmations and status updates are sent here."
            : "Add your email to get order confirmations and status updates."}
        </p>
        <form onSubmit={saveEmail} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
          <button
            type="submit"
            disabled={savingEmail}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {savingEmail ? "Saving..." : "Save"}
          </button>
        </form>
        {emailError && <p className="text-xs text-red-600 mt-2">{emailError}</p>}
        {emailSuccess && <p className="text-xs text-green-600 mt-2">{emailSuccess}</p>}
      </div>

      {/* Billing / Shipping Address — locked by default, edit is explicit */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Billing &amp; Shipping Address</h2>
          {!editingAddress && (
            <button
              onClick={startEditingAddress}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">Used for invoicing and default delivery — you can still override the ship-to address per order.</p>

        {editingAddress ? (
          <form onSubmit={saveAddress} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
              <textarea
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                rows={2}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
                placeholder="Billing address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
              <textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none"
                placeholder="Shipping address"
              />
            </div>
            {addressError && <p className="text-sm text-red-600">{addressError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingAddress}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {savingAddress ? "Saving..." : "Save Address"}
              </button>
              <button
                type="button"
                onClick={cancelEditingAddress}
                disabled={savingAddress}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Billing Address</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 px-3 py-2 rounded-lg">
                {user?.billing_address || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Shipping Address</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 px-3 py-2 rounded-lg">
                {user?.shipping_address || "Not set"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Journey Progress */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Verification Journey</h2>
          <div className="flex items-start gap-0">
            {STEPS.map((s, i) => {
              const done = currentStep > s.n || (currentStep === 4 && s.n === 4);
              const active = currentStep === s.n;
              return (
                <div key={s.n} className="flex-1 flex flex-col items-center">
                  <div className="flex items-center w-full">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mx-auto ${
                      done ? "bg-green-500 text-white" : active ? "bg-[#00A6A4] text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      {done ? "✓" : s.n}
                    </div>
                  </div>
                  <p className={`text-[10px] mt-2 text-center font-medium ${active ? "text-[#00A6A4]" : done ? "text-green-600" : "text-gray-400"}`}>
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>

          {currentStep === 4 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium text-center">
              ✓ Your account is fully verified
            </div>
          )}
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* Drug License */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Drug License</h2>
            <p className="text-xs text-gray-500 mt-0.5">Required for order processing</p>
          </div>
          {licenseDoc?.is_verified && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✓ Verified</span>}
          {licenseDoc && !licenseDoc.is_verified && !licenseDoc.rejection_reason && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">⏳ Pending</span>}
          {licenseDoc?.rejection_reason && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">✗ Rejected</span>}
        </div>

        {licenseDoc?.rejection_reason && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            Reason: {licenseDoc.rejection_reason}
          </div>
        )}

        {licenseDoc && !licenseDoc.rejection_reason ? (
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">License No:</span> {licenseDoc.doc_number}</p>
            {licenseDoc.expiry_date && <p><span className="font-medium">Expiry:</span> {new Date(licenseDoc.expiry_date).toLocaleDateString("en-IN")}</p>}
            {licenseDoc.photo_url && <a href={licenseDoc.photo_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View uploaded photo →</a>}
          </div>
        ) : (
          <form onSubmit={(e) => handleUpload(e, "LICENSE")} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">License Number *</label>
              <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required
                placeholder="Enter your drug license number"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date *</label>
              <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">License Photo *</label>
              <input ref={licenseFileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => setLicensePhotoFile(e.target.files[0] || null)} />
              <button type="button" onClick={() => licenseFileRef.current.click()}
                className="w-full px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#00A6A4] hover:text-[#00A6A4] transition text-left flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {licensePhotoFile ? licensePhotoFile.name : "Click to upload photo"}
              </button>
            </div>
            <button type="submit" disabled={uploading === "LICENSE"}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#00A6A4" }}>
              {uploading === "LICENSE" ? "Uploading..." : "Submit License"}
            </button>
          </form>
        )}
      </div>

      {/* GST Certificate */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">GST Certificate</h2>
            <p className="text-xs text-gray-500 mt-0.5">Required for invoice generation</p>
          </div>
          {gstDoc?.is_verified && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✓ Verified</span>}
          {gstDoc && !gstDoc.is_verified && !gstDoc.rejection_reason && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">⏳ Pending</span>}
          {gstDoc?.rejection_reason && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">✗ Rejected</span>}
        </div>

        {gstDoc?.rejection_reason && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            Reason: {gstDoc.rejection_reason}
          </div>
        )}

        {gstDoc && !gstDoc.rejection_reason ? (
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">GST No:</span> {gstDoc.doc_number}</p>
            {gstDoc.photo_url && <a href={gstDoc.photo_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View uploaded photo →</a>}
          </div>
        ) : (
          <form onSubmit={(e) => handleUpload(e, "GST")} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">GST Number *</label>
              <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} required
                placeholder="e.g. 27AAPCT1234H1Z0"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">GST Photo *</label>
              <input ref={gstFileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => setGstPhotoFile(e.target.files[0] || null)} />
              <button type="button" onClick={() => gstFileRef.current.click()}
                className="w-full px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#00A6A4] hover:text-[#00A6A4] transition text-left flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {gstPhotoFile ? gstPhotoFile.name : "Click to upload photo"}
              </button>
            </div>
            <button type="submit" disabled={uploading === "GST"}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#00A6A4" }}>
              {uploading === "GST" ? "Uploading..." : "Submit GST Certificate"}
            </button>
          </form>
        )}
      </div>

      {/* Password changes and account deletion now live under Settings. */}
      <p className="px-1 text-xs text-gray-400">
        Looking for password or account deletion options? They&apos;ve moved to{" "}
        <Link href="/settings" className="text-red-600 hover:underline">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
