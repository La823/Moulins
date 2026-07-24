"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// mode="client": manage employees assigned to a client (userId = client id)
// mode="employee": manage clients assigned to an employee (userId = employee id)
export default function AssignmentPanel({ mode, userId }) {
  const isClient = mode === "client";
  const listUrl = isClient
    ? `/admin/clients/${userId}/employees`
    : `/admin/employees/${userId}/clients`;
  const optionsUrl = isClient ? "/admin/employees" : "/admin/partners";
  const label = isClient ? "Assigned Employees" : "Assigned Clients";
  const optionLabel = isClient ? "employee" : "client";

  const [assigned, setAssigned] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([apiFetch(listUrl), apiFetch(optionsUrl)])
      .then(([a, o]) => {
        setAssigned(a || []);
        setOptions(o || []);
      })
      .catch(() => {
        setAssigned([]);
        setOptions([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode]);

  const assignedIds = new Set(assigned.map((a) => a.id));
  const available = options.filter((o) => !assignedIds.has(o.id));

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(
        isClient
          ? `/admin/clients/${userId}/employees`
          : `/admin/clients/${selected}/employees`,
        {
          method: "POST",
          body: JSON.stringify({
            employee_id: isClient ? selected : userId,
          }),
        }
      );
      setSelected("");
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (otherId) => {
    const clientId = isClient ? userId : otherId;
    const employeeId = isClient ? otherId : userId;
    if (!window.confirm(`Remove this ${optionLabel} assignment?`)) return;
    try {
      await apiFetch(`/admin/clients/${clientId}/employees/${employeeId}`, {
        method: "DELETE",
      });
      load();
    } catch (err) {
      alert("Failed to remove assignment: " + err.message);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          {label}
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            + Assign {optionLabel}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select {optionLabel}...</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.username || o.phone_number}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selected || saving}
            className="px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Add"}
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setSelected("");
              setError("");
            }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : assigned.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No {optionLabel}s assigned yet
        </p>
      ) : (
        <div className="space-y-2">
          {assigned.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
            >
              <Link
                href={isClient ? `/panel/employees/${a.id}` : `/panel/users/${a.id}`}
                className="text-sm font-medium text-gray-900 hover:underline"
              >
                {a.username || a.phone_number}
              </Link>
              <button
                onClick={() => handleRemove(a.id)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
