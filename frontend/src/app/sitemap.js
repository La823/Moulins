import { PUBLIC_DIVISIONS, SITE_URL, getPublicProducts, productPath } from "@/lib/publicCatalog";

// Built per request (from the in-memory catalogue, refreshed hourly) so a
// new product reaches it without a rebuild. Only publicly reachable pages go
// here — the logged-in catalogue (/products, /gutsy, …) sits behind a login
// gate (see robots.js); its public twins are /divisions and /medicines.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  const now = new Date();
  const products = await getPublicProducts();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/divisions`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...PUBLIC_DIVISIONS.map((d) => ({
      url: `${SITE_URL}/divisions/${d.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}${productPath(p)}`,
      ...(p.updatedAt && { lastModified: new Date(p.updatedAt) }),
      changeFrequency: "monthly",
      priority: 0.7,
      ...(p.images[0] && { images: [p.images[0]] }),
    })),
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/careers`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
