"use client";

import { usePathname } from "next/navigation";
import CustomerNavbar from "@/components/customer/Navbar";
import Footer from "@/components/customer/Footer";
import CartDrawer from "@/components/customer/CartDrawer";

export default function CustomerLayout({ children }) {
  // The partner panel is its own full-screen app shell (persistent sidebar,
  // own nav) — the storefront chrome doesn't belong around it.
  const pathname = usePathname();
  const isPanel = pathname?.startsWith("/partner-panel");

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
      <CustomerNavbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
