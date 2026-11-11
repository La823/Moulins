"use client";

import Link from "next/link";
import { RetailerOrderList } from "@/components/retailers/RetailerOrders";

// A doctor's orders to their partner (the same orders as a retailer's).
export default function DoctorOrdersPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-light text-gray-900">My Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Your orders to your partner. Add products to your cart to place a new one.</p>
        </div>
        <Link href="/products" className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
          Browse products
        </Link>
      </div>
      <RetailerOrderList base="/doctor-panel/orders" />
    </div>
  );
}
