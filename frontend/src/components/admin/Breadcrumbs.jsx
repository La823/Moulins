"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Breadcrumbs in the admin top bar: where the page sits in the menu
// (Dashboard › SCM › Marg Stock › Batch PTN-251202). The menu part comes from
// the sidebar's own entries; a detail page names itself with
// useBreadcrumbTitle("Ravi Pharma") — until it does, its crumb says "Details".

const TitleContext = createContext({ title: null, setTitle: () => {} });

export function BreadcrumbProvider({ children }) {
  const [title, setTitle] = useState(null);
  return <TitleContext.Provider value={{ title, setTitle }}>{children}</TitleContext.Provider>;
}

// A detail page's name for the last crumb; cleared when the page goes away.
export function useBreadcrumbTitle(title) {
  const { setTitle } = useContext(TitleContext);
  useEffect(() => {
    setTitle(title || null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

// Second-level folders that aren't pages of their own, and fixed sub-pages.
const SUB_LABELS = {
  products: "Products",
  batches: "Batches",
  employee: "Employee",
  new: "New",
};

// entries: [{ href, label, group? }] in the order to prefer (sidebar first).
export default function Breadcrumbs({ entries }) {
  const pathname = usePathname() || "";
  const { title } = useContext(TitleContext);

  // The sidebar entry this page lives under: the longest href that is the
  // path or a parent of it.
  const match = entries
    .filter((e) => e.href !== "/panel" && (pathname === e.href || pathname.startsWith(`${e.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const crumbs = [{ label: "Dashboard", href: "/panel" }];
  if (match) {
    if (match.group) crumbs.push({ label: match.group });
    crumbs.push({ label: match.label, href: match.href });
    const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
    rest.forEach((seg, i) => {
      const last = i === rest.length - 1;
      // A folder name mid-path ("products" in /products/123), or "new".
      if (SUB_LABELS[seg] && (!last || seg === "new")) {
        crumbs.push({ label: SUB_LABELS[seg] });
      } else if (last) {
        crumbs.push({ label: title || "Details" });
      } else {
        crumbs.push({ label: decodeURIComponent(seg) });
      }
    });
  } else if (pathname !== "/panel") {
    crumbs.push({ label: title || "Page" });
  }

  return (
    <nav aria-label="Breadcrumb" className="mr-auto min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={`${c.label}-${i}`}
              className={`items-center gap-1.5 ${last ? "flex min-w-0" : "shrink-0"} ${
                last ? "" : i < crumbs.length - 2 ? "hidden sm:flex" : "flex"
              }`}
            >
              {i > 0 && (
                // On phones only the last two crumbs show, so the first of
                // them goes without its leading chevron.
                <svg
                  className={`w-3.5 h-3.5 text-gray-300 shrink-0 ${last ? "" : "hidden sm:block"}`}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                </svg>
              )}
              {last ? (
                <span aria-current="page" className="font-medium text-gray-900 truncate" title={c.label}>
                  {c.label}
                </span>
              ) : c.href ? (
                <Link href={c.href} className="hover:text-gray-900 hover:underline whitespace-nowrap">
                  {c.label}
                </Link>
              ) : (
                <span className="whitespace-nowrap">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
