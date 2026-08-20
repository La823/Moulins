"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function PartnerLedgerPage() {
  const [ledger, setLedger] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/ledger").catch(() => null),
      apiFetch("/profile/balance").catch(() => null),
    ]).then(([l, b]) => {
      setLedger(l || null);
      setBalance(b || null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-1/4" />
          <div className="h-24 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  const hasBalance = balance?.balance !== null && balance?.balance !== undefined;

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-1">Ledger</h1>
      <p className="text-sm text-gray-400 mb-8">Your current balance and account ledger file</p>

      {/* Current Balance */}
      {hasBalance && (
        <div className="mb-6 border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Balance</p>
            <p className="text-3xl font-light text-gray-900">
              ₹{Number(balance.balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {balance.synced_at && (
            <p className="text-xs text-gray-400">
              As of {new Date(balance.synced_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
            </p>
          )}
        </div>
      )}

      {/* Ledger file */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Ledger File</h2>
        {!ledger ? (
          <p className="text-sm text-gray-400">No ledger uploaded yet</p>
        ) : (
          <a
            href={ledger.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-4 hover:border-gray-400 transition-colors"
          >
            <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div>
              <p className="text-sm text-gray-900 font-medium">View / download ledger</p>
              <p className="text-xs text-gray-500">
                Updated {new Date(ledger.updated_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
