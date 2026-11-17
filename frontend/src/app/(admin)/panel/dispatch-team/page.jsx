"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import PasswordRules, { isPasswordValid } from "@/components/admin/PasswordRules";

// Dispatch team: employee logins in the "dispatch" staff group (migration
// 186). They pack orders sent to packing, see products and Marg stock, and
// record freight bills (migration 190); attendance and leave work as for
// employees (link them to their scanner employee in Attendance), and they get
// no automatic staff alerts. Orders sent to packing go round the team in
// turn among those present today (internal/dispatch); an admin can take a
// member out of the rotation. Each opens the usual employee page.

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500";
const fmtWhen = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

// A starting password from the name: first name with a capital + "@123"
// (Manoj → Manoj@123), "@1234" when that would be under the 8 characters
// the password rules need (Ram → Ram@1234).
function suggestPassword(name) {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  if (!first) return "";
  const word = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return word.length + 4 >= 8 ? `${word}@123` : `${word}@1234`;
}

export default function DispatchTeamPage() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", phone_number: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [rota, setRota] = useState({}); // user id -> packer (today's attendance, rotation, open orders)
  const [rotaBusy, setRotaBusy] = useState("");
  // fingerprint-scanner employees (eTimeOffice), to link each login to theirs
  const [scanner, setScanner] = useState(null);
  const [linkBusy, setLinkBusy] = useState("");
  const [shown, setShown] = useState({}); // user id -> password visible
  const [pwEdit, setPwEdit] = useState(null); // { id, value, error }

  const loadScanner = useCallback(
    () =>
      apiFetch("/admin/etime/employees")
        .then((d) => setScanner(Array.isArray(d) ? d : []))
        .catch(() => setScanner([])),
    [],
  );
  useEffect(() => {
    loadScanner();
  }, [loadScanner]);

  // Links a login to a scanner employee (or unlinks with ""), as the
  // Attendance page's staff-logins picker does: etime_employees.user_id.
  const linkScanner = async (person, empCode) => {
    const current = (scanner || []).find((e) => e.user_id === person.id);
    if ((current?.emp_code || "") === empCode) return;
    setLinkBusy(person.id);
    try {
      if (current) {
        await apiFetch(`/admin/etime/employees/${current.emp_code}`, { method: "PUT", body: JSON.stringify({ user_id: null }) });
      }
      if (empCode) {
        await apiFetch(`/admin/etime/employees/${empCode}`, { method: "PUT", body: JSON.stringify({ user_id: person.id }) });
      }
      await Promise.all([loadScanner(), loadRota()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLinkBusy("");
    }
  };

  const savePassword = async () => {
    if (!pwEdit) return;
    if (!isPasswordValid(pwEdit.value)) return setPwEdit({ ...pwEdit, error: "The password doesn't meet the rules." });
    try {
      await apiFetch(`/admin/employees/${pwEdit.id}/password`, { method: "PUT", body: JSON.stringify({ password: pwEdit.value }) });
      setPeople((list) => (list || []).map((p) => (p.id === pwEdit.id ? { ...p, plain_password: pwEdit.value } : p)));
      setShown((s) => ({ ...s, [pwEdit.id]: true }));
      setPwEdit(null);
    } catch (e) {
      setPwEdit({ ...pwEdit, error: e.message });
    }
  };

  const loadRota = useCallback(
    () =>
      apiFetch("/admin/dispatch/packers")
        .then((d) => setRota(Object.fromEntries((d.packers || []).map((p) => [p.id, p]))))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    loadRota();
  }, [loadRota]);

  const toggleRotation = async (p) => {
    const r = rota[p.id];
    if (!r) return;
    setRotaBusy(p.id);
    try {
      await apiFetch(`/admin/dispatch/packers/${p.id}/rotation`, { method: "PUT", body: JSON.stringify({ skip: !r.skip }) });
      await loadRota();
    } catch (e) {
      setError(e.message);
    } finally {
      setRotaBusy("");
    }
  };

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
    <div className="max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Dispatch Team</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Orders sent to packing go to the next person present today, in turn. Take someone out of the rotation (a team lead, or someone at the other warehouse) and they get no orders, but can still pack any.
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

      <details className="mb-4 bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3 text-sm text-gray-700">
        <summary className="cursor-pointer font-medium text-teal-800">How to add a new dispatch member</summary>
        <ol className="mt-2 ml-5 list-decimal space-y-1">
          <li>
            Click <b>+ Add to dispatch team</b>: their name, their phone number (that is their login) and a password. They get
            packing, attendance and leave, and freight bills — nothing else.
          </li>
          <li>
            In their row, under <b>Scanner employee</b>, pick their name as it is on the fingerprint scanner (eTimeOffice). That
            links their attendance: the MPPL Team app then shows their days and leave, and the packing rotation knows when they are
            present. (The same link is on the Attendance page, under staff logins.)
          </li>
          <li>
            Give them their phone number and password. They sign in to the <b>MPPL Team</b> app and can change the password there
            (Profile → Change password); the new one shows here.
          </li>
          <li>If they lead the team or work at the other warehouse, set them <b>Out of rotation</b> so no orders are assigned to them.</li>
        </ol>
      </details>

      {success && <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="mb-5 bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                className={inputCls}
                value={form.username}
                onChange={(e) => {
                  const username = e.target.value;
                  // keeps filling the suggested password until it's typed over
                  const follows = !form.password || form.password === suggestPassword(form.username);
                  setForm({ ...form, username, password: follows ? suggestPassword(username) : form.password });
                }}
              />
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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Password <span className="font-normal text-gray-400">(suggested from the name; they can change it in the app)</span>
            </label>
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2">Phone</th>
                <th className="text-left font-medium px-4 py-2">Password</th>
                <th className="text-left font-medium px-4 py-2">Scanner employee</th>
                <th className="text-left font-medium px-4 py-2">Today</th>
                <th className="text-right font-medium px-4 py-2">To pack</th>
                <th className="text-left font-medium px-4 py-2">Rotation</th>
                <th className="text-left font-medium px-4 py-2">Last login</th>
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
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {pwEdit?.id === p.id ? (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            className="w-36 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900"
                            value={pwEdit.value}
                            onChange={(e) => setPwEdit({ ...pwEdit, value: e.target.value, error: "" })}
                            placeholder="New password"
                          />
                          <button type="button" onClick={savePassword} className="px-2 py-1 text-xs bg-gray-900 text-white rounded-md">
                            Save
                          </button>
                          <button type="button" onClick={() => setPwEdit(null)} className="px-2 py-1 text-xs border border-gray-300 rounded-md">
                            Cancel
                          </button>
                        </div>
                        <PasswordRules password={pwEdit.value} />
                        {pwEdit.error && <p className="text-xs text-red-600">{pwEdit.error}</p>}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-800">
                          {p.plain_password ? (shown[p.id] ? p.plain_password : "••••••••") : <span className="text-gray-400">not stored</span>}
                        </span>
                        {p.plain_password && (
                          <button type="button" onClick={() => setShown((s) => ({ ...s, [p.id]: !s[p.id] }))} className="text-xs text-teal-700 hover:underline">
                            {shown[p.id] ? "Hide" : "Show"}
                          </button>
                        )}
                        <button type="button" onClick={() => setPwEdit({ id: p.id, value: "", error: "" })} className="text-xs text-gray-500 hover:underline">
                          Change
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {scanner === null ? (
                      <span className="text-gray-400 text-xs">Loading…</span>
                    ) : (
                      <select
                        value={scanner.find((e) => e.user_id === p.id)?.emp_code || ""}
                        disabled={linkBusy === p.id}
                        onChange={(e) => linkScanner(p, e.target.value)}
                        className="max-w-[12rem] px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900 bg-white disabled:opacity-50"
                      >
                        <option value="">Not linked</option>
                        {scanner
                          .filter((e) => !e.user_id || e.user_id === p.id)
                          .map((e) => (
                            <option key={e.emp_code} value={e.emp_code}>
                              {e.name} ({e.emp_code})
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {!rota[p.id] ? (
                      <span className="text-gray-400">—</span>
                    ) : !rota[p.id].linked ? (
                      <span className="text-gray-500" title="Link them to their scanner employee in Attendance; until then they count as present every day">
                        Not linked to scanner
                      </span>
                    ) : rota[p.id].on_leave ? (
                      <span className="text-amber-700">On leave</span>
                    ) : rota[p.id].present ? (
                      <span className="text-green-700">Present</span>
                    ) : (
                      <span className="text-red-600">Not punched in</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{rota[p.id]?.open ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {rota[p.id] ? (
                      <button
                        type="button"
                        disabled={rotaBusy === p.id}
                        onClick={() => toggleRotation(p)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border disabled:opacity-50 ${
                          rota[p.id].skip
                            ? "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"
                            : "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                        }`}
                        title={rota[p.id].skip ? "Gets no orders. Click to put back in the rotation." : "Gets orders in turn. Click to take out of the rotation."}
                      >
                        {rota[p.id].skip ? "Out of rotation" : "In rotation"}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No packing permission</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{fmtWhen(p.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
