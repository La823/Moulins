"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import PasswordRules, { isPasswordValid } from "@/components/admin/PasswordRules";

// Dispatch team: employee logins in the "dispatch" staff group (migration
// 186). For now they can only view products; attendance and leave work as for
// employees (link them to their scanner employee in Attendance), and they get
// no automatic staff alerts. Each opens the usual employee page.

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";
const fmtWhen = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

export default function DispatchTeamPage() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", phone_number: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(
    () =>
      apiFetch("/admin/employees")
        .then((d) => {
          setPeople((Array.isArray(d) ? d : []).filter((e) => e.staff_group === "dispatch"));
          setError("");
        })
        .catch((e) => {
          setError(e.message);
          setPeople((p) => p || []);
        }),
    [],
  );

  useEffect(() => {
    let off = false;
    apiFetch("/admin/employees")
      .then((d) => !off && setPeople((Array.isArray(d) ? d : []).filter((e) => e.staff_group === "dispatch")))
      .catch((e) => {
        if (off) return;
        setError(e.message);
        setPeople([]);
      });
    return () => {
      off = true;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.username.trim()) return setFormError("Please enter their name.");
    if (!/^\d{10}$/.test(form.phone_number.trim())) return setFormError("Please enter a 10-digit phone number.");
    if (!isPasswordValid(form.password)) return setFormError("The password doesn't meet the rules below.");
    setSaving(true);
    try {
      await apiFetch("/admin/createuser", {
        method: "POST",
        body: JSON.stringify({
          username: form.username.trim(),
          phone_number: form.phone_number.trim(),
          password: form.password,
          role: "employee",
          staff_group: "dispatch",
        }),
      });
      setSuccess(`Added ${form.username.trim()} to the dispatch team.`);
      setForm({ username: "", phone_number: "", password: "" });
      setShowForm(false);
      await load();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Dispatch Team</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Logins for the dispatch team. For now they can only view products; attendance and leave work the same as for employees.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "+ Add to dispatch team"}
        </button>
      </div>

      {success && <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="mb-5 bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone number (their login)</label>
              <input
                className={inputCls}
                inputMode="numeric"
                maxLength={10}
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value.replace(/\D/g, "") })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              className={inputCls}
              type="text"
              autoComplete="off"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <PasswordRules password={form.password} />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {!people ? (
        <Loader />
      ) : people.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">No one in the dispatch team yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2">Phone</th>
                <th className="text-left font-medium px-4 py-2">Last login</th>
                <th className="text-left font-medium px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/panel/employees/${p.id}`} className="text-gray-900 hover:underline">
                      {p.username || "No name"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">{p.phone_number}</td>
                  <td className="px-4 py-2.5 text-gray-600">{fmtWhen(p.last_login_at)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{fmtWhen(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
