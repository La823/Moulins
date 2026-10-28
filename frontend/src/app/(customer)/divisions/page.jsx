import Link from "next/link";
import { PUBLIC_DIVISIONS, SITE_URL, jsonLd } from "@/lib/publicCatalog";
import { divisionThumb } from "@/lib/divisions";

export const metadata = {
  title: "Our Divisions",
  description:
    "The 12 therapy divisions of Moulins Pharmaceuticals — respiratory, orthopaedics, urology, gastro, cardio-diabetic, antibiotics, paediatrics, wellness, neuro-psychiatry, dermatology, gynaecology and ophthalmology.",
  alternates: { canonical: "/divisions" },
};

export default function DivisionsPage() {
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Divisions", item: `${SITE_URL}/divisions` },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs)} />
      <p className="text-sm uppercase tracking-[0.3em] text-gray-400 mb-3">Moulins Pharmaceuticals</p>
      <h1 className="text-4xl md:text-5xl font-light text-gray-900 mb-4">Our divisions</h1>
      <p className="text-gray-600 max-w-2xl mb-12">
        Twelve specialist divisions, each focused on one therapy area, together covering the medicines
        doctors and pharmacies across India rely on every day.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {PUBLIC_DIVISIONS.map((d) => (
          <Link key={d.slug} href={`/divisions/${d.slug}`} className="group block">
            <div className="aspect-[3/1] overflow-hidden bg-gray-100 mb-3">
              <img
                src={divisionThumb(d.heroImage)}
                alt={`${d.label} division`}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <h2 className="text-lg text-gray-900">{d.label}</h2>
            {d.desc && <p className="text-sm text-gray-500">{d.desc}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
