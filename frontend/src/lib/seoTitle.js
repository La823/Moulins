// Search-result titles for product pages, e.g.
//   "ACNEPRES CREAM 20 GM" + "Betamethasone 0.1% w/w + Clindamycin 1% w/w"
//   → "Acnepres Cream 20 gm – Betamethasone + Clindamycin"
// (the layout's title template adds " | Moulins Pharmaceuticals").

// Short-form words in product names, written out the way people search
const FORM_WORDS = {
  TAB: "Tablet",
  TABS: "Tablets",
  CAP: "Capsule",
  CAPS: "Capsules",
  SYP: "Syrup",
  INJ: "Injection",
  SUSP: "Suspension",
  SOL: "Solution",
  OINT: "Ointment",
  LOT: "Lotion",
};
const UNITS = { GM: "gm", G: "g", ML: "ml", MG: "mg", MCG: "mcg", KG: "kg", L: "L", IU: "IU" };

// Short ordinary words that are not codes
const PLAIN_WORDS = new Set(["EYE", "EAR", "DRY", "RED", "GEL", "OIL", "ALL", "NEW", "KID", "MAX"]);

// Letters-only words of 3 or fewer letters are strength/variant codes
// (SR, DSR, CV, XT, LS, AM, D) and stay in capitals.
function word(w) {
  const up = w.toUpperCase().replace(/\.$/, "");
  if (FORM_WORDS[up]) return FORM_WORDS[up];
  if (UNITS[up]) return UNITS[up];
  if (PLAIN_WORDS.has(up)) return up[0] + up.slice(1).toLowerCase();
  if (/^[A-Z]{1,3}$/i.test(w)) return up;
  if (/^[A-Z]+$/i.test(w)) return up[0] + up.slice(1).toLowerCase();
  return w; // numbers and mixed codes like D3, 10*10, 60K as they are
}

export function displayName(name) {
  return (name || "")
    // "2ML" → "2 ML", but not brand codes like "DUCKLIV-5G"
    .replace(/(?<![-\w.])(\d+(?:\.\d+)?)(GM|ML|MG|MCG|KG|G)\b/gi, "$1 $2")
    .split(/(\s+|-|\/|\+|\(|\))/)
    .map((part) => (/^[A-Za-z0-9*.%]+$/.test(part) ? word(part) : part))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// Just the ingredient names: "Paracetamol 325 mg + Aceclofenac 100 mg"
// → "Paracetamol + Aceclofenac"
// "+ Cream", "Ophthalmic Suspension": the dosage form, not an ingredient
const FORM_ONLY = /^(ophthalmic |oral |topical )?(cream|gel|ointment|lotion|suspension|solution|syrup|tablets?|capsules?|drops|q\.?s\.?|base)$/i;

export function saltNames(composition) {
  if (!composition) return "";
  const salts = composition
    .replace(/�/g, "-")
    .replace(/^.*?contains\s*:\s*/i, "")
    // a line break after a strength separates salts; elsewhere it just wraps
    .replace(/(\d[^\n]*)\n/g, "$1 + ")
    .replace(/\n/g, " ")
    .split(/\s*\+\s*|,\s*(?=[A-Z])/)
    .map((s) =>
      s
        .replace(/\(.*?\)/g, " ")
        .replace(/\b(I\.?P\.?|B\.?P\.?|U\.?S\.?P\.?)\b/g, " ")
        .replace(/\s\d.*$/, "") // strength onwards
        .replace(/[\s:;.-]+$/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => /^[a-z]/i.test(s) && !/^(mg|mcg|ml|gm|w\/[vw])\b/i.test(s) && !FORM_ONLY.test(s));
  return [...new Set(salts)].join(" + ");
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function productTitle(p) {
  const name = displayName(p.name);
  const salts = saltNames(p.composition);
  return salts ? `${name} – ${clip(salts, 60)}` : name;
}
