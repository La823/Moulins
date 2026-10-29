"use client";

import { useState } from "react";
import Loader from "@/components/Loader";
import { LiveYear, DaybookYear, liveFYStarts, useDaybookFYs, BILL_NUMBER_NOTE } from "@/components/admin/BillsByYear";

// Every party's bills, a section per financial year (see BillsByYear).
export default function AllBillsPage() {
  const daybookFYs = useDaybookFYs();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">All Bills</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Every party&apos;s bills, year by year: this year live from Marg (with line items), 2025-26 from the Day Book.
          Click a party to see only its bills.
        </p>
        <p className="text-xs text-gray-400">{BILL_NUMBER_NOTE}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
        }}
        className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-2 flex-wrap items-center"
      >
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Bill no or party..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-full sm:w-72"
        />
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchInput("");
            }}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Clear
          </button>
        )}
      </form>

      {!daybookFYs ? (
        <Loader />
      ) : (
        <>
          {/* keyed by the search so each year goes back to its first page */}
          {liveFYStarts().map((y) => (
            <LiveYear key={`${y}:${search}`} search={search} start={y} />
          ))}
          {daybookFYs.map((fy) => (
            <DaybookYear key={`${fy}:${search}`} search={search} fy={fy} />
          ))}
        </>
      )}
    </>
  );
}
