"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import HomeCarousel from "@/components/customer/HomeCarousel";
import AreasOfFocus from "@/components/customer/AreasOfFocus";

// All 12 divisions, using the same banner images used as filters on the Products page.
const DIVISIONS = [
  { name: "Aerozone", desc: "Respiratory & ENT", href: "/aerozone", icon: "/moulins divisions/Aerozone.jpg.jpeg" },
  { name: "Bone Voyage", desc: "Orthopaedics", href: "/bonevoyage", icon: "/moulins divisions/Bone Voyage.jpg.jpeg" },
  { name: "Fluidity", desc: "Urology & Renal", href: "/fluidity", icon: "/moulins divisions/Fluidity.jpg.jpeg" },
  { name: "Gutsy", desc: "Gastro", href: "/gutsy", icon: "/moulins divisions/GUTSY.jpg.jpeg" },
  { name: "Jivya", desc: "Cardio Diabetic", href: "/jivya", icon: "/moulins divisions/Jivvya.jpg.jpeg" },
  { name: "Life Gard", desc: "Antibiotics/Trauma", href: "/lifegard", icon: "/moulins divisions/Lifegard.jpg.jpeg" },
  { name: "Little Planet", desc: "Pediatric", href: "/littleplanet", icon: "/moulins divisions/Little Planet.jpg.jpeg" },
  { name: "Matrix", desc: "", href: "/matrix", icon: "/moulins divisions/Matrix.jpg.jpeg" },
  { name: "Mindset", desc: "Neuro/Psychiatry", href: "/mindset", icon: "/moulins divisions/Mindset.jpg.jpeg" },
  { name: "Missbella", desc: "Derma & Skin", href: "/missbella", icon: "/moulins divisions/Misbella.jpg.jpeg" },
  { name: "Srishti", desc: "Gynaecology", href: "/srishti", icon: "/moulins divisions/Srishti.jpg.jpeg" },
  { name: "View Point", desc: "Ophthalmology", href: "/viewpoint", icon: "/moulins divisions/View Point.jpg.jpeg" },
];

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay },
});

export default function HomePage() {
  const [highlights, setHighlights] = useState(null);

  useEffect(() => {
    apiFetch("/home-highlights").then(setHighlights).catch(() => {});
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="relative h-[92vh] flex items-end overflow-hidden">
        {/* Backdrop image */}
        <Image
          src="/pic.jpg.jpeg"
          alt=""
          fill
          className="object-cover"
          priority
          quality={90}
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

        {/* Content — left aligned, bottom */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-20">
          <motion.p
            {...rise(0.1)}
            className="text-sm uppercase tracking-[0.3em] text-white/50 mb-5"
          >
            Trusted Pharmaceutical Partner
          </motion.p>

          <motion.h1
            {...rise(0.25)}
            style={{ fontWeight: 600 }}
            className="text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] mb-4"
          >
            Healthcare
          </motion.h1>

          <motion.h1
            {...rise(0.4)}
            style={{ fontWeight: 350 }}
            className="text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] mb-8"
          >
            beyond medicine
          </motion.h1>

          <motion.p
            {...rise(0.55)}
            className="text-lg text-white/60 font-light max-w-xl mb-10"
          >
            Pharmaceuticals, nutraceuticals and active ingredients — manufactured
            with precision for healthcare professionals across India.
          </motion.p>

          <motion.div {...rise(0.7)} className="flex items-center gap-4">
            <Link
              href="/products"
              className="px-8 py-3.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Browse Products
            </Link>
            <Link
              href="/about"
              className="px-8 py-3.5 border border-white/30 text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
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

      {/* Divisions grid — same images used as filters on the Products page */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="mb-14">
          <h2 className="text-3xl font-light text-gray-900">Our Divisions</h2>
          <p className="text-sm text-gray-400 mt-3 max-w-lg">
            From active pharmaceutical ingredients to finished formulations — explore our comprehensive catalogue.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DIVISIONS.map((division) => (
            <Link
              key={division.href}
              href={division.href}
              className="group relative aspect-[16/9] overflow-hidden rounded-xl bg-white"
            >
              <img
                src={division.icon}
                alt={division.name}
                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-white text-base font-medium">{division.name}</h3>
                {division.desc && (
                  <p className="text-white/70 text-xs mt-0.5">{division.desc}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Curated collection highlights — admin-editable via /admin */}
      {highlights && (
        <section className="py-14" style={{ backgroundColor: "#1F3B2C" }}>
          <div className="max-w-7xl mx-auto px-8">
            <h2 className="text-4xl text-center text-[#F3EEE3] mb-10">
              {highlights.heading}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[1, 2].map((n) => {
                const imageUrl = highlights[`card${n}_image_url`];
                const buttonText = highlights[`card${n}_button_text`];
                const linkUrl = highlights[`card${n}_link_url`] || "/products";
                return (
                  <Link key={n} href={linkUrl} className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={buttonText}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-black/10" />
                      )}
                    </div>
                    <div
                      className="flex items-center justify-center py-5"
                      style={{ backgroundColor: "#F3EEE3" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "#1F3B2C" }}>
                        {buttonText}
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
      <AreasOfFocus />

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
