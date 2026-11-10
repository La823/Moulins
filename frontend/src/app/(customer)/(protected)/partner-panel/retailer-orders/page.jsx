"use client";

import { RetailerOrderList } from "@/components/retailers/RetailerOrders";

// Orders the partner's retailers placed with them.
export default function PartnerRetailerOrdersPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-1">Retailer Orders</h1>
      <p className="text-sm text-gray-500 mb-6">
        Orders your retailers placed with you. Accept them with your rates, then mark them dispatched and delivered.
      </p>
      <RetailerOrderList incoming base="/partner-panel/retailer-orders" />
    </div>
  );
}
