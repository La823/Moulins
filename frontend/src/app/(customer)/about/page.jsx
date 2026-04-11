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

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-[50vh] min-h-[380px] flex items-end overflow-hidden">
        <Image
          src="/pic.jpg.jpeg"
          alt=""
          fill
          className="object-cover"
          priority
          quality={90}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-14">
          <motion.p
            {...rise(0.1)}
            className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4"
          >
            About Moulins
          </motion.p>
          <motion.h1
            {...rise(0.25)}
            className="text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
          >
            Compassion in every
          </motion.h1>
          <motion.h1
            {...rise(0.4)}
            className="text-4xl md:text-5xl lg:text-6xl font-medium text-white leading-[1.1]"
          >
            dose we deliver
          </motion.h1>
        </div>
      </section>

      {/* Who We Are */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          <motion.div {...rise()}>
            <div className="h-1 w-12 bg-red-500 rounded-full mb-6" />
            <h2 className="text-3xl font-semibold text-gray-900 mb-6">
              Who We Are
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                Moulins Pharmaceuticals is a purpose-driven pharmaceutical
                company based in Panchkula, Haryana. We manufacture and distribute
                high-quality medicines, nutraceuticals, and active pharmaceutical
                ingredients across India.
              </p>
              <p>
                Founded on the belief that healthcare should be accessible,
                affordable, and compassionate, we work every day to bring
                precision-manufactured products to healthcare professionals and
                patients who depend on them.
              </p>
            </div>
          </motion.div>

          <motion.div {...rise(0.15)}>
            <div className="h-1 w-12 bg-red-500 rounded-full mb-6" />
            <h2 className="text-3xl font-semibold text-gray-900 mb-6">
              Our Mission
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                To advance health through quality pharmaceuticals — manufactured
                with precision, distributed with integrity, and delivered with
                care to every corner of India.
              </p>
              <p>
                We believe every pill carries responsibility. That&apos;s why we
                invest in rigorous quality control, ethical business practices, and
                long-term partnerships built on trust.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-8 py-20">
          <motion.h2
            {...rise()}
            className="text-3xl font-semibold text-gray-900 mb-12"
          >
            What We Stand For
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Quality First",
                desc: "ISO-certified manufacturing with stringent quality assurance at every stage — from raw materials to finished products.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                ),
              },
              {
                title: "Patient-Centric",
                desc: "Every decision we make is guided by its impact on the patients and communities we serve across India.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                  </svg>
                ),
              },
              {
                title: "Ethical Leadership",
                desc: "Transparent practices, fair pricing, and honest relationships with every partner, distributor, and healthcare professional.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
                  </svg>
                ),
              },
            ].map((val) => (
              <motion.div
                key={val.title}
                {...rise()}
                className="bg-white rounded-xl border border-gray-200 p-7"
              >
                <div className="w-11 h-11 rounded-lg bg-gray-900 text-white flex items-center justify-center mb-5">
                  {val.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {val.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {val.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gray-900 py-14">
        <div className="max-w-6xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "500+", label: "Products" },
              { value: "15+", label: "Years" },
              { value: "Pan India", label: "Distribution" },
              { value: "ISO", label: "Certified" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-light text-white">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-8 py-20 text-center">
        <motion.h2
          {...rise()}
          className="text-3xl font-semibold text-gray-900 mb-4"
        >
          Interested in partnering?
        </motion.h2>
        <motion.p
          {...rise(0.1)}
          className="text-base text-gray-500 max-w-xl mx-auto mb-8"
        >
          Whether you&apos;re a healthcare professional, distributor, or pharmacy —
          we&apos;d love to work with you.
        </motion.p>
        <motion.div {...rise(0.2)}>
          <Link
            href="/contact"
            className="inline-block px-8 py-3.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Get in Touch
          </Link>
        </motion.div>
      </section>
    </>
  );
}
