"use client";

import Image from "next/image";
import Link from "next/link";

const footerLinks = {
  products: {
    heading: "Products",
    items: [
      { label: "Pharmaceuticals", href: "/products" },
      { label: "Nutraceuticals", href: "/products" },
      { label: "OTC Products", href: "/products" },
      { label: "Active Ingredients", href: "/products" },
      { label: "Custom Formulations", href: "/products" },
    ],
  },
  company: {
    heading: "Company",
    items: [
      { label: "About Us", href: "/about" },
      { label: "Manufacturing", href: "/about" },
      { label: "Certifications", href: "/about" },
      { label: "Careers", href: "/about" },
      { label: "Sustainability", href: "/about" },
    ],
  },
  support: {
    heading: "Support",
    items: [
      { label: "Contact Us", href: "/contact" },
      { label: "Request a Quote", href: "/contact" },
      { label: "Shipping Policy", href: "/contact" },
      { label: "Quality Assurance", href: "/about" },
      { label: "FAQs", href: "/about" },
    ],
  },
};

export default function Footer() {
  return (
    <footer className="bg-[#111111] text-[#E5DDD3]">
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Contact column */}
          <div>
            <h3 className="text-lg font-semibold mb-5">Contact Us</h3>
            <div className="space-y-3 text-sm text-[#B8B0A4]">
              <p>
                Moulins Pharmaceuticals Pvt. Ltd.
                <br />
                Industrial Area, Phase II,
                <br />
                Baddi, Himachal Pradesh 173205
              </p>
              <p>
                9 am – 6 pm, Monday to Friday
                <br />
                9 am – 1 pm, Saturday
              </p>
              <a
                href="mailto:info@moulins.in"
                className="inline-block hover:text-white transition-colors"
              >
                info@moulins.in
              </a>
              <br />
              <a
                href="tel:+911234567890"
                className="inline-block hover:text-white transition-colors"
              >
                +91 12345 67890
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.values(footerLinks).map((section) => (
            <div key={section.heading}>
              <h3 className="text-lg font-semibold mb-5">{section.heading}</h3>
              <ul className="space-y-3">
                {section.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-[#B8B0A4] hover:text-white transition-colors duration-200"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-8">
        <div className="border-t border-[#2A2A2A]" />
      </div>

      {/* Logo */}
      <div className="flex justify-center py-14">
        <Image
          src="/Moulins Logo High Res - V2.png"
          alt="Moulins"
          width={200}
          height={64}
          className="h-14 w-auto brightness-0 invert opacity-80"
        />
      </div>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-8">
        <div className="border-t border-[#2A2A2A]" />
      </div>

      {/* Tagline + secondary links */}
      <div className="max-w-7xl mx-auto px-8 py-10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <p className="text-sm italic text-[#9A9286] max-w-xl leading-relaxed">
            Committed to advancing health through quality pharmaceuticals.
            Manufactured with precision, delivered with care — serving
            healthcare professionals and patients across India.
          </p>
          <div className="flex items-center gap-8">
            <Link
              href="/about"
              className="text-sm text-[#B8B0A4] hover:text-white transition-colors"
            >
              Our Story
            </Link>
            <Link
              href="/about"
              className="text-sm text-[#B8B0A4] hover:text-white transition-colors"
            >
              Quality Standards
            </Link>
            <Link
              href="/about"
              className="text-sm text-[#B8B0A4] hover:text-white transition-colors"
            >
              Sustainability
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto px-8 py-8">
          {/* Department contacts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                General &amp; Domestic queries
              </p>
              <a
                href="mailto:info@moulins.in"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                info@moulins.in
              </a>
            </div>
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                Sales &amp; B2B
              </p>
              <a
                href="mailto:sales@moulins.in"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                sales@moulins.in
              </a>
            </div>
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                Regulatory &amp; Compliance
              </p>
              <a
                href="mailto:regulatory@moulins.in"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                regulatory@moulins.in
              </a>
            </div>
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                Careers &amp; HR
              </p>
              <a
                href="mailto:careers@moulins.in"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                careers@moulins.in
              </a>
            </div>
          </div>

          {/* Legal */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-[#1A1A1A]">
            <div className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-xs text-[#6B6560] hover:text-[#9A9286] transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-xs text-[#6B6560] hover:text-[#9A9286] transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="/refund"
                className="text-xs text-[#6B6560] hover:text-[#9A9286] transition-colors"
              >
                Refund Policy
              </Link>
            </div>
            <p className="text-xs text-[#6B6560]">
              &copy; {new Date().getFullYear()} Moulins Pharmaceuticals Pvt.
              Ltd.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
