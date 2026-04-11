"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  // Password state
  const [showPassword, setShowPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwError, setPwError] = useState("");

  // Permissions state
  const [allPermissions, setAllPermissions] = useState([]);
  const [permState, setPermState] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [permSuccess, setPermSuccess] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch(`/admin/employees/${id}`)
      .then((data) => {
        setEmployee(data);
        const state = {};
        (data.permissions || []).forEach((p) => {
          state[p] = true;
        });
        setPermState(state);
      })
      .catch(() => setEmployee(null))
      .finally(() => setLoading(false));

    apiFetch("/admin/permissions")
      .then((data) => setAllPermissions(data.permissions || []))
      .catch(() => setAllPermissions([]));
  }, [id]);

  // Clear success messages
  useEffect(() => {
    if (pwSuccess) {
      const t = setTimeout(() => setPwSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [pwSuccess]);

  useEffect(() => {
    if (permSuccess) {
      const t = setTimeout(() => setPermSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [permSuccess]);

  const handlePasswordSave = async () => {
    if (newPassword.length < 4) {
      setPwError("Password must be at least 4 characters");
      return;
    }
    setSavingPassword(true);
    setPwError("");
    try {
      await apiFetch(`/admin/employees/${id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: newPassword }),
      });
      setEmployee((prev) => ({ ...prev, plain_password: newPassword }));
      setNewPassword("");
      setEditingPassword(false);
      setPwSuccess("Password updated");
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePermissions = async () => {
    setSavingPerms(true);
    try {
      const perms = Object.entries(permState)
        .filter(([, v]) => v)
        .map(([k]) => k);
      await apiFetch(`/admin/employees/${id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: perms }),
      });
      setEmployee((prev) => ({ ...prev, permissions: perms }));
      setPermSuccess("Permissions updated");
    } catch (err) {
      alert("Failed to save permissions: " + err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete employee "${employee.username || employee.phone_number}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/employees/${id}`, { method: "DELETE" });
      router.push("/admin/employees");
    } catch (err) {
      alert("Failed to delete employee: " + err.message);
      setDeleting(false);
    }
  };

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

  if (!employee) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">Employee not found</p>
        <Link
          href="/admin/employees"
          className="mt-3 inline-block text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Back to employees
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/employees"
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
        All Employees
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column — employee info */}
        <div className="lg:col-span-1 space-y-5">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-medium">
                {(employee.username || employee.phone_number || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {employee.username || "No name"}
                </h2>
                <p className="text-sm text-gray-500">{employee.role}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Phone
                </p>
                <p className="text-sm text-gray-900 font-mono">
                  {employee.phone_number}
                </p>
              </div>

              {employee.email && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Email
                  </p>
                  <p className="text-sm text-gray-900">{employee.email}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Joined
                </p>
                <p className="text-sm text-gray-900">
                  {new Date(employee.created_at).toLocaleDateString("en-IN", {
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
                  {employee.last_login_at
                    ? new Date(employee.last_login_at).toLocaleDateString(
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
                  {employee.phone_number}
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
                      ? employee.plain_password || "Not available"
                      : "••••••••••••"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ID */}
          <div className="px-1">
            <p className="text-[10px] text-gray-400 font-mono">
              ID: {employee.id}
            </p>
          </div>

          {/* Delete */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-2">
              Danger Zone
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Permanently delete this employee and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Delete Employee"}
            </button>
          </div>
        </div>

        {/* Right column — permissions */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Permissions
              </h3>
              {permSuccess && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                  {permSuccess}
                </span>
              )}
            </div>

            {/* Current permission badges */}
            <div className="flex items-center gap-2 mb-5">
              {(employee.permissions || []).length === 0 ? (
                <span className="text-xs text-gray-400 italic">
                  No permissions assigned
                </span>
              ) : (
                (employee.permissions || []).map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700"
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </span>
                ))
              )}
            </div>

            {/* Permission checkboxes */}
            <div className="space-y-2">
              {allPermissions.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={permState[perm.key] || false}
                    onChange={(e) =>
                      setPermState({
                        ...permState,
                        [perm.key]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {perm.label}
                    </p>
                    <p className="text-xs text-gray-500">{perm.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="px-5 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {savingPerms ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
