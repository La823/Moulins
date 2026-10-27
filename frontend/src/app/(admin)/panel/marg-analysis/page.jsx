"use client";

import { AnalysisHome } from "@/components/admin/analysis/boards";

// Analysis home: Customers, Suppliers & purchases and Products blocks (each
// opens its board), and the company's sales vs purchases. The reports live
// in components/admin/analysis.
export default function MargAnalysisPage() {
  return <AnalysisHome />;
}
