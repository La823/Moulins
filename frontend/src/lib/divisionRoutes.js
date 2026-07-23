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
  "Missbella(Derma and Skin Wellness)": "/missbella",
  "Srishti (Gynaecology)": "/srishti",
  "View Point (Ophthalmology)": "/viewpoint",
};

// Falls back to the filtered products list for any category that isn't one
// of the 12 dedicated divisions above.
export function divisionRouteForCategory(category) {
  return CATEGORY_TO_DIVISION_ROUTE[category] || `/products?category=${encodeURIComponent(category)}`;
}
