"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import { SortHeader, fmtDate, fmtQty, fmtMoney } from "@/components/admin/MargBills";
import { fmtMonth } from "@/components/admin/MargPeriod";

// Item company in Marg (Product.GCode).
export const PRODUCT_COMPANIES = [
  { code: "", label: "All products" },
  { code: "IB", label: "Moulins" },
  { code: "ID", label: "Third party" },
  { code: "IC", label: "Others" },
];

function SearchBox({ value, onSearch, placeholder }) {
  const [input, setInput] = useState(value);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(input.trim()); }} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-64"
      />
      <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Search</button>
    </form>
  );
}

function Empty({ text }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">{text}</div>;
}

// ---- demand & reorder -------------------------------------------------------

// How fast each product leaves stock and whether its stock lasts 90 days
// (backend internal/margede/demand.go), and working through the products
// that need ordering: link the purchase order raised, snooze, remarks
// (demand_review.go). Units, not rupees: consumption is sold + free units
// on sale invoices and unbilled challans, averaged over full months; stock
// is the usable stock (batches not expired).

const DEMAND_SORTS = {
  name: (r) => r.name.toLowerCase(),
  stock: (r) => r.stock,
  avg2: (r) => r.avg2,
  avg3: (r) => r.avg3,
  avg6: (r) => r.avg6,
  avg12: (r) => r.avg12,
  now: (r) => r.this_month,
  cover: (r) => (r.cover_days == null ? Infinity : r.cover_days),
  order: (r) => r.still_to_order,
  purchase: (r) => r.last_purchase || "",
  sold: (r) => r.last_sold || "",
  risk: (r) => r.expiry_risk_value || r.expiry_risk_qty,
  months: (r) => (r.avg3 > 0 ? r.stock / r.avg3 : Infinity),
};

const DEMAND_VIEWS = [
  { key: "to_review", label: "To review", match: (r) => r.review === "to_review" },
  { key: "on_order", label: "On order", match: (r) => r.review === "on_order" },
  { key: "snoozed", label: "Snoozed", match: (r) => r.review === "snoozed" },
  { key: "expiry", label: "Expiry risk", match: (r) => r.expiry_risk_qty > 0 },
  { key: "all", label: "All products", match: () => true },
];

// Minimum shelf life a batch must still have when sold.
export const SHELF_CHOICES = [0, 30, 60, 90, 180];

const monthYear = (v) => (v ? `${String(v).slice(5, 7)}/${String(v).slice(2, 4)}` : "—");

// "New · in stock since 25 Jul" for products that had no stock on 1 April:
// their averages count only the days since.
export function AvailableNote({ r }) {
  if (!r.new_this_year) return null;
  const since = new Date(r.available_from).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const how = r.available_why === "first_sale" ? "first sold" : "in stock since";
  return (
    <div className="mt-1 text-[11px] text-indigo-700" title="Averages count only the days since then">
      New · {how} {since}
      {r.too_new && " · under 30 days of sales, averages are a first guess"}
    </div>
  );
}

const avgTitle = (r, i) => `Over ${r.avg_days[i]} day${r.avg_days[i] !== 1 ? "s" : ""}${r.new_this_year ? " (since the product arrived)" : ""}`;

// "Not sold in the last N months": months, or "year" for no sale at all
// this financial year (bills go back to 1 April only).
const UNSOLD_CHOICES = [
  { key: 0, label: "Any" },
  { key: 1, label: "1 month" },
  { key: 2, label: "2 months" },
  { key: 3, label: "3 months" },
  { key: 6, label: "6 months" },
  { key: "year", label: "Not this year" },
];

function unsoldMatch(unsold, stockOnly) {
  if (!unsold) return () => true;
  let cutoff = null;
  if (unsold !== "year") {
    cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - unsold);
  }
  return (r) =>
    (!stockOnly || r.stock > 0) && (!r.last_sold || (cutoff && new Date(r.last_sold) < cutoff));
}

const shortDate = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "");

export default function Demand() {
  const { user } = useAuth();
  const canAct = user?.role === "admin" || (user?.permissions || []).includes("marg_demand_edit");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [view, setView] = useState("to_review");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [unsold, setUnsold] = useState(0);
  const [stockOnly, setStockOnly] = useState(true);
  const [sort, setSort] = useState({ key: "cover", dir: "asc" });
  const [shelf, setShelf] = useState(90);
  const [dialog, setDialog] = useState(null); // { kind: "po" | "snooze" | "history", row }

  useEffect(() => {
    apiFetch(`/admin/marg-analysis/demand?shelf=${shelf}`).then(setData).catch((e) => setError(e.message || "Could not load"));
  }, [reload, shelf]);

  if (error) return <Empty text={error} />;
  if (!data) return <Loader />;

  const refresh = () => setReload((n) => n + 1);
  const onSort = (k) =>
    setSort((s) =>
      s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: k === "name" || k === "cover" ? "asc" : "desc" }
    );
  const q = search.toLowerCase();
  const notSold = unsoldMatch(unsold, stockOnly);
  const base = data.rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q) || String(r.product_pid).includes(q)) &&
      notSold(r)
  );
  const viewMatch = DEMAND_VIEWS.find((v) => v.key === view).match;
  const rows = base.filter((r) => (!company || r.company_code === company) && viewMatch(r));
  const get = DEMAND_SORTS[sort.key] || DEMAND_SORTS.cover;
  rows.sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return sort.dir === "asc" ? c : -c;
  });
  const m = data.months;
  const viewCount = (v) => base.filter((r) => (!company || r.company_code === company) && v.match(r)).length;
  const companyCount = (code) => base.filter((r) => viewMatch(r) && (!code || r.company_code === code)).length;

  return (
    <>
      <p className="text-xs text-gray-500 mb-3 max-w-4xl">
        Consumption is units that left stock (sold + free, on sale invoices and challans not yet billed), averaged per month
        over full months; {fmtMonth(data.this_month.slice(0, 7))} is still running, so it shows apart and isn&apos;t in the
        averages. Bills go back to {fmtMonth(data.first_month.slice(0, 7))}, so the 6-month average uses {m.avg6} month
        {m.avg6 !== 1 ? "s" : ""} and the year uses {m.avg12}. A product needs ordering when its usable stock (expired batches
        left out) lasts under {data.cover_days} days at the 3-month average. A product with no stock on 1 April counts only from when
        it arrived (its first stock in, or first sale), so a product bought two months ago is averaged over those two months. <b>To review</b> is what needs ordering with no open
        purchase order linked and no snooze; a snooze ends on its date, or early if the product runs out.
      </p>

      <div className="flex gap-2 flex-wrap mb-3">
        {DEMAND_VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => {
              setView(v.key);
              setSort(v.key === "expiry" ? { key: "risk", dir: "desc" } : { key: "cover", dir: "asc" });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              view === v.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {v.label}
            <span className={view === v.key ? "text-gray-300" : "text-gray-400"}> {viewCount(v)}</span>
          </button>
        ))}
        <span className="w-px bg-gray-200 mx-1" />
        {PRODUCT_COMPANIES.map((c) => (
          <button
            key={c.code}
            onClick={() => setCompany(c.code)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {c.label}
            <span className={company === c.code ? "text-gray-300" : "text-gray-400"}> {companyCount(c.code)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
        <span className="text-gray-500">Not sold in</span>
        <span className="inline-flex rounded-md border border-gray-200 overflow-hidden bg-white">
          {UNSOLD_CHOICES.map((c) => (
            <button
              key={c.key}
              onClick={() => setUnsold(c.key)}
              className={`px-2.5 py-1 ${unsold === c.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {c.label}
            </button>
          ))}
        </span>
        {unsold !== 0 && (
          <label className="inline-flex items-center gap-1.5 text-gray-600 ml-1">
            <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
            only with stock
          </label>
        )}
        {unsold !== 0 && (
          <span className="text-gray-400">
            {unsold === "year" ? "no sale since 1 April" : `last sale before ${new Date(new Date().setMonth(new Date().getMonth() - unsold)).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} or none this year`}
          </span>
        )}
      </div>

      {view === "expiry" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 max-w-4xl">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium">Must still have</span>
            <ShelfPicker shelf={shelf} setShelf={setShelf} />
            <span className="font-medium">of shelf life when sold</span>
          </div>
          Stock is sold earliest expiry first at the 3-month average. Whatever can&apos;t be sold before its batch&apos;s expiry
          less that margin is at risk, valued at the batch&apos;s purchase rate. A product with no sales in the last 3 full
          months has all its stock at risk.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{rows.length}</span> product{rows.length !== 1 ? "s" : ""} · quantities in units
          {view === "expiry" && rows.length > 0 && (
            <>
              {" "}· <span className="font-semibold text-gray-900">{fmtMoney(rows.reduce((t, r) => t + r.expiry_risk_value, 0))}</span> at risk
              (purchase rate)
            </>
          )}
        </p>
        <SearchBox value={search} onSearch={setSearch} placeholder="Product name, code or PID..." />
      </div>

      {!rows.length ? (
        <Empty text={view === "to_review" ? "Nothing to review" : view === "expiry" ? "Nothing at risk of expiring" : "No products"} />
      ) : view === "expiry" ? (
        <ExpiryTable rows={rows} sort={sort} onSort={onSort} canAct={canAct} onDialog={(kind, r) => setDialog({ kind, row: r })} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <SortHeader label="Product" k="name" sort={sort} onSort={onSort} />
                <SortHeader label="Stock" k="stock" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Avg 2 m" k="avg2" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Avg 3 m" k="avg3" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Avg 6 m" k="avg6" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Avg year" k="avg12" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="This month" k="now" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Days of stock" k="cover" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Still to order" k="order" sort={sort} onSort={onSort} align="right" />
                <th className="px-4 py-3">PO</th>
                <th className="px-4 py-3">Remarks</th>
                <SortHeader label="Last sold" k="sold" sort={sort} onSort={onSort} />
                <SortHeader label="Last purchase" k="purchase" sort={sort} onSort={onSort} />
                {canAct && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <DemandRow key={r.product_pid} r={r} target={data.cover_days} canAct={canAct} onDialog={(kind) => setDialog({ kind, row: r })} onChanged={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "po" && <LinkPODialog row={dialog.row} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === "snooze" && <SnoozeDialog row={dialog.row} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === "history" && (
        <HistoryDialog row={dialog.row} canAct={canAct} me={user?.id} onClose={() => setDialog(null)} onDone={refresh} />
      )}
    </>
  );
}

function DemandRow({ r, target, canAct, onDialog, onChanged }) {
  const ended = r.snooze_ended && r.review === "to_review";
  return (
    <tr className={`hover:bg-gray-50 align-top ${ended ? "bg-amber-50/50" : ""}`}>
      <td className="px-4 py-3 min-w-[14rem]">
        <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">
          {r.name}
        </Link>
        <div className="text-xs text-gray-400">{[r.code, r.company].filter(Boolean).join(" · ")}</div>
        <AvailableNote r={r} />
        {r.expiry_risk_qty > 0 && (
          <div className="mt-1 text-[11px] text-red-700">⚠ {fmtQty(r.expiry_risk_qty)} units may expire before they sell</div>
        )}
        {ended && (
          <div className="mt-1 text-[11px] text-amber-800">
            ⏰ {r.snooze_ended.ended_early ? "Ran out while snoozed" : `Snooze ended ${shortDate(r.snooze_ended.until)}`}
            {" "}— snoozed {shortDate(r.snooze_ended.at)}{r.snooze_ended.by ? ` by ${r.snooze_ended.by}` : ""}
            {r.snooze_ended.reason ? `: ${r.snooze_ended.reason}` : ""}
          </div>
        )}
        {r.snooze && (
          <div className="mt-1 text-[11px] text-gray-500">
            💤 Snoozed until {shortDate(r.snooze.until)}{r.snooze.by ? ` by ${r.snooze.by}` : ""}
            {r.snooze.reason ? `: ${r.snooze.reason}` : ""}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className={r.stock <= 0 ? "text-red-600 font-medium" : "text-gray-900"}>{fmtQty(r.stock)}</div>
        {r.expired_stock > 0 && <div className="text-[11px] text-amber-700">+{fmtQty(r.expired_stock)} expired</div>}
      </td>
      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap" title={avgTitle(r, 0)}>{fmtQty(Math.round(r.avg2))}</td>
      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap" title={avgTitle(r, 1)}>
        {fmtQty(Math.round(r.avg3))}
        {r.new_this_year && <div className="text-[10px] font-normal text-indigo-700">{r.avg_days[1]} days</div>}
      </td>
      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap" title={avgTitle(r, 2)}>{fmtQty(Math.round(r.avg6))}</td>
      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap" title={avgTitle(r, 3)}>{fmtQty(Math.round(r.avg12))}</td>
      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{fmtQty(r.this_month)}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <CoverCell r={r} target={target} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {r.needs_order ? (
          <>
            <div className="font-semibold text-gray-900">{fmtQty(r.still_to_order)}</div>
            {r.open_po_qty > 0 && (
              <div className="text-[11px] text-gray-400">
                needs {fmtQty(r.suggested_qty)} · {fmtQty(r.open_po_qty)} on order
              </div>
            )}
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 items-start">
          {r.pos.map((p) => (
            <span
              key={p.link_id}
              title={[p.product, p.company, p.date && `PO date ${fmtDate(p.date)}`].filter(Boolean).join(" · ")}
              className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                !p.found ? "bg-red-50 text-red-700" : p.open ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-500"
              }`}
            >
              {p.po_number} · {p.found ? p.status || "No status" : "PO not found"}
              {p.qty != null && ` · ${fmtQty(p.received || 0)}/${fmtQty(p.qty)}`}
            </span>
          ))}
          {canAct && (
            <button onClick={() => onDialog("po")} className="text-[11px] text-blue-700 hover:underline whitespace-nowrap">
              + Link PO
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 max-w-[16rem]">
        {r.last_remark ? (
          <button onClick={() => onDialog("history")} className="text-left group">
            <div className="text-xs text-gray-800 line-clamp-2 group-hover:underline">{r.last_remark.body}</div>
            <div className="text-[11px] text-gray-400">
              {r.last_remark.by || "—"} · {shortDate(r.last_remark.at)}
              {r.remarks_count > 1 && ` · ${r.remarks_count} remarks`}
            </div>
          </button>
        ) : (
          <button onClick={() => onDialog("history")} className="text-[11px] text-gray-400 hover:text-gray-700 hover:underline">
            {canAct ? "+ Remark" : "History"}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.last_sold ? fmtDate(r.last_sold) : <span className="text-red-700">Not this year</span>}</td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.last_purchase ? fmtDate(r.last_purchase) : "—"}</td>
      {canAct && (
        <td className="px-4 py-3 whitespace-nowrap">
          {r.snooze ? (
            <UnsnoozeButton pid={r.product_pid} onDone={onChanged} />
          ) : r.needs_order ? (
            <button onClick={() => onDialog("snooze")} className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-gray-400">
              Snooze
            </button>
          ) : null}
        </td>
      )}
    </tr>
  );
}

function UnsnoozeButton({ pid, onDone }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={() => {
        setBusy(true);
        apiFetch(`/admin/marg-analysis/demand/${pid}/unsnooze`, { method: "POST" })
          .then(onDone)
          .catch((e) => alert(e.message || "Could not unsnooze"))
          .finally(() => setBusy(false));
      }}
      className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 disabled:opacity-50"
    >
      Unsnooze
    </button>
  );
}

function Dialog({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 p-5 mt-16" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            {sub && <div className="text-xs text-gray-500">{sub}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LinkPODialog({ row, onClose, onDone }) {
  const [q, setQ] = useState(row.name.split(" ")[0] || "");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/admin/marg-analysis/demand/po-search?q=${encodeURIComponent(q.trim())}`)
        .then(setResults)
        .catch((e) => setError(e.message || "Could not search"));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const link = (poNumber) => {
    setBusy(true);
    setError("");
    apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/pos`, { method: "POST", body: JSON.stringify({ po_number: poNumber }) })
      .then(() => { onDone(); onClose(); })
      .catch((e) => setError(e.message || "Could not link"))
      .finally(() => setBusy(false));
  };
  const linked = new Set(row.pos.map((p) => p.po_number));

  return (
    <Dialog title="Link a purchase order" sub={row.name} onClose={onClose}>
      {row.pos.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-500 mb-1">Linked</div>
          {row.pos.map((p) => (
            <div key={p.link_id} className="flex items-center justify-between text-sm py-1">
              <span>
                {p.po_number} <span className="text-xs text-gray-400">· {p.status || "No status"}</span>
              </span>
              <button
                onClick={() => {
                  apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/pos/${p.link_id}`, { method: "DELETE" })
                    .then(() => { onDone(); onClose(); })
                    .catch((e) => setError(e.message || "Could not unlink"));
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="PO number or product name"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-2"
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {!results ? (
          <p className="text-xs text-gray-400 p-3">Searching...</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-gray-400 p-3">No purchase orders match.</p>
        ) : (
          results.map((o) => (
            <button
              key={o.po_number}
              disabled={busy || linked.has(o.po_number)}
              onClick={() => link(o.po_number)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-gray-900">{o.po_number}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${o.open ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-500"}`}>
                  {o.status || "No status"}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {[o.product, o.company, o.qty != null && `Qty ${fmtQty(o.qty)}`, o.date && fmtDate(o.date)].filter(Boolean).join(" · ")}
                {linked.has(o.po_number) && " · already linked"}
              </div>
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}

const SNOOZE_CHOICES = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
];

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SnoozeDialog({ row, onClose, onDone }) {
  const inDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return isoDay(d);
  };
  const [until, setUntil] = useState(inDays(7));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    setError("");
    apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/snooze`, { method: "POST", body: JSON.stringify({ until, reason }) })
      .then(() => { onDone(); onClose(); })
      .catch((e) => setError(e.message || "Could not snooze"))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog title="Snooze" sub={row.name} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        Hidden from To review until the date, then it comes back with a reminder. It comes back early if it runs out of stock.
      </p>
      <div className="flex gap-2 flex-wrap mb-3">
        {SNOOZE_CHOICES.map((c) => (
          <button
            key={c.days}
            onClick={() => setUntil(inDays(c.days))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              until === inDays(c.days) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {c.label}
          </button>
        ))}
        <input
          type="date"
          value={until}
          min={inDays(1)}
          onChange={(e) => setUntil(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-900"
        />
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (optional), e.g. supplier quoting new price"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-2"
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex justify-end">
        <button onClick={save} disabled={busy || !until} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
          Snooze until {shortDate(until)}
        </button>
      </div>
    </Dialog>
  );
}

const EVENT_LABEL = {
  remark: "Remark",
  snooze: "Snoozed",
  unsnooze: "Unsnoozed",
  po_linked: "PO linked",
  po_unlinked: "PO unlinked",
};

function HistoryDialog({ row, canAct, me, onClose, onDone }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/history`)
      .then(setEvents)
      .catch((e) => setError(e.message || "Could not load"));
  }, [row.product_pid, version]);

  const changed = () => { setVersion((v) => v + 1); onDone(); };
  const add = () => {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/remarks`, { method: "POST", body: JSON.stringify({ body }) })
      .then(() => { setBody(""); changed(); })
      .catch((e) => setError(e.message || "Could not save"))
      .finally(() => setBusy(false));
  };
  const del = (id) => {
    apiFetch(`/admin/marg-analysis/demand/${row.product_pid}/remarks/${id}`, { method: "DELETE" })
      .then(changed)
      .catch((e) => setError(e.message || "Could not delete"));
  };

  return (
    <Dialog title="Remarks & history" sub={row.name} onClose={onClose}>
      {canAct && (
        <div className="mb-4">
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a remark"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-2"
          />
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || !body.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              Add remark
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {!events ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-400">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {events.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="py-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">{EVENT_LABEL[e.kind] || e.kind}</span>
                  {e.kind === "snooze" && e.until && ` until ${shortDate(e.until)}`}
                  {e.po_number && ` ${e.po_number}`}
                  {" · "}{e.by || "—"} · {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                {e.kind === "remark" && canAct && e.by_id === me && (
                  <button onClick={() => del(e.id)} className="text-red-600 hover:underline">Delete</button>
                )}
              </div>
              {e.body && <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{e.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// Days the stock lasts at the 3-month average, with a word or number so it
// doesn't rely on colour: out of stock, under 30 days, under the target, fine.
function CoverCell({ r, target }) {
  if (r.cover_days == null) {
    return <span className="text-xs text-gray-400" title="Nothing left stock in the last 3 full months">No recent sales</span>;
  }
  const d = Math.floor(r.cover_days);
  if (r.stock <= 0) return <span className="text-xs font-medium text-red-600">● Out of stock</span>;
  if (d < 30) return <span className="text-red-600 font-medium">● {d} days</span>;
  if (d < target) return <span className="text-amber-700 font-medium">● {d} days</span>;
  return <span className="text-gray-600">{d > 999 ? "999+" : d} days</span>;
}

export function ShelfPicker({ shelf, setShelf }) {
  return (
    <span className="inline-flex rounded-md border border-amber-300 overflow-hidden bg-white">
      {SHELF_CHOICES.map((d) => (
        <button
          key={d}
          onClick={() => setShelf(d)}
          className={`px-2 py-0.5 text-xs ${shelf === d ? "bg-amber-700 text-white" : "text-amber-900 hover:bg-amber-100"}`}
        >
          {d === 0 ? "None" : d % 30 === 0 ? `${d / 30} mo` : `${d} d`}
        </button>
      ))}
    </span>
  );
}

// Products with stock that may expire before it sells, worst first.
function ExpiryTable({ rows, sort, onSort, canAct, onDialog }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <SortHeader label="Product" k="name" sort={sort} onSort={onSort} />
            <SortHeader label="Stock" k="stock" sort={sort} onSort={onSort} align="right" />
            <SortHeader label="Avg 3 m" k="avg3" sort={sort} onSort={onSort} align="right" />
            <SortHeader label="Months of stock" k="months" sort={sort} onSort={onSort} align="right" />
            <SortHeader label="At risk" k="risk" sort={sort} onSort={onSort} align="right" />
            <th className="px-4 py-3">Batches at risk</th>
            <th className="px-4 py-3">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.product_pid} className="hover:bg-gray-50 align-top">
              <td className="px-4 py-3 min-w-[14rem]">
                <Link href={`/panel/marg-analysis/products/${r.product_pid}`} className="text-gray-900 hover:underline">
                  {r.name}
                </Link>
                <div className="text-xs text-gray-400">{[r.code, r.company].filter(Boolean).join(" · ")}</div>
                <AvailableNote r={r} />
                {r.avg3 === 0 && <div className="mt-1 text-[11px] text-red-700">No sales in the last 3 full months{r.this_month > 0 ? ` (${fmtQty(r.this_month)} sold this month)` : ""}</div>}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-900">{fmtQty(r.stock)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700" title={avgTitle(r, 1)}>{fmtQty(Math.round(r.avg3))}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                {r.avg3 > 0 ? (r.stock / r.avg3).toFixed(1) : "—"}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <div className="font-semibold text-red-700">{fmtQty(Math.round(r.expiry_risk_qty))} units</div>
                <div className="text-[11px] text-gray-500">{r.expiry_risk_value ? fmtMoney(r.expiry_risk_value) : "no purchase rate"}</div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  {r.batches.map((b) => (
                    <Link
                      key={b.stock_id}
                      href={`/panel/marg-stock/batches/${b.stock_id}`}
                      className="text-[11px] whitespace-nowrap hover:underline"
                      title={`Must be sold by ${fmtDate(b.sellable_until)}`}
                    >
                      <span className="font-medium text-gray-900">{b.batch || "—"}</span>
                      <span className="text-gray-500"> · exp {monthYear(b.expiry)} · </span>
                      <span className="text-red-700">{fmtQty(Math.round(b.risk_qty))} of {fmtQty(b.stock)} at risk</span>
                    </Link>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 max-w-[14rem]">
                <button onClick={() => onDialog("history", r)} className="text-left">
                  {r.last_remark ? (
                    <span className="text-xs text-gray-800 line-clamp-2 hover:underline">{r.last_remark.body}</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 hover:underline">{canAct ? "+ Remark" : "History"}</span>
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The product page's batch-by-batch outlook: when each batch sells out at
// the 3-month average, and what may expire first.
export function ProductExpiry({ pid }) {
  const [shelf, setShelf] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`/admin/marg-analysis/products/${pid}/expiry?shelf=${shelf}`)
      .then(setData)
      .catch((e) => setError(e.message || "Could not load"));
  }, [pid, shelf]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader />;
  const r = data.row;
  if (!r || !r.batches.length) return <p className="text-sm text-gray-400">No stock in Marg.</p>;

  const statusOf = (b) =>
    b.status === "expired" ? (
      <span className="text-red-700 font-medium">Expired</span>
    ) : b.status === "at_risk" ? (
      <span className="text-red-700 font-medium">⚠ {fmtQty(Math.round(b.risk_qty))} may expire</span>
    ) : b.status === "too_new" ? (
      <span className="text-indigo-700">New — too early to judge</span>
    ) : b.status === "no_expiry" ? (
      <span className="text-gray-400">No expiry date</span>
    ) : (
      <span className="text-green-700">✓ Sells in time</span>
    );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs text-gray-600">
        <span>
          Selling {fmtQty(Math.round(r.avg3))} a month (3-month average
          {r.new_this_year ? `, over the ${r.avg_days[1]} days since it arrived` : ""})
          {r.avg3 > 0 && ` · ${(r.stock / r.avg3).toFixed(1)} months of stock`} · must still have
        </span>
        <ShelfPicker shelf={shelf} setShelf={setShelf} />
        <span>of shelf life when sold</span>
      </div>
      {r.new_this_year && (
        <p className="mb-2 text-xs text-indigo-700">
          No stock on 1 April — {r.available_why === "first_sale" ? "first sold" : "first stock in"} on {fmtDate(r.available_from)}
          {r.first_purchase && ` · first purchase ${fmtDate(r.first_purchase)}`}. Averages count only the days since.
          {r.too_new && " Under 30 days of sales, so expiry risk isn't judged yet."}
        </p>
      )}
      {r.expiry_risk_qty > 0 && (
        <p className="mb-2 text-sm text-red-700">
          ⚠ {fmtQty(Math.round(r.expiry_risk_qty))} units
          {r.expiry_risk_value ? ` (${fmtMoney(r.expiry_risk_value)} at purchase rate)` : ""} may expire before they sell
          {r.avg3 === 0 && " — no sales in the last 3 full months"}.
        </p>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">MRP</th>
              <th className="px-4 py-3 text-right">Purchase</th>
              <th className="px-4 py-3">Sell by</th>
              <th className="px-4 py-3">Sells out by</th>
              <th className="px-4 py-3">Outlook</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {r.batches.map((b) => (
              <tr key={b.stock_id} className={b.status === "at_risk" || b.status === "expired" ? "bg-red-50/40" : ""}>
                <td className="px-4 py-3">
                  <Link href={`/panel/marg-stock/batches/${b.stock_id}`} className="font-medium text-gray-900 hover:underline">
                    {b.batch || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{monthYear(b.expiry)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmtQty(b.stock)}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{b.mrp ? fmtMoney(b.mrp) : "—"}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{b.purchase_rate ? fmtMoney(b.purchase_rate) : "—"}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.sellable_until ? fmtDate(b.sellable_until) : "—"}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.sells_out_by ? fmtDate(b.sells_out_by) : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{statusOf(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
