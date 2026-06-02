"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay },
});

export default function HomePage() {
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
            className="text-5xl md:text-6xl lg:text-7xl font-light text-white leading-[1.1] mb-4"
          >
            Quality medicines,
          </motion.h1>

          <motion.h1
            {...rise(0.4)}
            className="text-5xl md:text-6xl lg:text-7xl font-medium text-white leading-[1.1] mb-8"
          >
            delivered with care
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

      {/* Categories preview */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="mb-14">
          <h2 className="text-3xl font-light text-gray-900">Our Product Range</h2>
          <p className="text-sm text-gray-400 mt-3 max-w-lg">
            From active pharmaceutical ingredients to finished formulations — explore our comprehensive catalogue.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Pharmaceuticals",
              desc: "Tablets, capsules, syrups and injectables across therapeutic categories.",
            },
            {
              title: "Nutraceuticals",
              desc: "Vitamins, supplements and wellness products for everyday health.",
            },
            {
              title: "Custom Formulations",
              desc: "Tailored manufacturing solutions for your specific requirements.",
            },
          ].map((cat) => (
            <Link
              key={cat.title}
              href="/products"
              className="group border border-gray-200 rounded-xl p-8 hover:border-gray-400 transition-colors"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                {cat.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{cat.desc}</p>
              <span className="inline-block mt-4 text-sm text-red-600 font-medium group-hover:translate-x-1 transition-transform">
                Explore &rarr;
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-8">
          <h2 className="text-3xl font-light text-gray-900 mb-4">
            Ready to place an order?
          </h2>
          <p className="text-sm text-gray-500 max-w-md mb-8">
            Browse our full catalogue and order directly. Fast processing, reliable delivery across India.
          </p>
          <Link
            href="/products"
            className="inline-block px-8 py-3.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            View All Products
          </Link>
        </div>
      </section>
    </>
  );
}
