"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import MargSyncButton from "@/components/admin/MargSyncButton";
import CreateProductFromMargProductModal from "@/components/admin/CreateProductFromMargProductModal";

const PAGE_SIZE = 50;

const fmtMoney = (v) => (v == null ? "—" : `₹${Number(v).toFixed(2)}`);
const fmtStock = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));

export default function MargProductsPage() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [creatingFor, setCreatingFor] = useState(null); // marg product object, or null
  const [createdMessage, setCreatedMessage] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (company) params.set("company", company);
    apiFetch(`/admin/marg-products?${params.toString()}`)
      .then((data) => {
        setProducts(Array.isArray(data.products) ? data.products : []);
        setTotal(data.total || 0);
        setCompanies(Array.isArray(data.companies) ? data.companies : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, company, page, refreshKey]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleCompanyChange = (e) => {
    setPage(1);
    setCompany(e.target.value);
  };

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Marg Products</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Synced from Marg ERP — {total} unique product{total !== 1 ? "s" : ""}, batches clubbed under each.
          </p>
          {createdMessage && (
            <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {createdMessage}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <MargSyncButton onDone={() => setRefreshKey((k) => k + 1)} />
          <select
            value={company}
            onChange={handleCompanyChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or code..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-56"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No Marg products found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Base Code</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-right">Total Stock</th>
                  <th className="px-4 py-3 text-right">Batches</th>
                  <th className="px-4 py-3">Product</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    open={expanded.has(p.id)}
                    onToggle={() => toggle(p.id)}
                    onCreateClick={() => setCreatingFor(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Page {page} of {totalPages} — {total} product{total !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {creatingFor && (
        <CreateProductFromMargProductModal
          product={creatingFor}
          onClose={() => setCreatingFor(null)}
          onCreated={() => {
            setCreatingFor(null);
            setCreatedMessage(`Product created for ${creatingFor.name || creatingFor.base_code}.`);
            setTimeout(() => setCreatedMessage(""), 6000);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function ProductRow({ p, open, onToggle, onCreateClick }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer hover:bg-gray-50 transition-colors ${p.is_deleted ? "opacity-40" : ""}`}
      >
        <td className="px-4 py-3 text-gray-400">
          <svg
            className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
        <td className="px-4 py-3 text-gray-500">{p.base_code}</td>
        <td className="px-4 py-3 text-gray-500">{p.company || "—"}</td>
        <td className="px-4 py-3 text-right text-gray-700">{fmtMoney(p.mrp)}</td>
        <td className="px-4 py-3 text-right text-gray-700">{fmtStock(p.total_stock)}</td>
        <td className="px-4 py-3 text-right text-gray-500">{p.batch_count}</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {p.linked_product_id ? (
            <Link
              href={`/panel/products/${p.linked_product_id}`}
              className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Product Created →
            </Link>
          ) : (
            <button
              onClick={onCreateClick}
              className="text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Create Product
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-4 pb-4 pt-0 bg-gray-50">
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-left text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right">MRP</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {p.batches.map((b) => (
                    <tr key={b.id} className={b.is_deleted ? "opacity-40" : ""}>
                      <td className="px-3 py-2 text-gray-700">{b.curbatch || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{b.code}</td>
                      <td className="px-3 py-2 text-gray-500">{b.exp?.trim() || "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtStock(b.stock)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(b.mrp)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(b.rate)}</td>
                      <td className="px-3 py-2">
                        {b.is_deleted ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">Inactive</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
