"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { BillRow, BillDetail, SortHeader, fmtMoney, fmtDate, fmtQty, TYPE_STYLES } from "@/components/admin/MargBills";
import MonthlyChart from "@/components/admin/MargMonthlyChart";

// The partner page's "Bills & reports" tab: this year's totals, a monthly
// line chart, top products, a timeline (bills, app orders, joined) and the
// full bills list.
// Linked through the partner's Marg RID; needs marg_master_view (the section
// stays hidden without it).

const ORDER_STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
};

function monthLabel(m, withYear = false) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}

export default function MargPartnerBills({ partnerId, partnerName }) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("timeline");

  useEffect(() => {
    apiFetch(`/admin/partners/${partnerId}/marg-bills`)
      .then(setData)
      .catch((e) => {
        // No marg_master_view permission: leave the section out entirely.
        if (/forbidden|permission|403/i.test(e.message || "")) setHidden(true);
        else setError(e.message || "Could not load Marg bills");
      });
  }, [partnerId]);

  if (hidden) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
        You need the Marg master view permission to see bills and reports.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Bills &amp; reports{partnerName ? ` · ${partnerName}` : ""}</h2>
          <p className="text-xs text-gray-400 mt-0.5">This financial year from Marg, synced every 15 minutes.</p>
        </div>
        {data?.linked && (
          <Link
            href={`/panel/marg-ledger/${encodeURIComponent(data.party_code)}`}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            {data.party_name || data.party_code} · {data.party_code} →
          </Link>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : !data.linked ? (
        <>
          <p className="text-sm text-gray-500 mb-4">
            This partner isn&apos;t linked to a Marg party yet. Set their Marg RID under <span className="font-medium">Details</span> to see their bills here.
          </p>
          <Timeline events={data.timeline} />
        </>
      ) : (
        <>
          <Totals totals={data.totals} cancelled={data.cancelled} />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MonthlyChart monthly={data.monthly} />
            </div>
            <TopProducts products={data.top_products} />
          </div>
          <div className="flex gap-1 border-b border-gray-200 mt-6 mb-4">
            {[
              ["timeline", "Timeline"],
              ["bills", "All bills"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === k ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "timeline" ? <Timeline events={data.timeline} /> : <PartyBills code={data.party_code} />}
        </>
      )}
    </div>
  );
}

function TopProducts({ products }) {
  if (!products?.length) return null;
  return (
    <div>
      <div className="text-xs font-medium text-gray-700 mb-2">Top products this year</div>
      <ol className="divide-y divide-gray-100 text-sm">
        {products.slice(0, 8).map((p, i) => (
          <li key={p.product_pid} className="py-1.5 flex items-baseline gap-2">
            <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate text-gray-800" title={p.name || ""}>{p.name || `Product ${p.product_pid}`}</span>
            <span className="text-xs text-gray-500 whitespace-nowrap">{fmtQty(p.qty)} qty</span>
            <span className="text-gray-900 whitespace-nowrap">{fmtMoney(p.amount)}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-gray-400 mt-1">Amounts before GST.</p>
    </div>
  );
}

function Totals({ totals, cancelled }) {
  if (!totals.length) return <p className="text-sm text-gray-400 mb-4">No bills this year.</p>;
  return (
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 mb-5">
      {totals.map((t) => (
        <div key={t.code} className="rounded-lg border border-gray-200 p-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${TYPE_STYLES[t.code] || "bg-gray-100 text-gray-600"}`}>{t.name || t.code}</span>
          <div className="mt-2 text-lg font-semibold text-gray-900">{fmtMoney(t.total)}</div>
          <div className="text-xs text-gray-500">
            {t.bills} bill{t.bills !== 1 ? "s" : ""} · last {fmtDate(t.last_date)} · incl. GST
          </div>
        </div>
      ))}
      {cancelled > 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500 flex items-center">
          {cancelled} cancelled bill{cancelled !== 1 ? "s" : ""}, not counted
        </div>
      )}
    </div>
  );
}

// Newest first, grouped by month. Bills open into their lines in place.
function Timeline({ events }) {
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(null);
  if (!events?.length) return <p className="text-sm text-gray-400">Nothing yet.</p>;

  const shown = events.slice(0, limit);
  const groups = [];
  for (const e of shown) {
    const key = e.kind === "bill" ? String(e.at).slice(0, 7) : new Date(e.at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(e);
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.key} className="mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{monthLabel(g.key, true)}</div>
          <ol className="relative border-l border-gray-200 ml-1.5">
            {g.items.map((e, i) => (
              <li key={`${e.kind}-${e.voucher || e.order_id || i}`} className="ml-4 pb-3">
                <span
                  className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                    e.kind === "order" ? "bg-gray-900" : e.kind === "joined" ? "bg-green-600" : e.cancelled ? "bg-gray-300" : "bg-gray-400"
                  }`}
                />
                <TimelineItem e={e} open={open === e.voucher} onToggle={() => setOpen((v) => (v === e.voucher ? null : e.voucher))} />
              </li>
            ))}
          </ol>
        </div>
      ))}
      {events.length > limit && (
        <button onClick={() => setLimit((n) => n + 50)} className="text-xs text-gray-500 hover:text-gray-900 underline">
          Show older ({events.length - limit} more)
        </button>
      )}
    </div>
  );
}

function TimelineItem({ e, open, onToggle }) {
  if (e.kind === "joined") {
    return (
      <div className="text-sm text-gray-700">
        Joined as a partner <span className="text-xs text-gray-400">· {fmtDateTime(e.at)}</span>
      </div>
    );
  }
  if (e.kind === "order") {
    return (
      <div className="text-sm text-gray-700 flex items-center gap-2 flex-wrap">
        <Link href={`/panel/orders/${e.order_id}`} className="font-medium text-gray-900 hover:underline">
          App order #{e.order_id.slice(0, 8)}
        </Link>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${ORDER_STATUS_STYLES[e.order_status] || "bg-gray-100 text-gray-600"}`}>
          {e.order_status}
        </span>
        {e.marg_order_no && <span className="text-xs text-gray-400">Marg order {e.marg_order_no}</span>}
        <span className="text-xs text-gray-400">· {fmtDateTime(e.at)}</span>
      </div>
    );
  }
  return (
    <div className={e.cancelled ? "opacity-60" : ""}>
      <button onClick={onToggle} className="text-sm text-gray-700 flex items-center gap-2 flex-wrap text-left hover:text-gray-900">
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${TYPE_STYLES[e.bill_type] || "bg-gray-100 text-gray-600"}`}>
          {e.bill_type_name || e.bill_type}
        </span>
        <span className="font-medium text-gray-900">{e.bill_no}</span>
        <span className="text-gray-900">{fmtMoney(e.total)}</span>
        <span className="text-xs text-gray-400">
          {e.lines} line{e.lines !== 1 ? "s" : ""} · {fmtDate(e.at)}
        </span>
        {e.cancelled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">Cancelled</span>}
      </button>
      {open && (
        <div className="mt-2 bg-gray-50 rounded-lg p-3">
          <BillDetail voucher={e.voucher} />
        </div>
      )}
    </div>
  );
}

function fmtDateTime(v) {
  return new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

// Every bill for the party, the same rows as the Marg Bills page.
function PartyBills({ code }) {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({ party: code, page: String(page), sort: sort.key, dir: sort.dir });
    apiFetch(`/admin/marg-bills?${params.toString()}`).then(setList).catch(() => setList(null));
  }, [code, page, sort]);

  const sortBy = (key) => {
    setPage(1);
    setExpanded(null);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  };

  if (!list) return <p className="text-sm text-gray-400">Loading bills...</p>;
  if (!list.bills.length) return <p className="text-sm text-gray-400">No bills.</p>;
  const totalPages = Math.max(1, Math.ceil(list.total / list.page_size));

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 w-8"></th>
              <SortHeader label="Date" k="date" sort={sort} onSort={sortBy} />
              <SortHeader label="Bill no" k="bill_no" sort={sort} onSort={sortBy} />
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3 text-right">Lines</th>
              <SortHeader label="Total" k="total" sort={sort} onSort={sortBy} align="right" />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.bills.map((b) => (
              <BillRow
                key={b.voucher}
                b={b}
                linkParty={false}
                open={expanded === b.voucher}
                onToggle={() => setExpanded((v) => (v === b.voucher ? null : b.voucher))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-gray-400">
          {list.total} bills · page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { setExpanded(null); setPage((p) => Math.max(1, p - 1)); }}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => { setExpanded(null); setPage((p) => Math.min(totalPages, p + 1)); }}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
