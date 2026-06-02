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

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-[60vh] min-h-[420px] flex items-end overflow-hidden">
        <Image
          src="/doctor patient croped.jpg"
          alt=""
          fill
          className="object-cover object-top"
          priority
          quality={90}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-16">
          <motion.p
            {...rise(0.1)}
            className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4"
          >
            Healthcare Partners
          </motion.p>
          <motion.h1
            {...rise(0.25)}
            className="text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
          >
            Join Us: Become a
          </motion.h1>
          <motion.h1
            {...rise(0.4)}
            className="text-4xl md:text-5xl lg:text-6xl font-medium text-white leading-[1.1]"
          >
            Healthcare Partner
          </motion.h1>
        </div>
      </section>

      {/* Partnership Built on Purpose */}
      <section className="max-w-4xl mx-auto px-8 py-20 text-center">
        <motion.h2
          {...rise()}
          className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6"
        >
          A Partnership Built on Purpose
        </motion.h2>
        <motion.p
          {...rise(0.15)}
          className="text-base text-gray-500 leading-relaxed max-w-2xl mx-auto"
        >
          Moulins Pharmaceuticals is growing, and we&apos;re looking for Healthcare
          Partners across India who share our mission. As a Healthcare Partner,
          you&apos;re not just distributing medicines — you&apos;re delivering care,
          trust, and transformation to communities in need.
        </motion.p>
      </section>

      {/* What Sets Us Apart + Why Partner */}
      <section className="bg-gradient-to-b from-sky-50/60 to-white">
        <div className="max-w-6xl mx-auto px-8 py-20 space-y-16">
          {/* What Sets Us Apart */}
          <motion.div
            {...rise()}
            className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start"
          >
            <div className="md:col-span-2">
              <div className="h-1 w-12 bg-sky-400 rounded-full mb-5" />
              <h3 className="text-2xl font-semibold text-gray-900">
                What Sets Us Apart?
              </h3>
            </div>
            <div className="md:col-span-3 space-y-4 text-gray-600 leading-relaxed">
              <p>
                We are more than a pharmaceutical company — we are a movement for
                change in healthcare. Every pill we produce, every treatment we
                offer, carries the weight of responsibility, trust, and care.
              </p>
              <p>
                We don&apos;t just build networks — we build relationships. Our
                Healthcare Partners across India are more than distributors; they
                are the lifelines connecting us to those who depend on us.
              </p>
            </div>
          </motion.div>

          {/* Why Partner */}
          <motion.div
            {...rise()}
            className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start"
          >
            <div className="md:col-span-2">
              <div className="h-1 w-12 bg-sky-400 rounded-full mb-5" />
              <h3 className="text-2xl font-semibold text-gray-900">
                Why Partner with Moulins?
              </h3>
            </div>
            <div className="md:col-span-3">
              <ul className="space-y-5">
                {[
                  {
                    title: "A Vision for the Future",
                    desc: "Shaping the next era of healthcare, where medicine meets compassion.",
                  },
                  {
                    title: "Competitive Advantage",
                    desc: "High-quality products, transparent business practices, and ethical leadership.",
                  },
                  {
                    title: "Support & Growth",
                    desc: "Continuous support, training, and collaboration opportunities to ensure we succeed together.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
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

      {/* Be a Part of the Change */}
      <section className="max-w-4xl mx-auto px-8 py-20 text-center">
        <motion.h2
          {...rise()}
          className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6"
        >
          Be a Part of the Change
        </motion.h2>
        <motion.p
          {...rise(0.15)}
          className="text-base text-gray-500 leading-relaxed max-w-2xl mx-auto"
        >
          Join us in making healthcare more compassionate, accessible, and
          patient-centric. Together, we ensure medicine reaches beyond shelves and
          prescriptions — touching lives, building trust, and making a lasting
          difference.
        </motion.p>
      </section>

      {/* Map + Contact Info */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <motion.h2
            {...rise()}
            className="text-2xl font-semibold text-gray-900 mb-10"
          >
            Find Us
          </motion.h2>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {/* Map */}
            <motion.div
              {...rise(0.1)}
              className="lg:col-span-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm"
            >
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3431.1649375825973!2d76.8328068!3d30.68563510000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390f9378bb1f1db3%3A0xe31e7c2f33783a1e!2sMoulins%20Pharmaceuticals%20Pvt%20Ltd!5e0!3m2!1sen!2sin!4v1772470580226!5m2!1sen!2sin"
                width="100%"
                height="400"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Moulins Pharmaceuticals Location"
                className="w-full"
              />
            </motion.div>

            {/* Contact Cards */}
            <motion.div
              {...rise(0.2)}
              className="lg:col-span-2 space-y-6"
            >
              {/* Address */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                      Address
                    </h4>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      #363, Phase 2<br />
                      Industrial Area, Panchkula<br />
                      Haryana 134113
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                      Contact
                    </h4>
                    <div className="space-y-1.5">
                      <a
                        href="tel:+919815535304"
                        className="block text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        (+91) 98155-35304
                      </a>
                      <a
                        href="mailto:info@moulinspharma.com"
                        className="block text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        info@moulinspharma.com
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hours */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                      Hours
                    </h4>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      <p>Mon – Fri: 9 AM – 6 PM</p>
                      <p>Saturday: 9 AM – 1 PM</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Get Directions button */}
              <a
                href="https://maps.google.com/?q=Moulins+Pharmaceuticals+Pvt+Ltd+Panchkula"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
                Get Directions
              </a>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
