"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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

// A page that keeps its settings in the URL remembers them here (for this
// browser tab), so links back to it — its crumb, a detail page's "‹ back" —
// land on the same tab, sorts and filters instead of its defaults.
export function rememberQuery(path, query) {
  try {
    sessionStorage.setItem(`query:${path}`, query);
  } catch {
    /* storage blocked: links fall back to the plain page */
  }
}

export function withRememberedQuery(path) {
  try {
    const q = sessionStorage.getItem(`query:${path}`);
    return q ? `${path}?${q}` : path;
  } catch {
    return path;
  }
}

// Settings shared by every page under a section: going back within it
// keeps the ones the current page has (Analysis: period, running month, GST),
// over whatever the target page last had.
const SHARED_SETTINGS = { "/panel/marg-analysis": ["period", "current", "gst"] };

// onClick for a Link to a list page: go to it with its remembered settings.
export function useRememberedLink() {
  const router = useRouter();
  return (path) => (e) => {
    let to = withRememberedQuery(path);
    const section = Object.keys(SHARED_SETTINGS).find((p) => path.startsWith(p) && window.location.pathname.startsWith(p));
    if (section) {
      const [base, q] = to.split("?");
      const target = new URLSearchParams(q || "");
      const here = new URLSearchParams(window.location.search);
      SHARED_SETTINGS[section].forEach((k) => (here.has(k) ? target.set(k, here.get(k)) : target.delete(k)));
      to = target.toString() ? `${base}?${target}` : base;
    }
    if (to !== path && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      router.push(to);
    }
  };
}

// Pages below a menu entry that have a name of their own, so their crumb
// says it and links to them (Analysis › Customers › Customer ranking).
const SUB_PAGES = {
  "/panel/marg-analysis/net-sales": "Net sales",
  "/panel/marg-analysis/customers": "Customers",
  "/panel/marg-analysis/suppliers": "Suppliers & purchases",
  "/panel/marg-analysis/products": "Products",
};

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
  const remembered = useRememberedLink();

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
      const path = `${match.href}/${rest.slice(0, i + 1).join("/")}`;
      if (SUB_PAGES[path]) {
        crumbs.push({ label: SUB_PAGES[path], href: path });
      } else if (SUB_LABELS[seg] && (!last || seg === "new")) {
        // A folder name mid-path ("batches" in /batches/123), or "new".
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
                <Link href={c.href} onClick={remembered(c.href)} className="hover:text-gray-900 hover:underline whitespace-nowrap">
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
