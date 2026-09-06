"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { GstVerifyModal, DlVerifyModal, parseGovDate, gstFieldsPayload, dlFieldsPayload } from "@/components/shared/DocVerifyModals";

async function uploadFileToS3(file) {
  const { upload_url, public_url } = await apiFetch("/onboarding/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename: file.name }),
  });
  await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return public_url;
}

// A partner can hold both a Form 20B and a Form 21B wholesale drug license
// at once, so each form gets its own independent card/upload flow — matched
// doc types are fixed per instance rather than auto-detected from the
// scrape, since two cards exist side by side now.
function DrugLicenseCard({ title, subtitle, docType, doc, onUploaded, setError, setSuccess }) {
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licensePhotoFile, setLicensePhotoFile] = useState(null);
  const [updatingLicense, setUpdatingLicense] = useState(false);
  const [showDlVerify, setShowDlVerify] = useState(false);
  const [dlScrapedData, setDlScrapedData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const licenseFileRef = useRef(null);

  const isLicenseExpired = !!(doc?.expiry_date && new Date(doc.expiry_date) < new Date());

  const handleDlConfirm = (details) => {
    setDlScrapedData(details);
    const parsedExpiry = parseGovDate(details.dt_curr_validity_date);
    if (parsedExpiry) setLicenseExpiry(parsedExpiry);
    setShowDlVerify(false);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!licenseExpiry) { setError("Please verify your license first — the expiry date is fetched automatically."); return; }
    if (!licensePhotoFile) { setError("Please select a photo"); return; }

    setUploading(true);
    try {
      let photoUrl;
      try {
        photoUrl = await uploadFileToS3(licensePhotoFile);
      } catch (err) {
        throw new Error("Photo upload failed: " + err.message);
      }

      const payload = {
        doc_type: docType,
        doc_number: licenseNumber,
        expiry_date: licenseExpiry,
        photo_url: photoUrl,
        scraped_data: dlScrapedData || undefined,
        ...dlFieldsPayload(dlScrapedData),
      };
      await apiFetch("/onboarding/documents", { method: "POST", body: JSON.stringify(payload) });
      setSuccess(`${title} submitted for verification.`);
      setLicenseNumber(""); setLicenseExpiry(""); setLicensePhotoFile(null);
      licenseFileRef.current.value = ""; setUpdatingLicense(false); setDlScrapedData(null);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const detailRows = (d) => (
    <>
      <p><span className="font-medium">License No:</span> {d.doc_number}</p>
      {d.expiry_date && <p><span className="font-medium">Expiry:</span> {new Date(d.expiry_date).toLocaleDateString("en-IN")}</p>}
      {d.legal_name && <p><span className="font-medium">Firm Name:</span> {d.legal_name}</p>}
      {d.status && <p><span className="font-medium">Status (govt. portal):</span> {d.status}</p>}
      {d.address && <p><span className="font-medium">Address:</span> {d.address}</p>}
      {d.first_issue_date && <p><span className="font-medium">First Issued:</span> {new Date(d.first_issue_date).toLocaleDateString("en-IN")}</p>}
      {d.tech_person_name && (
        <p><span className="font-medium">Technical Person:</span> {d.tech_person_name}{d.tech_person_reg_no ? ` (Reg. No: ${d.tech_person_reg_no})` : ""}</p>
      )}
      {d.photo_url && <a href={d.photo_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View uploaded photo →</a>}
    </>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {doc?.is_verified && !isLicenseExpired && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✓ Verified</span>}
        {doc && !doc.is_verified && !doc.rejection_reason && !isLicenseExpired && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">⏳ Pending</span>}
        {doc?.rejection_reason && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">✗ Rejected</span>}
        {isLicenseExpired && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">⚠ Expired</span>}
      </div>

      {doc?.rejection_reason && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          Reason: {doc.rejection_reason}
        </div>
      )}

      {isLicenseExpired && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          Your license expired on {new Date(doc.expiry_date).toLocaleDateString("en-IN")}. Please update it with a new expiry date and photo.
        </div>
      )}

      {doc && !doc.rejection_reason && !isLicenseExpired ? (
        <div className="space-y-1 text-sm text-gray-600">{detailRows(doc)}</div>
      ) : isLicenseExpired && !updatingLicense ? (
        <div className="space-y-3">
          <div className="space-y-1 text-sm text-gray-600">{detailRows(doc)}</div>
          <button type="button" onClick={() => setUpdatingLicense(true)}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ backgroundColor: "#00A6A4" }}>
            Update License
          </button>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">License Number *</label>
            <div className="flex gap-2">
              <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required
                placeholder="Enter your drug license number"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]" />
              <button
                type="button"
                disabled={!licenseNumber.trim()}
                onClick={() => setShowDlVerify(true)}
                className="px-3 py-2 text-xs font-semibold text-[#00A6A4] border border-[#00A6A4] rounded-lg hover:bg-[#00A6A4]/5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Verify License
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Verifying fetches your registered details from the government drug-license portal so you can double-check the number before submitting.
            </p>
          </div>
          {dlScrapedData && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-gray-700 space-y-1">
              <p className="font-semibold text-teal-700 mb-1">Details fetched — will be saved with this submission:</p>
              {dlScrapedData.licence_form_no && <p><span className="font-medium">Form:</span> {dlScrapedData.licence_form_no}</p>}
              {dlScrapedData.institute_name && <p><span className="font-medium">Firm Name:</span> {dlScrapedData.institute_name}</p>}
              {dlScrapedData.licence_status && <p><span className="font-medium">Status:</span> {dlScrapedData.licence_status}</p>}
              {dlScrapedData.dt_curr_validity_date && <p><span className="font-medium">Valid Until:</span> {dlScrapedData.dt_curr_validity_date}</p>}
              {dlScrapedData.full_address && <p><span className="font-medium">Address:</span> {dlScrapedData.full_address}</p>}
              {dlScrapedData.tech_persons?.length > 0 && (
                <p><span className="font-medium">Technical Person:</span> {dlScrapedData.tech_persons.map((t) => t.techname).join(", ")}</p>
              )}
            </div>
          )}
          {!dlScrapedData && (
            <p className="text-xs text-gray-400">
              Expiry date is fetched automatically once you verify the license above — no need to enter it manually.
            </p>
          )}
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
          <button type="submit" disabled={uploading || !licenseExpiry}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#00A6A4" }}>
            {uploading ? "Uploading..." : updatingLicense ? "Update License" : "Submit License"}
          </button>
        </form>
      )}

      {showDlVerify && (
        <DlVerifyModal licenseNo={licenseNumber.trim()} onClose={() => setShowDlVerify(false)} onConfirm={handleDlConfirm} />
      )}
    </div>
  );
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

  const [shippingAddress, setShippingAddress] = useState(user?.shipping_address || "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressError, setAddressError] = useState(null);

  useEffect(() => {
    setShippingAddress(user?.shipping_address || "");
  }, [user?.shipping_address]);

  const startEditingAddress = () => {
    setShippingAddress(user?.shipping_address || "");
    setAddressError(null);
    setEditingAddress(true);
  };

  const cancelEditingAddress = () => {
    setShippingAddress(user?.shipping_address || "");
    setAddressError(null);
    setEditingAddress(false);
  };

  const saveAddress = async (e) => {
    e.preventDefault();
    setSavingAddress(true);
    setAddressError(null);
    try {
      // Billing address isn't sent here — it can only be pulled from the
      // verified GST record or changed by an admin, never typed freely.
      await apiFetch("/profile/address", {
        method: "PUT",
        body: JSON.stringify({ shipping_address: shippingAddress }),
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

  const [pullingBilling, setPullingBilling] = useState(false);
  const [pullBillingError, setPullBillingError] = useState(null);

  const pullBillingFromGst = async () => {
    setPullingBilling(true);
    setPullBillingError(null);
    try {
      await apiFetch("/profile/address/billing-from-gst", { method: "POST" });
      await refreshUser();
      setSuccess("Billing address pulled from your GST record");
    } catch (err) {
      setPullBillingError(err.message);
    } finally {
      setPullingBilling(false);
    }
  };

  const [gstNumber, setGstNumber] = useState("");
  const [gstPhotoFile, setGstPhotoFile] = useState(null);
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

  const handleGstUpload = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!gstPhotoFile) { setError("Please select a photo"); return; }

    setUploading("GST");
    try {
      const photoUrl = await uploadFileToS3(gstPhotoFile).catch((err) => {
        throw new Error("Photo upload failed: " + err.message);
      });

      const payload = { doc_type: "GST", doc_number: gstNumber, photo_url: photoUrl, scraped_data: gstScrapedData || undefined, ...gstFieldsPayload(gstScrapedData) };
      await apiFetch("/onboarding/documents", { method: "POST", body: JSON.stringify(payload) });
      setSuccess("GST certificate submitted for verification.");
      setGstNumber(""); setGstPhotoFile(null); gstFileRef.current.value = ""; setGstScrapedData(null); setUpdatingGst(false);
      fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(null);
    }
  };

  const [showGstVerify, setShowGstVerify] = useState(false);
  const [gstScrapedData, setGstScrapedData] = useState(null);
  const [updatingGst, setUpdatingGst] = useState(false);
  const license20BDoc = status?.documents?.find((d) => ["LICENSE", "LICENSE_20B"].includes(d.doc_type));
  const license21BDoc = status?.documents?.find((d) => d.doc_type === "LICENSE_21B");
  const gstDoc = status?.documents?.find((d) => d.doc_type === "GST");

  const handleGstConfirm = (details) => {
    setGstScrapedData(details);
    setShowGstVerify(false);
  };

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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Billing Address</label>
                <button
                  type="button"
                  onClick={pullBillingFromGst}
                  disabled={pullingBilling}
                  className="text-xs font-semibold text-[#00A6A4] hover:underline disabled:opacity-50"
                >
                  {pullingBilling ? "Pulling..." : "Pull from GST"}
                </button>
              </div>
              <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 px-3 py-2 rounded-lg">
                {user?.billing_address || "Not set"}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Billing address can only be pulled from your verified GST record, or changed by an admin — it can&apos;t be typed in directly.
              </p>
              {pullBillingError && <p className="text-xs text-red-600 mt-1">{pullBillingError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
              <textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                rows={2}
                autoFocus
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
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">Billing Address</p>
                <button
                  type="button"
                  onClick={pullBillingFromGst}
                  disabled={pullingBilling}
                  className="text-xs font-semibold text-[#00A6A4] hover:underline disabled:opacity-50"
                >
                  {pullingBilling ? "Pulling..." : "Pull from GST"}
                </button>
              </div>
              <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 px-3 py-2 rounded-lg">
                {user?.billing_address || "Not set"}
              </p>
              {pullBillingError && <p className="text-xs text-red-600 mt-1">{pullBillingError}</p>}
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

      {/* Drug License — Form 20B */}
      <DrugLicenseCard
        title="Drug License (Form 20B)"
        subtitle="Wholesale license — required for order processing"
        docType="LICENSE_20B"
        doc={license20BDoc}
        onUploaded={fetchStatus}
        setError={setError}
        setSuccess={setSuccess}
      />

      {/* Drug License — Form 21B */}
      <DrugLicenseCard
        title="Drug License (Form 21B)"
        subtitle="Wholesale license for Schedule X drugs, if applicable"
        docType="LICENSE_21B"
        doc={license21BDoc}
        onUploaded={fetchStatus}
        setError={setError}
        setSuccess={setSuccess}
      />

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

        {gstDoc && !gstDoc.rejection_reason && !updatingGst ? (
          <div className="space-y-3">
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">GST No:</span> {gstDoc.doc_number}</p>
              {gstDoc.legal_name && <p><span className="font-medium">Legal Name:</span> {gstDoc.legal_name}</p>}
              {gstDoc.trade_name && <p><span className="font-medium">Trade Name:</span> {gstDoc.trade_name}</p>}
              {gstDoc.status && <p><span className="font-medium">Status:</span> {gstDoc.status}</p>}
              {gstDoc.business_type && <p><span className="font-medium">Business Type:</span> {gstDoc.business_type}</p>}
              {gstDoc.registered_date && <p><span className="font-medium">Registered:</span> {new Date(gstDoc.registered_date).toLocaleDateString("en-IN")}</p>}
              {gstDoc.address && <p><span className="font-medium">Address:</span> {gstDoc.address}</p>}
              {gstDoc.photo_url && <a href={gstDoc.photo_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View uploaded photo →</a>}
            </div>
            {!gstDoc.legal_name && (
              <p className="text-xs text-gray-400">
                This certificate was submitted before we started fetching details automatically — click below to re-verify and fill them in.
              </p>
            )}
            <button type="button" onClick={() => setUpdatingGst(true)}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
              style={{ backgroundColor: "#00A6A4" }}>
              Update GST
            </button>
          </div>
        ) : (
          <form onSubmit={handleGstUpload} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">GST Number *</label>
              <div className="flex gap-2">
                <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} required
                  placeholder="e.g. 27AAPCT1234H1Z0"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]" />
                <button
                  type="button"
                  disabled={!gstNumber.trim()}
                  onClick={() => setShowGstVerify(true)}
                  className="px-3 py-2 text-xs font-semibold text-[#00A6A4] border border-[#00A6A4] rounded-lg hover:bg-[#00A6A4]/5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Verify GSTIN
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Verifying fetches your registered business details from the GST portal so you can double-check the number before submitting.
              </p>
            </div>
            {gstScrapedData && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-teal-700 mb-1">Details fetched — will be saved with this submission:</p>
                {gstScrapedData.lgnm && <p><span className="font-medium">Legal Name:</span> {gstScrapedData.lgnm}</p>}
                {gstScrapedData.tradeNam && <p><span className="font-medium">Trade Name:</span> {gstScrapedData.tradeNam}</p>}
                {gstScrapedData.sts && <p><span className="font-medium">Status:</span> {gstScrapedData.sts}</p>}
                {gstScrapedData.ctb && <p><span className="font-medium">Business Type:</span> {gstScrapedData.ctb}</p>}
                {gstScrapedData.pradr?.adr && <p><span className="font-medium">Address:</span> {gstScrapedData.pradr.adr}</p>}
              </div>
            )}
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
              {uploading === "GST" ? "Uploading..." : updatingGst ? "Update GST Certificate" : "Submit GST Certificate"}
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

      {showGstVerify && (
        <GstVerifyModal gstin={gstNumber.trim()} onClose={() => setShowGstVerify(false)} onConfirm={handleGstConfirm} />
      )}
    </div>
  );
}
