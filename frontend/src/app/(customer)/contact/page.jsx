"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay },
});

const TEAL = "#00A6A4";

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-[60vh] min-h-[420px] flex items-end overflow-hidden">
        <Image src="/doctor patient croped.jpg" alt="" fill className="object-cover object-top" priority quality={90} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-16">
          <motion.p {...rise(0.1)} className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4">Healthcare Partners</motion.p>
          <motion.h1 {...rise(0.25)} className="text-4xl md:text-6xl font-light text-white leading-[1.1]">Join Us: Become a</motion.h1>
          <motion.h1 {...rise(0.4)} className="text-4xl md:text-6xl font-medium text-white leading-[1.1]">Healthcare Partner</motion.h1>
        </div>
      </section>

      {/* Partnership Built on Purpose */}
      <section className="max-w-4xl mx-auto px-8 py-20 text-center">
        <motion.h2 {...rise()} className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6">A Partnership Built on Purpose</motion.h2>
        <motion.p {...rise(0.15)} className="text-base text-gray-500 leading-relaxed max-w-2xl mx-auto">
          Moulins Pharmaceuticals is growing, and we&apos;re looking for Healthcare Partners across India who share our mission.
          As a Healthcare Partner, you&apos;re not just distributing medicines — you&apos;re delivering care, trust, and transformation to communities in need.
        </motion.p>
      </section>

      {/* What Sets Us Apart + Why Partner */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-8 py-20 space-y-16">
          <motion.div {...rise()} className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            <div className="md:col-span-2">
              <div className="h-1 w-12 rounded-full mb-5" style={{ backgroundColor: TEAL }} />
              <h3 className="text-2xl font-semibold text-gray-900">What Sets Us Apart?</h3>
            </div>
            <div className="md:col-span-3 space-y-4 text-gray-600 leading-relaxed">
              <p>We are more than a pharmaceutical company — we are a movement for change in healthcare. Every pill we produce, every treatment we offer, carries the weight of responsibility, trust, and care.</p>
              <p>We don&apos;t just build networks — we build relationships. Our Healthcare Partners across India are more than distributors; they are the lifelines connecting us to those who depend on us.</p>
            </div>
          </motion.div>

          <motion.div {...rise()} className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            <div className="md:col-span-2">
              <div className="h-1 w-12 rounded-full mb-5" style={{ backgroundColor: TEAL }} />
              <h3 className="text-2xl font-semibold text-gray-900">Why Partner with Moulins?</h3>
            </div>
            <div className="md:col-span-3">
              <ul className="space-y-5">
                {[
                  { title: "A Vision for the Future", desc: "Shaping the next era of healthcare, where medicine meets compassion." },
                  { title: "Competitive Advantage", desc: "High-quality products, transparent business practices, and ethical leadership." },
                  { title: "Support & Growth", desc: "Continuous support, training, and collaboration opportunities to ensure we succeed together." },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <div className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TEAL }} />
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-gray-500 text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Map + Contact Info */}
      <section className="border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <motion.h2 {...rise()} className="text-2xl font-semibold text-gray-900 mb-10">Find Us</motion.h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {/* Map */}
            <motion.div {...rise(0.1)} className="lg:col-span-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3431.1649375825973!2d76.8328068!3d30.68563510000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390f9378bb1f1db3%3A0xe31e7c2f33783a1e!2sMoulins%20Pharmaceuticals%20Pvt%20Ltd!5e0!3m2!1sen!2sin!4v1772470580226!5m2!1sen!2sin"
                width="100%"
                height="400"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Moulins Pharmaceuticals Location"
              />
            </motion.div>

            {/* Contact Cards */}
            <motion.div {...rise(0.2)} className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Address</h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Plot No 363, Ist Floor<br />Industrial Area, Phase – II<br />Panchkula, Haryana – 134113
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Contact</h4>
                <a href="tel:+919815535304" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">+91 98155-35304</a>
                <a href="tel:+919878020363" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">+91 98780-20363</a>
                <a href="mailto:info@moulinspharma.com" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors mt-1">info@moulinspharma.com</a>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">Hours</h4>
                <p className="text-sm text-gray-600">Mon – Fri: 9 AM – 6 PM</p>
                <p className="text-sm text-gray-600">Saturday: 9 AM – 1 PM</p>
              </div>
              <a
                href="https://maps.google.com/?q=Moulins+Pharmaceuticals+Pvt+Ltd+Panchkula"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity"
                style={{ backgroundColor: TEAL }}
              >
                Get Directions
              </a>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
