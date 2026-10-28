import { SITE_URL } from "@/lib/publicCatalog";

// Everything under (protected) — products, division pages, doctors,
// meetings, orders, profile, chat, etc. — sits behind a client-side login
// redirect, so there's nothing there for a crawler to index; disallow it
// explicitly rather than let bots waste crawl budget hitting /login
// redirects. The public catalogue lives at /divisions and /medicines
// instead. The admin panel, warehouse and API are disallowed outright.
const PRIVATE = [
  "/panel", "/warehouse", "/api/", "/login", "/reset-password",
  "/products", "/aerozone", "/bonevoyage", "/fluidity", "/gutsy", "/jivya", "/lifegard", "/littleplanet",
  "/matrix", "/mindset", "/missbella", "/srishti", "/viewpoint",
  "/become-partner", "/chat", "/checkout", "/dashboard", "/doctor-panel", "/doctors", "/favorites", "/learning",
  "/meetings", "/my-attendance", "/my-daily-log", "/notifications", "/orders", "/partner-panel", "/payments",
  "/presentations", "/profile", "/requests", "/settings", "/special", "/team-panel",
];

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
