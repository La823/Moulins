const SITE_URL = "https://www.moulinspharma.com";

// Everything under (protected) — products, division pages, doctors,
// meetings, orders, profile, chat, etc. — sits behind a client-side login
// redirect, so there's nothing there for a crawler to index yet; disallow
// it explicitly rather than let bots waste crawl budget hitting /login
// redirects. The admin panel is disallowed outright.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/login", "/products", "/aerozone", "/bonevoyage", "/fluidity", "/gutsy", "/jivya", "/lifegard", "/littleplanet", "/matrix", "/mindset", "/missbella", "/srishti", "/viewpoint", "/doctors", "/meetings", "/orders", "/profile", "/chat", "/checkout", "/dashboard", "/requests", "/learning"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
