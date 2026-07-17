"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch("/admin/assignments"),
      apiFetch("/admin/customers"),
      apiFetch("/admin/employees"),
    ])
      .then(([a, c, e]) => {
        setAssignments(a || []);
        setClients(c || []);
        setEmployees(e || []);
      })
      .catch(() => {
        setAssignments([]);
        setClients([]);
        setEmployees([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAssign = async () => {
    if (!clientId || !employeeId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/clients/${clientId}/employees`, {
        method: "POST",
        body: JSON.stringify({ employee_id: employeeId }),
      });
      setClientId("");
      setEmployeeId("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (a) => {
    if (!window.confirm(`Remove assignment between "${a.client_name}" and "${a.employee_name}"?`)) return;
    try {
      await apiFetch(`/admin/clients/${a.client_id}/employees/${a.employee_id}`, {
        method: "DELETE",
      });
      load();
    } catch (err) {
      alert("Failed to remove assignment: " + err.message);
    }
  };

  const filtered = assignments.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.client_name?.toLowerCase().includes(q) ||
      a.employee_name?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Client-Employee Assignments</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          New Assignment
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.username || c.phone_number}
              </option>
            ))}
          </select>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select employee...</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.username || e.phone_number}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!clientId || !employeeId || saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? "Assigning..." : "Assign"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            All Assignments
          </h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No assignments found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-200">
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Assigned On</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      <Link href={`/panel/users/${a.client_id}`} className="text-gray-900 hover:underline font-medium">
                        {a.client_name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Link href={`/panel/employees/${a.employee_id}`} className="text-gray-900 hover:underline font-medium">
                        {a.employee_name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {new Date(a.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        onClick={() => handleRemove(a)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
