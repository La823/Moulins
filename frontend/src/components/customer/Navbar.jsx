"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";

const panelEase = [0.33, 1, 0.68, 1];

// All 12 division landing pages, in display order.
const DIVISIONS = [
  { name: "Aerozone", desc: "Respiratory & ENT", href: "/aerozone" },
  { name: "Bone Voyage", desc: "Orthopaedics", href: "/bonevoyage" },
  { name: "Fluidity", desc: "Urology & Renal", href: "/fluidity" },
  { name: "Gutsy", desc: "Gastro", href: "/gutsy" },
  { name: "Jivya", desc: "Cardio Diabetic", href: "/jivya" },
  { name: "Life Gard", desc: "Antibiotics/Trauma", href: "/lifegard" },
  { name: "Little Planet", desc: "Pediatric", href: "/littleplanet" },
  { name: "Matrix", desc: "", href: "/matrix" },
  { name: "Mindset", desc: "Neuro/Psychiatry", href: "/mindset" },
  { name: "Missbella", desc: "Derma & Skin", href: "/missbella" },
  { name: "Srishti", desc: "Gynaecology", href: "/srishti" },
  { name: "View Point", desc: "Ophthalmology", href: "/viewpoint" },
];

const dropdownContent = {
  products: (onClose) => (
    <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-[1fr_auto] gap-8 items-start">
      <div>
        <h3 className="text-2xl font-light text-gray-900 leading-snug mb-6">
          Explore our
          <br />
          product range
        </h3>
        <div className="flex flex-col items-start gap-3">
          <Link
            href="/products"
            onClick={onClose}
            className="group inline-flex items-center gap-4 text-4xl font-bold text-red-600"
          >
            Browse all products
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
          <Link
            href="/products?tag=Upcoming"
            onClick={onClose}
            className="group inline-flex items-center gap-2 text-xl text-gray-500 font-medium"
          >
            Upcoming products
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              <span
                className="inline-block"
                style={{ transform: "scaleX(5)", transformOrigin: "left" }}
              >
                &#10230;
              </span>
            </span>
          </Link>
        </div>
      </div>

      <div className="border-l border-gray-200 pl-10 flex gap-28">
      <div>
        <p className="font-heading text-xl font-thin text-red-600 mb-5">Our Divisions</p>
        <ul className="space-y-3">
          {DIVISIONS.slice(0, 6).map((division) => (
            <li key={division.href}>
              <Link
                href={division.href}
                onClick={onClose}
                className="group block text-base border-b border-transparent hover:border-red-600 transition-colors"
              >
                <span className="font-heading text-gray-900 font-medium group-hover:text-red-600 transition-colors">
                  {division.name}
                </span>
                {division.desc && (
                  <span className="text-xs text-gray-400 group-hover:text-red-600 transition-colors">
                    {" "}
                    &middot; {division.desc}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-heading text-xl font-thin text-red-600 mb-5 opacity-0 select-none">Our Divisions</p>
        <ul className="space-y-3">
          {DIVISIONS.slice(6).map((division) => (
            <li key={division.href}>
              <Link
                href={division.href}
                onClick={onClose}
                className="group block text-base border-b border-transparent hover:border-red-600 transition-colors"
              >
                <span className="font-heading text-gray-900 font-medium group-hover:text-red-600 transition-colors">
                  {division.name}
                </span>
                {division.desc && (
                  <span className="text-xs text-gray-400 group-hover:text-red-600 transition-colors">
                    {" "}
                    &middot; {division.desc}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
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
          {[
            { label: "Our Story", href: "/about" },
            { label: "Team", href: "/about" },
            { label: "Values", href: "/about" },
            { label: "Careers", href: "/careers" },
          ].map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={onClose}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {item.label}
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
          {["FAQ", "Blog", "Support", "Partners"].map((item) =>
            item === "Blog" ? (
              <li key={item} className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{item}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
                  Coming soon
                </span>
              </li>
            ) : (
              <li key={item}>
                <Link
                  href="/about"
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
  const [notifications, setNotifications] = useState([]);
  const [notifViewerUrl, setNotifViewerUrl] = useState(null);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const navRef = useRef(null);
  const router = useRouter();

  // Lightweight top-5 suggestions as you type — the full product grid only
  // loads once the search is actually submitted (Enter / clicking a result).
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch(`/products?search=${encodeURIComponent(q)}&limit=5`)
        .then((data) => {
          setSearchSuggestions(data.products || []);
          setShowSuggestions(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const goToSearch = (q) => {
    if (!q) return;
    router.push(`/products?search=${encodeURIComponent(q)}`);
    setActiveMenu(null);
    setShowSuggestions(false);
    setSearchQuery("");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    goToSearch(searchQuery.trim());
  };

  const handleSuggestionClick = (product) => {
    router.push(`/products/${product.id}`);
    setActiveMenu(null);
    setShowSuggestions(false);
    setSearchQuery("");
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveMenu(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/notifications?limit=5")
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => {});
  }, [user]);

  const markNotifRead = async (recipientId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.recipient_id === recipientId ? { ...n, is_read: true } : n))
    );
    try {
      await apiFetch(`/notifications/${recipientId}/read`, { method: "PUT" });
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotifClick = (n) => {
    if (!n.is_read) markNotifRead(n.recipient_id);
    if (n.deep_link) {
      router.push(n.deep_link);
      close();
    } else if (n.image_url) {
      setNotifViewerUrl(n.image_url);
    }
  };

  // Doctors have their own minimal profile (name/phone/email/speciality/
  // clinic — no GST/license/address, none of which applies to them). The
  // generic customer /profile page shouldn't ever appear in their nav.
  const profileHref = (u) => (u.role === "doctor" ? "/doctor-panel/profile" : "/profile");

  const dashboardHref = (u) =>
    u.role === "admin" || u.role === "employee"
      ? "/panel"
      : u.role === "team_member"
      ? "/team-panel"
      : u.role === "doctor"
      ? "/doctor-panel"
      : "/dashboard";
  const dashboardLabel = (u) =>
    u.role === "admin" || u.role === "employee"
      ? "Panel"
      : u.role === "team_member"
      ? "Team Panel"
      : u.role === "doctor"
      ? "Doctor Panel"
      : "Dashboard";

  const toggle = (id) => setActiveMenu((prev) => (prev === id ? null : id));
  const close = () => {
    setActiveMenu(null);
    setMobileMenuOpen(false);
  };

  // Special-type customers browse their private catalog via the "Special"
  // filter tile on the products page itself (not a separate navbar link —
  // partners and team members already have their own dedicated nav entries
  // below). Partners get a "Partner Panel" tile; team members (their
  // sub-accounts) get a "Team Panel" tile of their own. All hidden from
  // everyone else.
  let navItems = NAV_ITEMS;
  if (user?.role === "partner") {
    navItems = [...navItems, { id: "team", label: "Partner Panel", href: "/partner-panel" }];
  } else if (user?.role === "team_member") {
    navItems = [...navItems, { id: "team-panel", label: "Team Panel", href: "/team-panel" }];
  } else if (user?.role === "doctor") {
    navItems = [...navItems, { id: "doctor-panel", label: "Doctor Panel", href: "/doctor-panel" }];
  }
  // Team members are sub-accounts for field work, not billing — no cart.
  // Doctors can browse the catalog but never order — no cart either.
  const showCart = !!user && user.role !== "team_member" && user.role !== "doctor";

  const isDropdownOpen =
    activeMenu && activeMenu !== "search" && dropdownContent[activeMenu];

  return (
    <header ref={navRef} className="sticky top-0 z-50">
      {/* Main navigation bar */}
      <nav className="bg-white/70 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 lg:h-[72px] flex items-center justify-between">
          {/* Logo */}
          <Link href="/" onClick={close}>
            <Image
              src="/Moulins Logo High Res - V2.png"
              alt="Moulins"
              width={120}
              height={40}
              className="h-7 sm:h-8 lg:h-9 w-auto"
              priority
            />
          </Link>

          {/* Mobile utilities: cart (logged in only) + hamburger */}
          <div className="flex lg:hidden items-center gap-4">
            {showCart && (
              <button
                onClick={() => { close(); openCart(); }}
                className="relative text-gray-700"
                aria-label="Cart"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
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
            )}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Menu"
              className="text-gray-700 w-8 h-8 flex items-center justify-center"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                </svg>
              )}
            </button>
          </div>

          {/* Nav items + utilities (desktop) */}
          <div className="hidden lg:flex items-center gap-10">
            {navItems.map((item) =>
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

            {/* WhatsApp */}
            <a
              href="https://wa.me/9815535304?text=Hi%2C%20I%E2%80%99m%20interested%20in%20partnering%20with%20Moulins%20Pharmaceuticals."
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="transition-transform hover:scale-110 duration-200"
            >
              <svg
                className="w-9 h-9"
                fill="#000000"
                viewBox="0 0 640 640"
                aria-hidden="true"
              >
                <path d="M476.9 161.1C435 119.1 379.2 96 319.9 96C197.5 96 97.9 195.6 97.9 318C97.9 357.1 108.1 395.3 127.5 429L96 544L213.7 513.1C246.1 530.8 282.6 540.1 319.8 540.1L319.9 540.1C442.2 540.1 544 440.5 544 318.1C544 258.8 518.8 203.1 476.9 161.1zM319.9 502.7C286.7 502.7 254.2 493.8 225.9 477L219.2 473L149.4 491.3L168 423.2L163.6 416.2C145.1 386.8 135.4 352.9 135.4 318C135.4 216.3 218.2 133.5 320 133.5C369.3 133.5 415.6 152.7 450.4 187.6C485.2 222.5 506.6 268.8 506.5 318.1C506.5 419.9 421.6 502.7 319.9 502.7zM421.1 364.5C415.6 361.7 388.3 348.3 383.2 346.5C378.1 344.6 374.4 343.7 370.7 349.3C367 354.9 356.4 367.3 353.1 371.1C349.9 374.8 346.6 375.3 341.1 372.5C308.5 356.2 287.1 343.4 265.6 306.5C259.9 296.7 271.3 297.4 281.9 276.2C283.7 272.5 282.8 269.3 281.4 266.5C280 263.7 268.9 236.4 264.3 225.3C259.8 214.5 255.2 216 251.8 215.8C248.6 215.6 244.9 215.6 241.2 215.6C237.5 215.6 231.5 217 226.4 222.5C221.3 228.1 207 241.5 207 268.8C207 296.1 226.9 322.5 229.6 326.2C232.4 329.9 268.7 385.9 324.4 410C359.6 425.2 373.4 426.5 391 423.9C401.7 422.3 423.8 410.5 428.4 397.5C433 384.5 433 373.4 431.6 371.1C430.3 368.6 426.6 367.2 421.1 364.5z" />
              </svg>
            </a>

            {/* Gmail */}
            <a
              href="mailto:info@moulinspharma.com"
              aria-label="Email us"
              className="transition-transform hover:scale-110 duration-200"
            >
              <svg
                className="w-[30px] h-[30px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
                <rect x="2" y="4" width="20" height="16" rx="2" />
              </svg>
            </a>

            {/* Notifications bell — only shown to logged-in users */}
            {!!user && (
              <div className="relative">
                <button
                  onClick={() => toggle("notifications")}
                  className="relative text-gray-700 hover:text-red-600 transition-colors duration-200"
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {activeMenu === "notifications" && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">Notifications</p>
                      </div>
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-gray-400 text-center">No notifications yet</p>
                      ) : (
                        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                          {notifications.map((n) => (
                            <button
                              key={n.recipient_id}
                              onClick={() => handleNotifClick(n)}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                                n.is_read ? "" : "bg-teal-50/60"
                              }`}
                            >
                              <p className={`text-sm ${n.is_read ? "font-medium text-gray-800" : "font-semibold text-gray-900"}`}>
                                {n.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      <Link
                        href="/notifications"
                        onClick={close}
                        className="block px-4 py-2.5 text-center text-xs font-medium text-red-600 hover:text-red-700 border-t border-gray-100"
                      >
                        See all notifications
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Favorites icon — only shown to logged-in users */}
            {!!user && (
              <Link
                href="/favorites"
                onClick={close}
                className="text-gray-700 hover:text-red-600 transition-colors duration-200"
                aria-label="Favorites"
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
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 21.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              </Link>
            )}

            {/* Cart icon — only shown to logged-in users, nothing to cart otherwise */}
            {showCart && (
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
            )}

            {/* User area */}
            {!user && (
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#00A6A4" }}
              >
                Login
              </Link>
            )}
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
                          href={profileHref(user)}
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                          </svg>
                          My Profile
                        </Link>
                        <Link
                          href={dashboardHref(user)}
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                          </svg>
                          {dashboardLabel(user)}
                        </Link>
                        <Link
                          href="/settings"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                          Settings
                        </Link>
                        <Link
                          href="/chat"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                          </svg>
                          Messages
                        </Link>
                        <Link
                          href="/learning"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443" />
                          </svg>
                          Learning
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

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: panelEase }}
            className="lg:hidden bg-white border-b border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-8 py-6 max-h-[80vh] overflow-y-auto">
              {/* Search */}
              <form onSubmit={handleSearchSubmit} className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full text-base text-gray-900 placeholder:text-gray-400 outline-none border border-gray-200 rounded-lg px-4 py-2.5"
                />
              </form>

              {/* Top-level nav */}
              <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                <Link href="/products" onClick={close} className="py-3.5 text-base font-medium text-gray-900">
                  Products
                </Link>
                {!!user && (
                  <Link href="/notifications" onClick={close} className="py-3.5 text-base font-medium text-gray-900 flex items-center gap-2">
                    Notifications
                    {unreadCount > 0 && (
                      <span className="w-5 h-5 bg-red-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>
                )}
                {!!user && (
                  <Link href="/favorites" onClick={close} className="py-3.5 text-base font-medium text-gray-900">
                    Favorites
                  </Link>
                )}
                <Link href="/about" onClick={close} className="py-3.5 text-base font-medium text-gray-900">
                  About
                </Link>
                <Link href="/contact" onClick={close} className="py-3.5 text-base font-medium text-gray-900">
                  Contact
                </Link>
              </div>

              {/* Divisions */}
              <div className="mt-6">
                <p className="font-heading text-sm font-medium text-red-600 mb-3">Our Divisions</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {DIVISIONS.map((division) => (
                    <Link
                      key={division.href}
                      href={division.href}
                      onClick={close}
                      className="text-sm text-gray-700"
                    >
                      {division.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Contact icons */}
              <div className="flex items-center gap-6 mt-6 pt-6 border-t border-gray-100">
                <a
                  href="https://wa.me/9815535304?text=Hi%2C%20I%E2%80%99m%20interested%20in%20partnering%20with%20Moulins%20Pharmaceuticals."
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                >
                  <svg className="w-7 h-7" fill="#000000" viewBox="0 0 640 640" aria-hidden="true">
                    <path d="M476.9 161.1C435 119.1 379.2 96 319.9 96C197.5 96 97.9 195.6 97.9 318C97.9 357.1 108.1 395.3 127.5 429L96 544L213.7 513.1C246.1 530.8 282.6 540.1 319.8 540.1L319.9 540.1C442.2 540.1 544 440.5 544 318.1C544 258.8 518.8 203.1 476.9 161.1zM319.9 502.7C286.7 502.7 254.2 493.8 225.9 477L219.2 473L149.4 491.3L168 423.2L163.6 416.2C145.1 386.8 135.4 352.9 135.4 318C135.4 216.3 218.2 133.5 320 133.5C369.3 133.5 415.6 152.7 450.4 187.6C485.2 222.5 506.6 268.8 506.5 318.1C506.5 419.9 421.6 502.7 319.9 502.7zM421.1 364.5C415.6 361.7 388.3 348.3 383.2 346.5C378.1 344.6 374.4 343.7 370.7 349.3C367 354.9 356.4 367.3 353.1 371.1C349.9 374.8 346.6 375.3 341.1 372.5C308.5 356.2 287.1 343.4 265.6 306.5C259.9 296.7 271.3 297.4 281.9 276.2C283.7 272.5 282.8 269.3 281.4 266.5C280 263.7 268.9 236.4 264.3 225.3C259.8 214.5 255.2 216 251.8 215.8C248.6 215.6 244.9 215.6 241.2 215.6C237.5 215.6 231.5 217 226.4 222.5C221.3 228.1 207 241.5 207 268.8C207 296.1 226.9 322.5 229.6 326.2C232.4 329.9 268.7 385.9 324.4 410C359.6 425.2 373.4 426.5 391 423.9C401.7 422.3 423.8 410.5 428.4 397.5C433 384.5 433 373.4 431.6 371.1C430.3 368.6 426.6 367.2 421.1 364.5z" />
                  </svg>
                </a>
                <a href="mailto:info@moulinspharma.com" aria-label="Email us">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                  </svg>
                </a>
              </div>

              {/* Account */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                {!user && (
                  <Link
                    href="/login"
                    onClick={close}
                    className="block w-full text-center px-4 py-3 text-sm font-medium text-white rounded-lg"
                    style={{ backgroundColor: "#00A6A4" }}
                  >
                    Login
                  </Link>
                )}
                {user && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-900 mb-2">{user.username || user.phone_number}</p>
                    <Link href={profileHref(user)} onClick={close} className="py-2 text-sm text-gray-700">My Profile</Link>
                    <Link
                      href={dashboardHref(user)}
                      onClick={close}
                      className="py-2 text-sm text-gray-700"
                    >
                      {dashboardLabel(user)}
                    </Link>
                    <Link href="/settings" onClick={close} className="py-2 text-sm text-gray-700">Settings</Link>
                    <Link href="/chat" onClick={close} className="py-2 text-sm text-gray-700">Messages</Link>
                    <Link href="/learning" onClick={close} className="py-2 text-sm text-gray-700">Learning</Link>
                    <button
                      onClick={() => { close(); logout(); }}
                      className="text-left py-2 text-sm text-gray-700"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <form onSubmit={handleSearchSubmit}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products, composition..."
                    autoFocus
                    className="w-full text-2xl font-light text-gray-900 placeholder:text-gray-300 outline-none border-b border-gray-200 pb-4"
                  />
                </form>

                {/* Top-5 suggestions — lightweight, doesn't load the full grid */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="mt-4 divide-y divide-gray-100">
                    {searchSuggestions.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSuggestionClick(p)}
                        className="flex items-center gap-4 w-full py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        {p.images && p.images.length > 0 ? (
                          <img
                            src={p.images[0].image_url}
                            alt={p.name}
                            className="w-10 h-10 object-contain flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-50 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 truncate">{p.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => goToSearch(searchQuery.trim())}
                      className="w-full py-3 text-left text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      See all results for &ldquo;{searchQuery.trim()}&rdquo; &rarr;
                    </button>
                  </div>
                )}
                {showSuggestions && searchSuggestions.length === 0 && (
                  <p className="mt-4 text-sm text-gray-400">No matches found</p>
                )}
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
      {/* Notification image viewer */}
      <AnimatePresence>
        {notifViewerUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setNotifViewerUrl(null)}
          >
            <button
              onClick={() => setNotifViewerUrl(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
            <img
              src={notifViewerUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
