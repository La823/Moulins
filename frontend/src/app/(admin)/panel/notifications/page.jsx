"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

export default function NotificationsPage() {
  const [form, setForm] = useState({ title: "", body: "", deep_link: "" });
  const [imageFile, setImageFile] = useState(null);
  const [excluded, setExcluded] = useState([]); // [{id, username, phone_number}]
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [allPartners, setAllPartners] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = () => {
    apiFetch("/admin/notifications?limit=10")
      .then((data) => setHistory(data.notifications || []))
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    fetchHistory();
    apiFetch("/admin/broadcast-lists")
      .then((data) => setLists(data.lists || []))
      .catch(console.error);
    apiFetch("/admin/users/search")
      .then((data) => setAllPartners(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const excludedQ = searchQuery.trim().toLowerCase();
  const excludedIds = new Set(excluded.map((u) => u.id));
  const searchResults = allPartners
    .filter((u) => !excludedIds.has(u.id))
    .filter(
      (u) =>
        !excludedQ ||
        (u.username || "").toLowerCase().includes(excludedQ) ||
        (u.phone_number || "").includes(excludedQ)
    )
    .slice(0, 50);

  const addExcluded = (user) => {
    if (!excluded.some((u) => u.id === user.id)) {
      setExcluded([...excluded, user]);
    }
    setSearchQuery("");
    setShowResults(false);
  };

  const removeExcluded = (id) => {
    setExcluded(excluded.filter((u) => u.id !== id));
  };

  const uploadImage = async () => {
    const { upload_url, key } = await apiFetch("/admin/notifications/upload-url", {
      method: "POST",
      body: JSON.stringify({ filename: imageFile.name }),
    });
    await fetch(upload_url, {
      method: "PUT",
      body: imageFile,
      headers: { "Content-Type": imageFile.type },
    });
    return key;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    if (!confirm("Send this notification now? This cannot be undone.")) return;

    setSending(true);
    setError("");
    setLastResult(null);
    try {
      let imageKey = null;
      if (imageFile) {
        imageKey = await uploadImage();
      }

      const result = await apiFetch("/admin/notifications", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim(),
          deep_link: form.deep_link.trim() || null,
          image_key: imageKey,
          broadcast_list_id: listId || null,
          exclude_user_ids: excluded.map((u) => u.id),
        }),
      });

      setLastResult(result);
      setForm({ title: "", body: "", deep_link: "" });
      setImageFile(null);
      setExcluded([]);
      setListId("");
      fetchHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Notifications</h2>
      </div>

      <form onSubmit={handleSend} className="mb-8 p-6 bg-white rounded-xl border border-gray-200 space-y-4 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-700">Compose Broadcast</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            maxLength={255}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body *</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0] || null)}
            className="w-full text-sm text-gray-600"
          />
          {imageFile && (
            <img
              src={URL.createObjectURL(imageFile)}
              alt="preview"
              className="mt-2 w-24 h-24 object-cover rounded-lg border border-gray-200"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">All partners</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.member_count})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Manage your lists on the{" "}
            <a href="/panel/broadcast-lists" className="text-red-600 hover:text-red-700">
              Broadcast Lists
            </a>{" "}
            page.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deep Link (optional)</label>
          <input
            type="text"
            value={form.deep_link}
            onChange={(e) => setForm({ ...form, deep_link: e.target.value })}
            placeholder="e.g. /products/&lt;id&gt;"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        {/* Exclude users */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Exclude Users (optional)
          </label>
          <div ref={searchRef} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Search or click to browse all partners..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            {showResults && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                {searchResults.length > 0 ? (
                  searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addExcluded(u)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                    >
                      {u.username || "No name"}{" "}
                      <span className="text-gray-400">{u.phone_number}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-gray-400">No matching partners</p>
                )}
              </div>
            )}
          </div>

          {excluded.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {excluded.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {u.username || u.phone_number}
                  <button
                    type="button"
                    onClick={() => removeExcluded(u.id)}
                    className="hover:text-red-900 text-[10px] leading-none"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Review summary */}
        <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          Sending to{" "}
          <strong>
            {listId ? lists.find((l) => l.id === listId)?.name || "selected list" : "all partners"}
          </strong>
          {excluded.length > 0 && (
            <> except <strong>{excluded.length}</strong> excluded user{excluded.length !== 1 ? "s" : ""}</>
          )}
          .
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {lastResult && (
          <p className="text-sm text-green-700">
            Sent to {lastResult.recipient_count} recipient{lastResult.recipient_count !== 1 ? "s" : ""}
            {" "}({lastResult.push_success_count} push delivered, {lastResult.push_failure_count} failed).
          </p>
        )}

        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Broadcast"}
        </button>
      </form>

      {/* History */}
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Broadcasts</h3>
      {loadingHistory ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : history.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No notifications sent yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((n) => (
            <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{n.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                    n.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : n.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {n.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Sent by{" "}
                <span className="font-medium text-gray-500">
                  {n.created_by_name || "System"}
                  {n.created_by_role ? ` (${n.created_by_role})` : ""}
                </span>{" "}
                &middot; {n.recipient_count} recipients &middot; {n.push_success_count} push delivered &middot;{" "}
                {n.push_failure_count} failed &middot;{" "}
                {n.sent_at ? new Date(n.sent_at).toLocaleString() : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
