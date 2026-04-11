"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allPermissions, setAllPermissions] = useState([]);

  // Add employee form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    phone_number: "",
    password: "",
    username: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Permission editing
  const [editingPerms, setEditingPerms] = useState(null);
  const [permState, setPermState] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchEmployees = async () => {
    try {
      const data = await apiFetch("/admin/employees");
      const emps = Array.isArray(data) ? data : [];

      // Fetch permissions for each employee
      const withPerms = await Promise.all(
        emps.map(async (emp) => {
          try {
            const res = await apiFetch(
              `/admin/employees/${emp.id}/permissions`
            );
            return { ...emp, permissions: res.permissions || [] };
          } catch {
            return { ...emp, permissions: [] };
          }
        })
      );

      setEmployees(withPerms);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    apiFetch("/admin/permissions")
      .then((data) => setAllPermissions(data.permissions || []))
      .catch(() => setAllPermissions([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      await apiFetch("/admin/createuser", {
        method: "POST",
        body: JSON.stringify({
          phone_number: form.phone_number,
          password: form.password,
          username: form.username || undefined,
          role: "employee",
        }),
      });
      setSuccess(
        `Employee created: ${form.username || form.phone_number}`
      );
      setForm({ phone_number: "", password: "", username: "" });
      setShowForm(false);
      setLoading(true);
      fetchEmployees();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openPermEditor = (emp) => {
    setEditingPerms(emp.id);
    const state = {};
    allPermissions.forEach((p) => {
      state[p.key] = (emp.permissions || []).includes(p.key);
    });
    setPermState(state);
  };

  const savePermissions = async () => {
    setSavingPerms(true);
    try {
      const perms = Object.entries(permState)
        .filter(([, v]) => v)
        .map(([k]) => k);
      await apiFetch(`/admin/employees/${editingPerms}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: perms }),
      });
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingPerms ? { ...emp, permissions: perms } : emp
        )
      );
      setEditingPerms(null);
    } catch (err) {
      alert("Failed to save permissions: " + err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Employees</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add Employee"}
        </button>
      </div>

      {success && (
        <p className="text-sm text-green-600 mb-4 bg-green-50 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}

      {/* Add Employee Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-5 bg-white rounded-xl border border-gray-200 space-y-4 max-w-md"
        >
          <h3 className="text-sm font-semibold text-gray-700">
            New Employee
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number *
            </label>
            <input
              type="text"
              value={form.phone_number}
              onChange={(e) =>
                setForm({ ...form, phone_number: e.target.value })
              }
              required
              placeholder="e.g. +919876543210"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Employee"}
          </button>
        </form>
      )}

      {/* Employee List */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading employees...</p>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No employees yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &quot;Add Employee&quot; to create one
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => router.push(`/admin/employees/${emp.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                    {(emp.username || emp.phone_number || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {emp.username || "No name"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {emp.phone_number}
                      {emp.email ? ` · ${emp.email}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Joined{" "}
                      {new Date(emp.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {emp.last_login_at
                        ? ` · Last login ${new Date(
                            emp.last_login_at
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : " · Never logged in"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    editingPerms === emp.id
                      ? setEditingPerms(null)
                      : openPermEditor(emp);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {editingPerms === emp.id ? "Cancel" : "Permissions"}
                </button>
              </div>

              {/* Current permissions badges */}
              <div className="mt-3 flex items-center gap-2">
                {(emp.permissions || []).length === 0 ? (
                  <span className="text-xs text-gray-400 italic">
                    No permissions assigned
                  </span>
                ) : (
                  (emp.permissions || []).map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-50 text-blue-700"
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </span>
                  ))
                )}
              </div>

              {/* Permission editor */}
              {editingPerms === emp.id && (
                <div className="mt-4 pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Manage Permissions
                  </p>
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
                  <button
                    onClick={savePermissions}
                    disabled={savingPerms}
                    className="mt-3 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingPerms ? "Saving..." : "Save Permissions"}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="text-xs text-gray-400 px-1">
            {employees.length} employee{employees.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </>
  );
}
