"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Loader from "@/components/Loader";

// Shows the logo loader as a full-screen overlay for the moment between
// clicking any internal link and the new page actually rendering. Works
// globally via a document-level click listener rather than wrapping every
// <Link>, so it covers every link in the app (including ones added later)
// without touching each page.
export default function RouteLoader() {
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Adjusting state during render (not in an effect) when a prop changes —
  // the pattern React itself recommends for this: it re-renders immediately
  // with the reset state, no extra effect/render cascade.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setNavigating(false);
  }

  useEffect(() => {
    function handleClick(e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = e.target.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setNavigating(true);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!navigating) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex items-center justify-center">
      <Loader size="lg" />
    </div>
  );
}
