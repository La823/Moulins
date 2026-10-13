"use client";

import Image from "next/image";
import Link from "next/link";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.moulinspharma.app";

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
                1st Floor, 363, Industrial Area Phase 2,
                <br />
                Panchkula, Haryana 134113
              </p>
              <p>
                10 am – 7 pm, Monday to Saturday
              </p>
              <a
                href="mailto:info@moulinspharma.com"
                className="inline-block hover:text-white transition-colors"
              >
                info@moulinspharma.com
              </a>
              <br />
              <a
                href="tel:+919815535304"
                className="inline-block hover:text-white transition-colors"
              >
                +91 98155 35304
              </a>
            </div>

            {/* The Moulins app on Google Play */}
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get the Moulins app on Google Play"
              className="mt-6 inline-flex items-center gap-3 rounded-xl border border-[#3A3A3A] bg-black px-4 py-2.5 hover:border-[#6B6560] transition-colors"
            >
              <svg viewBox="0 0 24 26" className="w-6 h-6 shrink-0" aria-hidden="true">
                <path d="M1.2.6 13.4 12.8 1.2 25a1.9 1.9 0 0 1-.7-1.5V2.1c0-.6.3-1.1.7-1.5Z" fill="#00D7FE" />
                <path d="m17.5 8.7-4.1 4.1-12.2-12.2c.6-.5 1.5-.6 2.3-.2l14 8.3Z" fill="#00F076" />
                <path d="m17.5 16.9-14 8.2c-.8.5-1.7.4-2.3-.1l12.2-12.2 4.1 4.1Z" fill="#FF3A44" />
                <path d="m22.3 11.5-4.8-2.8-4.1 4.1 4.1 4.1 4.8-2.8c1.3-.7 1.3-1.9 0-2.6Z" fill="#FFD400" />
              </svg>
              <span className="leading-tight text-left">
                <span className="block text-[10px] uppercase tracking-wider text-[#B8B0A4]">Get it on</span>
                <span className="block text-base font-semibold text-white">Google Play</span>
              </span>
            </a>
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 mb-8 text-center">
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                General &amp; Domestic queries
              </p>
              <a
                href="mailto:info@moulinspharma.com"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                info@moulinspharma.com
              </a>
            </div>
            <div>
              <p className="text-xs text-[#6B6560] mb-1">
                Sales &amp; B2B
              </p>
              <a
                href="mailto:Sales@moulinspharma.com"
                className="text-xs text-[#9A9286] hover:text-white transition-colors"
              >
                Sales@moulinspharma.com
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
