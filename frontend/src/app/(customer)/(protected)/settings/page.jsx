"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import PasswordRules, { isPasswordValid } from "@/components/admin/PasswordRules";

export default function SettingsPage() {
  const { user } = useAuth();

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!isPasswordValid(newPassword)) {
      setPwError("New password doesn't meet all the requirements below");
      return;
    }
    setSavingPassword(true);
    setPwError("");
    setPwSuccess("");
    try {
      await apiFetch("/profile/password", {
        method: "PUT",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPwSuccess("Password updated");
      setTimeout(() => setPwSuccess(""), 4000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Account deletion
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [loadingDeletion, setLoadingDeletion] = useState(true);
  const [deleteReason, setDeleteReason] = useState("");
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [submittingDeletion, setSubmittingDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState(null);

  const fetchDeletionRequest = () => {
    apiFetch("/account/deletion-request")
      .then((data) => setDeletionRequest(data))
      .catch(() => setDeletionRequest(null))
      .finally(() => setLoadingDeletion(false));
  };

  useEffect(() => {
    fetchDeletionRequest();
  }, []);

  const submitDeletionRequest = async (e) => {
    e.preventDefault();
    if (!confirm("Submit a request to delete your account? Our team will review it before your account and data are removed.")) return;
    setSubmittingDeletion(true);
    setDeletionError(null);
    try {
      await apiFetch("/account/deletion-request", {
        method: "POST",
        body: JSON.stringify({ reason: deleteReason.trim() || undefined }),
      });
      setDeleteReason("");
      setShowDeleteForm(false);
      fetchDeletionRequest();
    } catch (err) {
      setDeletionError(err.message);
    } finally {
      setSubmittingDeletion(false);
    }
  };

  const cancelDeletionRequest = async () => {
    if (!confirm("Cancel your account deletion request?")) return;
    try {
      await apiFetch("/account/deletion-request", { method: "DELETE" });
      fetchDeletionRequest();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">{user?.username || user?.phone_number}</p>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Change Password</h2>
        <p className="text-xs text-gray-500 mb-4">Update the password you use to log in.</p>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <PasswordRules password={newPassword} />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-600">{pwSuccess}</p>}
          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {savingPassword ? "Saving..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Account Deletion — kept to a single compact line; only the reason
          form (when opened) or a pending/rejected status line grows it. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Account Deletion</h2>
        <p className="text-xs text-gray-500 mb-4">
          Our team reviews every request before your account and data are removed — this is not instant.
        </p>

        {!loadingDeletion && (
          deletionRequest?.status === "pending" ? (
            <p className="text-xs text-amber-700">
              Deletion request pending review
              {deletionRequest.reason && <> &middot; &ldquo;{deletionRequest.reason}&rdquo;</>}
              {" · "}
              <button onClick={cancelDeletionRequest} className="underline hover:text-amber-900">
                Cancel
              </button>
            </p>
          ) : showDeleteForm ? (
            <form onSubmit={submitDeletionRequest} className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Reason (optional)"
                className="flex-1 min-w-[160px] px-2 py-1 border border-gray-300 rounded text-xs text-gray-900"
              />
              <button
                type="submit"
                disabled={submittingDeletion}
                className="text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
              >
                {submittingDeletion ? "Submitting..." : "Confirm delete request"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteForm(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              {deletionError && <p className="text-xs text-red-600 w-full">{deletionError}</p>}
            </form>
          ) : (
            <p className="text-xs text-gray-400">
              {deletionRequest?.status === "rejected" && "Last deletion request was declined. "}
              <button onClick={() => setShowDeleteForm(true)} className="text-red-600 hover:underline">
                Request account deletion
              </button>
            </p>
          )
        )}
      </div>
    </div>
  );
}
