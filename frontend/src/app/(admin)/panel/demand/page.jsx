"use client";

import Demand from "@/components/admin/MargDemand";

// Demand & reorder (SCM): products whose stock lasts under 90 days, and
// working through them — link purchase orders, snooze, remarks.
export default function DemandPage() {
  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Demand &amp; reorder</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          How fast each product leaves stock, how long its stock lasts, and what needs ordering.
        </p>
      </div>
      <Demand />
    </>
  );
}
