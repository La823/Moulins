"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// App update prompts (backend internal/appversion, migration 192). The apps
// check these numbers on open: below the minimum build they are blocked with
// "Update required", below the latest build they are offered the update.
// Apps from before the check (Moulins 1.0.20 / MPPL Team 1.0.21 and older)
// can't read them; the reminder push at the bottom is how to reach them.

const APPS = { client: "Moulins", team: "MPPL Team" };
const PLATFORMS = { android: "Android", ios: "iPhone" };

const DEFAULT_REMIND = {
  partner_title: "Please update the Moulins app",
  partner_body: "A new version of the Moulins app is available. Please update it from the Play Store or App Store.",
  staff_title: "Please update your app",
  staff_body: "Staff now use the MPPL Team app. Please install or update MPPL Team and sign in with your usual phone number and password.",
};

function VersionCard({ v, devices, onSaved }) {
  const [form, setForm] = useState({
    latest_build: v.latest_build,
    latest_name: v.latest_name,
    min_build: v.min_build,
    message: v.message,
    update_url: v.update_url,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const phones = devices.filter((d) => d.app === v.app);
  const total = phones.reduce((s, d) => s + d.phones, 0);
  const below = (n) => phones.filter((d) => d.build < n).reduce((s, d) => s + d.phones, 0);

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const body = {
        ...form,
        latest_build: Number(form.latest_build) || 0,
        min_build: Number(form.min_build) || 0,
      };
      if (body.min_build > 0 && body.min_build > Number(v.min_build) &&
          !confirm(`Block every ${APPS[v.app]} (${PLATFORMS[v.platform]}) app below build ${body.min_build} until it is updated? ` +
            `${below(body.min_build)} phone(s) in use are below it now.`)) {
        setSaving(false);
        return;
      }
      await apiFetch(`/admin/app-versions/${v.app}/${v.platform}`, { method: "PUT", body: JSON.stringify(body) });
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setErr(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {APPS[v.app]} <span className="text-gray-400 font-normal">· {PLATFORMS[v.platform]}</span>
        </h3>
        {v.updated_at && v.updated_by && (
          <span className="text-xs text-gray-400">
            Last changed by {v.updated_by},{" "}
            {new Date(v.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-gray-500">
          Latest build (offer update below this)
          <input type="number" min="0" className={input} value={form.latest_build} onChange={set("latest_build")} />
        </label>
        <label className="text-xs text-gray-500">
          Latest version name (e.g. 1.0.21)
          <input className={input} value={form.latest_name} onChange={set("latest_name")} />
        </label>
        <label className="text-xs text-gray-500">
          Minimum build (block below this)
          <input type="number" min="0" className={input} value={form.min_build} onChange={set("min_build")} />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-3">
          Update link (Play Store / App Store / download page)
          <input className={input} value={form.update_url} onChange={set("update_url")} placeholder="https://…" />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-3">
          Message (optional, shown in the prompt)
          <input className={input} value={form.message} onChange={set("message")} maxLength={300} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
        {total > 0 && (
          <span className="text-xs text-gray-500 ml-auto">
            {total} phone{total === 1 ? "" : "s"} report this app
            {Number(form.latest_build) > 0 && <> · {below(Number(form.latest_build))} below the latest</>}
            {Number(form.min_build) > 0 && <> · {below(Number(form.min_build))} below the minimum</>}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AppVersionsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [remind, setRemind] = useState(DEFAULT_REMIND);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  const load = useCallback(() => {
    apiFetch("/admin/app-versions")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader />;

  const devices = data.devices || [];
  const reported = devices.filter((d) => d.app);
  const old = devices.filter((d) => !d.app);
  const oldPartners = old.filter((d) => !d.staff).reduce((s, d) => s + d.phones, 0);
  const oldStaff = old.filter((d) => d.staff).reduce((s, d) => s + d.phones, 0);

  const sendRemind = async () => {
    if (!confirm(`Send an update reminder push to ${oldPartners + oldStaff} phone(s) on an old app?`)) return;
    setSending(true);
    setSendResult("");
    try {
      const r = await apiFetch("/admin/app-versions/remind-old", { method: "POST", body: JSON.stringify(remind) });
      setSendResult(`Sent to ${r.sent} phone(s)${r.failed ? `, ${r.failed} could not be reached` : ""}.`);
      load();
    } catch (e) {
      setSendResult(e.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const setR = (k) => (e) => setRemind((f) => ({ ...f, [k]: e.target.value }));
  const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900">App Versions</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Publish the new build first, then raise these numbers. The build is the number after the + in the version
        (1.0.21+<b>25</b>), shown at the bottom of Profile in the app. Apps below the <b>latest</b> build see
        &ldquo;New version available&rdquo; (they can choose Later); apps below the <b>minimum</b> build are blocked
        with &ldquo;Update required&rdquo; until they update.
      </p>

      <div className="space-y-4">
        {data.versions.map((v) => (
          <VersionCard key={`${v.app}-${v.platform}`} v={v} devices={devices.filter((d) => d.app)} onSaved={load} />
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
        <h3 className="font-semibold text-gray-900 mb-1">Phones in use (last {data.active_days} days)</h3>
        <p className="text-xs text-gray-500 mb-3">Counted when the app opens and registers for notifications.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
              <th className="py-2">App</th>
              <th className="py-2">Build</th>
              <th className="py-2">Logins</th>
              <th className="py-2 text-right">Phones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {reported.map((d, i) => (
              <tr key={`r${i}`}>
                <td className="py-2">{APPS[d.app] || d.app}</td>
                <td className="py-2 font-mono">{d.build || "—"}</td>
                <td className="py-2 text-gray-500">{d.staff ? "Staff" : "Partners"}</td>
                <td className="py-2 text-right font-medium">{d.phones}</td>
              </tr>
            ))}
            {old.map((d, i) => (
              <tr key={`o${i}`} className="bg-amber-50/50">
                <td className="py-2 text-amber-800">Old app (before update check)</td>
                <td className="py-2 text-amber-700">not reported</td>
                <td className="py-2 text-gray-500">{d.staff ? "Staff" : "Partners"}</td>
                <td className="py-2 text-right font-medium text-amber-800">{d.phones}</td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-gray-400">No phones yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
        <h3 className="font-semibold text-gray-900 mb-1">Remind phones on an old app</h3>
        <p className="text-xs text-gray-500 mb-4">
          Apps from before the update check (Moulins 1.0.20, MPPL Team 1.0.21 and older) can&apos;t show the update
          prompt. This sends them a push notification instead: {oldPartners} partner phone(s) and {oldStaff} staff
          phone(s) right now.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">To partners</p>
            <input className={input} value={remind.partner_title} onChange={setR("partner_title")} />
            <textarea className={input} rows={3} value={remind.partner_body} onChange={setR("partner_body")} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">To staff</p>
            <input className={input} value={remind.staff_title} onChange={setR("staff_title")} />
            <textarea className={input} rows={3} value={remind.staff_body} onChange={setR("staff_body")} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={sendRemind}
            disabled={sending || oldPartners + oldStaff === 0}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send reminder"}
          </button>
          {sendResult && <span className="text-sm text-gray-600">{sendResult}</span>}
        </div>
      </div>
    </div>
  );
}
