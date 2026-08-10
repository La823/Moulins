"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

function ListEditor({ initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [members, setMembers] = useState(initial?.members || []); // [{id, username, phone_number}]
  const [allPartners, setAllPartners] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    apiFetch("/admin/users/search")
      .then((data) => setAllPartners(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const memberIds = new Set(members.map((u) => u.id));
  const searchResults = allPartners
    .filter((u) => !memberIds.has(u.id))
    .filter((u) => !q || (u.username || "").toLowerCase().includes(q) || (u.phone_number || "").includes(q))
    .slice(0, 50);

  const addMember = (user) => {
    if (!members.some((u) => u.id === user.id)) {
      setMembers([...members, user]);
    }
    setSearchQuery("");
    setShowResults(false);
  };

  const removeMember = (id) => {
    setMembers(members.filter((u) => u.id !== id));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body = JSON.stringify({ name: name.trim(), user_ids: members.map((u) => u.id) });
      const result = initial?.id
        ? await apiFetch(`/admin/broadcast-lists/${initial.id}`, { method: "PUT", body })
        : await apiFetch("/admin/broadcast-lists", { method: "POST", body });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="p-6 bg-white rounded-xl border border-gray-200 space-y-4 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-700">{initial?.id ? "Edit List" : "New Broadcast List"}</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">List Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Partners</label>
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
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => addMember(u)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                  >
                    {u.username || "No name"} <span className="text-gray-400">{u.phone_number}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-gray-400">No matching partners</p>
              )}
            </div>
          )}
        </div>

        {members.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {members.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                {u.username || u.phone_number}
                <button
                  type="button"
                  onClick={() => removeMember(u.id)}
                  className="hover:text-teal-900 text-[10px] leading-none"
                >
                  &#10005;
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">{members.length} partner{members.length !== 1 ? "s" : ""} in this list</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save List"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function BroadcastListsPage() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (new) | {id,name,members} (edit)

  const fetchLists = () => {
    setLoading(true);
    apiFetch("/admin/broadcast-lists")
      .then((data) => setLists(data.lists || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const startEdit = async (list) => {
    try {
      const data = await apiFetch(`/admin/broadcast-lists/${list.id}`);
      setEditing({ id: data.list.id, name: data.list.name, members: data.members || [] });
    } catch (err) {
      console.error(err);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this broadcast list? This cannot be undone.")) return;
    try {
      await apiFetch(`/admin/broadcast-lists/${id}`, { method: "DELETE" });
      fetchLists();
    } catch (err) {
      alert(err.message);
    }
  };

  const onSaved = () => {
    setEditing(null);
    fetchLists();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Broadcast Lists</h2>
        {!editing && (
          <button
            onClick={() => setEditing({})}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            New List
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Lists you create here are private to your account and can be selected as the audience when composing a broadcast
        notification.
      </p>

      {editing !== null ? (
        <ListEditor initial={editing.id ? editing : null} onSaved={onSaved} onCancel={() => setEditing(null)} />
      ) : loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : lists.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">You haven&rsquo;t created any broadcast lists yet</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {lists.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{l.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {l.member_count} partner{l.member_count !== 1 ? "s" : ""} &middot;{" "}
                  {new Date(l.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(l)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(l.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
