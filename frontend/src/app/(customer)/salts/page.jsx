import Link from "next/link";
import { getPublicProducts } from "@/lib/publicCatalog";
import { publicSalts, saltPath } from "@/lib/salts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Medicines by Salt",
  description: "Find Moulins Pharmaceuticals products by salt (active ingredient), from A to Z, with every brand and combination that contains it.",
  alternates: { canonical: "/salts" },
};

export default async function SaltsPage() {
  const salts = publicSalts(await getPublicProducts());
  const byLetter = new Map();
  for (const s of salts) {
    const letter = /[a-z]/i.test(s.name[0]) ? s.name[0].toUpperCase() : "#";
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(s);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <h1 className="text-3xl md:text-4xl font-light text-gray-900 leading-tight mb-4">Medicines by salt</h1>
      <p className="text-gray-600 max-w-2xl mb-8">
        Every salt in the Moulins Pharmaceuticals range, with the products that contain it, alone or in combination.
      </p>

      <nav aria-label="Letters" className="flex flex-wrap gap-x-3 gap-y-1 text-sm mb-10">
        {[...byLetter.keys()].map((l) => (
          <a key={l} href={`#${l}`} className="text-gray-500 hover:text-gray-900">{l}</a>
        ))}
      </nav>

      {[...byLetter.entries()].map(([letter, list]) => (
        <section key={letter} id={letter} className="mb-10 scroll-mt-24">
          <h2 className="text-sm uppercase tracking-widest text-gray-400 mb-3 pb-2 border-b border-gray-100">{letter}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
            {list.map((s) => (
              <li key={s.slug}>
                <Link href={saltPath(s.name)} className="text-sm text-gray-700 hover:text-gray-900 hover:underline underline-offset-2">
                  {s.name}
                </Link>
                <span className="text-xs text-gray-400"> · {s.products.length}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
