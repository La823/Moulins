"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import UserMeetingsRequests from "@/components/admin/UserMeetingsRequests";
import AssignmentPanel from "@/components/admin/AssignmentPanel";
import LedgerPanel from "@/components/admin/LedgerPanel";
import PasswordRules, { isPasswordValid } from "@/components/admin/PasswordRules";
import SpecialProductsPanel from "@/components/admin/SpecialProductsPanel";
import { GstVerifyModal, DlVerifyModal } from "@/components/shared/DocVerifyModals";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
};

// Collapsed-by-default section wrapper — used for Cart/Orders/Meetings so
// the profile page opens compact and staff expand only what they need.
function Collapsible({ title, subtitle, children, small = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <h3
          className={
            small
              ? "text-xs font-medium text-gray-400"
              : "text-sm font-semibold text-gray-700 uppercase tracking-wider"
          }
        >
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

export default function PartnerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const canEditCredentials =
    user?.role === "admin" || (user?.permissions || []).includes("partners_credentials");
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [changingType, setChangingType] = useState(false);
  const [typeError, setTypeError] = useState("");
  const [ridInput, setRidInput] = useState("");
  const [savingRid, setSavingRid] = useState(false);
  const [ridError, setRidError] = useState("");
  const [ridSuccess, setRidSuccess] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [uploadingTileImage, setUploadingTileImage] = useState(false);
  const [tileImageError, setTileImageError] = useState("");
  const [verifying, setVerifying] = useState(null); // "LICENSE" | "GST"
  const [scraperCheckDoc, setScraperCheckDoc] = useState(null); // the doc_type currently being cross-checked
  const [rejectingDoc, setRejectingDoc] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartLoading, setCartLoading] = useState(true);
  const ORDERS_PAGE_SIZE = 5;
  const [billingInput, setBillingInput] = useState("");
  const [shippingInput, setShippingInput] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressSuccess, setAddressSuccess] = useState("");
  const [pincodeInput, setPincodeInput] = useState("");
  const [savingPincode, setSavingPincode] = useState(false);
  const [pincodeError, setPincodeError] = useState("");
  const [pincodeSuccess, setPincodeSuccess] = useState("");
  const [sendingWelcomeEmail, setSendingWelcomeEmail] = useState(false);
  const [welcomeEmailError, setWelcomeEmailError] = useState("");
  const [welcomeEmailSuccess, setWelcomeEmailSuccess] = useState("");
  const [sendLog, setSendLog] = useState([]);

  const loadSendLog = () =>
    apiFetch(`/admin/partners/${id}/send-log`)
      .then((data) => setSendLog(data.entries || []))
      .catch(() => {});

  const lastSent = (templateKey) =>
    sendLog.find((e) => e.template_key === templateKey);

  useEffect(() => {
    apiFetch(`/admin/partners/${id}`)
      .then((data) => {
        setPartner(data);
        setRidInput(data?.rid || "");
        setEmailInput(data?.email || "");
        setPhoneInput(data?.phone_number || "");
        setBillingInput(data?.billing_address || "");
        setShippingInput(data?.shipping_address || "");
        setPincodeInput(data?.pincode || "");
      })
      .catch(() => setPartner(null))
      .finally(() => setLoading(false));
    loadSendLog();
    apiFetch(`/admin/partners/${id}/cart`)
      .then((data) => setCartItems(data.items || []))
      .catch(() => setCartItems([]))
      .finally(() => setCartLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-5 bg-gray-100 rounded w-1/3 mb-3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
        <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-4 bg-gray-100 rounded w-full mb-2" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">Partner not found</p>
        <Link
          href="/panel/users"
          className="mt-3 inline-block text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Back to partners
        </Link>
      </div>
    );
  }

  const handlePasswordSave = async () => {
    if (!isPasswordValid(newPassword)) {
      setPwError("Password doesn't meet all the requirements below");
      return;
    }
    setSavingPassword(true);
    setPwError("");
    try {
      await apiFetch(`/admin/partners/${id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: newPassword }),
      });
      setPartner((prev) => ({ ...prev, plain_password: newPassword }));
      setNewPassword("");
      setEditingPassword(false);
      setPwSuccess("Password updated");
      setTimeout(() => setPwSuccess(""), 4000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCustomerTypeChange = async (newType) => {
    if (newType === (partner.customer_type || "normal")) return;
    setChangingType(true);
    setTypeError("");
    try {
      await apiFetch(`/admin/partners/${id}/customer-type`, {
        method: "PUT",
        body: JSON.stringify({ customer_type: newType }),
      });
      setPartner((prev) => ({ ...prev, customer_type: newType }));
    } catch (err) {
      setTypeError(err.message);
    } finally {
      setChangingType(false);
    }
  };

  const handleRidSave = async (e) => {
    e.preventDefault();
    setSavingRid(true);
    setRidError("");
    setRidSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/rid`, {
        method: "PUT",
        body: JSON.stringify({ rid: ridInput.trim() }),
      });
      setPartner((prev) => ({ ...prev, rid: ridInput.trim() || null }));
      setRidSuccess("Saved");
      setTimeout(() => setRidSuccess(""), 3000);
    } catch (err) {
      setRidError(err.message);
    } finally {
      setSavingRid(false);
    }
  };

  const handleEmailSave = async (e) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/email`, {
        method: "PUT",
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      setPartner((prev) => ({ ...prev, email: emailInput.trim() || null }));
      setEmailSuccess("Saved");
      setTimeout(() => setEmailSuccess(""), 3000);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePhoneSave = async (e) => {
    e.preventDefault();
    if (!phoneInput.trim()) {
      setPhoneError("Phone number is required");
      return;
    }
    setSavingPhone(true);
    setPhoneError("");
    setPhoneSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/phone`, {
        method: "PUT",
        body: JSON.stringify({ phone_number: phoneInput.trim() }),
      });
      setPartner((prev) => ({ ...prev, phone_number: phoneInput.trim() }));
      setPhoneSuccess("Saved");
      setTimeout(() => setPhoneSuccess(""), 3000);
    } catch (err) {
      setPhoneError(err.message);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleAddressSave = async (e) => {
    e.preventDefault();
    setSavingAddress(true);
    setAddressError("");
    setAddressSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/address`, {
        method: "PUT",
        body: JSON.stringify({
          billing_address: billingInput,
          shipping_address: shippingInput,
        }),
      });
      setPartner((prev) => ({
        ...prev,
        billing_address: billingInput || null,
        shipping_address: shippingInput || null,
      }));
      setAddressSuccess("Saved");
      setTimeout(() => setAddressSuccess(""), 3000);
    } catch (err) {
      setAddressError(err.message);
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePincodeSave = async (e) => {
    e.preventDefault();
    setSavingPincode(true);
    setPincodeError("");
    setPincodeSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/pincode`, {
        method: "PUT",
        body: JSON.stringify({ pincode: pincodeInput }),
      });
      setPartner((prev) => ({ ...prev, pincode: pincodeInput || null }));
      setPincodeSuccess("Saved");
      setTimeout(() => setPincodeSuccess(""), 3000);
    } catch (err) {
      setPincodeError(err.message);
    } finally {
      setSavingPincode(false);
    }
  };

  const handleSendWelcomeEmail = async () => {
    setSendingWelcomeEmail(true);
    setWelcomeEmailError("");
    setWelcomeEmailSuccess("");
    try {
      await apiFetch(`/admin/partners/${id}/send-email/partner_welcome_credentials`, {
        method: "POST",
      });
      setWelcomeEmailSuccess("Email sent");
      setTimeout(() => setWelcomeEmailSuccess(""), 4000);
      loadSendLog();
    } catch (err) {
      setWelcomeEmailError(err.message);
    } finally {
      setSendingWelcomeEmail(false);
    }
  };

  const handleTileImageUpload = async (file) => {
    if (!file) return;
    setUploadingTileImage(true);
    setTileImageError("");
    try {
      const { upload_url, key } = await apiFetch("/admin/partners/special-tile-upload-url", {
        method: "POST",
        body: JSON.stringify({ customer_id: id, filename: file.name }),
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      await apiFetch(`/admin/partners/${id}/special-tile-image`, {
        method: "PUT",
        body: JSON.stringify({ image_key: key }),
      });
      const updated = await apiFetch(`/admin/partners/${id}`);
      setPartner(updated);
    } catch (err) {
      setTileImageError(err.message);
    } finally {
      setUploadingTileImage(false);
    }
  };

  const handleTileImageRemove = async () => {
    setUploadingTileImage(true);
    setTileImageError("");
    try {
      await apiFetch(`/admin/partners/${id}/special-tile-image`, {
        method: "PUT",
        body: JSON.stringify({ image_key: "" }),
      });
      setPartner((prev) => ({ ...prev, special_tile_image_url: "" }));
    } catch (err) {
      setTileImageError(err.message);
    } finally {
      setUploadingTileImage(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete partner "${partner.username || partner.phone_number}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/partners/${id}`, { method: "DELETE" });
      router.push("/panel/users");
    } catch (err) {
      alert("Failed to delete partner: " + err.message);
      setDeleting(false);
    }
  };

  const orders = partner.orders || [];
  const documents = partner.documents || [];

  const handleVerifyDoc = async (docType, isVerified, reason) => {
    setVerifying(docType);
    try {
      await apiFetch("/admin/partners/verify-document", {
        method: "POST",
        body: JSON.stringify({ user_id: partner.id, doc_type: docType, is_verified: isVerified, rejection_reason: reason || null }),
      });
      const updated = await apiFetch(`/admin/partners/${id}`);
      setPartner(updated);
      setRejectingDoc(null);
      setRejectReason("");
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setVerifying(null);
    }
  };

  return (
    <>
      {/* Back link */}
      <Link
        href="/panel/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-5"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
        All Partners
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column — partner info */}
        <div className="lg:col-span-1 space-y-5">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-medium">
                {(partner.username || partner.phone_number || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {partner.username || "No name"}
                </h2>
                <p className="text-sm text-gray-500">{partner.role}</p>
              </div>
            </div>

            <Collapsible title="Details">
            {/* Customer type — controls whether this partner sees their own
                private "Special" product division. Admin-only. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Customer Type
              </p>
              <select
                value={partner.customer_type || "normal"}
                onChange={(e) => handleCustomerTypeChange(e.target.value)}
                disabled={changingType}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
              >
                <option value="normal">Normal</option>
                <option value="special">Special</option>
              </select>
              {changingType && (
                <p className="text-xs text-gray-400 mt-1">Updating...</p>
              )}
              {typeError && (
                <p className="text-xs text-red-600 mt-1">{typeError}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                Special partners get their own private product catalog.
              </p>
            </div>

            {/* Marg party RID — links this partner to their Marg ERP
                ledger account (margmaster_party.rid). Set manually since
                Marg's party list has no link back to a Moulins account. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Marg Party RID
              </p>
              <form onSubmit={handleRidSave} className="flex gap-2">
                <input
                  type="text"
                  value={ridInput}
                  onChange={(e) => setRidInput(e.target.value)}
                  placeholder="e.g. 2090504"
                  className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={savingRid}
                  className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingRid ? "Saving..." : "Save"}
                </button>
              </form>
              {ridError && <p className="text-xs text-red-600 mt-1">{ridError}</p>}
              {ridSuccess && <p className="text-xs text-green-600 mt-1">{ridSuccess}</p>}
              <p className="text-[11px] text-gray-400 mt-1">
                Links this partner to their Marg ERP party/ledger record — find the RID on the Marg Parties page.
              </p>
            </div>

            {/* Tile image — shown on this customer's "Special" filter tile
                on the products page instead of the plain teal fallback. */}
            {(partner.customer_type || "normal") === "special" && (
              <div className="mb-5">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Special Tile Image
                </p>
                {partner.special_tile_image_url ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={partner.special_tile_image_url}
                      alt="Special tile"
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-blue-600 hover:underline cursor-pointer">
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingTileImage}
                          onChange={(e) => handleTileImageUpload(e.target.files?.[0])}
                        />
                      </label>
                      <button
                        onClick={handleTileImageRemove}
                        disabled={uploadingTileImage}
                        className="text-xs text-red-500 hover:text-red-700 text-left disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="inline-block text-sm text-blue-600 hover:underline cursor-pointer">
                    {uploadingTileImage ? "Uploading..." : "Upload an image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingTileImage}
                      onChange={(e) => handleTileImageUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
                {tileImageError && (
                  <p className="text-xs text-red-600 mt-1">{tileImageError}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  Shown on their &quot;Special&quot; filter tile on the products page.
                </p>
              </div>
            )}

            {/* Phone — this is also the partner's login identity, so
                changing it changes what they log in with. Editing it
                requires the partners_credentials permission. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Phone
              </p>
              {canEditCredentials ? (
                <>
                  <form onSubmit={handlePhoneSave} className="flex gap-2">
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Phone number"
                      className="flex-1 px-3 py-2 text-sm text-gray-900 font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="submit"
                      disabled={savingPhone}
                      className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {savingPhone ? "Saving..." : "Save"}
                    </button>
                  </form>
                  {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
                  {phoneSuccess && <p className="text-xs text-green-600 mt-1">{phoneSuccess}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">
                    This is also their login identity.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
                  {partner.phone_number}
                </p>
              )}
            </div>

            {/* Email — optional, partners can add it themselves too from
                their own profile. Editing it here requires the
                partners_credentials permission. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Email
              </p>
              {canEditCredentials ? (
                <>
                  <form onSubmit={handleEmailSave} className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Email address"
                      className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="submit"
                      disabled={savingEmail}
                      className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {savingEmail ? "Saving..." : "Save"}
                    </button>
                  </form>
                  {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                  {emailSuccess && <p className="text-xs text-green-600 mt-1">{emailSuccess}</p>}
                </>
              ) : (
                <p className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">
                  {partner.email || "Not set"}
                </p>
              )}
            </div>

            {/* Billing / Shipping Address — partners can also set this
                themselves from their own profile. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Billing &amp; Shipping Address
              </p>
              <form onSubmit={handleAddressSave} className="space-y-2">
                <textarea
                  value={billingInput}
                  onChange={(e) => setBillingInput(e.target.value)}
                  rows={2}
                  placeholder="Billing address"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <textarea
                  value={shippingInput}
                  onChange={(e) => setShippingInput(e.target.value)}
                  rows={2}
                  placeholder="Shipping address"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingAddress ? "Saving..." : "Save Address"}
                </button>
              </form>
              {addressError && <p className="text-xs text-red-600 mt-1">{addressError}</p>}
              {addressSuccess && <p className="text-xs text-green-600 mt-1">{addressSuccess}</p>}
            </div>

            {/* Pincode — drives the geocoded city/state/lat/lng, same as at
                signup. */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Pincode</p>
              <form onSubmit={handlePincodeSave} className="flex gap-2">
                <input
                  type="text"
                  value={pincodeInput}
                  onChange={(e) => setPincodeInput(e.target.value)}
                  placeholder="Pincode"
                  className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={savingPincode}
                  className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingPincode ? "Saving..." : "Save"}
                </button>
              </form>
              {(partner.city || partner.state) && (
                <p className="text-xs text-gray-500 mt-1">
                  {[partner.city, partner.state].filter(Boolean).join(", ")}
                </p>
              )}
              {pincodeError && <p className="text-xs text-red-600 mt-1">{pincodeError}</p>}
              {pincodeSuccess && <p className="text-xs text-green-600 mt-1">{pincodeSuccess}</p>}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Joined
                </p>
                <p className="text-sm text-gray-900">
                  {new Date(partner.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Last Login
                </p>
                <p className="text-sm text-gray-900">
                  {partner.last_login_at
                    ? new Date(partner.last_login_at).toLocaleDateString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )
                    : "Never"}
                </p>
              </div>
            </div>
            </Collapsible>
          </div>

          {/* Credentials card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <Collapsible title="Login Credentials">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {pwSuccess && (
              <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-3">
                {pwSuccess}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">Phone (Login)</p>
                <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
                  {partner.phone_number}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">Password</p>
                  {!editingPassword && canEditCredentials && (
                    <button
                      onClick={() => {
                        setEditingPassword(true);
                        setNewPassword("");
                        setPwError("");
                      }}
                      className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingPassword ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoFocus
                      className="w-full px-3 py-2 text-sm text-gray-900 font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <PasswordRules password={newPassword} />
                    {pwError && (
                      <p className="text-xs text-red-600">{pwError}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePasswordSave}
                        disabled={savingPassword}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        {savingPassword ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPassword(false);
                          setNewPassword("");
                          setPwError("");
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
                    {showPassword
                      ? partner.plain_password || "Not available"
                      : "••••••••••••"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleSendWelcomeEmail}
                disabled={sendingWelcomeEmail || !partner.email}
                className="w-full px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendingWelcomeEmail ? "Sending..." : "Send Welcome Email (login details)"}
              </button>
              {!partner.email && (
                <p className="text-[11px] text-gray-400 mt-1">Set an email above first.</p>
              )}
              {lastSent("partner_welcome_credentials") && (
                <p className="flex items-center gap-1.5 text-xs text-green-700 mt-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Sent {new Date(lastSent("partner_welcome_credentials").sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
              {welcomeEmailError && <p className="text-xs text-red-600 mt-1">{welcomeEmailError}</p>}
              {welcomeEmailSuccess && <p className="text-xs text-green-600 mt-1">{welcomeEmailSuccess}</p>}
            </div>
            </Collapsible>
          </div>

          {/* Journey Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Verification Journey</h3>
            <div className="space-y-2">
              {[
                { step: 1, label: "Account Created", always: true },
                { step: 2, label: "Drug License", docType: "LICENSE" },
                { step: 3, label: "GST Certificate", docType: "GST" },
              ].map(({ step, label, docType, always }) => {
                const doc = documents.find((d) => d.doc_type === docType);
                const done = always || (partner.onboarding_step || 1) >= step;
                return (
                  <div key={step} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${done ? "bg-gray-50" : "opacity-40"}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      doc?.is_verified ? "bg-green-500 text-white" :
                      doc && !doc.is_verified ? "bg-yellow-400 text-white" :
                      always ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      {doc?.is_verified || always ? "✓" : doc ? "!" : step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">{label}</p>
                      {doc && <p className={`text-[10px] ${doc.is_verified ? "text-green-600" : doc.rejection_reason ? "text-red-500" : "text-yellow-600"}`}>
                        {doc.is_verified ? "Verified" : doc.rejection_reason ? "Rejected" : "Pending review"}
                      </p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ID + tucked-away delete option — intentionally low-visibility,
              this is a destructive/irreversible action */}
          <div className="px-1">
            <p className="text-[10px] text-gray-400 font-mono mb-2">
              ID: {partner.id}
            </p>
            <Collapsible title="Advanced" small>
              <p className="text-[11px] text-gray-400 mb-2">
                Permanently delete this partner and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete partner"}
              </button>
            </Collapsible>
          </div>
        </div>

        {/* Right column — documents + orders */}
        <div className="lg:col-span-2 space-y-6">

          {/* Special product catalog — only for special-type customers */}
          {partner.customer_type === "special" && (
            <SpecialProductsPanel customerId={partner.id} />
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Documents</h3>
              <div className="space-y-4">
                {documents.map((doc) => {
                  const isLicense = doc.doc_type === "LICENSE" || doc.doc_type.startsWith("LICENSE_");
                  const docLabel = doc.doc_type === "GST" ? "GST Certificate"
                    : doc.doc_type === "LICENSE_21B" ? "Drug License (Form 21B)"
                    : doc.doc_type === "LICENSE_20B" ? "Drug License (Form 20B)"
                    : "Drug License";
                  return (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{docLabel}</p>
                        {doc.doc_number && <p className="text-xs text-gray-500 mt-0.5">No: {doc.doc_number}</p>}
                        {doc.expiry_date && <p className="text-xs text-gray-500">Expires: {new Date(doc.expiry_date).toLocaleDateString("en-IN")}</p>}
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                        doc.is_verified ? "bg-green-100 text-green-700" :
                        doc.rejection_reason ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {doc.is_verified ? "✓ Verified" : doc.rejection_reason ? "✗ Rejected" : "⏳ Pending"}
                      </span>
                    </div>

                    {doc.photo_url && (
                      <a href={doc.photo_url} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-xs text-blue-600 hover:underline mb-3">
                        View Document Photo →
                      </a>
                    )}

                    {/* Details the partner's own scraper check saved at upload time,
                        if any — lets the admin compare against the photo without
                        necessarily re-running the scraper. */}
                    {(doc.legal_name || doc.address || doc.status || doc.tech_person_name) && (
                      <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3 space-y-0.5">
                        {doc.legal_name && <p><span className="font-medium">Name:</span> {doc.legal_name}</p>}
                        {doc.trade_name && <p><span className="font-medium">Trade Name:</span> {doc.trade_name}</p>}
                        {doc.status && <p><span className="font-medium">Portal Status:</span> {doc.status}</p>}
                        {doc.address && <p><span className="font-medium">Address:</span> {doc.address}</p>}
                        {doc.tech_person_name && <p><span className="font-medium">Technical Person:</span> {doc.tech_person_name}</p>}
                      </div>
                    )}

                    {doc.rejection_reason && (
                      <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">Rejection reason: {doc.rejection_reason}</p>
                    )}

                    {doc.doc_number && (
                      <button
                        onClick={() => setScraperCheckDoc(doc)}
                        className="mb-3 px-3 py-1.5 text-xs font-semibold text-[#00A6A4] border border-[#00A6A4] rounded-lg hover:bg-[#00A6A4]/5"
                      >
                        🔍 Check with {isLicense ? "drug-license" : "GST"} portal
                      </button>
                    )}

                    {/* Action buttons */}
                    {!doc.is_verified && rejectingDoc !== doc.doc_type && (
                      <div className="flex gap-2">
                        <button onClick={() => handleVerifyDoc(doc.doc_type, true, null)}
                          disabled={verifying === doc.doc_type}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          {verifying === doc.doc_type ? "..." : "✓ Approve"}
                        </button>
                        <button onClick={() => setRejectingDoc(doc.doc_type)}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                          ✗ Reject
                        </button>
                      </div>
                    )}

                    {rejectingDoc === doc.doc_type && (
                      <div className="space-y-2 mt-2">
                        <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection..." autoFocus
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                        <div className="flex gap-2">
                          <button onClick={() => handleVerifyDoc(doc.doc_type, false, rejectReason)}
                            disabled={!rejectReason || verifying === doc.doc_type}
                            className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                            {verifying === doc.doc_type ? "..." : "Confirm Reject"}
                          </button>
                          <button onClick={() => { setRejectingDoc(null); setRejectReason(""); }}
                            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900">Cancel</button>
                        </div>
                      </div>
                    )}

                    {doc.is_verified && (
                      <button onClick={() => handleVerifyDoc(doc.doc_type, false, "Needs re-verification")}
                        disabled={verifying === doc.doc_type}
                        className="text-xs text-gray-400 hover:text-gray-600 mt-2">
                        Revoke verification
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {scraperCheckDoc && (
            scraperCheckDoc.doc_type === "GST" ? (
              <GstVerifyModal gstin={scraperCheckDoc.doc_number} onClose={() => setScraperCheckDoc(null)} />
            ) : (
              <DlVerifyModal licenseNo={scraperCheckDoc.doc_number} onClose={() => setScraperCheckDoc(null)} />
            )
          )}

          <div className="mb-8">
            <Collapsible
              title="Cart"
              subtitle={!cartLoading ? `${cartItems.length} item${cartItems.length !== 1 ? "s" : ""}` : undefined}
            >
            {cartLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">Loading cart...</p>
              </div>
            ) : cartItems.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <svg
                  className="w-10 h-10 text-gray-300 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                  />
                </svg>
                <p className="text-sm text-gray-400">This partner&apos;s cart is empty</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/panel/products/${item.product_id}`)}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.product_name}
                        {!item.is_active && (
                          <span className="ml-2 text-[11px] font-medium text-red-500">inactive</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[item.pack_size, item.product_form].filter(Boolean).join(" · ")}
                        {item.stock <= 0 && <span className="text-red-500 ml-2">out of stock</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm text-gray-900">
                        Qty <span className="font-semibold">{item.quantity}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        &#8377;{item.price} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </Collapsible>
          </div>

          <div>
            <Collapsible
              title="Orders"
              subtitle={`${orders.length} order${orders.length !== 1 ? "s" : ""}`}
            >

          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <svg
                className="w-10 h-10 text-gray-300 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-sm text-gray-400">
                This partner hasn&apos;t placed any orders yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(showAllOrders ? orders : orders.slice(0, ORDERS_PAGE_SIZE)).map((order) => (
                <div
                  key={order.id}
                  onClick={() => router.push(`/panel/orders/${order.id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-400 font-mono">
                        {order.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-1 rounded-full font-medium capitalize ${
                        STATUS_STYLES[order.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {order.item_count} item{order.item_count !== 1 ? "s" : ""}
                    </p>
                    {order.notes && (
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">
                        {order.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {orders.length > ORDERS_PAGE_SIZE && (
            <button
              onClick={() => setShowAllOrders((v) => !v)}
              className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              {showAllOrders ? "Show less" : `Show all ${orders.length}`}
            </button>
          )}
            </Collapsible>
          </div>

          <Collapsible title="Meetings & Requests">
            <UserMeetingsRequests userId={partner.id} />
          </Collapsible>
          <LedgerPanel partnerId={partner.id} />
          <AssignmentPanel mode="client" userId={partner.id} />
        </div>
      </div>
    </>
  );
}
