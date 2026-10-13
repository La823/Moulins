"use client";

import { usePathname } from "next/navigation";
import CustomerNavbar from "@/components/customer/Navbar";
import Footer from "@/components/customer/Footer";
import CartDrawer from "@/components/customer/CartDrawer";
import SmoothScroll from "@/components/customer/SmoothScroll";

export default function CustomerLayout({ children }) {
  // The partner panel and team-member panel are each their own full-screen
  // app shell (persistent sidebar, own nav) — the storefront chrome
  // doesn't belong around either of them.
  const pathname = usePathname();
  const isPanel = pathname?.startsWith("/partner-panel") || pathname?.startsWith("/team-panel");

  if (isPanel) {
    return (
      <>
        {children}
        <CartDrawer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Smooth scrolling on storefront pages only — the partner/team
          panels above have their own scrolling sidebars and keep native scroll */}
      <SmoothScroll />
      <CustomerNavbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
