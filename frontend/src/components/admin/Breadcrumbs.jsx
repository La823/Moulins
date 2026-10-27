"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Breadcrumbs in the admin top bar, as the route you took to this page:
// Dashboard › Analysis › Customers › All customers › Kotler Pharma.
//
// Opening a page from the menu (sidebar or top bar) starts the route again
// from where that page sits in the menu (Dashboard › SCM › Marg Stock).
// Following a link inside a page adds that page to the route; going back to
// a page already on it — by its crumb or the browser's Back — cuts the
// route there. Each crumb keeps the page's address as you left it, so going
// back lands on the same filters and sorts. Links marked
// data-crumb="replace" (tabs between sibling reports) swap the last crumb
// instead of adding one. The route lives in sessionStorage (this browser
// tab only).
//
// A detail page names itself with useBreadcrumbTitle("Ravi Pharma") — until
// it does, its crumb says "Details". <BackLink> on a detail page goes to the
// previous step of the route.

const TitleContext = createContext({ title: null, setTitle: () => {}, trail: null, setTrail: () => {} });

export function BreadcrumbProvider({ children }) {
  const [title, setTitle] = useState(null); // { path, text }
  const [trail, setTrail] = useState(null);
  return <TitleContext.Provider value={{ title, setTitle, trail, setTrail }}>{children}</TitleContext.Provider>;
}

// A detail page's name for its crumb; cleared when the page goes away. It is
// tagged with the page's path so a page that has just been left can't lend
// its name to the next one.
export function useBreadcrumbTitle(title) {
  const { setTitle } = useContext(TitleContext);
  const pathname = usePathname();
  useEffect(() => {
    setTitle(title ? { path: pathname, text: title } : null);
    return () => setTitle(null);
  }, [title, pathname, setTitle]);
}

// A page that keeps its settings in the URL remembers them here (for this
// browser tab), so links back to it land on the same tab, sorts and filters
// instead of its defaults — also when the route doesn't hold it.
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

function withSharedSettings(to) {
  const [base, q] = to.split("?");
  const section = Object.keys(SHARED_SETTINGS).find((p) => base.startsWith(p) && window.location.pathname.startsWith(p));
  if (!section) return to;
  const target = new URLSearchParams(q || "");
  const here = new URLSearchParams(window.location.search);
  SHARED_SETTINGS[section].forEach((k) => (here.has(k) ? target.set(k, here.get(k)) : target.delete(k)));
  return target.toString() ? `${base}?${target}` : base;
}

// onClick for a Link back to a page: go to `url` if given (the address it
// was left at), else the page with its remembered settings.
export function useRememberedLink() {
  const router = useRouter();
  return (path, url) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // new tab: plain href
    const to = withSharedSettings(url || withRememberedQuery(path));
    if (to !== path) {
      e.preventDefault();
      router.push(to);
    }
  };
}

// Pages below a menu entry that have a name of their own, so their crumb
// says it and links to them (Analysis › Customers › All customers).
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

// Where a page sits in the menu, as crumbs; the last one is the page itself.
function menuCrumbs(pathname, entries, title) {
  const match = entries
    .filter((e) => e.href !== "/panel" && (pathname === e.href || pathname.startsWith(`${e.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const crumbs = [{ label: "Dashboard", href: "/panel", path: "/panel" }];
  if (match) {
    if (match.group) crumbs.push({ label: match.group });
    crumbs.push({ label: match.label, href: match.href, path: match.href });
    const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
    rest.forEach((seg, i) => {
      const last = i === rest.length - 1;
      const path = `${match.href}/${rest.slice(0, i + 1).join("/")}`;
      if (SUB_PAGES[path]) {
        crumbs.push({ label: SUB_PAGES[path], href: path, path });
      } else if (SUB_LABELS[seg] && (!last || seg === "new")) {
        // A folder name mid-path ("batches" in /batches/123), or "new".
        crumbs.push({ label: SUB_LABELS[seg], ...(last ? { href: path, path } : {}) });
      } else if (last) {
        crumbs.push({ label: title || "Details", href: path, path });
      } else {
        crumbs.push({ label: decodeURIComponent(seg) });
      }
    });
  } else if (pathname !== "/panel") {
    crumbs.push({ label: title || "Page", href: pathname, path: pathname });
  }
  return crumbs;
}

const TRAIL_KEY = "crumbTrail";
const REPLACE_KEY = "crumbReplace";
const MAX_CRUMBS = 8;

function load(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: crumbs fall back to the menu */
  }
}

// entries: [{ href, label, group? }] in the order to prefer (sidebar first).
export default function Breadcrumbs({ entries }) {
  const pathname = usePathname() || "";
  const { title: tagged, trail, setTrail } = useContext(TitleContext);
  const title = tagged && tagged.path === pathname ? tagged.text : null;
  const remembered = useRememberedLink();

  // Work out the route for this page.
  useEffect(() => {
    const menu = menuCrumbs(pathname, entries, title);
    const here = menu[menu.length - 1];
    const prev = load(TRAIL_KEY);
    const replace = load(REPLACE_KEY);
    save(REPLACE_KEY, false);
    const fromMenu = pathname === "/panel" || entries.some((e) => e.href === pathname);
    let next;
    const at = prev ? prev.findIndex((c) => c.path === pathname) : -1;
    if (at >= 0) {
      // Back to a page already on the route: cut it there.
      next = prev.slice(0, at + 1);
      next[at] = { ...next[at], label: title || (next[at].label !== "Details" ? next[at].label : here.label) };
    } else if (!prev || fromMenu) {
      next = menu;
    } else if (replace && prev.length > 1) {
      next = [...prev.slice(0, -1), here];
    } else {
      next = [...prev, here];
    }
    if (next.length > MAX_CRUMBS) next = [next[0], ...next.slice(next.length - (MAX_CRUMBS - 1))];
    save(TRAIL_KEY, next);
    setTrail(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, title]);

  // Before any click leaves the page, note the address it's at (its filters
  // and sorts), and whether the link only swaps the last crumb.
  useEffect(() => {
    const onClick = (e) => {
      const t = load(TRAIL_KEY);
      if (t?.length && t[t.length - 1].path === window.location.pathname) {
        t[t.length - 1].url = window.location.pathname + window.location.search;
        save(TRAIL_KEY, t);
      }
      const a = e.target.closest?.("a");
      if (a) save(REPLACE_KEY, a.dataset.crumb === "replace");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Until the route is worked out (first render), show the menu crumbs.
  const crumbs = trail && trail[trail.length - 1]?.path === pathname ? trail : menuCrumbs(pathname, entries, title);

  return (
    <nav aria-label="Breadcrumb" className="mr-auto min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={`${c.path || c.label}-${i}`}
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
                <Link href={c.url || c.href} onClick={remembered(c.href, c.url)} className="hover:text-gray-900 hover:underline whitespace-nowrap max-w-[14rem] truncate">
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

// "‹ Previous page" for a detail page: the step before it on the route, or
// `fallback` / `fallbackLabel` (the page's usual list) when there is none.
export function BackLink({ fallback, fallbackLabel, className = "inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3" }) {
  const pathname = usePathname();
  const { trail } = useContext(TitleContext);
  const remembered = useRememberedLink();
  const steps = (trail || []).filter((c) => c.href && c.path !== pathname);
  const prev = trail && steps.length > 1 ? steps[steps.length - 1] : null; // more than just Dashboard
  const href = prev ? prev.href : fallback;
  return (
    <Link href={prev?.url || href} onClick={remembered(href, prev?.url)} className={className}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
      </svg>
      {prev ? prev.label : fallbackLabel}
    </Link>
  );
}
