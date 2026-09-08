"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

// Product <-> storage-location linkage, as a plain list inside the admin
// panel (not the 2D/3D editor at /warehouse, which is deliberately its own
// full-page tab since the canvas needs the room). Reuses the editor's own
// bin-generation logic (expandBins/fromDbConnect/migrate) via a runtime
// import() of its vendored JS, so the rack -> bay -> bin hierarchy shown
// here always matches what the 2D editor draws — no separate reimplementation
// to drift out of sync.
export default function WarehouseInventoryPage() {
  const [modules, setModules] = useState(null);
  const [layouts, setLayouts] = useState([]);
  const [layoutName, setLayoutName] = useState("");
  const [layoutState, setLayoutState] = useState(null);
  const [products, setProducts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [geometry, dbconnect, migrations] = await Promise.all([
          import(/* webpackIgnore: true */ "/warehouse-editor/js/geometry.js"),
          import(/* webpackIgnore: true */ "/warehouse-editor/js/dbconnect.js"),
          import(/* webpackIgnore: true */ "/warehouse-editor/js/migrations.js"),
        ]);
        if (!cancelled) {
          setModules({
            expandBins: geometry.expandBins,
            fromDbConnect: dbconnect.fromDbConnect,
            migrate: migrations.migrate,
          });
        }
      } catch (err) {
        if (!cancelled) setError("Could not load the layout engine: " + err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    apiFetch("/admin/warehouse/layouts")
      .then((list) => {
        setLayouts(list || []);
        if (list && list.length > 0) setLayoutName(list[0].name);
      })
      .catch((err) => setError("Could not load layouts: " + err.message));

    apiFetch("/admin/products?name_only=true&limit=0")
      .then((data) => setProducts((data.products || []).map((p) => ({ id: p.id, name: p.name }))))
      .catch((err) => setError("Could not load products: " + err.message));
  }, []);

  useEffect(() => {
    if (!layoutName || !modules) return;
    loadLayout(layoutName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutName, modules]);

  async function loadLayout(name) {
    setLoading(true);
    setError("");
    try {
      const [raw, assigns] = await Promise.all([
        apiFetch(`/admin/warehouse/layouts/${encodeURIComponent(name)}`),
        apiFetch(`/admin/warehouse/layouts/${encodeURIComponent(name)}/assignments`),
      ]);
      setLayoutState(modules.fromDbConnect(modules.migrate(raw)));
      setAssignments(assigns || []);
    } catch (err) {
      setError("Could not load that layout: " + err.message);
      setLayoutState(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAssignments() {
    try {
      setAssignments((await apiFetch(`/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments`)) || []);
    } catch (err) {
      setError("Could not refresh assignments: " + err.message);
    }
  }

  function findAssignment(locationType, locationKey, slot) {
    return assignments.find(
      (a) => a.location_type === locationType && a.location_key === locationKey && a.slot === slot,
    );
  }

  async function updateAssignment(locationType, locationKey, slot, productId) {
    const path = `/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments/${locationType}/${encodeURIComponent(locationKey)}/${slot}`;
    try {
      if (productId) {
        await apiFetch(path, { method: "PUT", body: JSON.stringify({ product_id: productId }) });
      } else if (findAssignment(locationType, locationKey, slot)) {
        await apiFetch(path, { method: "DELETE" });
      } else {
        return;
      }
      await refreshAssignments();
    } catch (err) {
      alert("Could not update product assignment: " + err.message);
    }
  }

  // rack -> bay -> bins (levels), grouped from the flat expandBins() list.
  const rackGroups = useMemo(() => {
    if (!layoutState || !modules) return [];
    const bins = modules.expandBins(layoutState);
    const byRackThenBay = {};
    for (const b of bins) {
      const bayIndex = parseInt(b.override_key.split("|")[1], 10);
      byRackThenBay[b.row] = byRackThenBay[b.row] || {};
      byRackThenBay[b.row][bayIndex] = byRackThenBay[b.row][bayIndex] || [];
      byRackThenBay[b.row][bayIndex].push(b);
    }
    return (layoutState.racks || []).map((rack) => ({
      rack,
      bays: Array.from({ length: rack.bays }, (_, bayIndex) => {
        const bayBins = (byRackThenBay[rack.id]?.[bayIndex] || []).sort((a, b) => a.level - b.level);
        return { bayIndex, label: bayBins[0]?.bay ?? bayIndex + 1, bins: bayBins };
      }),
    }));
  }, [layoutState, modules]);

  const pallets = layoutState?.pallets || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Warehouse Inventory</h2>
        <a href="/warehouse" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700">
          Open 2D/3D layout editor →
        </a>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Layout</label>
        <select
          value={layoutName}
          onChange={(e) => setLayoutName(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 min-w-[220px]"
        >
          {layouts.length === 0 && <option value="">No layouts saved</option>}
          {layouts.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && layoutState && (
        <>
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Pallets ({pallets.length})</h3>
            {pallets.length === 0 ? (
              <p className="text-sm text-gray-500">No pallets in this layout.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {pallets.map((p) => {
                  const a = findAssignment("pallet", p.id, "A");
                  return (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{p.id}</div>
                        <div className="text-xs text-gray-500">
                          {p.w}×{p.d}×{p.h} m
                        </div>
                      </div>
                      <ProductSelect
                        value={a?.product_id}
                        products={products}
                        onChange={(pid) => updateAssignment("pallet", p.id, "A", pid)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Racks ({rackGroups.length})</h3>
            {rackGroups.length === 0 ? (
              <p className="text-sm text-gray-500">No rack rows in this layout.</p>
            ) : (
              <div className="space-y-2">
                {rackGroups.map(({ rack, bays }) => (
                  <details
                    key={rack.id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                    open
                  >
                    <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-gray-900 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                      <span>Rack {rack.id}</span>
                      <span className="text-xs font-normal text-gray-500">
                        {rack.bays} bay{rack.bays !== 1 ? "s" : ""} · {rack.levels} level
                        {rack.levels !== 1 ? "s" : ""} · {rack.type}
                      </span>
                    </summary>
                    <div className="divide-y divide-gray-100">
                      {bays.map(({ bayIndex, label, bins }) => (
                        <details key={bayIndex}>
                          <summary className="px-4 py-2 pl-8 cursor-pointer text-sm text-gray-800 hover:bg-gray-50 flex items-center justify-between">
                            <span>Bay {String(label).padStart(2, "0")}</span>
                            <span className="text-xs font-normal text-gray-400">
                              {bins.length} bin{bins.length !== 1 ? "s" : ""}
                            </span>
                          </summary>
                          <div className="pl-10 pr-4 pb-3 space-y-2 bg-gray-50/60">
                            {bins.map((b) => {
                              const l = findAssignment("bin", b.whse_location, "L");
                              const r = findAssignment("bin", b.whse_location, "R");
                              return (
                                <div key={b.whse_location} className="flex items-center gap-3 pt-2">
                                  <span className="text-xs font-mono text-gray-500 w-28 shrink-0">
                                    {b.whse_location}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-gray-400 w-3">L</span>
                                    <ProductSelect
                                      value={l?.product_id}
                                      products={products}
                                      onChange={(pid) => updateAssignment("bin", b.whse_location, "L", pid)}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-gray-400 w-3">R</span>
                                    <ProductSelect
                                      value={r?.product_id}
                                      products={products}
                                      onChange={(pid) => updateAssignment("bin", b.whse_location, "R", pid)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {!loading && !layoutState && !error && (
        <p className="text-sm text-gray-500">Select a layout above to see its pallets and rack bins.</p>
      )}
    </div>
  );
}

function ProductSelect({ value, products, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900 min-w-[160px]"
    >
      <option value="">— none —</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
