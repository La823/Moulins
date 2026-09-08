// editor.js — the 2D plan editor. Owns the live `state`, the canvas camera, the
// toolset, and the side-panel UI. Pure layout math lives in geometry.js;
// persistence lives in store.js; the 3D view lives in preview3d.js.

import { ptSegDist, expandBins, bayOf, resolveBayLabel } from './geometry.js';
import {
  saveLayout,
  fetchDefaultLayout,
  fetchBlankLayout,
  saveToServer,
  loadFromServer,
  listServerLayouts,
  deleteFromServer,
  mergeLibraryBinTypes,
  saveBinTypeToLibrary,
  deleteBinTypeFromLibrary,
  listAssignments,
  saveAssignment,
  deleteAssignment,
  listProductsForPicker,
} from './store.js';
import { createPreview3D } from './preview3d.js';
import { migrate } from './migrations.js';
import { fromDbConnect, toDbConnect } from './dbconnect.js';
import { createLabelState } from './labels.js';
import { getUnit, setUnit, formatLength, displayValue, parseLength } from './units.js';

// Quick-fill presets for door-kind nodes — sets w (opening width, metres)
// and h (clear height, metres). Purely a UI convenience; w/h stay freely
// editable afterward and 'custom' just means "user typed their own".
const DOOR_PRESETS = {
  personnel: { label: 'Personnel door', w: 0.9, h: 2.1 },
  roller: { label: 'Roller shutter', w: 3, h: 3.5 },
  dock: { label: 'Dock door', w: 2.4, h: 3 },
  sliding: { label: 'Sliding door', w: 4, h: 3.5 },
  custom: { label: 'Custom', w: null, h: null },
};

let state;
let preview;
const labelState = createLabelState(); // 3D-only now — see hover below for 2D

// 2D plan labels show only for whatever the mouse is currently over
// (see `hover`, set in pointermove) — this checks that without caring
// which kind of object it is.
function isHovered(obj) {
  return !!(hover && hover.obj === obj);
}

// Product <-> location assignments (which product lives in which bin/pallet
// slot) — real relational data on the Go backend, not part of the layout
// JSONB. Loaded per-layout and cached here; refreshed after every edit.
let productsList = [];
let assignmentsList = [];

function currentLayoutName() {
  return state.meta?.name || 'warehouse';
}

function findAssignment(locationType, locationKey, slot) {
  return assignmentsList.find(
    (a) => a.location_type === locationType && a.location_key === locationKey && a.slot === slot,
  );
}

// Passed into preview3d.js's build() so the 3D view can resolve a bin's
// linked product on hover without needing access to assignmentsList itself.
function getBinProduct(whseLocation, slot) {
  return findAssignment('bin', whseLocation, slot)?.product_name ?? null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function productOptionsHtml(selectedId) {
  const opts = [`<option value="">— none —</option>`];
  for (const p of productsList) {
    opts.push(`<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`);
  }
  return opts.join('');
}

// Loads the product picker list + this layout's current assignments, then
// re-renders the properties panel so whatever's selected picks them up —
// called after every layout load/switch, and safe to call even before a
// panel needing them is open.
async function loadProductsAndAssignments() {
  try {
    productsList = await listProductsForPicker();
  } catch (err) {
    console.warn('Could not load products for assignment picker:', err);
  }
  await refreshAssignments();
}

async function refreshAssignments() {
  try {
    assignmentsList = await listAssignments(currentLayoutName());
  } catch (err) {
    console.warn('Could not load product assignments:', err);
  }
  renderProps();
}

// The bins (one per level) inside one bay of a rack row, in level order —
// used to list product-assignment pickers for the currently selected bay.
function binsInBay(rack, bayIndex) {
  return expandBins(state)
    .filter((b) => b.row === rack.id)
    .filter((b) => parseInt(b.override_key.split('|')[1], 10) === bayIndex)
    .sort((a, b) => a.level - b.level);
}

async function onAssignmentPickerChange(locationType, locationKey, slot, productId) {
  try {
    if (productId) {
      await saveAssignment(currentLayoutName(), locationType, locationKey, slot, productId);
    } else {
      await deleteAssignment(currentLayoutName(), locationType, locationKey, slot);
    }
    await refreshAssignments();
  } catch (err) {
    alert('Could not update product assignment: ' + err.message);
  }
}

// DOM refs (resolved in initEditor)
let cv;
let ctx;
let props;
let toolHint;

// 2D camera: world center (cx, cy) in metres + zoom in px/m
const view = { cx: 61, cy: 27, zoom: 10 };

// interaction state
let tool = 'select';
let sel = null; // { kind, obj }
let hover = null; // { kind, obj } — whatever's under the mouse right now; 2D
// labels only render for this object instead of being drawn for everything
// all the time, so the plan stays uncluttered until you point at something.
let hoverBay = null; // bay index under the mouse when hover.obj is a rack —
// tracked separately from `hover` since the rack itself doesn't change as
// the mouse moves between bays, but the tooltip content should.
let pendingEdgeNode = null;
let dragDraw = null;
let dragMove = null;
// A hit object doesn't start actually moving the instant you mousedown on
// it — it waits for the pointer to move past DRAG_THRESHOLD_PX first (see
// pointermove). Without this, the ordinary few-pixel jitter every real
// mouse click has was read as an intentional drag, silently nudging
// whatever you clicked (most visible on small objects like pallets, where
// even a 0.3m snap-grid nudge looks like the whole view jumped).
let dragMovePending = null;
const DRAG_THRESHOLD_PX = 4;
let panning = null;
let calMode = false;
let calClicks = [];
let mode3d = false;
let bgImage = null;
let saveTimer = null;
let selBay = null; // { rack, bayIndex } — which bay is highlighted for the readout

// ---------- coordinate transforms ----------
const sx = (x) => (x - view.cx) * view.zoom * devicePixelRatio + cv.width / 2;
const sy = (y) => cv.height / 2 - (y - view.cy) * view.zoom * devicePixelRatio;
const wx = (px) => (px * devicePixelRatio - cv.width / 2) / (view.zoom * devicePixelRatio) + view.cx;
const wy = (py) => (cv.height / 2 - py * devicePixelRatio) / (view.zoom * devicePixelRatio) + view.cy;
const snap = (v) => {
  const s = +state.settings.snap || 0;
  return s > 0 ? Math.round(v / s) * s : v;
};

// Draw a line from (x1,y1) to (x2,y2) with an arrowhead at the end, in device px.
function drawArrow(x1, y1, x2, y2, color) {
  const dpr = devicePixelRatio;
  const head = 7 * dpr;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.4), y2 - head * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.4), y2 - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

// Draw a pallet in plan view: a wood-tone deck with slat lines running along
// either its depth or its width (see p.dir, like a rack row's direction),
// plus a 3x3 grid of support blocks showing through the gaps — a stylized
// top-down pallet icon, not a literal render. p = { x, y, w, d, h, dir },
// (x,y) = SW corner in metres. dir 'E' (default) = slats run N-S (along
// depth); dir 'N' = slats run E-W (along width).
// p.w/p.d are the pallet's real, fixed physical dimensions ("Width" is
// always the same measurement, along whichever way the slats run) — they
// never change when you flip orientation. `dir` only picks which screen
// axis (E: w->X/d->Y, N: swapped) the footprint is drawn/hit-tested along,
// so rotating turns the whole shape 90° visually without altering the
// numbers shown in the properties panel.
function palletRenderDims(p) {
  return p.dir === 'N' ? { rw: p.d, rd: p.w } : { rw: p.w, rd: p.d };
}

// Grid-snap only aligns a pallet's corner to the grid — it says nothing
// about where a *neighboring* object's edge actually is, so placing a
// pallet next to a zone or another pallet whose size isn't a multiple of
// the grid leaves a sliver of overlap or gap (this is what looked like
// "the dimensions changed" — they never did, the edges just didn't meet).
// While dragging a pallet, additionally pull its edges flush against any
// zone/pallet edge within EDGE_SNAP_DIST, independent of the grid.
const EDGE_SNAP_DIST = 0.15; // metres
function edgeSnapPallet(draggedPallet, rawX, rawY) {
  const { rw, rd } = palletRenderDims(draggedPallet);
  const edges = []; // { x0,x1,y0,y1 } footprints of everything else on the floor
  (state.zones || []).forEach((z) => edges.push({ x0: z.x, x1: z.x + z.w, y0: z.y, y1: z.y + z.d }));
  (state.pallets || []).forEach((op) => {
    if (op === draggedPallet) return;
    const d = palletRenderDims(op);
    edges.push({ x0: op.x, x1: op.x + d.rw, y0: op.y, y1: op.y + d.rd });
  });

  let x = rawX;
  let y = rawY;
  let bestXDist = EDGE_SNAP_DIST;
  let bestYDist = EDGE_SNAP_DIST;
  for (const e of edges) {
    for (const edgeX of [e.x0, e.x1]) {
      const dLeft = Math.abs(rawX - edgeX);
      if (dLeft < bestXDist) {
        bestXDist = dLeft;
        x = edgeX;
      }
      const dRight = Math.abs(rawX + rw - edgeX);
      if (dRight < bestXDist) {
        bestXDist = dRight;
        x = edgeX - rw;
      }
    }
    for (const edgeY of [e.y0, e.y1]) {
      const dBottom = Math.abs(rawY - edgeY);
      if (dBottom < bestYDist) {
        bestYDist = dBottom;
        y = edgeY;
      }
      const dTop = Math.abs(rawY + rd - edgeY);
      if (dTop < bestYDist) {
        bestYDist = dTop;
        y = edgeY - rd;
      }
    }
  }
  return { x, y };
}

function drawPallet(p, selected, z) {
  const { rw, rd } = palletRenderDims(p);
  const x = sx(p.x);
  const y = sy(p.y + rd);
  const w = rw * z;
  const h = rd * z;

  // Deck (top boards) base color — pale wood.
  ctx.fillStyle = '#c9a06b';
  ctx.strokeStyle = selected ? '#5fa8e8' : '#7a5a35';
  ctx.lineWidth = 1.5; // constant regardless of selection — see zones above
  ctx.fillRect(x, y, w, h);

  // Support blocks (3x3), drawn first/darker so slats appear to sit on them.
  ctx.fillStyle = '#5c4326';
  const blockW = w * 0.14;
  const blockH = h * 0.14;
  for (let bi = 0; bi < 3; bi++) {
    for (let bj = 0; bj < 3; bj++) {
      const bx = x + (bi / 2) * (w - blockW);
      const by = y + (bj / 2) * (h - blockH);
      ctx.fillRect(bx, by, blockW, blockH);
    }
  }

  // Deck slats, each with a thin gap so the blocks peek through — drawn
  // relative to the (dir-aware) render width/height above, so they turn
  // with the footprint automatically when rotated.
  ctx.fillStyle = '#c9a06b';
  ctx.strokeStyle = '#a37b48';
  ctx.lineWidth = 1;
  const slatCount = Math.max(3, Math.round(rw / 0.14));
  const slatPitch = w / slatCount;
  const slatW = slatPitch * 0.72;
  for (let i = 0; i < slatCount; i++) {
    const sxPos = x + i * slatPitch + (slatPitch - slatW) / 2;
    ctx.fillRect(sxPos, y, slatW, h);
    ctx.strokeRect(sxPos, y, slatW, h);
  }

  ctx.strokeStyle = selected ? '#5fa8e8' : '#7a5a35';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  if (isHovered(p)) {
    ctx.fillStyle = '#3a2c17';
    ctx.font = `600 ${Math.max(10, z * 2.4)}px Consolas`;
    ctx.fillText(p.id, x + 4, y + Math.max(12, z * 2.6));
    ctx.font = `${Math.max(9, z * 2)}px Consolas`;
    ctx.fillText(
      `${formatLength(p.w)}×${formatLength(p.d)}×${formatLength(p.h)}`,
      x + 4,
      y + Math.max(24, z * 5),
    );
    const assigned = findAssignment('pallet', p.id, 'A');
    ctx.fillText(
      assigned ? assigned.product_name : 'No product linked',
      x + 4,
      y + Math.max(36, z * 7.4),
    );
  }
}

// ---------- persistence (debounced draft cache + saved flag) ----------
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      saveLayout(state);
      flagSaved('saved');
    } catch {
      flagSaved('not saved — export!', true);
    }
  }, 400);
}
function flagSaved(text, warn) {
  const el = document.getElementById('savedFlag');
  el.textContent = text;
  el.style.color = warn ? 'var(--node)' : 'var(--ok)';
  if (!warn) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 2200);
  }
}

function loadBgImage() {
  if (state.bg && state.bg.dataURL) {
    bgImage = new Image();
    bgImage.onload = draw;
    bgImage.src = state.bg.dataURL;
  } else {
    bgImage = null;
  }
}

// ---------- canvas sizing ----------
function resize() {
  cv.width = cv.clientWidth * devicePixelRatio;
  cv.height = cv.clientHeight * devicePixelRatio;
  draw();
}

// ---------- draw ----------
function draw() {
  if (mode3d) return;
  const W = cv.width;
  const H = cv.height;
  const z = view.zoom * devicePixelRatio;
  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, W, H);

  if (bgImage && state.bg) {
    ctx.save();
    ctx.globalAlpha = (state.bg.opacity ?? 35) / 100;
    const s = state.bg.mPerPx * z;
    ctx.translate(sx(state.bg.ox), sy(state.bg.oy + bgImage.height * state.bg.mPerPx));
    ctx.scale(s, s);
    ctx.drawImage(bgImage, 0, 0);
    ctx.restore();
  }

  const g = +state.settings.grid || 10;
  const x0 = Math.floor(wx(0) / g) * g;
  const x1 = wx(cv.clientWidth);
  const y1 = Math.floor(wy(cv.clientHeight) / g) * g;
  const y0 = wy(0);
  ctx.strokeStyle = '#212931';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += g) {
    ctx.moveTo(sx(x), 0);
    ctx.lineTo(sx(x), H);
  }
  for (let y = y1; y <= y0; y += g) {
    ctx.moveTo(0, sy(y));
    ctx.lineTo(W, sy(y));
  }
  ctx.stroke();
  ctx.strokeStyle = '#3a4654';
  ctx.beginPath();
  ctx.moveTo(sx(0), 0);
  ctx.lineTo(sx(0), H);
  ctx.moveTo(0, sy(0));
  ctx.lineTo(W, sy(0));
  ctx.stroke();

  // origin axes at (0,0): +x = East (screen right), +y = North (screen up)
  const dpr = devicePixelRatio;
  const aLen = 56 * dpr;
  const ox = sx(0);
  const oy = sy(0);
  drawArrow(ox, oy, ox + aLen, oy, '#d4453a');
  drawArrow(ox, oy, ox, oy - aLen, '#5fb878');
  ctx.font = `600 ${12 * dpr}px Consolas`;
  ctx.fillStyle = '#d4453a';
  ctx.fillText('x → E', ox + aLen + 4 * dpr, oy + 4 * dpr);
  ctx.fillStyle = '#5fb878';
  ctx.fillText('y ↑ N', ox + 5 * dpr, oy - aLen - 5 * dpr);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ox, oy, 3 * dpr, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#aeb8c2';
  ctx.font = `${11 * dpr}px Consolas`;
  ctx.fillText('0,0', ox + 7 * dpr, oy + 15 * dpr);

  // fixed north compass, top-right of the canvas (north is always screen-up in 2D)
  const cxp = W - 40 * dpr;
  const cyp = 50 * dpr;
  drawArrow(cxp, cyp + 20 * dpr, cxp, cyp - 20 * dpr, '#5fb878');
  ctx.fillStyle = '#9fb4cf';
  ctx.font = `600 ${14 * dpr}px Consolas`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cxp, cyp - 26 * dpr);
  ctx.textAlign = 'left';

  state.zones.forEach((zn) => {
    const seld = sel && sel.kind === 'zone' && sel.obj === zn;
    ctx.fillStyle = zn.color + '55';
    ctx.strokeStyle = seld ? '#5fa8e8' : zn.color;
    // Same lineWidth whether selected or not — strokeRect draws centered on
    // the path, so a thicker selected border bleeds outward and makes the
    // rectangle visibly grow. Selection is shown by color alone.
    ctx.lineWidth = 1.5;
    const x = sx(zn.x);
    const y = sy(zn.y + zn.d);
    const w = zn.w * z;
    const h = zn.d * z;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    if (isHovered(zn)) {
      ctx.fillStyle = '#eef2f6';
      ctx.font = `600 ${Math.max(12, z * 4)}px Consolas`;
      ctx.fillText('ZONE ' + zn.id, x + 8, y + Math.max(16, z * 5));
      ctx.fillStyle = '#9aa6b3';
      ctx.font = `${Math.max(10, z * 2.4)}px Consolas`;
      ctx.fillText(
        `${formatLength(zn.w)}×${formatLength(zn.d)}  elev ${formatLength(zn.elev)}`,
        x + 8,
        y + Math.max(30, z * 8.4),
      );
    }
  });

  (state.pallets || []).forEach((p) => {
    const seld = sel && sel.kind === 'pallet' && sel.obj === p;
    drawPallet(p, seld, z);
  });

  state.racks.forEach((r) => {
    const t = state.binTypes[r.type] || { w: 4, d: 4, color: '#888' };
    const seld = sel && sel.kind === 'rack' && sel.obj === r;
    for (let b = 0; b < r.bays; b++) {
      let bx = r.x;
      let by = r.y;
      let bw;
      let bd;
      if (r.dir === 'E') {
        bx += b * t.w;
        bw = t.w;
        bd = t.d;
      } else {
        by += b * t.w;
        bw = t.d;
        bd = t.w;
      }
      ctx.fillStyle = t.color + (seld ? 'cc' : '88');
      ctx.strokeStyle = seld ? '#5fa8e8' : '#10141a';
      ctx.lineWidth = 1;
      ctx.fillRect(sx(bx), sy(by + bd), bw * z, bd * z);
      ctx.strokeRect(sx(bx), sy(by + bd), bw * z, bd * z);
      if (selBay && selBay.rack === r && selBay.bayIndex === b) {
        ctx.strokeStyle = '#ffe580';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx(bx) + 1, sy(by + bd) + 1, bw * z - 2, bd * z - 2);
        if (z >= 3) {
          ctx.fillStyle = '#ffe580';
          ctx.font = `700 ${Math.max(9, z * 2)}px Consolas`;
          ctx.textAlign = 'left';
          ctx.fillText(resolveBayLabel(state, r, b), sx(bx) + 4, sy(by + bd) + Math.max(12, z * 2.5));
        }
      }
    }
    if (isHovered(r)) {
      ctx.fillStyle = seld ? '#5fa8e8' : '#cfd8e2';
      ctx.font = `600 ${Math.max(11, z * 2.6)}px Consolas`;
      const dOff = r.dir === 'E' ? z * (state.binTypes[r.type]?.d || 4) : 0;
      let ty = sy(r.y) + Math.max(13, z * 3.2) + dOff + 12;
      if (hoverBay != null) {
        ctx.fillText(`${resolveBayLabel(state, r, hoverBay)} — ${r.type}`, sx(r.x), ty);
        ctx.font = `${Math.max(9, z * 2)}px Consolas`;
        ctx.fillStyle = '#9aa6b3';
        binsInBay(r, hoverBay).forEach((b) => {
          // Keyed by whse_location, not override_key — matches how the rack
          // panel's bin-product-sel dropdowns save assignments (see data-loc).
          const l = findAssignment('bin', b.whse_location, 'L');
          const rt = findAssignment('bin', b.whse_location, 'R');
          ty += Math.max(12, z * 2.6);
          ctx.fillText(
            `L${b.level}: ${l ? l.product_name : '—'} / ${rt ? rt.product_name : '—'}`,
            sx(r.x),
            ty,
          );
        });
      } else {
        ctx.fillText(`${r.id} ×${r.bays} L${r.levels} ${r.type}`, sx(r.x), ty);
      }
    }
  });

  state.edges.forEach((ed) => {
    const a = state.nodes.find((n) => n.id === ed.a);
    const b = state.nodes.find((n) => n.id === ed.b);
    if (!a || !b) return;
    const seld = sel && sel.kind === 'edge' && sel.obj === ed;
    ctx.strokeStyle = seld ? '#5fa8e8' : ed.ramp ? '#e8a33d' : '#7f8a96';
    ctx.lineWidth = seld ? 4 : 2;
    ctx.setLineDash(ed.ramp ? [8, 5] : []);
    ctx.beginPath();
    ctx.moveTo(sx(a.x), sy(a.y));
    ctx.lineTo(sx(b.x), sy(b.y));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  state.nodes.forEach((n) => {
    const seld = sel && sel.kind === 'node' && sel.obj === n;
    const pend = pendingEdgeNode === n;
    const sized = (n.kind === 'door' || n.kind === 'dock') && n.w;
    ctx.fillStyle = n.kind === 'dock' ? '#3d8fe8' : n.kind === 'ramp' ? '#e8a33d' : '#d4453a';
    ctx.strokeStyle = seld || pend ? '#5fa8e8' : '#10141a';
    ctx.lineWidth = seld || pend ? 3 : 1.5;
    ctx.beginPath();
    // Radius scales with opening width for door/dock nodes so the marker's
    // size actually reflects n.w, but it stays a circle (never a rectangle).
    const r = sized ? Math.max(5, (n.w / 2) * z) : Math.max(5, z * 1.0);
    ctx.arc(sx(n.x), sy(n.y), r, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (isHovered(n)) {
      ctx.fillStyle = '#ffb3ab';
      ctx.font = `${Math.max(10, z * 2.2)}px Consolas`;
      ctx.fillText(n.id, sx(n.x) + 8, sy(n.y) - 8);
    }
  });

  if (dragDraw) {
    ctx.strokeStyle = '#5fa8e8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (tool === 'zone') {
      const x = Math.min(dragDraw.x0, dragDraw.x1);
      const y = Math.max(dragDraw.y0, dragDraw.y1);
      ctx.strokeRect(
        sx(x),
        sy(y),
        Math.abs(dragDraw.x1 - dragDraw.x0) * z,
        Math.abs(dragDraw.y1 - dragDraw.y0) * z,
      );
    } else if (tool === 'rack') {
      ctx.beginPath();
      ctx.moveTo(sx(dragDraw.x0), sy(dragDraw.y0));
      ctx.lineTo(sx(dragDraw.x1), sy(dragDraw.y1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (calClicks.length === 1) {
    ctx.fillStyle = '#5fa8e8';
    ctx.beginPath();
    ctx.arc(calClicks[0].px * devicePixelRatio, calClicks[0].py * devicePixelRatio, 6, 0, 7);
    ctx.fill();
  }
}

// ---------- tools ----------
function setHint(t) {
  toolHint.textContent = t;
  toolHint.style.display = t ? 'block' : 'none';
}
function setTool(t) {
  tool = t;
  pendingEdgeNode = null;
  dragDraw = null;
  selBay = null;
  calMode = false;
  calClicks = [];
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  const hints = {
    zone: 'Drag a rectangle for the new zone',
    rack: 'Drag along the row direction — bays auto-fill',
    node: 'Click to place a node (door, dock, junction…)',
    edge: 'Click first node, then second node',
    pallet: 'Click to place a pallet',
    pan: 'Drag anywhere to pan the view',
    delete: 'Click anything to delete it',
  };
  setHint(hints[t] || '');
  // 'grab' hints that dragging pans (Pan tool) or moves an object (Select
  // tool); swapped for 'grabbing' while a pan or move is actually happening.
  cv.style.cursor = t === 'select' || t === 'pan' ? 'grab' : 'crosshair';
  // Same Pan tool drives the 3D view too: a plain left-drag pans there
  // instead of orbiting, so panning a zoomed-in 3D scene doesn't require
  // remembering right-click or shift-drag.
  if (mode3d) preview.setPanMode(t === 'pan');
  draw();
}

function hitTest(x, y) {
  const tol = 8 / view.zoom;
  for (const n of state.nodes) {
    if (Math.hypot(n.x - x, n.y - y) < tol) return { kind: 'node', obj: n };
  }
  for (const ed of state.edges) {
    const a = state.nodes.find((n) => n.id === ed.a);
    const b = state.nodes.find((n) => n.id === ed.b);
    if (a && b && ptSegDist(x, y, a.x, a.y, b.x, b.y) < tol * 0.8) return { kind: 'edge', obj: ed };
  }
  for (const r of [...state.racks].reverse()) {
    const t = state.binTypes[r.type] || { w: 4, d: 4 };
    const w = r.dir === 'E' ? r.bays * t.w : t.d;
    const d = r.dir === 'E' ? t.d : r.bays * t.w;
    if (x >= r.x && x <= r.x + w && y >= r.y && y <= r.y + d) return { kind: 'rack', obj: r };
  }
  for (const p of [...(state.pallets || [])].reverse()) {
    const { rw, rd } = palletRenderDims(p);
    if (x >= p.x && x <= p.x + rw && y >= p.y && y <= p.y + rd) return { kind: 'pallet', obj: p };
  }
  for (const zn of [...state.zones].reverse()) {
    if (x >= zn.x && x <= zn.x + zn.w && y >= zn.y && y <= zn.y + zn.d) return { kind: 'zone', obj: zn };
  }
  return null;
}

function deleteSelected() {
  if (!sel) return;
  if (sel.kind === 'zone') state.zones = state.zones.filter((z) => z !== sel.obj);
  if (sel.kind === 'rack') state.racks = state.racks.filter((r) => r !== sel.obj);
  if (sel.kind === 'pallet') state.pallets = (state.pallets || []).filter((p) => p !== sel.obj);
  if (sel.kind === 'edge') state.edges = state.edges.filter((ed) => ed !== sel.obj);
  if (sel.kind === 'node') {
    state.edges = state.edges.filter((ed) => ed.a !== sel.obj.id && ed.b !== sel.obj.id);
    state.nodes = state.nodes.filter((n) => n !== sel.obj);
  }
  sel = null;
  save();
  renderProps();
  draw();
}

function nextZoneId() {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!state.zones.some((z) => z.id === c)) return c;
  }
  return 'Z' + state.zones.length;
}
function nextRackId() {
  let i = 1;
  while (state.racks.some((r) => r.id === 'ROW-' + i)) i++;
  return 'ROW-' + i;
}
function nextPalletId() {
  let i = 1;
  while ((state.pallets || []).some((p) => p.id === 'PLT-' + i)) i++;
  return 'PLT-' + i;
}
function nextNodeId(kind) {
  let i = 1;
  const p = kind.toUpperCase();
  while (state.nodes.some((n) => n.id === `${p}-${i}`)) i++;
  return `${p}-${i}`;
}
function randColor() {
  const cs = ['#4a5a72', '#55657d', '#4f6a63', '#5d6f55', '#6d5f4e', '#6b5a66', '#5a6b8a', '#6e5a4a'];
  return cs[Math.floor(Math.random() * cs.length)];
}

// ---------- properties panel ----------
function f(label, html) {
  return `<div class="field"><label>${label}</label>${html}</div>`;
}
function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', (e) => {
      fn(e.target.value);
      save();
      draw();
    });
  }
}
function bindNum(id, key, obj, int) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', (e) => {
      const v = int ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
      if (!Number.isNaN(v)) {
        obj[key] = v;
        save();
        draw();
      }
    });
  }
}

// Length fields (metres, feet, or feet'inches" depending on the current unit
// setting — see units.js). obj[key] is always stored in metres; the input
// shows/accepts whatever unit the user picked. Reformats to a clean display
// string on blur, so "5'6" typed while zoomed in still tidies up once you
// tab away, without fighting the cursor mid-keystroke.
function bindLength(id, key, obj) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', (e) => {
    const v = parseLength(e.target.value);
    if (!Number.isNaN(v)) {
      obj[key] = v;
      save();
      draw();
    }
  });
  el.addEventListener('blur', () => {
    el.value = displayValue(obj[key]);
  });
}

function renderProps() {
  if (!sel) {
    props.innerHTML = `<h2>Properties</h2>
      <div class="hintline">Nothing selected. Click an object with the Select tool,
      or use the toolbar to add zones, rack rows, nodes, and path edges.</div>
      <div class="field"><label>Building</label>
        <input type="text" id="p_bname" value="${state.meta.name}"></div>`;
    bind('p_bname', (v) => {
      state.meta.name = v;
    });
    return;
  }
  const o = sel.obj;
  if (sel.kind === 'zone') {
    props.innerHTML =
      `<h2>Zone</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f('SW x', `<input type="text" id="p_x" value="${displayValue(o.x)}">`) +
      f('SW y', `<input type="text" id="p_y" value="${displayValue(o.y)}">`) +
      f('Width E-W', `<input type="text" id="p_w" value="${displayValue(o.w)}">`) +
      f('Depth N-S', `<input type="text" id="p_d" value="${displayValue(o.d)}">`) +
      f('Floor elev', `<input type="text" id="p_elev" value="${displayValue(o.elev)}">`) +
      f('Clear ht', `<input type="text" id="p_ch" value="${displayValue(o.clearH)}">`) +
      f('Color', `<input type="color" id="p_col" value="${o.color}">`) +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete zone</button></div>`;
    bindLength('p_x', 'x', o);
    bindLength('p_y', 'y', o);
    bindLength('p_w', 'w', o);
    bindLength('p_d', 'd', o);
    bindLength('p_elev', 'elev', o);
    bindLength('p_ch', 'clearH', o);
    bind('p_id', (v) => {
      o.id = v;
    });
    bind('p_col', (v) => {
      o.color = v;
    });
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'node') {
    const sized = o.kind === 'door' || o.kind === 'dock';
    if (sized && o.dir !== 'E' && o.dir !== 'N') o.dir = 'E';
    props.innerHTML =
      `<h2>Node</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f(
        'Kind',
        `<select id="p_kind">
        ${['door', 'ramp', 'junction', 'dock', 'staging', 'charge']
          .map((k) => `<option ${o.kind === k ? 'selected' : ''}>${k}</option>`)
          .join('')}</select>`,
      ) +
      f('x', `<input type="text" id="p_x" value="${displayValue(o.x)}">`) +
      f('y', `<input type="text" id="p_y" value="${displayValue(o.y)}">`) +
      (sized
        ? f(
            'Door type',
            `<select id="p_doortype">
            ${Object.entries(DOOR_PRESETS)
              .map(([k, p]) => `<option value="${k}" ${o.doorType === k ? 'selected' : ''}>${p.label}</option>`)
              .join('')}</select>`,
          ) +
          f('Opening width', `<input type="text" id="p_w" value="${displayValue(o.w ?? 3)}">`) +
          f('Clear height', `<input type="text" id="p_h" value="${displayValue(o.h ?? 3)}">`) +
          f(
            'Orientation',
            `<select id="p_dir">
            <option ${o.dir === 'E' ? 'selected' : ''} value="E">Faces E/W (opening runs N/S)</option>
            <option ${o.dir === 'N' ? 'selected' : ''} value="N">Faces N/S (opening runs E/W)</option></select>`,
          )
        : '') +
      `<div class="hintline">Zone is auto-detected from position at export time.</div>` +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete node</button></div>`;
    bindLength('p_x', 'x', o);
    bindLength('p_y', 'y', o);
    bind('p_kind', (v) => {
      o.kind = v;
      if ((v === 'door' || v === 'dock') && o.w == null) {
        o.w = DOOR_PRESETS[o.doorType ?? 'roller']?.w ?? 3;
        o.h = DOOR_PRESETS[o.doorType ?? 'roller']?.h ?? 3;
        o.dir = o.dir ?? 'E';
      }
      renderProps();
    });
    bind('p_id', (v) => {
      state.edges.forEach((ed) => {
        if (ed.a === o.id) ed.a = v;
        if (ed.b === o.id) ed.b = v;
      });
      o.id = v;
    });
    if (sized) {
      bindLength('p_w', 'w', o);
      bindLength('p_h', 'h', o);
      bind('p_dir', (v) => {
        o.dir = v;
      });
      document.getElementById('p_doortype').onchange = (e) => {
        o.doorType = e.target.value;
        const preset = DOOR_PRESETS[o.doorType];
        if (preset && preset.w != null) {
          o.w = preset.w;
          o.h = preset.h;
        }
        save();
        renderProps();
        draw();
      };
    }
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'edge') {
    props.innerHTML =
      `<h2>Path edge</h2>` +
      f('From', `<input type="text" value="${o.a}" disabled>`) +
      f('To', `<input type="text" value="${o.b}" disabled>`) +
      f('Ramp', `<input type="checkbox" id="p_ramp" ${o.ramp ? 'checked' : ''}>`) +
      `<div class="hintline">Length is computed from node coordinates.</div>` +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete edge</button></div>`;
    document.getElementById('p_ramp').onchange = (e) => {
      o.ramp = e.target.checked;
      save();
      draw();
    };
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'pallet') {
    if (o.dir !== 'E' && o.dir !== 'N') o.dir = 'E';
    props.innerHTML =
      `<h2>Pallet</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f('SW x', `<input type="text" id="p_x" value="${displayValue(o.x)}">`) +
      f('SW y', `<input type="text" id="p_y" value="${displayValue(o.y)}">`) +
      f('Width', `<input type="text" id="p_w" value="${displayValue(o.w)}">`) +
      f('Depth', `<input type="text" id="p_d" value="${displayValue(o.d)}">`) +
      f('Height', `<input type="text" id="p_h" value="${displayValue(o.h)}">`) +
      f(
        'Orientation',
        `<select id="p_dir">
        <option ${o.dir === 'E' ? 'selected' : ''} value="E">0°</option>
        <option ${o.dir === 'N' ? 'selected' : ''} value="N">90° (rotated)</option></select>`,
      ) +
      f(
        'Product',
        `<select id="p_product">${productOptionsHtml(findAssignment('pallet', o.id, 'A')?.product_id)}</select>`,
      ) +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete pallet</button></div>`;
    bindLength('p_x', 'x', o);
    bindLength('p_y', 'y', o);
    bindLength('p_w', 'w', o);
    bindLength('p_d', 'd', o);
    bindLength('p_h', 'h', o);
    bind('p_id', (v) => {
      o.id = v;
    });
    document.getElementById('p_dir').onchange = (e) => {
      // Rotates the footprint visually (see palletRenderDims) — the stored
      // Width/Depth numbers themselves never change.
      o.dir = e.target.value;
      save();
      draw();
    };
    document.getElementById('p_product').onchange = (e) => {
      onAssignmentPickerChange('pallet', o.id, 'A', e.target.value);
    };
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'rack') {
    // Guards: ensure v4 fields exist (in-flight data may be mid-migration)
    if (!Array.isArray(o.levelHeights) || o.levelHeights.length !== o.levels) {
      const t = state.binTypes[o.type];
      const defH = t && t.h > 0 ? t.h : 0.12;
      o.levelHeights = Array.from({ length: Math.max(o.levels, 1) }, (_, i) => o.levelHeights?.[i] ?? defH);
    }
    if (!o.rowToken) o.rowToken = o.id.replace(/^[^-]+-/, '');
    if (!Number.isInteger(o.bayStart) || o.bayStart < 1) o.bayStart = 1;
    if (typeof o.bayReverse !== 'boolean') o.bayReverse = false;
    if (!state.binOverrides || typeof state.binOverrides !== 'object') state.binOverrides = {};

    const lhFields = o.levelHeights
      .map((h, i) => f(`Level ${i + 1} ht`, `<input type="text" id="p_lh_${i}" value="${displayValue(h)}">`))
      .join('');

    // Bin label overrides — collapsible, rendered via <details>
    const rackBins = expandBins(state).filter((b) => b.row === o.id);
    const binovrRows = rackBins
      .map((b) => {
        const cur = state.binOverrides[b.override_key] ?? '';
        return `<div class="binovr-row">
          <span class="binovr-gen">${b.override_key in state.binOverrides ? '✎' : ''} ${b.bin_label}</span>
          <input type="text" class="binovr-inp" data-key="${b.override_key}"
            value="${cur}" placeholder="${b.bin_label}">
        </div>`;
      })
      .join('');

    const selBayBlo = selBay && selBay.rack === o ? (o.bayLevelOverrides || {})[selBay.bayIndex] : null;
    const selBayLevels = selBayBlo ? selBayBlo.levels : o.levels;
    const bayReadout =
      selBay && selBay.rack === o
        ? `<div class="hintline bay-readout">Bay: <strong>${resolveBayLabel(state, o, selBay.bayIndex)}</strong>&ensp;&middot;&ensp;${selBayLevels} level${selBayLevels !== 1 ? 's' : ''}${selBayBlo ? ' <em>(override)</em>' : ''}&ensp;&middot;&ensp;click another bay to update</div>`
        : '';

    props.innerHTML =
      `<h2>Rack row</h2>` +
      bayReadout +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f(
        'Bin type',
        `<select id="p_type">
        ${Object.keys(state.binTypes)
          .map((k) => `<option ${o.type === k ? 'selected' : ''}>${k}</option>`)
          .join('')}</select>`,
      ) +
      f(
        'Direction',
        `<select id="p_dir">
        <option ${o.dir === 'E' ? 'selected' : ''} value="E">E — bays run east</option>
        <option ${o.dir === 'N' ? 'selected' : ''} value="N">N — bays run north</option></select>`,
      ) +
      f('Bays', `<input type="number" id="p_bays" value="${o.bays}" min="1" step="1">`) +
      f('Levels', `<input type="number" id="p_lv" value="${o.levels}" min="1" step="1">`) +
      lhFields +
      f('Row token', `<input type="text" id="p_rt" value="${o.rowToken}">`) +
      f('Bay start', `<input type="number" id="p_bs" value="${o.bayStart}" min="1" step="1">`) +
      f('Bay reverse', `<input type="checkbox" id="p_br" ${o.bayReverse ? 'checked' : ''}>`) +
      f('Start x', `<input type="text" id="p_x" value="${displayValue(o.x)}">`) +
      f('Start y', `<input type="text" id="p_y" value="${displayValue(o.y)}">`) +
      `<div class="hintline">Bins generate as ROW-BAY-LEVEL at export (whse_location).</div>` +
      `<details><summary>Edit bin labels (${rackBins.length} bins)</summary>` +
      `<div class="binovr-scroll" id="p_binovr">${binovrRows}</div></details>` +
      (() => {
        if (!selBay || selBay.rack !== o) return '';
        const blo = (o.bayLevelOverrides || {})[selBay.bayIndex];
        const bayLabel = resolveBayLabel(state, o, selBay.bayIndex);
        const effLevels = blo ? blo.levels : o.levels;
        const effHeights = blo ? blo.levelHeights : [...o.levelHeights];
        const heightFields = effHeights
          .map((h, i) => f(`Level ${i + 1} height`, `<input type="text" id="p_bov_h_${i}" value="${displayValue(h)}">`))
          .join('');
        return (
          `<details id="p_bay_ov"${blo ? ' open' : ''}>` +
          `<summary>Override bay ${bayLabel} levels</summary>` +
          f('Override levels', `<input type="number" id="p_bov_lv" value="${effLevels}" min="1" step="1">`) +
          heightFields +
          `<div class="btnrow">` +
          (blo ? `<button class="btn small" id="p_bov_clear">Remove override</button>` : '') +
          `</div></details>`
        );
      })() +
      (() => {
        if (!selBay || selBay.rack !== o) return '';
        const bins = binsInBay(o, selBay.bayIndex);
        if (!bins.length) return '';
        const rows = bins
          .map((b) => {
            const l = findAssignment('bin', b.whse_location, 'L');
            const r = findAssignment('bin', b.whse_location, 'R');
            return (
              `<div class="bin-product-row">` +
              `<span class="bin-product-label">${b.whse_location}</span>` +
              `<select class="bin-product-sel" data-loc="${b.whse_location}" data-slot="L">${productOptionsHtml(l?.product_id)}</select>` +
              `<select class="bin-product-sel" data-loc="${b.whse_location}" data-slot="R">${productOptionsHtml(r?.product_id)}</select>` +
              `</div>`
            );
          })
          .join('');
        return (
          `<details open><summary>Products in this bay (${bins.length} bin${bins.length !== 1 ? 's' : ''})</summary>` +
          `<div class="hintline">L / R = two independent slots per bin.</div>` +
          `<div id="p_bin_products">${rows}</div></details>`
        );
      })() +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete row</button></div>`;

    bindLength('p_x', 'x', o);
    bindLength('p_y', 'y', o);
    bindNum('p_bays', 'bays', o, true);
    bindNum('p_bs', 'bayStart', o, true);

    // Custom levels handler: resize levelHeights to stay in sync with levels count
    const lvEl = document.getElementById('p_lv');
    if (lvEl) {
      lvEl.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isNaN(v) || v < 1) return;
        const oldLen = o.levelHeights.length;
        if (v > oldLen) {
          const lastH = o.levelHeights[oldLen - 1] ?? (state.binTypes[o.type]?.h || 0.12);
          for (let i = oldLen; i < v; i++) o.levelHeights.push(lastH);
        } else {
          o.levelHeights.length = v;
        }
        o.levels = v;
        save();
        renderProps();
        draw();
      });
    }
    o.levelHeights.forEach((_, i) => {
      const lhEl = document.getElementById(`p_lh_${i}`);
      if (lhEl) {
        lhEl.addEventListener('input', (e) => {
          const v = parseLength(e.target.value);
          if (!Number.isNaN(v) && v > 0) {
            o.levelHeights[i] = v;
            save();
            draw();
          }
        });
        lhEl.addEventListener('blur', () => {
          lhEl.value = displayValue(o.levelHeights[i]);
        });
      }
    });

    // Per-bay level override controls
    if (selBay && selBay.rack === o) {
      const blo = (o.bayLevelOverrides || {})[selBay.bayIndex];
      const effHeights = blo ? blo.levelHeights : [...o.levelHeights];

      const bovLvEl = document.getElementById('p_bov_lv');
      if (bovLvEl) {
        bovLvEl.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isNaN(v) || v < 1) return;
          if (!o.bayLevelOverrides) o.bayLevelOverrides = {};
          const curBlo = o.bayLevelOverrides[selBay.bayIndex];
          const curHeights = curBlo ? curBlo.levelHeights : [...o.levelHeights];
          const defH = curHeights[curHeights.length - 1] ?? o.levelHeights[o.levelHeights.length - 1] ?? 6;
          const newHeights = Array.from({ length: v }, (_, i) => curHeights[i] ?? defH);
          o.bayLevelOverrides[selBay.bayIndex] = { levels: v, levelHeights: newHeights };
          save();
          renderProps();
          draw();
        });
      }

      effHeights.forEach((_, i) => {
        const hEl = document.getElementById(`p_bov_h_${i}`);
        if (hEl) {
          hEl.addEventListener('input', (e) => {
            const v = parseLength(e.target.value);
            if (Number.isNaN(v) || v <= 0) return;
            if (!o.bayLevelOverrides) o.bayLevelOverrides = {};
            if (!o.bayLevelOverrides[selBay.bayIndex]) {
              o.bayLevelOverrides[selBay.bayIndex] = { levels: o.levels, levelHeights: [...o.levelHeights] };
            }
            o.bayLevelOverrides[selBay.bayIndex].levelHeights[i] = v;
            save();
            draw();
          });
          hEl.addEventListener('blur', () => {
            const blo2 = (o.bayLevelOverrides || {})[selBay.bayIndex];
            const h = blo2 ? blo2.levelHeights[i] : o.levelHeights[i];
            hEl.value = displayValue(h);
          });
        }
      });

      const bovClearEl = document.getElementById('p_bov_clear');
      if (bovClearEl) {
        bovClearEl.addEventListener('click', () => {
          if (o.bayLevelOverrides) delete o.bayLevelOverrides[selBay.bayIndex];
          save();
          renderProps();
          draw();
        });
      }
    }

    // Bin label overrides — event delegation on the scroll container
    const binovrEl = document.getElementById('p_binovr');
    if (binovrEl) {
      binovrEl.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        if (!key) return;
        const v = e.target.value.trim();
        if (v) {
          state.binOverrides[key] = v;
        } else {
          delete state.binOverrides[key];
        }
        save();
      });
    }

    bind('p_id', (v) => {
      o.id = v;
    });
    bind('p_rt', (v) => {
      o.rowToken = v;
    });
    bind('p_type', (v) => {
      o.type = v;
    });
    bind('p_dir', (v) => {
      o.dir = v;
    });
    const brEl = document.getElementById('p_br');
    if (brEl) {
      brEl.addEventListener('change', (e) => {
        o.bayReverse = e.target.checked;
        save();
        draw();
      });
    }
    document.querySelectorAll('.bin-product-sel').forEach((selEl) => {
      selEl.addEventListener('change', (e) => {
        onAssignmentPickerChange('bin', e.target.dataset.loc, e.target.dataset.slot, e.target.value);
      });
    });
    document.getElementById('p_del').onclick = deleteSelected;
  }
}

// ---------- bin types panel ----------
function renderBinTypes() {
  const box = document.getElementById('binTypeList');
  box.innerHTML = '';
  Object.entries(state.binTypes).forEach(([name, t]) => {
    const row = document.createElement('div');
    row.className = 'bt-row';
    row.innerHTML = `
      <input type="text" value="${name}" data-f="name">
      <input type="text" value="${displayValue(t.w)}" data-f="w">
      <input type="text" value="${displayValue(t.d)}" data-f="d">
      <input type="text" value="${displayValue(t.h)}" data-f="h">
      <input type="color" value="${t.color}" data-f="color">
      <span class="lib" title="Save to persistent library — makes this bin type available in every layout">⇪</span>
      <span class="x" title="delete">×</span>`;
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const field = inp.dataset.f;
        if (field === 'name') {
          const nv = inp.value.trim().toUpperCase() || name;
          if (nv !== name) {
            state.binTypes[nv] = state.binTypes[name];
            delete state.binTypes[name];
            state.racks.forEach((r) => {
              if (r.type === name) r.type = nv;
            });
            renderBinTypes();
            renderProps();
          }
        } else if (field === 'color') {
          state.binTypes[name].color = inp.value;
        } else {
          const v = parseLength(inp.value);
          state.binTypes[name][field] = Number.isNaN(v) ? 0 : v;
          inp.value = displayValue(state.binTypes[name][field]);
        }
        save();
        draw();
      });
    });
    row.querySelector('.lib').onclick = async () => {
      const libBtn = row.querySelector('.lib');
      const cur = state.binTypes[name];
      try {
        libBtn.textContent = '…';
        await saveBinTypeToLibrary(name, cur);
        libBtn.textContent = '✓';
        setTimeout(() => {
          libBtn.textContent = '⇪';
        }, 1200);
      } catch (err) {
        libBtn.textContent = '⇪';
        alert('Could not save to library: ' + err.message);
      }
    };
    row.querySelector('.x').onclick = async () => {
      if (state.racks.some((r) => r.type === name)) {
        alert('Rows still use this type.');
        return;
      }
      delete state.binTypes[name];
      renderBinTypes();
      save();
      draw();
    };
    box.appendChild(row);
  });
}

// ---------- background image ----------
function updateBgInfo() {
  document.getElementById('bgInfo').textContent = state.bg
    ? `Image loaded · scale ${state.bg.mPerPx.toFixed(3)} m/px. Drag with Select does NOT move the image; adjust via Calibrate.`
    : 'No image loaded. Load your floorplan PNG, then Calibrate: click two points a known distance apart.';
}

// ---------- import / export ----------
function exportLayout() {
  const out = toDbConnect(state);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'warehouse_layout.json';
  a.click();
  flagSaved('exported');
}

async function importLayoutFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    alert('Could not parse that file: ' + err.message);
    return;
  }
  delete data.bins; // derived — regenerate on next save; binOverrides is NOT deleted (user data)
  try {
    data = fromDbConnect(migrate(data));
  } catch (err) {
    alert('Could not load that layout: ' + err.message);
    return;
  }
  // Backfill any missing top-level keys from the shipped default.
  const defaults = await fetchDefaultLayout();
  state = await mergeLibraryBinTypes(Object.assign(JSON.parse(JSON.stringify(defaults)), data));
  sel = null;
  loadBgImage();
  renderBinTypes();
  renderProps();
  updateBgInfo();
  save();
  draw();
  loadProductsAndAssignments();
}

// ---------- new design ----------
async function newDesign() {
  if (!confirm('Start a new design? Any unsaved changes to the current one will be lost.')) return;
  state = await mergeLibraryBinTypes(await fetchBlankLayout());
  sel = null;
  selBay = null;
  loadBgImage();
  renderBinTypes();
  renderProps();
  updateBgInfo();
  save();
  draw();
  flagSaved('new design started');
  loadProductsAndAssignments();
}

// ---------- server persistence ----------
async function saveLayoutToServer() {
  const name = prompt('Save as (layout name):', state.meta?.name || 'warehouse');
  if (!name) return;
  try {
    await saveToServer(name, state);
    flagSaved(`saved "${name}" to server`);
  } catch (err) {
    alert('Could not save to server: ' + err.message);
  }
}

async function applyLoadedLayout(name, data) {
  const defaults = await fetchDefaultLayout();
  state = await mergeLibraryBinTypes(Object.assign(JSON.parse(JSON.stringify(defaults)), data));
  sel = null;
  selBay = null;
  loadBgImage();
  renderBinTypes();
  renderProps();
  updateBgInfo();
  save();
  draw();
  flagSaved(`loaded "${name}" from server`);
  loadProductsAndAssignments();
}

async function loadLayoutFromServer() {
  let layouts;
  try {
    layouts = await listServerLayouts();
  } catch (err) {
    alert('Could not list saved layouts: ' + err.message);
    return;
  }
  openLayoutPicker(layouts || []);
}

function closeLayoutPicker() {
  const el = document.getElementById('whLayoutPicker');
  if (el) el.remove();
}

function openLayoutPicker(layouts) {
  closeLayoutPicker();

  const overlay = document.createElement('div');
  overlay.id = 'whLayoutPicker';
  overlay.className = 'wh-modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLayoutPicker();
  });

  const box = document.createElement('div');
  box.className = 'wh-modal';

  const title = document.createElement('h2');
  title.textContent = 'Saved layouts';
  box.appendChild(title);

  if (!layouts.length) {
    const empty = document.createElement('div');
    empty.className = 'hintline';
    empty.textContent = 'No layouts saved to the server yet.';
    box.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'wh-modal-list';
    layouts
      .slice()
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .forEach((l) => {
        const row = document.createElement('div');
        row.className = 'wh-modal-row';

        const info = document.createElement('div');
        info.className = 'wh-modal-row-info';
        const when = l.updated_at ? new Date(l.updated_at).toLocaleString() : '';
        info.innerHTML = `<div class="wh-modal-row-name">${l.name}</div><div class="hintline">Updated ${when}</div>`;
        info.addEventListener('click', async () => {
          closeLayoutPicker();
          try {
            const data = await loadFromServer(l.name);
            await applyLoadedLayout(l.name, data);
          } catch (err) {
            alert('Could not load from server: ' + err.message);
          }
        });

        const del = document.createElement('button');
        del.className = 'btn small danger';
        del.textContent = 'Delete';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete saved layout "${l.name}"? This cannot be undone.`)) return;
          try {
            await deleteFromServer(l.name);
            row.remove();
          } catch (err) {
            alert('Could not delete layout: ' + err.message);
          }
        });

        row.appendChild(info);
        row.appendChild(del);
        list.appendChild(row);
      });
    box.appendChild(list);
  }

  const btnrow = document.createElement('div');
  btnrow.className = 'btnrow';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn small';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = closeLayoutPicker;
  btnrow.appendChild(closeBtn);
  box.appendChild(btnrow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ---------- 3D toggle ----------
function setMode3d(on) {
  mode3d = on;
  document.getElementById('c3dwrap').style.display = on ? 'block' : 'none';
  cv.style.display = on ? 'none' : 'block';
  document.getElementById('view3d').classList.toggle('active', on);
  document.getElementById('view2d').classList.toggle('active', !on);
  if (on) {
    preview.build(state, labelState.get(), getBinProduct);
    preview.setPanMode(tool === 'pan');
  } else {
    preview.teardown();
    draw();
  }
}

// ---------- label toggle ----------
function toggleLabels() {
  labelState.toggle();
  const btn = document.getElementById('toggleLabels');
  if (btn) btn.classList.toggle('active', labelState.get());
  if (mode3d) preview.build(state, labelState.get(), getBinProduct);
  draw();
}

// ---------- pointer / keyboard wiring ----------
function wirePointer() {
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerleave', () => {
    if (hover) {
      hover = null;
      hoverBay = null;
      draw();
    }
  });

  cv.addEventListener('pointerdown', (e) => {
    // Stops the browser from treating this as the start of a native
    // drag/scroll/overscroll gesture — all panning here is handled by our
    // own pointermove math, not the browser's.
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const x = wx(mx);
    const y = wy(my);
    cv.setPointerCapture(e.pointerId);

    if (e.button === 2) {
      panning = { mx, my };
      cv.style.cursor = 'grabbing';
      return;
    }

    if (tool === 'pan') {
      panning = { mx, my };
      cv.style.cursor = 'grabbing';
      return;
    }

    if (calMode) {
      calClicks.push({ x, y, px: mx, py: my });
      if (calClicks.length === 2) {
        const distInput = prompt(
          `Real-world distance between those two points (in ${getUnit() === 'm' ? 'metres' : getUnit() === 'ft' ? 'feet' : "feet'inches\""}):`,
          displayValue(30),
        );
        const distM = parseLength(distInput);
        if (distM > 0 && state.bg) {
          const dPx =
            Math.hypot(calClicks[1].x - calClicks[0].x, calClicks[1].y - calClicks[0].y) / state.bg.mPerPx;
          state.bg.mPerPx = distM / dPx;
          updateBgInfo();
          save();
        }
        calMode = false;
        calClicks = [];
        setHint('');
      } else {
        setHint('Calibrate: click the SECOND point');
      }
      draw();
      return;
    }

    if (tool === 'select') {
      const h = hitTest(x, y);
      sel = h;
      if (h && h.kind === 'rack') {
        const bi = bayOf(h.obj, state.binTypes, x, y);
        selBay = bi !== null ? { rack: h.obj, bayIndex: bi } : null;
      } else {
        selBay = null;
      }
      if (h && (h.kind === 'zone' || h.kind === 'rack' || h.kind === 'node' || h.kind === 'pallet')) {
        dragMovePending = { obj: h.obj, mx, my, ox: x - h.obj.x, oy: y - h.obj.y };
      }
      // Clicking empty space with the Select tool just deselects — it no
      // longer pans. Use the dedicated Pan tool (or right-click-drag) to
      // move the view, so a slightly-missed click never nudges the camera.
      renderProps();
      draw();
      return;
    }
    if (tool === 'zone' || tool === 'rack') {
      dragDraw = { x0: snap(x), y0: snap(y), x1: snap(x), y1: snap(y) };
      return;
    }
    if (tool === 'node') {
      const id = nextNodeId('door');
      const n = { id, kind: 'door', x: snap(x), y: snap(y), w: 3, h: 3, dir: 'E', doorType: 'roller' };
      state.nodes.push(n);
      sel = { kind: 'node', obj: n };
      save();
      renderProps();
      draw();
      return;
    }
    if (tool === 'pallet') {
      const p = { id: nextPalletId(), x: snap(x), y: snap(y), w: 1.2, d: 1.0, h: 0.15, dir: 'E' };
      if (!state.pallets) state.pallets = [];
      state.pallets.push(p);
      sel = { kind: 'pallet', obj: p };
      save();
      renderProps();
      draw();
      return;
    }
    if (tool === 'edge') {
      const h = hitTest(x, y);
      if (h && h.kind === 'node') {
        if (!pendingEdgeNode) {
          pendingEdgeNode = h.obj;
          setHint(`Edge from ${h.obj.id} — click second node`);
        } else if (h.obj !== pendingEdgeNode) {
          state.edges.push({ a: pendingEdgeNode.id, b: h.obj.id, ramp: false });
          sel = { kind: 'edge', obj: state.edges[state.edges.length - 1] };
          pendingEdgeNode = null;
          setHint('Click first node, then second node');
          save();
          renderProps();
        }
      }
      draw();
      return;
    }
    if (tool === 'delete') {
      const h = hitTest(x, y);
      if (h) {
        sel = h;
        deleteSelected();
      }
    }
  });

  cv.addEventListener('pointermove', (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const x = wx(mx);
    const y = wy(my);
    document.getElementById('status').textContent =
      `x: ${formatLength(x)} , y: ${formatLength(y)}   zoom ${view.zoom.toFixed(1)} px/m`;

    // Hover-driven 2D labels: skip while actively panning/dragging (nothing
    // useful to hover mid-drag, and it'd just be wasted hitTest work), and
    // only redraw when the hovered object actually changes.
    if (panning || dragDraw || dragMovePending || dragMove) {
      if (hover) {
        hover = null;
        hoverBay = null;
        draw();
      }
    } else {
      const h = hitTest(x, y);
      const nextObj = h ? h.obj : null;
      const prevObj = hover ? hover.obj : null;
      const nextBay = h && h.kind === 'rack' ? bayOf(h.obj, state.binTypes, x, y) : null;
      if (nextObj !== prevObj || nextBay !== hoverBay) {
        hover = h;
        hoverBay = nextBay;
        draw();
      }
    }

    if (panning) {
      view.cx -= (mx - panning.mx) / view.zoom;
      view.cy += (my - panning.my) / view.zoom;
      panning = { mx, my };
      draw();
      return;
    }
    if (dragDraw) {
      dragDraw.x1 = snap(x);
      dragDraw.y1 = snap(y);
      draw();
      return;
    }
    if (dragMovePending && !dragMove) {
      const dist = Math.hypot(mx - dragMovePending.mx, my - dragMovePending.my);
      if (dist > DRAG_THRESHOLD_PX) {
        dragMove = { ox: dragMovePending.ox, oy: dragMovePending.oy };
        cv.style.cursor = 'grabbing';
      }
    }
    if (dragMove && sel) {
      const rawX = x - dragMove.ox;
      const rawY = y - dragMove.oy;
      if (sel.kind === 'pallet') {
        // Edge-snap first (flush against a neighboring zone/pallet edge);
        // only fall back to the plain grid snap on whichever axis didn't
        // find a nearby edge to lock onto.
        const snapped = edgeSnapPallet(sel.obj, rawX, rawY);
        sel.obj.x = snapped.x !== rawX ? snapped.x : snap(rawX);
        sel.obj.y = snapped.y !== rawY ? snapped.y : snap(rawY);
      } else {
        sel.obj.x = snap(rawX);
        sel.obj.y = snap(rawY);
      }
      renderProps();
      draw();
    }
  });

  cv.addEventListener('pointerup', () => {
    if (panning) {
      panning = null;
      cv.style.cursor = tool === 'select' || tool === 'pan' ? 'grab' : 'crosshair';
      return;
    }
    if (dragMovePending || dragMove) {
      dragMovePending = null;
      dragMove = null;
      cv.style.cursor = tool === 'select' ? 'grab' : 'crosshair';
      save();
      return;
    }
    if (!dragDraw) return;

    const { x0, y0, x1, y1 } = dragDraw;
    dragDraw = null;
    if (tool === 'zone') {
      const w = Math.abs(x1 - x0);
      const d = Math.abs(y1 - y0);
      if (w >= 4 && d >= 4) {
        const zn = {
          id: nextZoneId(),
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          w,
          d,
          elev: 0,
          clearH: 14,
          color: randColor(),
        };
        state.zones.push(zn);
        sel = { kind: 'zone', obj: zn };
        save();
        renderProps();
      }
    }
    if (tool === 'rack') {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dir = Math.abs(dx) >= Math.abs(dy) ? 'E' : 'N';
      const len = dir === 'E' ? Math.abs(dx) : Math.abs(dy);
      const type = Object.keys(state.binTypes)[0] || 'STD';
      const bw = state.binTypes[type]?.w || 4.5;
      const bays = Math.max(1, Math.floor(len / bw));
      const rackId = nextRackId();
      const defaultLevelH = state.binTypes[type]?.h > 0 ? state.binTypes[type].h : 0.12;
      const r = {
        id: rackId,
        type,
        dir,
        bays,
        levels: 3,
        levelHeights: [defaultLevelH, defaultLevelH, defaultLevelH],
        bayLevelOverrides: {},
        rowToken: rackId.replace(/^[^-]+-/, ''),
        bayStart: 1,
        bayReverse: false,
        x: dir === 'E' ? Math.min(x0, x1) : x0,
        y: dir === 'E' ? y0 : Math.min(y0, y1),
      };
      state.racks.push(r);
      sel = { kind: 'rack', obj: r };
      save();
      renderProps();
    }
    draw();
  });

  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const px = wx(mx);
      const py = wy(my);
      view.zoom *= e.deltaY > 0 ? 0.88 : 1.14;
      view.zoom = Math.max(0.4, Math.min(40, view.zoom));
      view.cx = px - (mx * devicePixelRatio - cv.width / 2) / (view.zoom * devicePixelRatio);
      view.cy = py + (my * devicePixelRatio - cv.height / 2) / (view.zoom * devicePixelRatio);
      draw();
    },
    { passive: false },
  );
}

// Arrow-key panning step, in screen px (converted to world metres via zoom
// at press time so it feels consistent whether zoomed in or out). Held keys
// repeat via the browser's normal keydown auto-repeat.
const ARROW_PAN_PX = 60;

function wireKeyboard() {
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (mode3d) return; // arrow-key panning only applies to the 2D plan

    const arrowDeltas = {
      ArrowLeft: [-ARROW_PAN_PX, 0],
      ArrowRight: [ARROW_PAN_PX, 0],
      ArrowUp: [0, -ARROW_PAN_PX],
      ArrowDown: [0, ARROW_PAN_PX],
    };
    if (arrowDeltas[e.key]) {
      e.preventDefault(); // don't let the browser scroll the page
      const [dxPx, dyPx] = arrowDeltas[e.key];
      view.cx += dxPx / view.zoom;
      view.cy -= dyPx / view.zoom;
      draw();
      return;
    }

    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    if (k === 'z') setTool('zone');
    if (k === 'r') setTool('rack');
    if (k === 'n') setTool('node');
    if (k === 'e') setTool('edge');
    if (k === 'p') setTool('pallet');
    if (k === 'h') setTool('pan');
    if (k === 'x') setTool('delete');
    if (k === 'l') toggleLabels();
    if (k === 'escape') {
      pendingEdgeNode = null;
      dragDraw = null;
      calMode = false;
      calClicks = [];
      setHint('');
      draw();
    }
    if ((k === 'delete' || k === 'backspace') && sel) deleteSelected();
  });
}

function wirePanels() {
  document.querySelectorAll('.tool').forEach((b) => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });

  document.getElementById('addBinType').onclick = () => {
    let i = 1;
    while (state.binTypes['TYPE' + i]) i++;
    state.binTypes['TYPE' + i] = { w: 4.5, d: 4, h: 6, color: '#8f7fc4' };
    renderBinTypes();
    save();
  };

  const snapIn = document.getElementById('snapIn');
  const gridIn = document.getElementById('gridIn');
  snapIn.value = displayValue(state.settings.snap);
  gridIn.value = displayValue(state.settings.grid);
  snapIn.onchange = (e) => {
    const v = parseLength(e.target.value);
    state.settings.snap = Number.isNaN(v) ? 0 : v;
    snapIn.value = displayValue(state.settings.snap);
    save();
  };
  gridIn.onchange = (e) => {
    const v = parseLength(e.target.value);
    state.settings.grid = Number.isNaN(v) ? 10 : v;
    gridIn.value = displayValue(state.settings.grid);
    save();
    draw();
  };

  const unitsIn = document.getElementById('unitsIn');
  if (unitsIn) {
    unitsIn.value = getUnit();
    unitsIn.onchange = (e) => {
      setUnit(e.target.value);
      // Re-render everything that shows a length so it picks up the new unit.
      snapIn.value = displayValue(state.settings.snap);
      gridIn.value = displayValue(state.settings.grid);
      renderBinTypes();
      renderProps();
      updateBgInfo();
      draw();
    };
  }

  document.getElementById('bgLoad').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => {
      const file = inp.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        state.bg = { dataURL: rd.result, mPerPx: 0.107, ox: 0, oy: 0, opacity: 35 };
        loadBgImage();
        updateBgInfo();
        save();
      };
      rd.readAsDataURL(file);
    };
    inp.click();
  };
  document.getElementById('bgCal').onclick = () => {
    if (!state.bg) {
      alert('Load a background image first.');
      return;
    }
    calMode = true;
    calClicks = [];
    setHint('Calibrate: click the FIRST of two points a known distance apart');
  };
  document.getElementById('bgClear').onclick = () => {
    state.bg = null;
    bgImage = null;
    updateBgInfo();
    save();
    draw();
  };
  document.getElementById('bgOpacity').oninput = (e) => {
    if (state.bg) {
      state.bg.opacity = +e.target.value;
      save();
      draw();
    }
  };

  document.getElementById('view2d').onclick = () => setMode3d(false);
  document.getElementById('view3d').onclick = () => setMode3d(true);
  document.getElementById('toggleLabels').onclick = toggleLabels;
  document.getElementById('exportBtn').onclick = exportLayout;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (file) importLayoutFile(file);
    e.target.value = '';
  };
  document.getElementById('saveServerBtn').onclick = saveLayoutToServer;
  document.getElementById('loadServerBtn').onclick = loadLayoutFromServer;
  document.getElementById('newDesignBtn').onclick = newDesign;
}

// ---------- entry point ----------
export async function initEditor(layout) {
  state = await mergeLibraryBinTypes(layout);

  cv = document.getElementById('c2d');
  ctx = cv.getContext('2d');
  props = document.getElementById('props');
  toolHint = document.getElementById('toolHint');
  preview = createPreview3D(document.getElementById('c3dwrap'));

  addEventListener('resize', resize);
  wirePointer();
  wireKeyboard();
  wirePanels();

  loadBgImage();
  renderProps();
  renderBinTypes();
  updateBgInfo();
  resize();
  setTool('select');
  loadProductsAndAssignments();
}
