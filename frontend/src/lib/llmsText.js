import "server-only";
import { PUBLIC_DIVISIONS, SITE_URL, divisionForProduct, getPublicProducts, productPath } from "@/lib/publicCatalog";

// /llms.txt and /llms-full.txt — a plain-Markdown summary of the company
// for AI assistants (the llms.txt convention: https://llmstxt.org). Only
// what the public site already says: the About page's facts and the public
// catalogue (see publicCatalog.js), never rates or detailing material.

const ABOUT = `# Moulins Pharmaceuticals

> Moulins Pharmaceuticals Pvt. Ltd. is a pharmaceutical company based in Panchkula, Haryana, India. It manufactures and distributes medicines, nutraceuticals and active pharmaceutical ingredients across India through twelve therapy divisions, selling to pharmacies, distributors and doctors through a partner network.

- Mission: to advance health through quality pharmaceuticals — manufactured with precision, distributed with integrity, and delivered with care to every corner of India.
- Values: quality first (ISO-certified manufacturing with quality assurance from raw materials to finished products), patient-centric decisions, and ethical leadership (transparent practices, fair pricing and honest relationships with partners, distributors and healthcare professionals).
- Scale: 500+ products, 15+ years, pan-India distribution.
- Recognition: named Pharmaceutical Medicine Supplier — Startup of the Year 2026 by Pharma Outlook (July 2026), for its entrepreneur-first partner model.
- Leadership: Tanmay Arora (CEO; chemical engineer, IIT Kharagpur; formerly in the Young Leaders Program at Dr. Reddy's Laboratories), Pardeep Arora (Director, Sales & Marketing; 33+ years in pharmaceutical sales and marketing; founder of Metamorf Lifesciences), Durgesh Saini (Director, Sales; 15+ years in pharmaceutical sales).
- Prices and ordering are available to registered partners only; this site does not sell to patients directly.
- Medical note: product information here is for healthcare professionals and trade partners. Patients should take medicines only as prescribed by a doctor.`;

const CONTACT = `## Contact

- Address: 1st Floor, 363, Industrial Area Phase 2, Panchkula, Haryana 134113, India
- Phone: +91 98155 35304
- Email: info@moulinspharma.com (general), Sales@moulinspharma.com (sales)
- Website: ${SITE_URL}
- Android app: https://play.google.com/store/apps/details?id=com.moulinspharma.app`;

const PAGES = `## Key pages

- [About us](${SITE_URL}/about): mission, values, leadership and press
- [All divisions](${SITE_URL}/divisions): the twelve therapy divisions and their products
- [Become a partner / contact](${SITE_URL}/contact): for pharmacies, distributors and doctors
- [Careers](${SITE_URL}/careers): current openings`;

function divisionsSection(products) {
  const counts = {};
  for (const p of products) {
    const d = divisionForProduct(p);
    if (d) counts[d.slug] = (counts[d.slug] || 0) + 1;
  }
  const lines = PUBLIC_DIVISIONS.map((d) => {
    const area = d.desc || "General & Wellness";
    const n = counts[d.slug] ? ` — ${counts[d.slug]} product${counts[d.slug] === 1 ? "" : "s"}` : "";
    return `- [${d.label}](${SITE_URL}/divisions/${d.slug}): ${area}${n}`;
  });
  return `## Divisions\n\n${lines.join("\n")}`;
}

const productLine = (p) => {
  const details = [p.composition, p.strength, p.form, p.packSize].filter(Boolean).join("; ");
  return `- [${p.name}](${SITE_URL}${productPath(p)})${details ? `: ${details.replace(/\s+/g, " ")}` : ""}`;
};

function productsSection(products) {
  const sections = PUBLIC_DIVISIONS.map((d) => {
    const list = products.filter((p) => divisionForProduct(p)?.slug === d.slug).sort((a, b) => a.name.localeCompare(b.name));
    if (list.length === 0) return null;
    return `### ${d.label}${d.desc ? ` (${d.desc})` : ""}\n\n${list.map(productLine).join("\n")}`;
  }).filter(Boolean);
  return `## Products\n\nEach product with its composition, strength, dosage form and pack size.\n\n${sections.join("\n\n")}`;
}

// The short file: who the company is, its divisions and where to look next.
export async function llmsTxt() {
  const products = await getPublicProducts();
  return [
    ABOUT,
    divisionsSection(products),
    PAGES,
    CONTACT,
    `## Optional\n\n- [Full product list](${SITE_URL}/llms-full.txt): every public product with its composition`,
  ].join("\n\n") + "\n";
}

// The long file: the same, plus every public product.
export async function llmsFullTxt() {
  const products = await getPublicProducts();
  return [ABOUT, divisionsSection(products), productsSection(products), PAGES, CONTACT].join("\n\n") + "\n";
}
