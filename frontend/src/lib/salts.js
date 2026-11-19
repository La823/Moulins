import { saltNames } from "@/lib/seoTitle";
import { slugify } from "@/lib/publicCatalog";

// Salt (active ingredient) pages: /salts/rabeprazole lists every product with
// rabeprazole in it, whatever salt form ("Rabeprazole Sodium") the
// composition names. Built from the composition text already on the products.

// Trailing salt forms folded into the base drug
const SALT_FORM = /\s+(hydrochloride|dihydrochloride|hcl|hydrobromide|sodium|potassium|calcium|magnesium|mesylate|maleate|besylate|besilate|succinate|tartrate|fumarate|dihydrate|trihydrate|monohydrate|hydrate|anhydrous|acetate|propionate|dipropionate|valerate|furoate|phosphate|bromide|benzoate)$/i;

// Preservatives listed in compositions; nobody searches a medicine by these
const EXCIPIENT = /^(benzyl alcohol|chlorbutol|chlorobutanol|benzalkonium chloride|methyl ?paraben|propyl ?paraben|sodium benzoate)$/i;

// Ingredient names, not descriptions like "Herbal Brain Syrup"
const NOT_A_SALT = /\b(herbal|support|for|with|and|syrup|tablets?|capsules?|powder|extract of|each|contains|solutions?)\b|[:&()]/i;

function baseSalt(name) {
  let s = name.replace(/\s+eq\.?\s+to.*$/i, "").trim();
  for (let i = 0; i < 3 && SALT_FORM.test(s) && s.split(" ").length > 1; i++) s = s.replace(SALT_FORM, "");
  return s;
}

// "IRON" / "iron" → "Iron"; keeps short codes (D3, B12) and inner capitals (CoQ10)
const tidy = (s) =>
  s
    .split(/(\s+|-)/)
    .map((w) => (/^[A-Z]{4,}$/.test(w) || /^[a-z]{2,}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join("");

export function saltsOf(product) {
  const names = saltNames(product.composition);
  if (!names) return [];
  return [
    ...new Set(
      names
        .split(" + ")
        .filter((s) => s.length >= 3 && s.split(/\s+/).length <= 4 && !NOT_A_SALT.test(s))
        .map((s) => tidy(baseSalt(s)))
        .filter((s) => !EXCIPIENT.test(s)),
    ),
  ];
}

export const saltPath = (name) => `/salts/${slugify(name)}`;

// [{ name, slug, products }] for salts in at least one product, A–Z
export function buildSaltIndex(products) {
  const bySlug = new Map();
  for (const p of products) {
    for (const name of saltsOf(p)) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, names: new Map(), products: [] });
      const e = bySlug.get(slug);
      e.names.set(name, (e.names.get(name) || 0) + 1);
      e.products.push(p);
    }
  }
  return [...bySlug.values()]
    .map((e) => ({
      slug: e.slug,
      // the spelling most products use
      name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      products: e.products.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A salt page needs at least this many products; one product would only
// repeat its own product page.
export const MIN_SALT_PRODUCTS = 2;

// The products' main photos, for the salt page's picture in search results
// and its sitemap entry (the first one is the page's own picture)
export const saltImages = (salt, max = 5) => salt.products.map((p) => p.images[0]).filter(Boolean).slice(0, max);

export const publicSalts =(products) => buildSaltIndex(products).filter((s) => s.products.length >= MIN_SALT_PRODUCTS);
