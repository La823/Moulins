"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";

// A read-only sibling of /warehouse (the full 2D/3D editor): loads a saved
// layout and renders it in the same read-only 3D preview the editor itself
// uses (frontend/public/warehouse-editor/js/preview3d.js — orbit/pan/zoom
// only, no mutation), plus a product search that jumps the camera to a
// match. Deliberately NOT built on top of editor.js — that module wires up
// its whole toolbar/canvas as one big stateful machine with no "read-only"
// mode, and retrofitting one there risks the real editor. This page instead
// mirrors the pattern already used by (admin)/panel/warehouse-inventory:
// a plain React shell that dynamically imports the same vendored geometry
// helpers so bin/bay numbering always matches the editor exactly.
export default function WarehouseViewPage() {
  return (
    <AuthGuard allowedRoles={["admin", "employee"]}>
      <Suspense fallback={null}>
        <WarehouseViewer />
      </Suspense>
    </AuthGuard>
  );
}

function WarehouseViewer() {
  const wrapRef = useRef(null);
  const previewRef = useRef(null);
  const modulesRef = useRef(null);
  const appliedLocateRef = useRef(false);

  // A QR code on a printed bin/pallet label links here as
  // /warehouse/view?layout=<name>&locate=bin:<key> (or pallet:<id>) — see
  // the backend's QRCodeHandler. Consumed once, on first load, below.
  const searchParams = useSearchParams();
  const initialLayout = searchParams.get("layout");
  const locateParam = searchParams.get("locate");

  const [layouts, setLayouts] = useState([]);
  const [engineReady, setEngineReady] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [layoutState, setLayoutState] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [panMode, setPanMode] = useState(false);
  const [selected, setSelected] = useState(null); // the highlighted assignment, or null
  // Sidebar is an overlay on top of the always-full-screen 3D view (not a
  // flex column) so it can slide fully off-screen on phones without
  // squeezing the canvas into a sliver. Starts closed on narrow screens so
  // the 3D view is what greets a phone user, open on desktop.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 768px)").matches) setSidebarOpen(false);
  }, []);

  function togglePan() {
    const next = !panMode;
    setPanMode(next);
    previewRef.current?.setPanMode(next);
  }

  function makeGetBinProduct(list) {
    return (whseLocation, slot) => {
      const a = list.find(
        (x) => x.location_type === "bin" && x.location_key === whseLocation && x.slot === slot,
      );
      return a?.product_name ?? null;
    };
  }

  // Load the vendored modules once, then the layout list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [geometry, dbconnect, migrations, preview3d] = await Promise.all([
          import(/* webpackIgnore: true */ "/warehouse-editor/js/geometry.js"),
          import(/* webpackIgnore: true */ "/warehouse-editor/js/dbconnect.js"),
          import(/* webpackIgnore: true */ "/warehouse-editor/js/migrations.js"),
          import(/* webpackIgnore: true */ "/warehouse-editor/js/preview3d.js"),
        ]);
        if (cancelled) return;
        modulesRef.current = {
          expandBins: geometry.expandBins,
          fromDbConnect: dbconnect.fromDbConnect,
          migrate: migrations.migrate,
        };
        previewRef.current = preview3d.createPreview3D(wrapRef.current);
        setEngineReady(true);
      } catch (err) {
        if (!cancelled) setError("Could not load the layout engine: " + err.message);
      }
    })();
    return () => {
      cancelled = true;
      previewRef.current?.teardown();
    };
  }, []);

  useEffect(() => {
    apiFetch("/admin/warehouse/layouts")
      .then((list) => {
        setLayouts(list || []);
        let preferred = initialLayout;
        if (!preferred) {
          try {
            preferred = JSON.parse(localStorage.getItem("warehouse_layout_editor_v1"))?.meta?.name;
          } catch { /* Ignore an unreadable local draft. */ }
        }
        if (initialLayout && !(list || []).some((l) => l.name === initialLayout)) {
          setError(`Layout "${initialLayout}" was not found.`);
          return;
        }
        const wanted = preferred && (list || []).some((l) => l.name === preferred);
        if (wanted) setLayoutName(preferred);
        else if (list && list.length > 0) setLayoutName(list[0].name);
      })
      .catch((err) => setError("Could not load layouts: " + err.message));
    // Only meant to run once on mount — initialLayout is read from the URL
    // a single time, not re-applied if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!layoutName || !engineReady) return;
    let cancelled = false;
    setSelected(null);
    previewRef.current?.clearHighlight();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [raw, assigns, library] = await Promise.all([
          apiFetch(`/admin/warehouse/layouts/${encodeURIComponent(layoutName)}`),
          apiFetch(`/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments`),
          apiFetch("/admin/warehouse/bin-types").catch(() => []),
        ]);
        if (cancelled) return;
        const state = modulesRef.current.fromDbConnect(modulesRef.current.migrate(raw));
        // Match the editor's shared bin-type overrides, which affect geometry.
        for (const type of library || []) {
          state.binTypes[type.name] = { w: type.w, d: type.d, h: type.h, color: type.color };
        }
        setLayoutState(state);
        setAssignments(assigns || []);
        previewRef.current?.build(state, showLabels, makeGetBinProduct(assigns || []));

        // Apply the QR-linked highlight exactly once, only when this load
        // is the one the link actually pointed at (not a later manual
        // layout switch by the viewer).
        if (locateParam && !appliedLocateRef.current && layoutName === initialLayout) {
          appliedLocateRef.current = true;
          const sep = locateParam.indexOf(":");
          if (sep > 0) {
            const locType = locateParam.slice(0, sep);
            const locKey = locateParam.slice(sep + 1);
            previewRef.current?.highlight(locType, locKey, undefined, true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load that layout: " + err.message);
          setLayoutState(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // previewRef/modulesRef are refs, not reactive state — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutName, engineReady]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return assignments.filter((a) => a.product_name?.toLowerCase().includes(q));
  }, [query, assignments]);

  // Highlights the matched bin/pallet with a bright label right where it is
  // — deliberately does NOT move the camera, so it doesn't yank the view
  // away from wherever the person is currently looking.
  function locate(a) {
    if (!previewRef.current) return;
    setSelected(a);
    previewRef.current.highlight(a.location_type, a.location_key, a.slot);
  }

  useEffect(() => {
    // Only auto-clear when an actual search query stopped matching anything
    // — `results` is a fresh (empty) array from useMemo whenever assignments
    // load too, even with an empty search box, which used to wipe out a
    // QR-code highlight the instant it was applied.
    if (query && results.length === 0) {
      setSelected(null);
      previewRef.current?.clearHighlight();
    }
  }, [results, query]);

  // Toggling "3D Labels" rebuilds the scene (that's how preview3d.js's
  // build() takes the flag) — reapply any active search highlight after,
  // since a rebuild tears down and recreates every mesh/label.
  useEffect(() => {
    if (!layoutState) return;
    previewRef.current?.build(layoutState, showLabels, makeGetBinProduct(assignments));
    if (selected) previewRef.current?.highlight(selected.location_type, selected.location_key, selected.slot);
    // Only meant to react to the toggle itself — layoutState/assignments
    // changes are already handled by the load effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLabels]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      <div className="absolute inset-0">
        <div ref={wrapRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-gray-950/60">
            Loading…
          </div>
        )}
        {!loading && !layoutState && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            Select a layout to view it.
          </div>
        )}
      </div>

      <button
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? "Hide panel" : "Show panel"}
        className="absolute top-3 left-3 z-30 w-9 h-9 flex items-center justify-center rounded-md bg-gray-900/90 border border-gray-700 text-gray-200 shadow-lg"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      <div
        className={`absolute inset-y-0 left-0 z-20 w-80 max-w-[88vw] border-r border-gray-800 bg-gray-900 flex flex-col shadow-2xl transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 pl-14 border-b border-gray-800">
          <h1 className="text-sm font-semibold text-gray-100">Warehouse — view only</h1>
          <a href={layoutName ? `/warehouse?layout=${encodeURIComponent(layoutName)}` : "/warehouse"} className="text-xs text-blue-400 hover:text-blue-300">
            Open the editor →
          </a>
          <p className="mt-2 text-xs text-gray-400">Showing the server-saved layout. Use Save to Server in the editor to publish draft changes here.</p>
        </div>

        <div className="p-4 border-b border-gray-800">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Layout</label>
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100"
          >
            {layouts.length === 0 && <option value="">No layouts saved</option>}
            {layouts.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="p-4 border-b border-gray-800 flex gap-2">
          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`flex-1 px-2.5 py-1.5 rounded-md text-sm border ${
              showLabels
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-gray-800 border-gray-700 text-gray-300"
            }`}
          >
            {showLabels ? "Hide Labels" : "Show Labels"}
          </button>
          <button
            onClick={togglePan}
            title="Drag to pan instead of orbit"
            className={`flex-1 px-2.5 py-1.5 rounded-md text-sm border ${
              panMode
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-gray-800 border-gray-700 text-gray-300"
            }`}
          >
            ✋ Pan{panMode ? " (on)" : ""}
          </button>
        </div>

        <div className="p-4 border-b border-gray-800">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Search product</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Product name…"
            className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 placeholder:text-gray-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {query && results.length === 0 && (
            <p className="text-xs text-gray-500 px-2 py-3">No matches in this layout.</p>
          )}
          {results.map((a, i) => {
            const key = `${a.location_type}-${a.location_key}-${a.slot}`;
            return (
              <button
                key={`${key}-${i}`}
                onClick={() => locate(a)}
                className={`w-full text-left px-3 py-2 rounded-md hover:bg-gray-800 mb-1 ${
                  selected === a ? "bg-gray-800 ring-1 ring-lime-400/60" : ""
                }`}
              >
                <div className="text-sm text-gray-100">{a.product_name}</div>
                <div className="text-xs text-gray-400 font-mono">
                  {a.location_type === "pallet" ? "Pallet" : "Bin"} {a.location_key}
                  {a.location_type === "bin" ? ` (${a.slot})` : ""}
                </div>
              </button>
            );
          })}
        </div>

        {error && <p className="text-xs text-red-400 p-4 border-t border-gray-800">{error}</p>}
      </div>
    </div>
  );
}
