import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  SITE_URL,
  divisionForProduct,
  getPublicProducts,
  jsonLd,
  productIdFromSlug,
  productPath,
} from "@/lib/publicCatalog";
import PublicCatalogCta from "@/components/customer/PublicCatalogCta";

export const dynamic = "force-dynamic";

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// An empty catalogue means the backend couldn't be reached, not that the
// product is gone — fail the request rather than tell search engines 404.
async function findProduct(slug) {
  const all = await getPublicProducts();
  if (all.length === 0) throw new Error("public catalogue unavailable");
  const id = productIdFromSlug(slug);
  return { product: id ? all.find((p) => p.product_id === id) : null, all };
}

export async function generateMetadata({ params }) {
  const { product: p } = await findProduct((await params).slug);
  if (!p) return {};
  const division = divisionForProduct(p);
  const title = p.composition ? `${p.name} (${clip(p.composition, 60)})` : p.name;
  const details = [p.form, p.packSize].filter(Boolean).join(", ");
  const description = clip(
    [
      `${p.name} by Moulins Pharmaceuticals`,
      p.composition && `Composition: ${p.composition}`,
      details,
      division && `${division.label} division${division.desc ? ` (${division.desc})` : ""}`,
    ]
      .filter(Boolean)
      .join(". ") + ".",
    160,
  );
  return {
    title,
    description,
    alternates: { canonical: productPath(p) },
    openGraph: {
      title,
      description,
      url: productPath(p),
      ...(p.images[0] && { images: [{ url: p.images[0], alt: p.name }] }),
    },
  };
}

export default async function MedicinePage({ params }) {
  const { slug } = await params;
  const { product: p, all } = await findProduct(slug);
  if (!p) notFound();
  // a renamed product keeps its number, so old links land on the new name
  if (productPath(p) !== `/medicines/${slug}`) permanentRedirect(productPath(p));

  const division = divisionForProduct(p);
  const related = division
    ? all.filter((o) => o.product_id !== p.product_id && divisionForProduct(o)?.slug === division.slug).slice(0, 8)
    : [];

  const facts = [
    ["Composition", p.composition],
    ["Strength", p.strength],
    ["Dosage form", p.form],
    ["Pack size", p.packSize],
    ["Pack type", p.packForm],
    ["Brand", p.brand && p.brand !== p.name ? p.brand : null],
  ].filter(([, v]) => v);

  const crumbs = [
    { name: "Home", item: `${SITE_URL}/` },
    { name: "Divisions", item: `${SITE_URL}/divisions` },
    ...(division ? [{ name: division.label, item: `${SITE_URL}/divisions/${division.slug}` }] : []),
    { name: p.name, item: `${SITE_URL}${productPath(p)}` },
  ];
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, ...c })),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />

      <nav aria-label="Breadcrumb" className="text-xs text-gray-400 mb-8">
        <Link href="/divisions" className="hover:text-gray-700">Divisions</Link>
        {division && (
          <>
            <span className="mx-2">/</span>
            <Link href={`/divisions/${division.slug}`} className="hover:text-gray-700">{division.label}</Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="text-gray-600">{p.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
        <div>
          <div className="aspect-square bg-white flex items-center justify-center border border-gray-100">
            {p.images[0] ? (
              <img src={p.images[0]} alt={p.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="w-full h-full bg-gray-50" />
            )}
          </div>
          {p.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {p.images.slice(1, 5).map((src, i) => (
                <div key={src} className="aspect-square bg-white border border-gray-100 flex items-center justify-center">
                  <img src={src} alt={`${p.name} — view ${i + 2}`} loading="lazy" className="max-h-full max-w-full object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {division && (
            <Link
              href={`/divisions/${division.slug}`}
              className="block text-[11px] font-bold uppercase tracking-widest mb-3"
              style={{ color: "#2E5B41" }}
            >
              {division.label}
              {division.desc && ` · ${division.desc}`}
            </Link>
          )}
          <h1 className="text-3xl md:text-4xl font-light text-gray-900 leading-tight mb-6">{p.name}</h1>

          {facts.length > 0 && (
            <dl className="divide-y divide-gray-100 border-y border-gray-100 mb-8">
              {facts.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-4 py-3 text-sm">
                  <dt className="text-gray-400">{label}</dt>
                  <dd className="text-gray-900 whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-sm text-gray-500 mb-5">
            Manufactured and marketed by Moulins Pharmaceuticals Pvt. Ltd., Panchkula, Haryana. Available to
            pharmacies, distributors and doctors through our partner network.
          </p>
          <PublicCatalogCta privateHref={`/products/${p.id}`} />
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-xl font-light text-gray-900 mb-6">More from {division.label}</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {related.map((o) => (
              <li key={o.product_id}>
                <Link href={productPath(o)} className="group block">
                  <div className="h-48 bg-white flex items-center justify-center mb-2">
                    {o.thumb ? (
                      <img src={o.thumb} alt={o.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-gray-50" />
                    )}
                  </div>
                  <h3 className="text-sm text-gray-900 line-clamp-2 group-hover:underline underline-offset-2">{o.name}</h3>
                  {o.composition && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{o.composition}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/divisions/${division.slug}`} className="inline-block mt-8 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2">
            All {division.label} products
          </Link>
        </section>
      )}
    </div>
  );
}
