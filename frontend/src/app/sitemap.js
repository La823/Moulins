const SITE_URL = "https://www.moulinspharma.com";

// Only the pages that are actually publicly reachable go here — the
// product catalog and division pages sit behind a login gate right now
// (see robots.js) so listing them would just send crawlers to redirects.
export default function sitemap() {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/careers`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
