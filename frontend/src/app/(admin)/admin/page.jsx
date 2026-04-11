"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

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
          href="/admin/products"
          color="blue"
        />
        <MetricCard
          label="Active Products"
          value={stats.activeProducts}
          href="/admin/products"
          color="green"
        />
        {isAdmin && (
          <MetricCard
            label="Customers"
            value={stats.totalUsers}
            href="/admin/users"
            color="purple"
          />
        )}
        <MetricCard
          label="Orders"
          value="--"
          href="/admin/orders"
          color="amber"
          sub="Coming soon"
        />
      </div>

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
              href="/admin/products"
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
                  href={`/admin/products/${p.id}`}
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
                Recent Customers
              </h3>
              <Link
                href="/admin/users"
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
