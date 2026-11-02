// Cheque writer logic, no React: amount in words and figures, the bank
// layouts (presets), fitting the words onto the cheque's lines, and
// straightening a photographed cheque. Used by app/(admin)/panel/cheques.
// Measurements are in mm; font sizes in pt.

export const MM = 96 / 25.4; // CSS px per mm

const pad2 = (n) => String(n).padStart(2, "0");
const clone = (o) => JSON.parse(JSON.stringify(o));
const fill = (t, v) => (t || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ---- amount in words ---------------------------------------------------------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n, o) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? (o.hyphen ? "-" : " ") + ONES[n % 10] : ""));
function threeDigits(n, o) {
  const h = Math.floor(n / 100), r = n % 100, p = [];
  if (h) p.push(ONES[h] + " Hundred");
  if (r) p.push((h && o.useAnd ? "and " : "") + twoDigits(r, o));
  return p.join(" ");
}
function intlWords(n, o) {
  const scales = ["", "Thousand", "Million", "Billion", "Trillion"], p = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const c = n % 1000;
    if (c) p.unshift(threeDigits(c, o) + (scales[i] ? " " + scales[i] : ""));
  }
  return p.join(" ");
}
function indianWords(n, o) {
  if (!n) return "";
  const p = [], cr = Math.floor(n / 1e7);
  if (cr) p.push(indianWords(cr, o) + " Crore");
  n %= 1e7;
  const l = Math.floor(n / 1e5);
  if (l) p.push(twoDigits(l, o) + " Lakh");
  n %= 1e5;
  const t = Math.floor(n / 1000);
  if (t) p.push(twoDigits(t, o) + " Thousand");
  n %= 1000;
  if (n) p.push(threeDigits(n, o));
  return p.join(" ");
}
const numWords = (n, o) => (o.system === "indian" ? indianWords : intlWords)(n, o) || "Zero";

// The amount typed, in paise; 0 when it isn't a usable amount.
export function toCents(s) {
  const n = Number(String(s || "").replace(/[,\s₹$£€]/g, ""));
  return isFinite(n) && n > 0 && n < 1e12 ? Math.round(n * 100) : 0;
}
export function amountWords(cents, L) {
  const major = Math.floor(cents / 100), minor = cents % 100;
  const v = { major: numWords(major, L), minor: minor ? numWords(minor, L) : "Zero", cents: pad2(minor) };
  v.minorPart = minor ? fill(L.minorTemplate, v) : "";
  const s = fill(L.wordsTemplate, v).replace(/\s+/g, " ").trim();
  return L.upper ? s.toUpperCase() : s;
}
export function amountFigures(cents, L) {
  const dec = L.decimals === "always" || cents % 100 !== 0;
  const s = (cents / 100).toLocaleString(L.system === "indian" ? "en-IN" : "en-US", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: 2 });
  return fill(L.amountTemplate, { amount: s });
}
function fmtChequeDate(iso, D) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return D.format.replace("YYYY", y).replace("YY", y.slice(2)).replace("MM", m).replace("DD", d);
}

// ---- layouts -----------------------------------------------------------------

export const LABELS = {
  date: "Date", payee: "Payee", words1: "Amount in words – line 1", words2: "Amount in words – line 2",
  amount: "Amount in figures", acpayee: "A/C PAYEE crossing", memo: "Memo", signLabel: "Signatory label",
};
const F = (x, y, w, size, extra) => Object.assign({ x, y, w, size, show: true, align: "left", rot: 0 }, extra);
const LANG_IN = { system: "indian", useAnd: false, hyphen: false, upper: false, wordsTemplate: "{major} {minorPart} Only", minorTemplate: "and {minor} Paise", decimals: "auto", amountTemplate: "{amount}/-" };
const LANG_US = { system: "intl", useAnd: false, hyphen: true, upper: false, wordsTemplate: "{major} and {cents}/100", minorTemplate: "", decimals: "always", amountTemplate: "**{amount}" };
const PRESETS = {
  india: () => ({
    // RBI MICR spec: 8" x 3 2/3"
    name: "India – CTS-2010", width: 203.2, height: 93.1, lang: clone(LANG_IN), acPayeeDefault: true,
    date: { format: "DDMMYYYY", boxed: true, pitch: 4.6 },
    fields: { date: F(156, 7.5, 37, 12), payee: F(18, 19.5, 150, 12), words1: F(32, 28.5, 125, 11), words2: F(8, 37, 115, 11), amount: F(158, 36, 38, 13), acpayee: F(5, 4, 24, 8, { align: "center", rot: -30 }), memo: F(10, 50, 80, 9, { show: false }), signLabel: F(140, 58, 58, 9, { align: "center", show: false }) },
  }),
  usPersonal: () => ({
    name: "US personal check", width: 152.4, height: 69.85, lang: clone(LANG_US), acPayeeDefault: false,
    date: { format: "MM/DD/YYYY", boxed: false, pitch: 4.6 },
    fields: { date: F(108, 12.5, 32, 10), payee: F(24, 23, 92, 11), amount: F(126, 23, 24, 11), words1: F(8, 32.5, 118, 10), words2: F(8, 38, 118, 10, { show: false }), acpayee: F(5, 3, 24, 8, { show: false, align: "center", rot: -30 }), memo: F(14, 56, 55, 9), signLabel: F(95, 52, 50, 8, { show: false, align: "center" }) },
  }),
  usBusiness: () => ({
    name: "US business check", width: 215.9, height: 88.9, lang: clone(LANG_US), acPayeeDefault: false,
    date: { format: "MM/DD/YYYY", boxed: false, pitch: 4.6 },
    fields: { date: F(160, 17, 35, 11), payee: F(30, 32, 135, 12), amount: F(176, 32, 32, 12), words1: F(12, 43, 160, 11), words2: F(12, 49, 160, 11, { show: false }), acpayee: F(5, 3, 24, 8, { show: false, align: "center", rot: -30 }), memo: F(16, 74, 70, 9), signLabel: F(135, 66, 70, 8, { show: false, align: "center" }) },
  }),
  custom: () => Object.assign(PRESETS.india(), { name: "Custom cheque" }),
};
export const PRESET_OPTIONS = [
  ["india", "India – generic CTS-2010 (203×93 mm)"],
  ["usPersonal", "US personal (6×2.75 in)"],
  ["usBusiness", "US business (8.5×3.5 in)"],
  ["custom", "Blank / custom"],
];
// Field positions measured on public/cheque-banks/*.jpg, which are scaled to
// exactly 203.2 x 93.1 mm (10 px/mm). hdfc.jpg is a 1:1 scan of our own HDFC
// current-account leaf (account number and MICR blanked); it goes into our
// printer upright, top edge on the left, centred across an A4 sheet and at
// its top. Our printer shrinks the page to 97.6% and shifts it; the scale and
// calibration below were measured on a printed test cheque (31 Oct 2026).
// Bump HDFC_REV when these change, so saved HDFC layouts pick them up.
export const HDFC_REV = 8;
const HDFC_PRINTING = { orient: "left", pageMode: "a4", feedCentre: true, feedY: 0, printScale: 97.6, calX: 1.5, calY: 1.3 };
export const BANKS = {
  sbi: { name: "State Bank of India", pitch: 5.06, fields: { date: F(155, 6.1, 41, 12), payee: F(17, 19.4, 128, 12), words1: F(31, 28.5, 116, 11), words2: F(8, 36.9, 127, 11), amount: F(157.5, 34.5, 37, 13), acpayee: F(5, 13, 24, 8, { align: "center", rot: -30 }), signLabel: F(145, 60, 55, 9, { align: "center" }) } },
  hdfc: { name: "HDFC Bank", pitch: 5, fields: { date: F(156.8, 6.8, 40, 12), payee: F(18, 19.5, 160, 12), words1: F(31.5, 28.7, 110, 11), words2: F(10.5, 38, 121, 11), amount: F(159.5, 36.3, 36, 13), acpayee: F(8, 5.5, 24, 8, { align: "center", rot: -30 }), signLabel: F(140, 62, 57, 9, { align: "center" }) } },
  icici: { name: "ICICI Bank", pitch: 5.12, fields: { date: F(155.7, 9.6, 41, 12), payee: F(28, 21.6, 148, 12), words1: F(28.5, 30.6, 115, 11), words2: F(9, 39.3, 135, 11), amount: F(159, 37.2, 37, 13), acpayee: F(3, 12, 22, 8, { align: "center", rot: -30 }), signLabel: F(165, 66, 32, 9, { align: "center" }) } },
  axis: { name: "Axis Bank", pitch: 5.2, fields: { date: F(156.5, 8.9, 42, 12), payee: F(14, 23.4, 133, 12), words1: F(27, 31.4, 118, 11), words2: F(7, 39.3, 130, 11), amount: F(163, 37.3, 33, 13), acpayee: F(5, 17, 24, 8, { align: "center", rot: -30 }), signLabel: F(160, 64, 38, 9, { align: "center" }) } },
  kotak: { name: "Kotak Mahindra Bank", pitch: 6.17, fields: { date: F(147.3, 11.8, 50, 12), payee: F(18, 24.5, 145, 12), words1: F(31, 32.8, 113, 11), words2: F(13, 40.8, 131, 11), amount: F(155, 39, 40, 13), acpayee: F(5, 6, 24, 8, { align: "center", rot: -30 }), signLabel: F(150, 66, 38, 9, { align: "center" }) } },
  canara: { name: "Canara Bank", pitch: 4.95, fields: { date: F(154.9, 8.6, 40, 12), payee: F(18.5, 20.2, 138, 12), words1: F(32, 29.2, 108, 11), words2: F(11, 37.2, 129, 11), amount: F(157, 36.3, 37, 13), acpayee: F(5, 13.5, 24, 8, { align: "center", rot: -30 }), signLabel: F(155, 64, 38, 9, { align: "center" }) } },
  union: { name: "Union Bank of India", pitch: 6.16, fields: { date: F(146.9, 7.6, 50, 12), payee: F(17, 20.9, 146, 12), words1: F(29.5, 29.9, 115, 11), words2: F(12, 38.3, 131, 11), amount: F(155, 36.6, 40, 13), acpayee: F(5, 13.5, 24, 8, { align: "center", rot: -30 }), signLabel: F(150, 62, 36, 9, { align: "center" }) } },
};
function bankPreset(key) {
  const b = BANKS[key], p = PRESETS.india();
  p.date.pitch = b.pitch;
  return Object.assign(p, { name: b.name, bg: `/cheque-banks/${key}.jpg`, bgOpacity: 0.6, fields: Object.assign({ memo: F(10, 50, 80, 9, { show: false }) }, clone(b.fields)) },
    key === "hdfc" && { hdfcRev: HDFC_REV, ...HDFC_PRINTING });
}

// Brings a layout saved by an older version of the page up to date. Each
// step runs once and leaves a mark, so later changes made by hand stay put.
export function upgradeLayout(p) {
  // the A/C PAYEE crossing became slanted
  if (!p.acSlanted && p.fields?.acpayee) {
    p = { ...p, acSlanted: true, fields: { ...p.fields, acpayee: { ...p.fields.acpayee, rot: p.fields.acpayee.rot || -30 } } };
  }
  // HDFC fields re-measured on a scan of our own leaf, and how our printer
  // takes it
  if (p.bg === "/cheque-banks/hdfc.jpg" && (p.hdfcRev || 0) < HDFC_REV) {
    p = { ...p, hdfcRev: HDFC_REV, ...HDFC_PRINTING, date: { ...p.date, pitch: BANKS.hdfc.pitch }, fields: { ...p.fields, ...clone(BANKS.hdfc.fields) } };
  }
  return p;
}
// A new layout (no id: the server gives it one). kind is a PRESETS key or
// "bank:<BANKS key>".
export function makeProfile(kind) {
  return Object.assign(
    { account: "", fontFamily: "Arial, Helvetica, sans-serif", bg: null, bgOpacity: 0.5, pageMode: "cheque", orient: "h", feedCentre: false, printScale: 100, feedX: 0, feedY: 0, calX: 0, calY: 0, nextNo: 1, signLabelText: "", acSlanted: true },
    kind.startsWith("bank:") ? bankPreset(kind.slice(5)) : PRESETS[kind](),
  );
}

export const SAMPLE = () => ({ date: today(), payee: "Sample Payee Name", amount: "123456.78", acPayee: true, memo: "Memo text" });

// ---- fitting the text --------------------------------------------------------

let mctx = null;
function textWidthMm(t, pt, fam) {
  if (!mctx) mctx = document.createElement("canvas").getContext("2d");
  mctx.font = `${pt}pt ${fam}`;
  return mctx.measureText(t).width / MM;
}

// Flows the words over the line slots, as many as fit on each.
function splitWords(text, slots, fam) {
  const words = text ? text.split(" ") : [], lines = [];
  let i = 0;
  for (const s of slots) {
    let line = "";
    while (i < words.length) {
      const t = line ? line + " " + words[i] : words[i];
      if (line && textWidthMm(t, s.size, fam) > s.w) break;
      line = t;
      i++;
    }
    lines.push(line);
  }
  if (i < words.length) lines[lines.length - 1] += " " + words.slice(i).join(" ");
  lines.overflow = lines.some((l, k) => textWidthMm(l, slots[k].size, fam) > slots[k].w);
  return lines;
}

// What each field prints for cheque d on layout p, and warnings when
// something doesn't fit its space.
export function fieldValues(p, d) {
  const cents = toCents(d.amount), fs = p.fields;
  const slotKeys = ["words1", "words2"].filter((k) => fs[k].show);
  const lines = slotKeys.length ? splitWords(cents ? amountWords(cents, p.lang) : "", slotKeys.map((k) => fs[k]), p.fontFamily) : [];
  const v = {
    date: fmtChequeDate(d.date, p.date), payee: d.payee, amount: cents ? amountFigures(cents, p.lang) : "",
    acpayee: d.acPayee ? "A/C PAYEE" : "", memo: d.memo, signLabel: p.signLabelText, words1: "", words2: "",
  };
  slotKeys.forEach((k, i) => (v[k] = lines[i] || ""));
  const warn = [];
  if (lines.overflow) warn.push("Amount in words doesn’t fit on the available line(s). Use a smaller font or widen the fields in Layout.");
  if (fs.payee.show && d.payee && textWidthMm(d.payee, fs.payee.size, p.fontFamily) > fs.payee.w) warn.push("Payee name is wider than the payee field.");
  if (fs.amount.show && v.amount && textWidthMm(v.amount, fs.amount.size, p.fontFamily) > fs.amount.w) warn.push("Amount in figures is wider than its box.");
  return { v, warn, cents };
}

// ---- straightening a photographed cheque -------------------------------------

// Solves the 3x3 homography (h33 = 1) that maps each dst point to its src point.
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}
export function warpToRect(src, pts, W, H) {
  const sw = src.width, sh = src.height, sd = src.getContext("2d").getImageData(0, 0, sw, sh).data;
  const h = homography(pts, [[0, 0], [W, 0], [W, H], [0, H]]);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d"), img = octx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const X = x + 0.5, Y = y + 0.5, w = h[6] * X + h[7] * Y + 1;
      const u = (h[0] * X + h[1] * Y + h[2]) / w - 0.5, v = (h[3] * X + h[4] * Y + h[5]) / w - 0.5;
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(u))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(v)));
      const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
      const i00 = (y0 * sw + x0) * 4, i01 = i00 + sw * 4, o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = (sd[i00 + c] * (1 - fx) + sd[i00 + 4 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i01 + 4 + c] * fx) * fy;
      d[o + 3] = 255;
    }
  octx.putImageData(img, 0, 0);
  return out;
}
// Orders 4 clicked points as top-left, top-right, bottom-right, bottom-left.
export function orderCorners(p) {
  const by = (f, max) => p.reduce((a, q) => ((max ? f(q) > f(a) : f(q) < f(a)) ? q : a));
  return [by((q) => q[0] + q[1]), by((q) => q[0] - q[1], true), by((q) => q[0] + q[1], true), by((q) => q[0] - q[1])];
}
