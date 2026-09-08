"use client";

import { useEffect, useRef } from "react";
import AuthGuard from "@/components/AuthGuard";

// Ported from the standalone warehouse_layout_editor project's index.html —
// the static 2D/3D warehouse layout editor (ES modules + vendored three.js),
// mounted directly instead of via an iframe so it shares this page's origin
// (and therefore the same localStorage auth token apiFetch() uses) with no
// extra auth plumbing. Deliberately a standalone top-level route (not nested
// under (admin)/panel) — the sidebar-panel chrome fights the editor for
// screen space, so this opens in its own tab from the admin nav instead.
// See frontend/public/warehouse-editor/js/store.js for the save/load calls
// against the Go backend's /admin/warehouse/layouts API.
//
// Being top-level (not under (admin)/panel) also means it never got the
// AuthGuard the rest of admin gets — an expired/missing token used to just
// fail every API call inside the editor with a raw "HTTP 401" alert instead
// of bouncing to /login. Wrapped below to match panel/layout.jsx's guard.
export default function WarehouseLayoutPage() {
  return (
    <AuthGuard allowedRoles={["admin", "employee"]}>
      <WarehouseEditor />
    </AuthGuard>
  );
}

function WarehouseEditor() {
  const mountedRef = useRef(false);

  useEffect(() => {
    // Next.js dev (Strict Mode) mounts effects twice — guard so main.js
    // (which wires up global DOM listeners) only ever runs once per mount.
    if (mountedRef.current) return;
    mountedRef.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/warehouse-editor/css/styles.css";
    document.head.appendChild(link);

    // The reset in styles.css is scoped to .wh-editor-root (not html/body) so
    // it can't bleed into the rest of the app, but that leaves body's default
    // margin in place — enough to push the 100vh editor past the viewport and
    // give the page a 1-line scrollbar that jumps on every re-render (e.g.
    // adding/deleting an object). Clear just the margin, only while mounted.
    const prevBodyMargin = document.body.style.margin;
    document.body.style.margin = "0";

    // A click-drag inside the canvas can otherwise be interpreted as a
    // native overscroll/rubber-band gesture by the browser (most visible on
    // trackpads), nudging the whole page up/down independently of our own
    // pan/select pointer-event code. Disable it on the scrolling root
    // elements while this page is mounted.
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";

    window.__WAREHOUSE_API_BASE__ = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    // Cache-busted on every mount: these are plain static files (not
    // fingerprinted by Next's build), and ES module scripts in particular
    // tend to stick in the browser's module cache across reloads — without
    // this, a fix to the vendored editor JS can keep serving the old
    // behavior even after a hard refresh.
    const script = document.createElement("script");
    script.type = "module";
    script.src = `/warehouse-editor/js/main.js?v=${Date.now()}`;
    document.body.appendChild(script);

    return () => {
      mountedRef.current = false;
      document.head.removeChild(link);
      document.body.removeChild(script);
      document.body.style.margin = prevBodyMargin;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      delete window.__WAREHOUSE_API_BASE__;
    };
  }, []);

  return (
    <div className="wh-editor-root" id="app">
      <div id="topbar">
        <span className="brand">Warehouse Layout Editor</span>
        <button className="btn" id="newDesignBtn">+ New Design</button>
        <div className="sep" />
        <button className="btn tool active" data-tool="select" title="V">Select / Move</button>
        <button className="btn tool" data-tool="pan" title="H — drag anywhere to pan">✋ Pan</button>
        <button className="btn tool" data-tool="zone" title="Z — drag a rectangle">+ Zone</button>
        <button className="btn tool" data-tool="rack" title="R — drag along the row direction">+ Rack Row</button>
        <button className="btn tool" data-tool="pallet" title="P — click to place">+ Pallet</button>
        <button className="btn tool" data-tool="node" title="N — click to place">+ Node / Door</button>
        <button className="btn tool" data-tool="edge" title="E — click node A then node B">+ Path Edge</button>
        <button className="btn tool danger" data-tool="delete" title="X — click to delete">Delete</button>
        <div className="sep" />
        <button className="btn" id="view2d">2D Plan</button>
        <button className="btn" id="view3d">3D Preview</button>
        <button className="btn active" id="toggleLabels" title="L — 2D plan labels only appear on hover; this controls 3D Preview labels">3D Labels</button>
        <div className="sep" />
        <button className="btn" id="exportBtn">Export JSON</button>
        <button className="btn" id="importBtn">Import JSON</button>
        <input type="file" id="importFile" accept=".json" style={{ display: "none" }} />
        <div className="sep" />
        <button className="btn" id="saveServerBtn">Save to Server</button>
        <button className="btn" id="loadServerBtn">Load from Server</button>
        <div className="sep" />
        <a
          className="btn"
          href="/panel/warehouse-inventory"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Inventory Table
        </a>
        <div className="spacer" />
        <span id="savedFlag" />
      </div>

      <div id="main">
        <div id="side">
          <div id="props" />

          <h2>Background tracing image</h2>
          <div className="btnrow">
            <button className="btn small" id="bgLoad">Load image</button>
            <button className="btn small" id="bgCal">Calibrate scale</button>
            <button className="btn small" id="bgClear">Remove</button>
          </div>
          <div className="field">
            <label>Opacity</label>
            <input type="range" id="bgOpacity" min="0" max="100" defaultValue="35" style={{ flex: 1 }} />
          </div>
          <div className="hintline" id="bgInfo">
            No image loaded. Load your floorplan PNG, then Calibrate: click two points a known distance apart.
          </div>

          <h2>Bin types</h2>
          <div className="bt-row bt-head">
            <span>name</span><span>w</span><span>d</span><span>h</span><span /><span /><span />
          </div>
          <div id="binTypeList" />
          <div className="btnrow"><button className="btn small" id="addBinType">+ Add type</button></div>

          <h2>Settings</h2>
          <div className="field">
            <label>Units</label>
            <select id="unitsIn">
              <option value="m">Meters</option>
              <option value="ft">Feet (decimal)</option>
              <option value="ftin">Feet &amp; inches</option>
            </select>
          </div>
          <div className="field">
            <label>Snap</label><input type="text" id="snapIn" defaultValue="0.3" />
          </div>
          <div className="field">
            <label>Grid</label><input type="text" id="gridIn" defaultValue="3" />
          </div>

          <h2>Keyboard</h2>
          <div className="hintline">
            V select &middot; H pan &middot; Z zone &middot; R rack &middot; P pallet &middot; N node &middot; E edge &middot; X delete<br />
            L 3D labels &middot; Esc cancel &middot; Del remove selected<br />
            Arrow keys pan &middot; Right-drag also pans &middot; Scroll zoom
          </div>
        </div>

        <div id="stage">
          <canvas id="c2d" />
          <div id="c3dwrap" />
          <div id="status">x: — , y: —</div>
          <div id="toolHint" />
        </div>
      </div>

      <div id="bootError" />
    </div>
  );
}
