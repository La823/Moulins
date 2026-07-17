"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/admin/settings")
      .then((data) => setSettings(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleSetting = async (key) => {
    const newValue = settings[key] === "true" ? "false" : "true";
    setSaving(true);
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ [key]: newValue }),
      });
      setSettings({ ...settings, [key]: newValue });
    } catch (err) {
      alert("Failed to update: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-800 mb-6">Settings</h2>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-4 max-w-xl">
          {/* Attendance visibility toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Employee Attendance Visibility
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Allow employees to view their own attendance calendar
                </p>
              </div>
              <button
                onClick={() => toggleSetting("employee_attendance_visible")}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.employee_attendance_visible === "true"
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    settings.employee_attendance_visible === "true"
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
