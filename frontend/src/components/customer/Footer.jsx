"use client";

import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{ backgroundColor: "#00A6A4" }} className="text-white">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8 flex-wrap">

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h3>
            <ul className="flex flex-row md:flex-col gap-4 md:gap-2 flex-wrap">
              {[
                { label: "Home", href: "/" },
                { label: "About", href: "/about" },
                { label: "Location", href: "/contact" },
                { label: "Contact", href: "/contact" },
              ].map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm text-white/80 hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Logo + tagline */}
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/Moulins Logo High Res - V2.png"
              alt="Moulins"
              width={160}
              height={52}
              className="h-12 w-auto brightness-0 invert"
            />
            <p className="text-xs text-white/70 text-center max-w-xs leading-relaxed">
              HealthCare, Beyond Medicine
            </p>
          </div>

          {/* Follow Us */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Follow Us</h3>
            <div className="flex flex-col gap-2">
              {[
                { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61573916712376" },
                { label: "Twitter", href: "https://x.com/MoulinsPharma" },
                { label: "Instagram", href: "https://www.instagram.com/moulinspharma" },
              ].map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="text-sm text-white/80 hover:text-white transition-colors">
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Contact</h3>
            <div className="flex flex-col gap-1.5 text-sm text-white/80">
              <p>Plot No 363, Ist Floor</p>
              <p>Industrial Area, Phase – II</p>
              <p>Panchkula, Haryana – 134113</p>
              <a href="tel:+919815535304" className="hover:text-white transition-colors mt-1">+91 98155 35304</a>
              <a href="mailto:info@moulinspharma.com" className="hover:text-white transition-colors">info@moulinspharma.com</a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-4 text-center">
          <p className="text-xs text-white/60">
            &copy; {new Date().getFullYear()} Moulins Pharmaceuticals Pvt. Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
