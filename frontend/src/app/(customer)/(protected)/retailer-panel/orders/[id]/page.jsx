"use client";

import { useParams } from "next/navigation";
import { RetailerOrderView } from "@/components/retailers/RetailerOrders";

export default function RetailerOrderPage() {
  const { id } = useParams();
  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <RetailerOrderView id={id} backHref="/retailer-panel" />
    </div>
  );
}
