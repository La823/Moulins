// store.js — where a layout comes from and where the working draft is cached.
//
// Source of truth at startup:
//   1. If the browser has a saved draft in localStorage, use it (migrated).
//   2. Otherwise fetch the shipped default from data/default_layout.json.
//
// The localStorage copy is a convenience draft cache so a reload doesn't lose
// in-progress edits. It is NOT a substitute for Export JSON (or, later, the
// Postgres backend) — see README and docs/postgres.md.

import { migrate } from './migrations.js';
import { fromDbConnect, toDbConnect } from './dbconnect.js';

export const LS_KEY = 'warehouse_layout_editor_v1';
// Absolute, not relative — this module is embedded in the Next.js admin
// panel at /panel/warehouse, so a relative URL would resolve against that
// page's path instead of where these static assets actually live.
const DEFAULT_LAYOUT_URL = '/warehouse-editor/data/default_layout.json';

// Set by the admin panel page before loading main.js (see
// frontend/src/app/(admin)/panel/warehouse/page.jsx) to the Go backend's
// base URL — same value apiFetch() in the Next.js app itself uses.
const API_BASE = (typeof window !== 'undefined' && window.__WAREHOUSE_API_BASE__) || '';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchDefaultLayout() {
  const res = await fetch(DEFAULT_LAYOUT_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not load ${DEFAULT_LAYOUT_URL} (HTTP ${res.status})`);
  }
  return fromDbConnect(migrate(await res.json()));
}

// A blank starting point for "New Design" — same shape as the shipped
// default, but with zones/racks/nodes/edges/background cleared out so the
// user starts on an empty canvas instead of the sample layout.
export async function fetchBlankLayout() {
  const layout = await fetchDefaultLayout();
  layout.meta = { ...layout.meta, name: 'New Warehouse' };
  layout.zones = [];
  layout.racks = [];
  layout.nodes = [];
  layout.edges = [];
  layout.pallets = [];
  layout.bg = null;
  layout.binOverrides = {};
  return layout;
}

// Returns { layout, fromCache }. Throws only if BOTH localStorage and the
// default fetch fail (e.g. opened from a file:// URL).
export async function loadInitialLayout() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { layout: fromDbConnect(migrate(JSON.parse(raw))), fromCache: true };
  } catch (err) {
    // Corrupt cache shouldn't be fatal — fall through to the default.
    console.warn('Ignoring unreadable localStorage draft:', err);
  }
  return { layout: await fetchDefaultLayout(), fromCache: false };
}

// Synchronously write the working draft. Saves in db_connect format so the
// stored value is always a valid db_connect file (dir on racks is preserved
// via fromDbConnect when the draft is reloaded). Throws on quota errors.
export function saveLayout(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(toDbConnect(state)));
}

export function clearDraft() {
  localStorage.removeItem(LS_KEY);
}

// Server persistence — the Go backend's warehouse_layouts table (see
// backend/internal/api/routehandlers/warehouse). Separate from the
// localStorage draft cache above: these are explicit, named saves.

export async function listServerLayouts() {
  const res = await fetch(`${API_BASE}/admin/warehouse/layouts`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not list layouts (HTTP ${res.status})`);
  return res.json();
}

export async function saveToServer(name, state) {
  const res = await fetch(`${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(toDbConnect(state)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not save layout (HTTP ${res.status})`);
  }
}

export async function deleteFromServer(name) {
  const res = await fetch(`${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not delete layout (HTTP ${res.status})`);
  }
}

export async function loadFromServer(name) {
  const res = await fetch(`${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not load layout (HTTP ${res.status})`);
  }
  return fromDbConnect(migrate(await res.json()));
}

// Persistent bin-type library — shared across every layout (including brand
// new ones), unlike a layout's own `binTypes`, which only apply to that one
// saved layout. Backed by the Go backend's warehouse_bin_types table.

export async function listBinTypeLibrary() {
  const res = await fetch(`${API_BASE}/admin/warehouse/bin-types`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not list bin type library (HTTP ${res.status})`);
  return res.json();
}

export async function saveBinTypeToLibrary(name, type) {
  const res = await fetch(`${API_BASE}/admin/warehouse/bin-types/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ w: type.w, d: type.d, h: type.h, color: type.color }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not save bin type (HTTP ${res.status})`);
  }
}

export async function deleteBinTypeFromLibrary(name) {
  const res = await fetch(`${API_BASE}/admin/warehouse/bin-types/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not delete bin type (HTTP ${res.status})`);
  }
}

// Merge the persistent library into a layout's own binTypes — library
// entries are the source of truth (so editing one in the library updates it
// everywhere it's used), while any bin type that only exists on this one
// layout (never saved to the library) is left as-is. Never throws: if the
// library fetch fails (offline, logged out), the layout's own binTypes are
// used unchanged.
export async function mergeLibraryBinTypes(layout) {
  let library;
  try {
    library = await listBinTypeLibrary();
  } catch (err) {
    console.warn('Could not load bin type library, using layout-local bin types only:', err);
    return layout;
  }
  const merged = { ...(layout.binTypes || {}) };
  for (const t of library) {
    merged[t.name] = { w: t.w, d: t.d, h: t.h, color: t.color };
  }
  return { ...layout, binTypes: merged };
}

// Product <-> location assignments — which product is stored in a given
// rack bin (row-bay-level) or on a given pallet. Backed by the Go backend's
// warehouse_bin_assignments table (separate from the layout's own JSONB, so
// it's real relational data with a FK to products — see migration 107).
// locationType is 'bin' | 'pallet'; slot is 'L' | 'R' (bins only, two
// products can share a bin) | 'A' (pallets — always a single slot).

export async function listAssignments(layoutName) {
  const res = await fetch(
    `${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`Could not list product assignments (HTTP ${res.status})`);
  return res.json();
}

export async function saveAssignment(layoutName, locationType, locationKey, slot, productId) {
  const path = `${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments/${encodeURIComponent(locationType)}/${encodeURIComponent(locationKey)}/${encodeURIComponent(slot)}`;
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ product_id: productId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Could not save assignment (HTTP ${res.status})`);
  }
}

export async function deleteAssignment(layoutName, locationType, locationKey, slot) {
  const path = `${API_BASE}/admin/warehouse/layouts/${encodeURIComponent(layoutName)}/assignments/${encodeURIComponent(locationType)}/${encodeURIComponent(locationKey)}/${encodeURIComponent(slot)}`;
  const res = await fetch(path, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(text || `Could not delete assignment (HTTP ${res.status})`);
  }
}

// Lightweight product list for the assignment picker dropdown — reuses the
// same /admin/products the rest of the admin panel uses, just id+name.
let productListCache = null;
export async function listProductsForPicker() {
  if (productListCache) return productListCache;
  const res = await fetch(`${API_BASE}/admin/products?name_only=true&limit=0`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not list products (HTTP ${res.status})`);
  const data = await res.json();
  productListCache = (data.products || []).map((p) => ({ id: p.id, name: p.name }));
  return productListCache;
}
