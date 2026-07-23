"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function AdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/admin/admins")
      .then((data) => setAdmins(Array.isArray(data) ? data : []))
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Admins</h2>
      </div>

      <p className="text-xs text-gray-400 mb-5">
        Admin accounts have full access to every part of the panel. Promote an
        employee to admin from their profile page under Employees.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading admins...</p>
      ) : admins.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No admin accounts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => router.push(`/panel/employees/${a.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                  {(a.username || a.phone_number || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{a.username || "No name"}</p>
                  <p className="text-xs text-gray-500">
                    {a.phone_number}
                    {a.email ? ` · ${a.email}` : ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Joined{" "}
                    {new Date(a.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {a.last_login_at
                      ? ` · Last login ${new Date(a.last_login_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}`
                      : " · Never logged in"}
                  </p>
                </div>
              </div>
            </div>
          ))}

          <div className="text-xs text-gray-400 px-1">
            {admins.length} admin{admins.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </>
  );
}
