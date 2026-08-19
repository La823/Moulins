"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function DoctorPanelDashboard() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Welcome, {user?.username || "Doctor"}
      </h1>
      <p className="text-sm text-gray-500 mb-8">Browse the Moulins product catalog.</p>

      <Link
        href="/products"
        className="block bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 transition-colors"
      >
        <h2 className="text-sm font-medium text-gray-900">Browse Products</h2>
        <p className="text-xs text-gray-500 mt-1">View the full product catalog and details.</p>
      </Link>
    </div>
  );
}
