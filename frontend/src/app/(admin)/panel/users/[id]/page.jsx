"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import UserMeetingsRequests from "@/components/admin/UserMeetingsRequests";
import AssignmentPanel from "@/components/admin/AssignmentPanel";
import LedgerPanel from "@/components/admin/LedgerPanel";
import PasswordRules, { isPasswordValid } from "@/components/admin/PasswordRules";

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [verifying, setVerifying] = useState(null); // "LICENSE" | "GST"
  const [rejectingDoc, setRejectingDoc] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    apiFetch(`/admin/customers/${id}`)
      .then((data) => setCustomer(data))
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false));
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

  if (!customer) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">Customer not found</p>
        <Link
          href="/panel/users"
          className="mt-3 inline-block text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Back to customers
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
      await apiFetch(`/admin/customers/${id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: newPassword }),
      });
      setCustomer((prev) => ({ ...prev, plain_password: newPassword }));
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

  const handleDelete = async () => {
    if (!window.confirm(`Delete customer "${customer.username || customer.phone_number}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/customers/${id}`, { method: "DELETE" });
      router.push("/panel/users");
    } catch (err) {
      alert("Failed to delete customer: " + err.message);
      setDeleting(false);
    }
  };

  const orders = customer.orders || [];
  const documents = customer.documents || [];

  const handleVerifyDoc = async (docType, isVerified, reason) => {
    setVerifying(docType);
    try {
      await apiFetch("/admin/customers/verify-document", {
        method: "POST",
        body: JSON.stringify({ user_id: customer.id, doc_type: docType, is_verified: isVerified, rejection_reason: reason || null }),
      });
      const updated = await apiFetch(`/admin/customers/${id}`);
      setCustomer(updated);
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
        All Customers
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column — customer info */}
        <div className="lg:col-span-1 space-y-5">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-medium">
                {(customer.username || customer.phone_number || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {customer.username || "No name"}
                </h2>
                <p className="text-sm text-gray-500">{customer.role}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Phone
                </p>
                <p className="text-sm text-gray-900 font-mono">
                  {customer.phone_number}
                </p>
              </div>

              {customer.email && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Email
                  </p>
                  <p className="text-sm text-gray-900">{customer.email}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Joined
                </p>
                <p className="text-sm text-gray-900">
                  {new Date(customer.created_at).toLocaleDateString("en-IN", {
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
                  {customer.last_login_at
                    ? new Date(customer.last_login_at).toLocaleDateString(
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
          </div>

          {/* Credentials card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Login Credentials
              </h3>
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
                  {customer.phone_number}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">Password</p>
                  {!editingPassword && (
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
                      ? customer.plain_password || "Not available"
                      : "••••••••••••"}
                  </p>
                )}
              </div>
            </div>
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
                const done = always || (customer.onboarding_step || 1) >= step;
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

          {/* ID */}
          <div className="px-1">
            <p className="text-[10px] text-gray-400 font-mono">
              ID: {customer.id}
            </p>
          </div>

          {/* Delete */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-2">
              Danger Zone
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Permanently delete this customer and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Delete Customer"}
            </button>
          </div>
        </div>

        {/* Right column — documents + orders */}
        <div className="lg:col-span-2 space-y-6">

          {/* Documents */}
          {documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Documents</h3>
              <div className="space-y-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{doc.doc_type === "LICENSE" ? "Drug License" : "GST Certificate"}</p>
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

                    {doc.rejection_reason && (
                      <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">Rejection reason: {doc.rejection_reason}</p>
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
                ))}
              </div>
            </div>
          )}

          <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Orders
            </h3>
            <span className="text-xs text-gray-400">
              {orders.length} order{orders.length !== 1 ? "s" : ""}
            </span>
          </div>

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
                This customer hasn&apos;t placed any orders yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
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
          </div>

          <UserMeetingsRequests userId={customer.id} />
          <LedgerPanel customerId={customer.id} />
          <AssignmentPanel mode="client" userId={customer.id} />
        </div>
      </div>
    </>
  );
}
