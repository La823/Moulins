// Maps a product's exact category string (as stored in the DB) to its
// dedicated division landing page — same category strings used for
// CATEGORY_ICONS on the products listing page, and the same routes that
// exist as their own pages (frontend/src/app/(customer)/(protected)/<slug>).
export const CATEGORY_TO_DIVISION_ROUTE = {
  "Aerozone(Respiratory & ENT)": "/aerozone",
  "Bone Voyage (Orthopaedics)": "/bonevoyage",
  "Fluidity (Urology and renal)": "/fluidity",
  "Gutsy (Gastro)": "/gutsy",
  "Jivya (Cardio Diabetic Division)": "/jivya",
  "Life Gard (Antibiotics/ Trauma)": "/lifegard",
  "Little Planet (Pediatric)": "/littleplanet",
  Matrix: "/matrix",
  "Mindset (Neuro/Psychiatry)": "/mindset",
  "Misbella (Derma and Skin Wellness)": "/missbella",
  "Srishti (Gynaecology)": "/srishti",
  "View Point (Ophthalmology)": "/viewpoint",
};

// Keys are matched on letters and digits only, so punctuation and spacing in
// the stored name cannot break the link. Renaming "Missbella(Derma...)" to
// "Missbella (Derma...)" — one added space — silently stopped matching and
// sent the division link to the generic products list instead, which looks
// like a working page rather than a fault.
const normalizeCategory = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const NORMALIZED_ROUTES = Object.fromEntries(
  Object.entries(CATEGORY_TO_DIVISION_ROUTE).map(([k, v]) => [normalizeCategory(k), v]),
);

// Falls back to the filtered products list for any category that isn't one
// of the 12 dedicated divisions above.
export function divisionRouteForCategory(category) {
  return (
    CATEGORY_TO_DIVISION_ROUTE[category] ||
    NORMALIZED_ROUTES[normalizeCategory(category)] ||
    `/products?category=${encodeURIComponent(category)}`
  );
}
