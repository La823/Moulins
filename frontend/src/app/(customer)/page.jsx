"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { visibleImages, cardImageUrl } from "@/lib/productImages";
import HomeCarousel from "@/components/customer/HomeCarousel";
import { useAuth } from "@/context/AuthContext";
// import AreasOfFocus from "@/components/customer/AreasOfFocus"; // temporarily hidden — see below

// All 12 divisions, using the same banner images used as filters on the Products page.
const DIVISIONS = [
  { name: "Aerozone", desc: "Respiratory & ENT", href: "/aerozone", icon: "/moulins divisions/thumbs/Aerozone.jpg", glyph: "wind", tint: "sky" },
  { name: "Bone Voyage", desc: "Orthopaedics", href: "/bonevoyage", icon: "/moulins divisions/thumbs/Bone Voyage.jpg", glyph: "bone", tint: "rose" },
  { name: "Fluidity", desc: "Urology & Renal", href: "/fluidity", icon: "/moulins divisions/thumbs/Fluidity.jpg", glyph: "droplet", tint: "cyan" },
  { name: "Gutsy", desc: "Gastro", href: "/gutsy", icon: "/moulins divisions/thumbs/GUTSY.jpg", glyph: "stomach", tint: "red" },
  { name: "Jivya", desc: "Cardio Diabetic", href: "/jivya", icon: "/moulins divisions/thumbs/Jivvya.jpg", glyph: "heart", tint: "violet" },
  { name: "Life Gard", desc: "Antibiotics & Trauma", href: "/lifegard", icon: "/moulins divisions/thumbs/Lifegard.jpg", glyph: "shield", tint: "red" },
  { name: "Little Planet", desc: "Pediatric", href: "/littleplanet", icon: "/moulins divisions/thumbs/Little Planet.jpg", glyph: "smile", tint: "emerald" },
  { name: "Matrix", desc: "General & Wellness", href: "/matrix", icon: "/moulins divisions/thumbs/Matrix.jpg", glyph: "leaf", tint: "teal" },
  { name: "Mindset", desc: "Neuro & Psychiatry", href: "/mindset", icon: "/moulins divisions/thumbs/Mindset.jpg", glyph: "brain", tint: "purple" },
  { name: "Misbella", desc: "Derma & Skin", href: "/missbella", icon: "/moulins divisions/thumbs/Misbella.jpg", glyph: "sparkle", tint: "amber" },
  { name: "Srishti", desc: "Gynaecology", href: "/srishti", icon: "/moulins divisions/thumbs/Srishti.jpg", glyph: "venus", tint: "pink" },
  { name: "View Point", desc: "Ophthalmology", href: "/viewpoint", icon: "/moulins divisions/thumbs/View Point.jpg", glyph: "eye", tint: "blue" },
];

// Tint classes spelled out in full so Tailwind keeps them.
// strip = card's lower band, badge = icon circle, arrow = arrow circle
const DIVISION_TINTS = {
  sky: { strip: "bg-sky-50", badge: "bg-sky-100 text-sky-600", arrow: "bg-sky-100 text-sky-700" },
  rose: { strip: "bg-rose-50", badge: "bg-rose-100 text-rose-500", arrow: "bg-rose-100 text-rose-600" },
  cyan: { strip: "bg-cyan-50", badge: "bg-cyan-100 text-cyan-600", arrow: "bg-cyan-100 text-cyan-700" },
  red: { strip: "bg-red-50", badge: "bg-red-100 text-red-500", arrow: "bg-red-100 text-red-600" },
  violet: { strip: "bg-violet-50", badge: "bg-violet-100 text-violet-600", arrow: "bg-violet-100 text-violet-700" },
  emerald: { strip: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-600", arrow: "bg-emerald-100 text-emerald-700" },
  teal: { strip: "bg-teal-50", badge: "bg-teal-100 text-teal-600", arrow: "bg-teal-100 text-teal-700" },
  purple: { strip: "bg-purple-50", badge: "bg-purple-100 text-purple-600", arrow: "bg-purple-100 text-purple-700" },
  amber: { strip: "bg-amber-50", badge: "bg-amber-100 text-amber-600", arrow: "bg-amber-100 text-amber-700" },
  pink: { strip: "bg-pink-50", badge: "bg-pink-100 text-pink-500", arrow: "bg-pink-100 text-pink-600" },
  blue: { strip: "bg-blue-50", badge: "bg-blue-100 text-blue-600", arrow: "bg-blue-100 text-blue-700" },
};

// Outline icons (24x24, stroked) for each division's specialty
const DIVISION_GLYPHS = {
  wind: <><path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" /><path d="M9.8 4.4A2 2 0 1 1 11 8H2" /></>,
  bone: <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />,
  droplet: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />,
  stomach: <path d="M8 2v3a3 3 0 0 0 3 3h1a6 6 0 0 1 6 6v1a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-1a3 3 0 0 1 3-3h2" />,
  heart: <><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" /></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M9 12h6" /><path d="M12 9v6" /></>,
  smile: <><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>,
  leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></>,
  brain: <><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v13" /></>,
  sparkle: <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
  venus: <><circle cx="12" cy="9" r="6" /><path d="M12 15v7" /><path d="M9 19h6" /></>,
  eye: <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>,
};

const PARTNER_LOGOS = [
  {
    name: "OPITAC",
    src: "/partnership/opitac_logo.png",
    tagline: "Advanced Glutathione Technology for antioxidant protection and cellular wellness.",
  },
  {
    name: "Lonza",
    src: "/partnership/Lonza.png",
    tagline: "Patented UC-II® Collagen for clinically proven joint health and mobility.",
  },
  {
    name: "Sami-Sabinsa",
    src: "/partnership/Sami.png",
    tagline: "Clinically Researched Boswellin® for musculoskeletal care and inflammation support.",
  },
  {
    name: "Fuji Chemical",
    src: "/partnership/Fuji.png",
    tagline: "Premium Astaxanthin Innovation for vision, retinal and antioxidant health.",
  },
  {
    name: "Virchow Biotech",
    src: "/partnership/Virchow.png",
    tagline: "Regenerative Biotechnology Solutions for advanced wound healing and specialized care.",
  },
];

// Rotating pastel accents for the Upcoming Products cards — cycles through
// pink/teal/purple so a row of cards doesn't look monotone.
const UPCOMING_ACCENTS = [
  {
    bg: "#FCEBEC",
    border: "#F6D2D4",
    solid: "#C6394A",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    bg: "#E9F5F1",
    border: "#CDEBE1",
    solid: "#1E7A63",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 6.75h10.5v10.5H6.75V6.75z" />
      </svg>
    ),
  },
  {
    bg: "#F2ECFB",
    border: "#E1D3F5",
    solid: "#6E3FA3",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
];

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay },
});

export default function HomePage() {
  const { user } = useAuth();
  const [highlights, setHighlights] = useState(null);
  const [upcomingProducts, setUpcomingProducts] = useState([]);

  useEffect(() => {
    apiFetch("/home-highlights").then(setHighlights).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setUpcomingProducts([]);
      return;
    }
    apiFetch("/products?tag=Upcoming&limit=20")
      .then((res) => setUpcomingProducts(res.products || []))
      .catch(() => {});
  }, [user]);

  return (
    <>
      {/* Hero — same crop the mobile app uses below md, desktop banner above */}
      <section className="relative h-[100svh] md:h-[92vh] flex items-end overflow-hidden">
        {/* Backdrop video — plays once, then rests on its last frame */}
        <video
          poster="/hero-poster.jpg"
          autoPlay
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/hero.webm" type="video/webm" />
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

        {/* Content — left aligned, bottom */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 md:px-8 pb-14 md:pb-20">
          <motion.p
            {...rise(0.1)}
            className="text-xs md:text-sm uppercase tracking-[0.2em] md:tracking-[0.3em] text-white/50 mb-4 md:mb-5"
          >
            Because every treatment begins with trust.
          </motion.p>

          <motion.h1
            {...rise(0.25)}
            style={{ fontWeight: 600 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] mb-3 md:mb-4"
          >
            Healthcare
          </motion.h1>

          <motion.h1
            {...rise(0.4)}
            style={{ fontWeight: 350 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] mb-6 md:mb-8"
          >
            beyond medicine
          </motion.h1>

          <motion.p
            {...rise(0.55)}
            className="text-base md:text-lg text-white/60 font-light max-w-xl mb-8 md:mb-10"
          >
            Delivering pharmaceuticals, nutraceuticals and active ingredients
            with scientific precision, uncompromising quality, and an
            unwavering commitment to better patient outcomes.
          </motion.p>

          <motion.div {...rise(0.7)} className="flex flex-wrap items-center gap-3 md:gap-4">
            <Link
              href="/products"
              className="px-6 md:px-8 py-3 md:py-3.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Browse Products
            </Link>
            <Link
              href="/about"
              className="px-6 md:px-8 py-3 md:py-3.5 border border-white/30 text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              About Us
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-gray-900 py-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-2xl font-light text-white">500+</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Products</p>
            </div>
            <div>
              <p className="text-2xl font-light text-white">15+</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Years Experience</p>
            </div>
            <div>
              <p className="text-2xl font-light text-white">ISO</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Certified</p>
            </div>
            <div>
              <p className="text-2xl font-light text-white">Pan India</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Delivery</p>
            </div>
          </div>
        </div>
      </section>

      {/* Video hero — same clip/settings as the original site's landing hero */}
      <section className="relative w-full aspect-[32/9] overflow-hidden">
        <video
          className="absolute inset-0 w-full h-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="auto"
        >
          <source src="/videos/moulinslander.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8">
          <motion.p {...rise()} className="text-white/70 max-w-2xl leading-relaxed">
            At Moulins Pharma, healthcare goes beyond medicine—it&apos;s about trust, compassion, and lasting care. Like a moulin channelling life-giving water, we create pathways to well-being, ensuring care reaches every individual in need.
          </motion.p>
        </div>
      </section>

      {/* Divisions grid — logo card with a tinted specialty strip */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-100/40 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-10">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-4 mb-2">
              <span className="h-px w-10 bg-teal-500/60" />
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">Specialist Care</span>
              <span className="h-px w-10 bg-teal-500/60" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#0f2557]">Our Divisions</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto leading-relaxed">
              From active pharmaceutical ingredients to finished formulations — explore our comprehensive catalogue.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DIVISIONS.map((division) => {
              const tint = DIVISION_TINTS[division.tint];
              return (
                <Link
                  key={division.href}
                  href={division.href}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="h-24 flex items-center justify-center px-5 py-2.5">
                    <img
                      src={division.icon}
                      alt={division.name}
                      className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className={`flex items-center gap-3 px-3.5 py-2.5 ${tint.strip}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint.badge}`}>
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        {DIVISION_GLYPHS[division.glyph]}
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[#0f2557] truncate">{division.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{division.desc}</p>
                    </div>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-1 ${tint.arrow}`}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Upcoming Products — any product tagged "Upcoming" in admin */}
      {upcomingProducts.length > 0 && (
        <section className="relative overflow-hidden py-20 bg-white">
          {/* Soft decorative blobs, matching the pastel card accents */}
          <div className="pointer-events-none absolute -top-10 -left-24 w-80 h-80 rounded-full bg-red-50" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 w-96 h-96 rounded-full bg-red-50" />

          <div className="relative max-w-7xl mx-auto px-8">
            {/* Heading */}
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest">
                Coming Soon
              </span>
              <h2 className="mt-4 text-4xl md:text-5xl font-extrabold text-gray-900">
                Upcoming <span className="text-red-600">Products</span>
              </h2>
              <p className="mt-3 text-gray-500">
                Innovative formulations. Trusted quality. Better healthcare ahead.
              </p>
              <div className="mx-auto mt-4 w-16 h-1 rounded-full bg-red-600" />
            </div>

            {/* Cards — single row, horizontally scrollable */}
            <div className="no-scrollbar flex gap-8 overflow-x-auto pb-2 snap-x snap-mandatory">
              {upcomingProducts.map((p, i) => {
                const accent = UPCOMING_ACCENTS[i % UPCOMING_ACCENTS.length];
                const images = visibleImages(p.images);
                return (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="group flex flex-col flex-shrink-0 w-[20rem] snap-start rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition-shadow duration-300"
                    style={{ border: `1px solid ${accent.border}` }}
                  >
                    {/* Image banner */}
                    <div
                      className="relative aspect-[4/3] overflow-hidden"
                      style={{ backgroundColor: accent.bg }}
                    >
                      <span
                        className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide text-white"
                        style={{ backgroundColor: accent.solid }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        Launching Soon
                      </span>
                      {images.length > 0 ? (
                        <img
                          src={images[0].image_url}
                          alt={p.name}
                          className="w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>

                    {/* Body */}
                    <div className="px-5 pt-4 pb-1 bg-white flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: accent.bg, color: accent.solid }}
                        >
                          {accent.icon}
                        </span>
                        {p.categories && p.categories.length > 0 && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: accent.solid }}
                          >
                            {p.categories[0]}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-red-600 transition-colors">
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                    </div>

                    {/* Footer bar */}
                    <div
                      className="flex items-center justify-between px-5 py-3.5 mt-auto"
                      style={{ backgroundColor: accent.bg }}
                    >
                      <div className="flex items-center gap-4">
                        {p.mrp != null && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={accent.solid} strokeWidth={1.8} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                            </svg>
                            <div>
                              <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none">MRP</p>
                              <p className="text-xs font-semibold text-gray-800 leading-tight">₹{p.mrp}/-</p>
                            </div>
                          </div>
                        )}
                        {p.pack_size && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={accent.solid} strokeWidth={1.8} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                            <div>
                              <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none">Packing</p>
                              <p className="text-xs font-semibold text-gray-800 leading-tight">{p.pack_size}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border transition-transform group-hover:translate-x-0.5"
                        style={{ borderColor: accent.solid, color: accent.solid }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* View all */}
            <div className="text-center mt-12">
              <Link
                href="/products?tag=Upcoming"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white text-sm font-semibold rounded-full hover:bg-red-700 transition-colors"
              >
                View All Products
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">
                  &rarr;
                </span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Curated collection highlights — admin-editable via /admin.
          Warm "product spotlight" look: cream backdrop, orange accents, serif heading */}
      {highlights && (
        <section className="relative overflow-hidden py-16 md:py-20 bg-[#fbf3ea]">
          {/* Soft peach arcs + orange dot field, top right */}
          <div className="pointer-events-none absolute -top-40 -right-40 w-[34rem] h-[34rem] rounded-full bg-[#f6dfc8]/60" />
          <div className="pointer-events-none absolute -bottom-48 -left-32 w-[28rem] h-[28rem] rounded-full bg-[#f8e7d6]/70" />
          <div
            className="pointer-events-none absolute top-0 right-0 w-80 h-60"
            style={{
              backgroundImage: "radial-gradient(circle, #ef7a2f 2.5px, transparent 3px)",
              backgroundSize: "22px 22px",
              maskImage: "radial-gradient(ellipse at top right, black 10%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at top right, black 10%, transparent 70%)",
            }}
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-8">
            {/* Heading — left aligned, eyebrow with a trailing rule */}
            <div className="mb-10">
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#e0661f]">Product Spotlight</span>
                <span className="h-px w-14 bg-[#e0661f]/60" />
              </div>
              <h2
                className="mt-3 text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] text-[#10261c] max-w-3xl"
                style={{ fontFamily: "var(--font-erode), Georgia, serif" }}
              >
                {highlights.heading}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {[1, 2].map((n) => {
                const imageUrl = highlights[`card${n}_image_url`];
                const buttonText = highlights[`card${n}_button_text`];
                const linkUrl = highlights[`card${n}_link_url`] || "/products";
                return (
                  <Link
                    key={n}
                    href={linkUrl}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white border border-[#f1c9a5] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden p-8 md:p-10">
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt={buttonText}
                          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4 px-6 py-5">
                      <h3
                        className="text-2xl md:text-3xl font-bold leading-tight text-[#10261c]"
                        style={{ fontFamily: "var(--font-erode), Georgia, serif" }}
                      >
                        {buttonText}
                      </h3>
                      <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-r from-[#e0661f] to-[#f08a3c] text-white shadow-md transition-transform group-hover:translate-x-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <HomeCarousel />
      {/* Areas of Focus — temporarily hidden, not removed; may be needed again later. */}
      {/* <AreasOfFocus /> */}

      {/* Partnerships */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-8">
          <h2 className="text-5xl font-light text-gray-900 mb-12 text-center">Our Global Partnerships</h2>

          {/* Partner taglines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-16">
            {PARTNER_LOGOS.map((logo) => (
              <div key={logo.name} className="text-center">
                <img src={logo.src} alt={logo.name} className="h-10 w-auto object-contain mx-auto mb-4" />
                <p className="text-sm text-gray-500 leading-relaxed">{logo.tagline}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <img
                src="/partnership/companyglobe.jpeg"
                alt="Moulins Pharmaceuticals — Pioneering Global Collaborations in Advanced Therapeutics"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <img
                src="/partnership/companies.jpeg"
                alt="Moulins Pharmaceuticals international collaborations — Opitac, Lonza, Sami-Sabinsa, Fuji Chemical, Virchow Biotech"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Endless scrolling logo strip — each logo gets a fixed-width slot so
            both duplicated halves are always pixel-identical in width, no
            matter when/how each image finishes loading; that's what keeps
            the -50% loop point seamless instead of drifting. */}
        <div className="relative w-full overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
          <div
            style={{
              display: "flex",
              width: "max-content",
              flexWrap: "nowrap",
              animation: "moulins-marquee 25s linear infinite",
            }}
          >
            {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((logo, i) => (
              <div
                key={`${logo.name}-${i}`}
                style={{ width: 220, height: 56 }}
                className="flex items-center justify-center flex-shrink-0"
              >
                <img src={logo.src} alt={logo.name} className="max-h-14 w-auto object-contain" />
              </div>
            ))}
          </div>
        </div>
        <style jsx>{`
          @keyframes moulins-marquee {
            from {
              transform: translateX(0);
            }
            to {
              transform: translateX(-50%);
            }
          }
        `}</style>
      </section>

      {/* Careers */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-5xl font-light text-gray-900 mb-10">Careers at Moulins</h2>
            <div className="border-t border-gray-200">
              {[
                { label: "Explore the latest job openings", href: "/careers" },
                { label: "Learn about our hiring programs", href: "/careers" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex items-center justify-between py-6 border-b border-gray-200"
                >
                  <span className="text-lg text-gray-900 transition-colors duration-200 group-hover:text-red-600">
                    {item.label}
                  </span>
                  <span className="text-xl text-gray-900 transition-all duration-200 group-hover:translate-x-1 group-hover:text-red-600">
                    &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="relative aspect-[16/9] overflow-hidden rounded-none">
            <img
              src="/doctor patient croped.jpg"
              alt="Careers at Moulins"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>
    </>
  );
}
