"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";

const TEAL = "#00A6A4";
const panelEase = [0.33, 1, 0.68, 1];

const dropdownContent = {
  about: (onClose) => (
    <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-3 gap-8">
      <div>
        <h3 className="text-2xl font-light text-gray-900 leading-snug mb-6">
          Learn about<br />Moulins
        </h3>
        <Link href="/about" onClick={onClose} className="group inline-flex items-center gap-2 text-sm font-medium" style={{ color: TEAL }}>
          About us <span className="group-hover:translate-x-1 transition-transform inline-block">&rarr;</span>
        </Link>
      </div>
      <div className="border-l border-gray-200 pl-8">
        <p className="font-medium mb-4 text-gray-900">Company</p>
        <ul className="space-y-3">
          {["Our Story", "Our Team", "Our Mission", "Our History"].map((item) => (
            <li key={item}>
              <Link href="/about" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{item}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-l border-gray-200 pl-8">
        <p className="font-medium mb-4 text-gray-900">Connect</p>
        <ul className="space-y-3">
          {["Contact Us", "Location", "Partner With Us", "Careers"].map((item) => (
            <li key={item}>
              <Link href="/contact" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{item}</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};

const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "about", label: "About" },
  { id: "location", label: "Location", href: "/contact#map" },
  { id: "contact", label: "Contact Us", href: "/contact" },
];

export default function CustomerNavbar() {
  const { user, logout } = useAuth();
  const { itemCount, openCart } = useCart();
  const [activeMenu, setActiveMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setActiveMenu(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") setActiveMenu(null); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const toggle = (id) => setActiveMenu((prev) => (prev === id ? null : id));
  const close = () => setActiveMenu(null);
  const isDropdownOpen = activeMenu && dropdownContent[activeMenu];

  return (
    <header ref={navRef} className="sticky top-0 z-50">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 md:px-10 h-[72px] flex items-center justify-between">

          {/* Logo */}
          <Link href="/" onClick={close} className="flex items-center gap-3">
            <Image src="/Moulins Logo High Res - V2.png" alt="Moulins" width={120} height={40} className="h-10 w-auto" priority />
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={close}
                  className="px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-200 relative group"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-4 right-4 h-[2px] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 rounded-full" style={{ backgroundColor: TEAL }} />
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 relative group"
                >
                  {item.label}
                  <span
                    className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full transition-transform duration-300"
                    style={{ backgroundColor: TEAL, transform: activeMenu === item.id ? "scaleX(1)" : "scaleX(0)" }}
                  />
                </button>
              )
            )}
          </div>

          {/* Right side: WhatsApp, Gmail, Cart, User */}
          <div className="flex items-center gap-3">
            {/* WhatsApp */}
            <a
              href="https://wa.me/9815535304?text=Hi%2C%20I%E2%80%99m%20interested%20in%20partnering%20with%20Moulins%20Pharmaceuticals."
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-110 duration-200"
              aria-label="WhatsApp"
            >
              <Image src="/icons8-whatsapp.svg" alt="WhatsApp" width={32} height={32} className="w-8 h-8" />
            </a>

            {/* Gmail */}
            <a
              href="mailto:info@moulinspharma.com"
              className="transition-transform hover:scale-110 duration-200"
              aria-label="Email"
            >
              <Image src="/icons8-gmail.svg" alt="Email" width={32} height={32} className="w-8 h-8" />
            </a>

            {/* Cart */}
            <button
              onClick={() => { close(); openCart(); }}
              className="relative text-gray-700 hover:text-gray-900 transition-colors duration-200 ml-1"
              aria-label="Cart"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-white text-[10px] font-medium rounded-full flex items-center justify-center" style={{ backgroundColor: TEAL }}>
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>

            {/* User */}
            {user && (
              <div className="relative pl-3 border-l border-gray-200">
                <button
                  onClick={() => toggle("user")}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span className="hidden sm:inline">{user.username || user.phone_number}</span>
                  <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${activeMenu === "user" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <AnimatePresence>
                  {activeMenu === "user" && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user.username || "User"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{user.phone_number}</p>
                      </div>
                      <div className="py-1">
                        <Link href="/orders" onClick={close} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">My Orders</Link>
                        <Link href="/doctors" onClick={close} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">My Doctors</Link>
                      </div>
                      <div className="border-t border-gray-100 py-1">
                        <button onClick={() => { close(); logout(); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Logout</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.4, ease: panelEase }}
            className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-sm overflow-hidden z-50"
          >
            <AnimatePresence mode="wait">
              <motion.div key={activeMenu} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {dropdownContent[activeMenu](close)}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop */}
      <AnimatePresence>
        {activeMenu && activeMenu !== "user" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="fixed inset-0 top-[72px] bg-black/5 z-40"
            onClick={close}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
