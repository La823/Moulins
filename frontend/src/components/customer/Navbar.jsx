"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";

const panelEase = [0.33, 1, 0.68, 1];

const dropdownContent = {
  products: (onClose) => (
    <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-3 gap-8">
      <div>
        <h3 className="text-2xl font-light text-gray-900 leading-snug mb-6">
          Explore our
          <br />
          product range
        </h3>
        <Link
          href="/products"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-sm text-red-600 font-medium"
        >
          Browse all products
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
      </div>

      <div className="border-l border-gray-200 pl-8">
        <Link
          href="/products"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-red-600 font-medium mb-5 hover:text-red-700 transition-colors"
        >
          Health &amp; Wellness
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <ul className="space-y-3">
          {["Pain Relief", "Vitamins & Supplements", "Digestive Health", "Respiratory Care"].map(
            (item) => (
              <li key={item}>
                <Link
                  href="/products"
                  onClick={onClose}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {item}
                </Link>
              </li>
            )
          )}
        </ul>
      </div>

      <div className="border-l border-gray-200 pl-8">
        <Link
          href="/products"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-red-600 font-medium mb-5 hover:text-red-700 transition-colors"
        >
          Personal Care
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <ul className="space-y-3">
          {["Skin Care", "Oral Care", "Hair Care", "Eye Care"].map((item) => (
            <li key={item}>
              <Link
                href="/products"
                onClick={onClose}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {item}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),

  about: (onClose) => (
    <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-3 gap-8">
      <div>
        <h3 className="text-2xl font-light text-gray-900 leading-snug mb-6">
          Learn about
          <br />
          Moulins
        </h3>
        <Link
          href="/about"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-sm text-red-600 font-medium"
        >
          About us
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
      </div>

      <div className="border-l border-gray-200 pl-8">
        <Link
          href="/about"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-red-600 font-medium mb-5 hover:text-red-700 transition-colors"
        >
          Company
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <ul className="space-y-3">
          {["Our Story", "Team", "Values", "Careers"].map((item) => (
            <li key={item}>
              <Link
                href="/about"
                onClick={onClose}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {item}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-l border-gray-200 pl-8">
        <Link
          href="/about"
          onClick={onClose}
          className="group inline-flex items-center gap-2 text-red-600 font-medium mb-5 hover:text-red-700 transition-colors"
        >
          Resources
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <ul className="space-y-3">
          {["FAQ", "Blog", "Support", "Partners"].map((item) => (
            <li key={item}>
              <Link
                href="/about"
                onClick={onClose}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {item}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};

const NAV_ITEMS = [
  { id: "products", label: "Products" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact", href: "/contact" },
];

export default function CustomerNavbar() {
  const { user, logout } = useAuth();
  const { itemCount, openCart } = useCart();
  const [activeMenu, setActiveMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setActiveMenu(null);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const toggle = (id) => setActiveMenu((prev) => (prev === id ? null : id));
  const close = () => setActiveMenu(null);

  const isDropdownOpen =
    activeMenu && activeMenu !== "search" && dropdownContent[activeMenu];

  return (
    <header ref={navRef} className="sticky top-0 z-50">
      {/* Main navigation bar */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 h-[72px] flex items-center justify-between">
          {/* Logo */}
          <Link href="/" onClick={close}>
            <Image
              src="/Moulins Logo High Res - V2.png"
              alt="Moulins"
              width={120}
              height={40}
              className="h-9 w-auto"
              priority
            />
          </Link>

          {/* Nav items + utilities */}
          <div className="flex items-center gap-10">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={close}
                  className="text-[15px] font-medium text-gray-700 hover:text-red-600 transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className="relative text-[15px] font-medium transition-colors duration-200 py-6"
                  style={{
                    color: activeMenu === item.id ? "#dc2626" : undefined,
                  }}
                >
                  <span className="text-gray-700 hover:text-red-600 transition-colors duration-200"
                    style={{
                      color: activeMenu === item.id ? "#dc2626" : undefined,
                    }}
                  >
                    {item.label}
                  </span>

                  {/* Red underline indicator */}
                  {activeMenu === item.id && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-600"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                </button>
              )
            )}

            {/* Search icon */}
            <button
              onClick={() => toggle("search")}
              className="text-red-600 hover:text-red-700 transition-colors duration-200"
              aria-label="Search"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {/* Cart icon */}
            <button
              onClick={() => { close(); openCart(); }}
              className="relative text-gray-700 hover:text-red-600 transition-colors duration-200"
              aria-label="Cart"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>

            {/* User area */}
            {user && (
              <div className="relative pl-6 border-l border-gray-200">
                <button
                  onClick={() => toggle("user")}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span>{user.username || user.phone_number}</span>
                  <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${activeMenu === "user" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
                      className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user.username || "User"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{user.phone_number}</p>
                      </div>
                      <div className="py-1">
                        <Link
                          href="/orders"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                          </svg>
                          My Orders
                        </Link>
                        <Link
                          href="/doctors"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                          </svg>
                          My Doctors
                        </Link>
                      </div>
                      <div className="border-t border-gray-100 py-1">
                        <button
                          onClick={() => { close(); logout(); }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                          </svg>
                          Logout
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Dropdown panels — container animates height on open/close,
          content crossfades when switching between menus */}
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
              <motion.div
                key={activeMenu}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {dropdownContent[activeMenu](close)}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search panel */}
      <AnimatePresence>
        {activeMenu === "search" && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.35, ease: panelEase }}
            className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-sm overflow-hidden z-50"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              <div className="max-w-7xl mx-auto px-8 py-10">
                <input
                  type="text"
                  placeholder="Search products..."
                  autoFocus
                  className="w-full text-2xl font-light text-gray-900 placeholder:text-gray-300 outline-none border-b border-gray-200 pb-4"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle backdrop overlay */}
      <AnimatePresence>
        {activeMenu && activeMenu !== "user" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 top-[72px] bg-black/5 z-40"
            onClick={close}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
