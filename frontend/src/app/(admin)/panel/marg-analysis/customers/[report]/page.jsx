"use client";

import { useParams } from "next/navigation";
import { ReportPage } from "@/components/admin/analysis/boards";

export default function Page() {
  const { report } = useParams();
  return <ReportPage block="customers" report={report} />;
}
