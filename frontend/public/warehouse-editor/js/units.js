// units.js — display-unit conversion for the editor's length fields.
//
// Internal storage stays metres everywhere: `state`, the exported
// db_connect JSON, and the backend's warehouse_layouts/warehouse_bin_types
// tables. This module only affects how numbers are *shown* and *typed* in
// the UI — a per-browser preference (localStorage), not part of the layout
// data, so switching it never changes a saved layout's numbers.

const LS_KEY = 'warehouse_layout_editor_units';
const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;

let unit = 'm'; // 'm' | 'ft' | 'ftin'
try {
  const saved = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
  if (saved === 'm' || saved === 'ft' || saved === 'ftin') unit = saved;
} catch {
  // ignore — default to metres
}

export function getUnit() {
  return unit;
}

export function setUnit(u) {
  if (u !== 'm' && u !== 'ft' && u !== 'ftin') return;
  unit = u;
  try {
    localStorage.setItem(LS_KEY, u);
  } catch {
    // non-fatal — just won't persist across reloads
  }
}

export function unitSuffix() {
  return unit === 'm' ? 'm' : unit === 'ft' ? 'ft' : '';
}

function round(v, p) {
  const f = 10 ** p;
  return Math.round(v * f) / f;
}

// Metres -> a plain editable number, in the current unit (used for 'm'/'ft'
// text inputs, and internally by the 'ftin' formatter below).
export function toDisplayNumber(m, precision = 2) {
  if (unit === 'ft' || unit === 'ftin') return round(m / FT_TO_M, precision);
  return round(m, precision);
}

// Metres -> a compound feet'inches" string, e.g. 4' 6.5" — used for 'ftin'
// mode text inputs.
export function toFeetInches(m) {
  const totalIn = m / IN_TO_M;
  const sign = totalIn < 0 ? '-' : '';
  let ft = Math.floor(Math.abs(totalIn) / 12);
  let inch = round(Math.abs(totalIn) - ft * 12, 2);
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  return `${sign}${ft}' ${inch}"`;
}

// Metres -> the string to put in a length input's value, given the current
// unit mode.
export function displayValue(m) {
  if (typeof m !== 'number' || Number.isNaN(m)) return '';
  return unit === 'ftin' ? toFeetInches(m) : String(toDisplayNumber(m));
}

// Metres -> a human-readable label with its unit suffix, for canvas labels
// and read-only text (not input values).
export function formatLength(m) {
  if (typeof m !== 'number' || Number.isNaN(m)) return '';
  return unit === 'ftin' ? toFeetInches(m) : `${toDisplayNumber(m)} ${unitSuffix()}`;
}

// Parse a user-typed length string -> metres. Accepts, regardless of the
// current unit mode: a plain number (interpreted per the current unit),
// explicit suffixes (m, ft/', in/"), and compound feet-inches (5'6", 5' 6").
// Returns NaN if unparseable.
export function parseLength(input) {
  if (input == null) return NaN;
  const s = String(input).trim();
  if (!s) return NaN;

  // Compound feet + inches: 5'6", 5' 6", 5ft 6in, 5ft
  const compound = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft)\s*(-?\d+(?:\.\d+)?)?\s*(?:"|in)?$/i);
  if (compound) {
    const ft = parseFloat(compound[1]) || 0;
    const inch = parseFloat(compound[2]) || 0;
    return ft * FT_TO_M + inch * IN_TO_M;
  }
  // Inches only: 18", 18in
  const inchesOnly = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:"|in)$/i);
  if (inchesOnly) return parseFloat(inchesOnly[1]) * IN_TO_M;
  // Metres explicit: 1.5m (but not "mm")
  const metresOnly = s.match(/^(-?\d+(?:\.\d+)?)\s*m$/i);
  if (metresOnly) return parseFloat(metresOnly[1]);

  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  if (unit === 'm') return n;
  return n * FT_TO_M; // 'ft' and 'ftin' plain numbers are read as feet
}
