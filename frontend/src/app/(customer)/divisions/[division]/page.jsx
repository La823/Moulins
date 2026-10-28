import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PUBLIC_DIVISIONS,
  SITE_URL,
  getDivision,
  getDivisionProducts,
  jsonLd,
  productPath,
} from "@/lib/publicCatalog";
import PublicCatalogCta from "@/components/customer/PublicCatalogCta";

// Rendered per request from the in-memory catalogue (see publicCatalog.js),
// never at build time, when the backend may not be reachable.
export const dynamic = "force-dynamic";

const areaOf = (d) => (d.desc ? `${d.desc} division` : "general and wellness division");

export async function generateMetadata({ params }) {
  const d = getDivision((await params).division);
  if (!d) return {};
  const title = d.desc ? `${d.label} — ${d.desc} Medicines` : `${d.label} — General & Wellness Products`;
  const description = `${d.label} is the ${areaOf(d)} of Moulins Pharmaceuticals. Browse its products with their composition, dosage form and pack size.`;
  return {
    title,
    description,
    alternates: { canonical: `/divisions/${d.slug}` },
    openGraph: { title, description, url: `/divisions/${d.slug}`, images: [{ url: d.heroImage, alt: `${d.label} division` }] },
  };
}

export default async function DivisionPage({ params }) {
  const d = getDivision((await params).division);
  if (!d) notFound();
  const products = await getDivisionProducts(d);
  const forms = [...new Set(products.map((p) => p.form).filter(Boolean))].sort();

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Divisions", item: `${SITE_URL}/divisions` },
        { "@type": "ListItem", position: 3, name: d.label, item: `${SITE_URL}/divisions/${d.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${d.label} products`,
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.name,
        url: `${SITE_URL}${productPath(p)}`,
      })),
    },
  ];

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />

      <section className="relative h-[45vh] min-h-[320px] flex items-end overflow-hidden">
        <img src={d.heroImage} alt={`${d.label} division`} className="absolute inset-0 w-full h-full object-cover object-[center_15%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-8 pb-12">
          <nav aria-label="Breadcrumb" className="text-xs text-white/60 mb-3">
            <Link href="/divisions" className="hover:text-white">Divisions</Link>
            <span className="mx-2">/</span>
            <span>{d.label}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl text-white leading-tight mb-2">{d.label}</h1>
          {d.desc && <p className="text-sm md:text-base uppercase tracking-[0.2em] text-white/70">{d.desc}</p>}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-gray-600">
              {d.label} is the {areaOf(d)} of Moulins Pharmaceuticals
              {products.length > 0 && (
                <>
                  , with {products.length} product{products.length !== 1 ? "s" : ""}
                  {forms.length > 0 && <> in {forms.length === 1 ? forms[0].toLowerCase() : `${forms.slice(0, -1).join(", ").toLowerCase()} and ${forms.at(-1).toLowerCase()}`} form</>}
                </>
              )}
              .
            </p>
          </div>
          <PublicCatalogCta privateHref={d.privateRoute} label={`from ${d.label}`} />
        </div>

        {products.length === 0 ? (
          <p className="text-center py-20 text-gray-400 text-sm">Products for this division will be listed here soon.</p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">
            {products.map((p) => (
              <li key={p.product_id}>
                <Link href={productPath(p)} className="group block">
                  <div className="h-56 sm:h-72 bg-white flex items-center justify-center mb-3">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-gray-50" />
                    )}
                  </div>
                  <h2 className="text-sm text-gray-900 leading-snug line-clamp-2 group-hover:underline underline-offset-2">{p.name}</h2>
                  {p.composition && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.composition}</p>}
                  {(p.form || p.packSize) && (
                    <p className="text-xs text-gray-400 mt-1">{[p.form, p.packSize].filter(Boolean).join(" · ")}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-16 pt-8 border-t border-gray-200">
          <h2 className="text-sm uppercase tracking-widest text-gray-400 mb-4">Other divisions</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PUBLIC_DIVISIONS.filter((o) => o.slug !== d.slug).map((o) => (
              <Link key={o.slug} href={`/divisions/${o.slug}`} className="text-sm text-gray-600 hover:text-gray-900">
                {o.label}
                {o.desc && <span className="text-gray-400"> · {o.desc}</span>}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
