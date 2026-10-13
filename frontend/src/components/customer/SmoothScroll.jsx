"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";

// Keeps Lenis in step with the rest of the storefront:
// - a new page starts at the top (Lenis would otherwise carry its own
//   scroll position over a client-side navigation)
// - while a drawer or the mobile menu locks the page (body overflow hidden),
//   Lenis stops too, or the page would still glide behind the overlay
function LenisSync() {
  const lenis = useLenis();
  const pathname = usePathname();

  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true, force: true });
  }, [pathname, lenis]);

  useEffect(() => {
    if (!lenis) return;
    const sync = () => {
      if (document.body.style.overflow === "hidden") lenis.stop();
      else lenis.start();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [lenis]);

  return null;
}

// Smooth scrolling for the storefront (https://github.com/darkroomengineering/lenis).
// Window-level ("root"), so the page markup doesn't change. Respects
// "reduce motion": those visitors keep the browser's native scrolling.
export default function SmoothScroll() {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e) => setReduceMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (reduceMotion) return null;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        // scrollable boxes inside the page (cart drawer, menus, lists) keep
        // scrolling natively instead of the wheel moving the whole page
        allowNestedScroll: true,
        // in-page #links glide too
        anchors: true,
        stopInertiaOnNavigate: true,
      }}
    >
      <LenisSync />
    </ReactLenis>
  );
}
