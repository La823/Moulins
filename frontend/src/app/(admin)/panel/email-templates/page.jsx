"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    apiFetch("/admin/email-templates")
      .then((data) => {
        const list = data.templates || [];
        setTemplates(list);
        if (!selectedKey && list.length > 0) selectTemplate(list[0]);
      })
      .catch(() => setTemplates([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTemplate = (t) => {
    setSelectedKey(t.key);
    setSubject(t.subject);
    setBodyHtml(t.body_html);
    setError("");
    setSuccess("");
  };

  const selected = templates?.find((t) => t.key === selectedKey);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiFetch(`/admin/email-templates/${selectedKey}`, {
        method: "PUT",
        body: JSON.stringify({ subject, body_html: bodyHtml }),
      });
      setTemplates((prev) => prev.map((t) => (t.key === selectedKey ? updated : t)));
      setSuccess("Saved");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (templates === null) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Email Templates</h2>
      <p className="text-sm text-gray-500 mb-6">
        Edit the copy sent for each system email. Automated ones fire on their own (order placed, status changes);
        manual ones are sent by staff from an entity&apos;s detail page.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Template list */}
        <div className="lg:col-span-1 space-y-2">
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTemplate(t)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                t.key === selectedKey
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-gray-900">{t.label}</p>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                    t.trigger_mode === "automated"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {t.trigger_mode}
                </span>
              </div>
              <p className="text-xs text-gray-500">{t.description}</p>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {selected && (
            <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Available placeholders</p>
                <p className="text-xs font-mono text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                  {selected.placeholders || "—"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  required
                  rows={14}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-900 font-mono resize-y"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Template"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
