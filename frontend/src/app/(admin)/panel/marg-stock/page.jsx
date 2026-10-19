"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

// Product-wise, batch-wise stock from Marg's Corporate EDE API, synced with
// the bills every 15 minutes. Each batch is compared with the product
// master (Marg Products, from the other Marg API): that one never shows
// negative stock and updates some batches later.

const VIEWS = [
  { key: "", label: "All products" },
  { key: "in_stock", label: "In stock" },
  { key: "negative", label: "Negative stock" },
  { key: "expired", label: "Expired, still in stock" },
  { key: "expiring", label: "Expiring in 6 months" },
  { key: "differs", label: "Differs from product master" },
];

const COMPANIES = [
  { value: "", label: "All companies" },
  { value: "IB", label: "Moulins" },
  { value: "ID", label: "Third party" },
  { value: "IC", label: "Others" },
];

const MASTER_STATUS = {
  match: { label: "Matches", className: "bg-green-50 text-green-700" },
  negative_master_zero: { label: "Master shows 0", className: "bg-red-50 text-red-600" },
  differs: { label: "Differs", className: "bg-amber-50 text-amber-700" },
  not_in_master: { label: "Not in master", className: "bg-gray-100 text-gray-600" },
  deleted_in_master: { label: "Deleted in master", className: "bg-gray-100 text-gray-400" },
};

const fmtQty = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));
const fmtMoney = (v, digits = 2) =>
  v == null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function fmtExpiry(v) {
  if (!v) return "—";
  const [y, m] = String(v).slice(0, 7).split("-");
  return `${m}/${y}`;
}
// Master expiry is "yyyymmdd" text.
function fmtMasterExpiry(v) {
  if (!v || v.length < 6) return "—";
  return `${v.slice(4, 6)}/${v.slice(0, 4)}`;
}
function fmtDate(v) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function isExpired(v) {
  if (!v) return false;
  return String(v).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export default function MargStockPage() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (view) params.set("view", view);
    if (company) params.set("company", company);
    if (search) params.set("search", search);
    apiFetch(`/admin/marg-stock?${params.toString()}`)
      .then(setList)
      .catch((e) => setError(e.message || "Could not load stock"))
      .finally(() => setLoading(false));
  }, [view, company, search, page]);

  const reset = (setter) => (value) => {
    setPage(1);
    setExpanded(new Set());
    setter(value);
  };

  const toggle = (pid) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.page_size)) : 1;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Marg Stock</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Batch-wise stock for every product, straight from Marg (synced every 15 minutes), compared with the product master.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => reset(setView)(v.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                view === v.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {v.label}
              {list?.view_counts?.[v.key] != null && (
                <span className={view === v.key ? "text-gray-300" : "text-gray-400"}> {list.view_counts[v.key].toLocaleString("en-IN")}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={company}
            onChange={(e) => reset(setCompany)(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            {COMPANIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <form
            onSubmit={(e) => { e.preventDefault(); reset(setSearch)(searchInput.trim()); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Product name, code or PID..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-64"
            />
            <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Search
            </button>
          </form>
        </div>
      </div>

      {list && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold text-gray-900">{list.total.toLocaleString("en-IN")}</span> product{list.total !== 1 ? "s" : ""}
          {" · "}
          <span className="font-semibold text-gray-900">{fmtMoney(list.stock_value, 0)}</span> stock value
          <span className="text-gray-400"> at purchase rate</span>
        </p>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : loading && !list ? (
        <Loader />
      ) : !list || list.products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No products match these filters</p>
        </div>
      ) : (
        <>
          <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3 text-right">Batches</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Next expiry</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.products.map((p) => (
                  <ProductRow key={p.product_pid} p={p} open={expanded.has(p.product_pid)} onToggle={() => toggle(p.product_pid)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setExpanded(new Set()); setPage((x) => Math.max(1, x - 1)); }}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => { setExpanded(new Set()); setPage((x) => Math.min(totalPages, x + 1)); }}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Badge({ className, title, children }) {
  return (
    <span title={title} className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function ProductRow({ p, open, onToggle }) {
  const details = [p.form_name, p.hsn_code && `HSN ${p.hsn_code}`, p.gst_percent != null && `GST ${p.gst_percent}%`]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-gray-400">
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{p.name || `Product ${p.product_pid}`}</div>
          <div className="text-xs text-gray-400">
            {p.code ? `${p.code} · ` : ""}{p.product_pid}{details ? ` · ${details}` : ""}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500">{p.company_name || p.company_code || "—"}</td>
        <td className="px-4 py-3 text-right text-gray-500">{p.batch_count}</td>
        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${p.total_stock < 0 ? "text-red-600" : "text-gray-900"}`}>
          {fmtQty(p.total_stock)} <span className="text-xs font-normal text-gray-400">{p.unit || ""}</span>
        </td>
        <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{p.stock_value ? fmtMoney(p.stock_value, 0) : "—"}</td>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtExpiry(p.nearest_expiry)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1 flex-wrap">
            {p.negative_batches > 0 && <Badge className="bg-red-50 text-red-600">{p.negative_batches} negative</Badge>}
            {p.expired_qty > 0 && <Badge className="bg-red-50 text-red-600">{fmtQty(p.expired_qty)} expired</Badge>}
            {p.expiring_qty > 0 && <Badge className="bg-amber-50 text-amber-700">{fmtQty(p.expiring_qty)} expiring</Badge>}
            {p.master_mismatches > 0 && <Badge className="bg-gray-100 text-gray-600">≠ master</Badge>}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-4 pb-4 pt-0 bg-gray-50">
            <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-left text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right">Opening (1 Apr)</th>
                    <th className="px-3 py-2 text-right">MRP</th>
                    <th className="px-3 py-2 text-right">Purchase rate</th>
                    <th className="px-3 py-2">Supplier invoice</th>
                    <th className="px-3 py-2">Product master</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.batches.map((b) => {
                    const st = MASTER_STATUS[b.master_status] || { label: b.master_status, className: "bg-gray-100 text-gray-600" };
                    const masterBits = b.master_status === "differs" || b.master_status === "negative_master_zero"
                      ? [
                          b.master_stock != null && b.master_stock !== b.stock && `stock ${fmtQty(b.master_stock)}`,
                          b.master_mrp != null && b.master_mrp !== b.mrp && `MRP ${fmtMoney(b.master_mrp)}`,
                          b.master_purchase_rate != null && b.master_purchase_rate !== b.purchase_rate && `rate ${fmtMoney(b.master_purchase_rate)}`,
                          b.master_expiry && fmtMasterExpiry(b.master_expiry) !== fmtExpiry(b.expiry) && `exp ${fmtMasterExpiry(b.master_expiry)}`,
                        ].filter(Boolean).join(", ")
                      : "";
                    return (
                      <tr key={b.marg_id} className={b.stock === 0 ? "text-gray-400" : ""}>
                        <td className="px-3 py-2 text-gray-800">{b.batch || <span className="text-gray-400">No batch</span>}</td>
                        <td className={`px-3 py-2 ${b.stock > 0 && isExpired(b.expiry) ? "text-red-600 font-medium" : "text-gray-600"}`}>{fmtExpiry(b.expiry)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${b.stock < 0 ? "text-red-600" : "text-gray-900"}`}>{fmtQty(b.stock)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{fmtQty(b.opening)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{b.mrp ? fmtMoney(b.mrp) : "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{b.purchase_rate ? fmtMoney(b.purchase_rate) : "—"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {b.supplier_invoice ? `${b.supplier_invoice} · ${fmtDate(b.supplier_invoice_date)}` : "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge className={st.className}>{st.label}</Badge>
                          {masterBits && <span className="ml-1.5 text-gray-500">master: {masterBits}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
