"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { KIND_LABELS } from "@/lib/margLedger";
import { LiveYear, DaybookYear, liveFYStarts, useDaybookFYs, BILL_NUMBER_NOTE } from "@/components/admin/BillsByYear";

// One party's bills, a section per financial year (see BillsByYear).

export default function PartyBillsPage() {
  const { code: rawCode } = useParams();
  const code = decodeURIComponent(rawCode);
  const [party, setParty] = useState(null);
  const daybookFYs = useDaybookFYs(code);

  useEffect(() => {
    apiFetch(`/admin/marg-ledger/${encodeURIComponent(code)}`)
      .then(setParty)
      .catch(() => setParty({}));
  }, [code]);

  if (!party || !daybookFYs) return <Loader />;

  const a = party.account;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{a ? a.name : code}</h2>
          <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{code}</span>
            {a?.city && <span>· {a.city}</span>}
            {a?.kind && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{KIND_LABELS[a.kind] || a.kind}</span>}
            {a?.in_marg_parties && (
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                In Marg Parties{a.marg_party_status ? ` · ${a.marg_party_status}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <Link href={`/panel/marg-ledger/${encodeURIComponent(code)}`} className="text-gray-500 hover:text-gray-800 underline">
            Marg Accounts
          </Link>
          <Link href={`/panel/marg-daybook/${encodeURIComponent(code)}`} className="text-gray-500 hover:text-gray-800 underline">
            Ledger 2025-26
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-6">{BILL_NUMBER_NOTE}</p>

      {liveFYStarts().map((y) => (
        <LiveYear key={y} party={code} start={y} />
      ))}
      {daybookFYs.map((fy) => (
        <DaybookYear key={fy} party={code} fy={fy} />
      ))}
    </>
  );
}
