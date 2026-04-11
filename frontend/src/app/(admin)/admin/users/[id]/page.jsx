"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
          href="/admin/users"
          className="mt-3 inline-block text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  const handlePasswordSave = async () => {
    if (newPassword.length < 4) {
      setPwError("Password must be at least 4 characters");
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
      router.push("/admin/users");
    } catch (err) {
      alert("Failed to delete customer: " + err.message);
      setDeleting(false);
    }
  };

  const orders = customer.orders || [];

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/users"
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

        {/* Right column — orders */}
        <div className="lg:col-span-2">
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
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
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
      </div>
    </>
  );
}
