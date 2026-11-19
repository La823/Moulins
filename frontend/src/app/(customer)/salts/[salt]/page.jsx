import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL, getPublicProducts, jsonLd, productPath } from "@/lib/publicCatalog";
import { publicSalts, saltImages, saltPath, saltsOf } from "@/lib/salts";
import { displayName } from "@/lib/seoTitle";
import PublicCatalogCta from "@/components/customer/PublicCatalogCta";

// Rendered per request from the in-memory catalogue (see publicCatalog.js).
export const dynamic = "force-dynamic";

const listWords = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

async function findSalt(slug) {
  const all = await getPublicProducts();
  if (all.length === 0) throw new Error("public catalogue unavailable");
  return publicSalts(all).find((s) => s.slug === slug) || null;
}

const formsOf = (products) => [...new Set(products.map((p) => p.form).filter(Boolean))].sort();

export async function generateMetadata({ params }) {
  const s = await findSalt((await params).salt);
  if (!s) return {};
  const forms = formsOf(s.products);
  const title = `${s.name} Products & Brands`;
  const description = `${s.products.length} Moulins Pharmaceuticals products containing ${s.name}${
    forms.length ? `, as ${listWords(forms.map((f) => f.toLowerCase()))}` : ""
  }: ${s.products.map((p) => displayName(p.name)).join(", ")}.`;
  return {
    title,
    description: description.length > 160 ? `${description.slice(0, 159).trimEnd()}…` : description,
    alternates: { canonical: saltPath(s.name) },
    openGraph: {
      title,
      url: saltPath(s.name),
      ...(saltImages(s, 1)[0] && { images: [{ url: saltImages(s, 1)[0], alt: `${s.name} — Moulins Pharmaceuticals` }] }),
    },
  };
}

export default async function SaltPage({ params }) {
  const s = await findSalt((await params).salt);
  if (!s) notFound();
  const forms = formsOf(s.products);

  // the products grouped by their full salt combination: "Rabeprazole + Domperidone"
  const groups = new Map();
  for (const p of s.products) {
    const combo = saltsOf(p).join(" + ");
    if (!groups.has(combo)) groups.set(combo, []);
    groups.get(combo).push(p);
  }
  const combos = [...groups.entries()].sort((a, b) => a[0].split(" + ").length - b[0].split(" + ").length || a[0].localeCompare(b[0]));

  const images = saltImages(s);
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${s.name} Products & Brands`,
      url: `${SITE_URL}${saltPath(s.name)}`,
      ...(images[0] && { primaryImageOfPage: { "@type": "ImageObject", url: images[0] }, image: images }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Salts", item: `${SITE_URL}/salts` },
        { "@type": "ListItem", position: 3, name: s.name, item: `${SITE_URL}${saltPath(s.name)}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${s.name} products`,
      numberOfItems: s.products.length,
      itemListElement: s.products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.name,
        url: `${SITE_URL}${productPath(p)}`,
      })),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />

      <nav aria-label="Breadcrumb" className="text-xs text-gray-400 mb-8">
        <Link href="/salts" className="hover:text-gray-700">Salts</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">{s.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-light text-gray-900 leading-tight mb-4">{s.name}</h1>
          <p className="text-gray-600">
            Moulins Pharmaceuticals makes {s.products.length} products containing {s.name}
            {forms.length > 0 && <>, available as {listWords(forms.map((f) => f.toLowerCase()))}</>}
            {combos.length > 1 && <>, alone and in {combos.length - (groups.has(s.name) ? 1 : 0)} combination{combos.length - (groups.has(s.name) ? 1 : 0) !== 1 ? "s" : ""}</>}.
          </p>
        </div>
        <PublicCatalogCta privateHref="/products" />
      </div>

      {combos.map(([combo, products]) => (
        <section key={combo} className="mb-14">
          <h2 className="text-lg font-light text-gray-900 mb-6 pb-2 border-b border-gray-100">{combo}</h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">
            {products.map((p) => (
              <li key={p.product_id}>
                <Link href={productPath(p)} className="group block">
                  <div className="h-56 bg-white flex items-center justify-center mb-3">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-gray-50" />
                    )}
                  </div>
                  <h3 className="text-sm text-gray-900 leading-snug line-clamp-2 group-hover:underline underline-offset-2">{p.name}</h3>
                  {p.composition && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.composition}</p>}
                  {(p.form || p.packSize) && (
                    <p className="text-xs text-gray-400 mt-1">{[p.form, p.packSize].filter(Boolean).join(" · ")}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link href="/salts" className="inline-block mt-4 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2">
        All salts
      </Link>
    </div>
  );
}
