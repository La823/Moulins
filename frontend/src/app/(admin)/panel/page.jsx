"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

// Maps each category name (as stored in the DB) to its storefront landing page.
// Categories without a landing page yet are shown as plain text.
const CATEGORY_LINKS = {
  "Aerozone(Respiratory & ENT)": "/aerozone",
  "Bone Voyage (Orthopaedics)": "/bonevoyage",
  "Fluidity (Urology and renal)": "/fluidity",
  "Gutsy (Gastro)": "/gutsy",
  "Jivya (Cardio Diabetic Division)": "/jivya",
  "Life Gard (Antibiotics/ Trauma)": "/lifegard",
  "Little Planet (Pediatric)": "/littleplanet",
  "Matrix": "/matrix",
  "Mindset (Neuro/Psychiatry)": "/mindset",
  "Missbella(Derma and Skin Wellness)": "/missbella",
  "Srishti (Gynaecology)": "/srishti",
  "View Point (Ophthalmology)": "/viewpoint",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [stats, setStats] = useState({
    totalProducts: 0,
    activeProducts: 0,
    totalUsers: 0,
  });
  const [recentProducts, setRecentProducts] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]); // [{id, name}]
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [catManagerError, setCatManagerError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [tags, setTags] = useState([]); // [{id, name, color}]
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6B7280");
  const [editingTag, setEditingTag] = useState(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingTagColor, setEditingTagColor] = useState("#6B7280");
  const [tagManagerError, setTagManagerError] = useState("");
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState(null);

  const fetchCategories = async () => {
    try {
      const data = await apiFetch("/products/categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/products/categories")
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [isAdmin]);

  const fetchTags = async () => {
    try {
      const data = await apiFetch("/products/tags");
      setTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchTags();
  }, [isAdmin]);

  const handleAddTag = async (e) => {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    setTagManagerError("");
    try {
      await apiFetch("/admin/tags", {
        method: "POST",
        body: JSON.stringify({ name, color: newTagColor }),
      });
      setNewTagName("");
      setNewTagColor("#6B7280");
      fetchTags();
    } catch (err) {
      setTagManagerError(err.message);
    }
  };

  const startEditTag = (tag) => {
    setEditingTag(tag.name);
    setEditingTagName(tag.name);
    setEditingTagColor(tag.color || "#6B7280");
    setTagManagerError("");
  };

  const handleRenameTag = async (id) => {
    const name = editingTagName.trim();
    if (!name) return;
    setTagManagerError("");
    try {
      await apiFetch(`/admin/tags/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, color: editingTagColor }),
      });
      setEditingTag(null);
      fetchTags();
    } catch (err) {
      setTagManagerError(err.message);
    }
  };

  const handleDeleteTag = async (id) => {
    if (confirmDeleteTagId !== id) {
      setConfirmDeleteTagId(id);
      return;
    }
    setConfirmDeleteTagId(null);
    try {
      await apiFetch(`/admin/tags/${id}`, { method: "DELETE" });
      fetchTags();
    } catch (err) {
      setTagManagerError(err.message);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setCatManagerError("");
    try {
      await apiFetch("/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewCategoryName("");
      fetchCategories();
    } catch (err) {
      setCatManagerError(err.message);
    }
  };

  const startEditCategory = (name) => {
    setEditingCategory(name);
    setEditingCategoryName(name);
    setCatManagerError("");
  };

  const handleRenameCategory = async (id) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    setCatManagerError("");
    try {
      await apiFetch(`/admin/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      setEditingCategory(null);
      fetchCategories();
    } catch (err) {
      setCatManagerError(err.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await apiFetch(`/admin/categories/${id}`, { method: "DELETE" });
      fetchCategories();
    } catch (err) {
      setCatManagerError(err.message);
    }
  };

  // Product count per category, shown next to each name in the manager below.
  const [categoryCounts, setCategoryCounts] = useState({});

  useEffect(() => {
    if (!isAdmin || categories.length === 0) return;
    Promise.all(
      categories.map((c) =>
        apiFetch(`/admin/products?category=${encodeURIComponent(c.name)}&limit=1`)
          .then((data) => [c.name, data.total || 0])
          .catch(() => [c.name, null])
      )
    ).then((entries) => setCategoryCounts(Object.fromEntries(entries)));
  }, [isAdmin, categories]);

  useEffect(() => {
    const fetches = [
      apiFetch("/admin/products?page=1&limit=5").catch(() => ({
        products: [],
        total: 0,
      })),
      apiFetch("/products?page=1&limit=1").catch(() => ({ total: 0 })),
    ];
    // Only admins can fetch users
    if (isAdmin) {
      fetches.push(apiFetch("/admin/users").catch(() => []));
    }

    Promise.all(fetches)
      .then(([adminProducts, publicProducts, users]) => {
        setStats({
          totalProducts: adminProducts.total || 0,
          activeProducts: publicProducts.total || 0,
          totalUsers: Array.isArray(users) ? users.length : 0,
        });
        setRecentProducts(adminProducts.products || []);
        setRecentUsers(Array.isArray(users) ? users.slice(0, 5) : []);
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (loading) return <p className="text-gray-500">Loading dashboard...</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Dashboard</h2>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Products"
          value={stats.totalProducts}
          href="/panel/products"
          color="blue"
        />
        <MetricCard
          label="Active Products"
          value={stats.activeProducts}
          href="/panel/products"
          color="green"
        />
        {isAdmin && (
          <MetricCard
            label="Partners"
            value={stats.totalUsers}
            href="/panel/users"
            color="purple"
          />
        )}
        <MetricCard
          label="Orders"
          value="--"
          href="/panel/orders"
          color="amber"
          sub="Coming soon"
        />
      </div>

      {/* Category Manager - admin only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 w-full">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Categories</h3>

          <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Add
            </button>
          </form>

          {catManagerError && (
            <p className="text-sm text-red-600 mb-2">{catManagerError}</p>
          )}

          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">No categories yet</p>
          ) : (
            <div className="space-y-1.5">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  {editingCategory === c.name ? (
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                    />
                  ) : CATEGORY_LINKS[c.name] ? (
                    <span className="flex items-baseline gap-2 min-w-0">
                      <Link
                        href={CATEGORY_LINKS[c.name]}
                        target="_blank"
                        className="text-sm text-gray-800 hover:text-gray-900 hover:underline truncate"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {CATEGORY_LINKS[c.name]}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-800">{c.name}</span>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingCategory !== c.name && (
                      <Link
                        href={`/panel/products?category=${encodeURIComponent(c.name)}`}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap mr-6"
                      >
                        {categoryCounts[c.name] ?? "…"} product
                        {categoryCounts[c.name] === 1 ? "" : "s"}
                      </Link>
                    )}
                    {editingCategory === c.name ? (
                      <>
                        <button
                          onClick={() => handleRenameCategory(c.id)}
                          className="text-xs font-medium text-gray-900 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setConfirmDeleteId(null);
                            startEditCategory(c.name);
                          }}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                          Rename
                        </button>
                        {confirmDeleteId === c.id && (
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteCategory(c.id)}
                          className={`text-xs font-medium ${
                            confirmDeleteId === c.id
                              ? "text-red-700 underline"
                              : "text-red-500 hover:text-red-700"
                          }`}
                        >
                          {confirmDeleteId === c.id ? "Confirm delete?" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tag Manager - admin only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 w-full">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tags</h3>

          <form onSubmit={handleAddTag} className="flex gap-2 mb-3">
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              title="Tag color"
              className="w-10 h-10 p-0.5 border border-gray-300 rounded-lg cursor-pointer flex-shrink-0"
            />
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Add
            </button>
          </form>

          {tagManagerError && (
            <p className="text-sm text-red-600 mb-2">{tagManagerError}</p>
          )}

          {tags.length === 0 ? (
            <p className="text-sm text-gray-400">No tags yet</p>
          ) : (
            <div className="space-y-1.5">
              {tags.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  {editingTag === t.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="color"
                        value={editingTagColor}
                        onChange={(e) => setEditingTagColor(e.target.value)}
                        title="Tag color"
                        className="w-7 h-7 p-0.5 border border-gray-300 rounded cursor-pointer flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        autoFocus
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                      />
                    </div>
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-gray-800">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: t.color || "#6B7280" }}
                      />
                      {t.name}
                    </span>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingTag === t.name ? (
                      <>
                        <button
                          onClick={() => handleRenameTag(t.id)}
                          className="text-xs font-medium text-gray-900 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTag(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setConfirmDeleteTagId(null);
                            startEditTag(t);
                          }}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                          Rename
                        </button>
                        {confirmDeleteTagId === t.id && (
                          <button
                            onClick={() => setConfirmDeleteTagId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTag(t.id)}
                          className={`text-xs font-medium ${
                            confirmDeleteTagId === t.id
                              ? "text-red-700 underline"
                              : "text-red-500 hover:text-red-700"
                          }`}
                        >
                          {confirmDeleteTagId === t.id ? "Confirm delete?" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div
        className={`grid grid-cols-1 ${isAdmin ? "lg:grid-cols-2" : ""} gap-6`}
      >
        {/* Recent Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Recent Products
            </h3>
            <Link
              href="/panel/products"
              className="text-xs text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {recentProducts.length === 0 ? (
            <p className="text-sm text-gray-400">No products yet</p>
          ) : (
            <div className="space-y-3">
              {recentProducts.map((p) => (
                <Link
                  key={p.id}
                  href={`/panel/products/${p.id}`}
                  className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                >
                  {p.images && p.images.length > 0 ? (
                    <img
                      src={p.images[0].image_url}
                      alt={p.name}
                      className="w-9 h-9 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                      N/A
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Rs. {p.price} &middot; {p.stock} in stock
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      p.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {p.is_active ? "Active" : "Hidden"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Users - admin only */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">
                Recent Partners
              </h3>
              <Link
                href="/panel/users"
                className="text-xs text-blue-600 hover:underline"
              >
                View all
              </Link>
            </div>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-gray-400">No users yet</p>
            ) : (
              <div className="space-y-3">
                {recentUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-1.5 -mx-1.5"
                  >
                    <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
                      {(u.username || u.phone_number || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {u.username || "No name"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {u.phone_number}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        u.role === "admin"
                          ? "bg-red-100 text-red-700"
                          : u.role === "employee"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function MetricCard({ label, value, href, color, sub }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
    >
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      <span
        className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[color]}`}
      >
        {label}
      </span>
    </Link>
  );
}

