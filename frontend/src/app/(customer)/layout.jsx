"use client";

import CustomerNavbar from "@/components/customer/Navbar";
import Footer from "@/components/customer/Footer";
import CartDrawer from "@/components/customer/CartDrawer";

export default function CustomerLayout({ children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <CustomerNavbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
