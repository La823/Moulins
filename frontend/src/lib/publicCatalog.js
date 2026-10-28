import "server-only";
import { DIVISIONS } from "@/lib/divisions";
import { CATEGORY_TO_DIVISION_ROUTE } from "@/lib/divisionRoutes";

// The public, crawlable catalogue behind /divisions and /medicines. Rendered
// on the server so search engines see real text, and limited to what anyone
// may see: name, brand, division, form, pack, strength, composition and the
// ordinary product photos. Never rates, stock, detailing text, audio or
// visual aids — the list below is a whitelist, so a field added to the API
// later stays off these pages until someone adds it here.

export const SITE_URL = "https://www.moulinspharma.com";

// Inside docker the frontend reaches the backend directly (API_INTERNAL_URL,
// e.g. http://backend:8080); elsewhere it goes through the public API URL.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// How long a fetched catalogue is reused before the next request refetches it.
const REVALIDATE_SECONDS = 3600;

const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// The 12 divisions, keyed by the same slug as their logged-in page
// (/gutsy → "gutsy"), with the category string their products carry.
const ROUTE_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_TO_DIVISION_ROUTE).map(([cat, route]) => [route, cat]));

export const PUBLIC_DIVISIONS = DIVISIONS.map((d) => ({
  slug: d.route.slice(1),
  label: d.label,
  desc: d.desc,
  heroImage: d.heroImage,
  category: ROUTE_TO_CATEGORY[d.route],
  privateRoute: d.route,
}));

export function getDivision(slug) {
  return PUBLIC_DIVISIONS.find((d) => d.slug === slug) || null;
}

export function divisionForProduct(product) {
  const cats = (product.categories || []).map(normalize);
  return PUBLIC_DIVISIONS.find((d) => cats.includes(normalize(d.category))) || null;
}

export const productPath = (p) => `/medicines/${slugify(p.name)}-${p.product_id}`;

// "/medicines/gutsy-d-1234" → 1234
export function productIdFromSlug(slug) {
  const m = /-(\d+)$/.exec(slug || "") || /^(\d+)$/.exec(slug || "");
  return m ? Number(m[1]) : null;
}

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function publicImages(p) {
  return (p.images || [])
    .filter((img) => !img.hidden && !img.visual_aid && img.image_url)
    .map((img) => ({ url: img.image_url, key: img.image_key }));
}

function toPublic(p) {
  const images = publicImages(p);
  const first = images[0];
  const thumb = first && p.thumb_url && p.thumb_source_key === first.key ? p.thumb_url : first?.url || null;
  return {
    id: p.id,
    product_id: p.product_id,
    name: p.name,
    brand: text(p.brand_name),
    categories: p.categories || [],
    form: text(p.product_form),
    packSize: text(p.pack_size),
    packForm: text(p.pack_form),
    strength: text(p.strength),
    composition: text(p.key_ingredients),
    images: images.map((i) => i.url),
    thumb,
    updatedAt: p.updated_at || null,
  };
}

// The full API response runs to megabytes, past what Next's fetch cache
// keeps (2MB), so the trimmed list is held in memory here instead and shared
// by every page and the sitemap until it's an hour old.
let cached = { at: 0, products: null, pending: null };

async function fetchPublicProducts() {
  const res = await fetch(`${API_URL}/products?limit=1000`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.products || []).filter((p) => p.product_id && p.name).map(toPublic);
}

// Every active product the public may see. The backend already leaves out
// inactive and partner-exclusive products for a caller with no login. If a
// refresh fails the last good list is kept; with none, the list is empty
// rather than an error page.
export async function getPublicProducts() {
  const fresh = cached.products && Date.now() - cached.at < REVALIDATE_SECONDS * 1000;
  if (fresh) return cached.products;
  if (!cached.pending) {
    cached.pending = fetchPublicProducts()
      .then((products) => {
        cached = { at: Date.now(), products, pending: null };
        return products;
      })
      .catch((err) => {
        console.error("public catalogue fetch failed:", err.message);
        cached.pending = null;
        return cached.products || [];
      });
  }
  return cached.pending;
}

export async function getDivisionProducts(division) {
  const all = await getPublicProducts();
  const want = normalize(division.category);
  return all
    .filter((p) => p.categories.some((c) => normalize(c) === want))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPublicProduct(productId) {
  const all = await getPublicProducts();
  return all.find((p) => p.product_id === productId) || null;
}

export function jsonLd(data) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
