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

const TEAM = [
  {
    name: "Pardeep Arora",
    title: "Director, Sales & Marketing",
    photo: "/team/pardeeparora.jpg",
    bio: "With over 33 years of experience in pharmaceutical sales and marketing, Pardeep Arora chose to step away from a successful corporate career to make a greater impact in healthcare. As the founder of Metamorf Lifesciences, he led the company to touch the lives of 1 crore patients per annum, driven by the vision of \"Transforming Lives to Transform the Lives of Healthcare Partners.\"\n\nNow, as Director of Sales and Marketing at Moulins Pharmaceuticals, Pardeep brings his extensive expertise and strategic leadership to drive growth and expand access to quality healthcare.",
  },
  {
    name: "Tanmay Arora",
    title: "CEO, Moulins Pharmaceuticals",
    photo: "/team/tanmay.png",
    objectPosition: "center 35%",
    bio: "An accomplished chemical engineer from IIT Kharagpur, Tanmay Arora brings a wealth of experience to Moulins Pharmaceuticals. He was part of the prestigious Young Leaders Program at Dr. Reddy's Laboratories, gaining extensive expertise across both research and manufacturing domains.\n\nAs the CEO of Moulins Pharmaceuticals, Tanmay is committed to driving the company's mission of \"Healthcare, Beyond Medicine.\" His leadership focuses on delivering impactful healthcare solutions, fostering innovation, and ensuring compassionate care reaches those who need it most.",
  },
  {
    name: "Durgesh Saini",
    title: "Director, Sales",
    photo: "/team/durgesh.jpg",
    bio: "With over 15 years of experience in pharmaceutical sales, Durgesh Saini has built a reputation for driving growth and building strong market presence. As the General Manager at Metamorf Lifesciences, he played a pivotal role in expanding the company's reach and touching the lives of countless patients.\n\nAs Director of Sales at Moulins Pharmaceuticals, Durgesh brings his strategic expertise and deep market understanding to lead the sales team toward accessible, quality healthcare solutions.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative h-[50vh] min-h-[380px] flex items-end overflow-hidden">
        <Image src="/pic.jpg.jpeg" alt="" fill className="object-cover" priority quality={90} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-14">
          <motion.p {...rise(0.1)} className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4">About Moulins</motion.p>
          <motion.h1 {...rise(0.25)} className="text-4xl md:text-6xl font-light text-white leading-[1.1]">Compassion in every</motion.h1>
          <motion.h1 {...rise(0.4)} className="text-4xl md:text-6xl font-medium text-white leading-[1.1]">dose we deliver</motion.h1>
        </div>
      </section>

      {/* Who We Are + Mission */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          <motion.div {...rise()}>
            <div className="h-1 w-12 rounded-full mb-6" style={{ backgroundColor: TEAL }} />
            <h2 className="text-3xl font-semibold text-gray-900 mb-6">Who We Are</h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>Moulins Pharmaceuticals is a purpose-driven pharmaceutical company based in Panchkula, Haryana. We manufacture and distribute high-quality medicines, nutraceuticals, and active pharmaceutical ingredients across India.</p>
              <p>Founded on the belief that healthcare should be accessible, affordable, and compassionate, we work every day to bring precision-manufactured products to healthcare professionals and patients who depend on them.</p>
            </div>
          </motion.div>
          <motion.div {...rise(0.15)}>
            <div className="h-1 w-12 rounded-full mb-6" style={{ backgroundColor: TEAL }} />
            <h2 className="text-3xl font-semibold text-gray-900 mb-6">Our Mission</h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>To advance health through quality pharmaceuticals — manufactured with precision, distributed with integrity, and delivered with care to every corner of India.</p>
              <p>We believe every pill carries responsibility. That&apos;s why we invest in rigorous quality control, ethical business practices, and long-term partnerships built on trust.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-8 py-20">
          <motion.h2 {...rise()} className="text-3xl font-semibold text-gray-900 mb-12">What We Stand For</motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: "Quality First", desc: "ISO-certified manufacturing with stringent quality assurance at every stage — from raw materials to finished products." },
              { title: "Patient-Centric", desc: "Every decision we make is guided by its impact on the patients and communities we serve across India." },
              { title: "Ethical Leadership", desc: "Transparent practices, fair pricing, and honest relationships with every partner, distributor, and healthcare professional." },
            ].map((val) => (
              <motion.div key={val.title} {...rise()} className="bg-white rounded-xl border border-gray-200 p-7">
                <div className="w-3 h-3 rounded-full mb-5" style={{ backgroundColor: TEAL }} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{val.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{val.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14" style={{ backgroundColor: TEAL }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[{ value: "500+", label: "Products" }, { value: "15+", label: "Years" }, { value: "Pan India", label: "Distribution" }, { value: "ISO", label: "Certified" }].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-light text-white">{stat.value}</p>
                <p className="text-xs text-white/70 mt-1 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="max-w-6xl mx-auto px-8 py-24" id="ourteam">
        <motion.div {...rise()} className="text-center mb-16">
          <div className="h-1 w-12 rounded-full mx-auto mb-6" style={{ backgroundColor: TEAL }} />
          <h2 className="text-4xl font-semibold text-gray-900 mb-4">Our Team</h2>
          <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
            Meet the dedicated professionals behind our mission to deliver exceptional healthcare solutions and innovation.
          </p>
        </motion.div>

        <div className="space-y-24">
          {TEAM.map((member, i) => (
            <motion.div
              key={member.name}
              {...rise(0.1)}
              className={`flex flex-col ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} gap-12 md:gap-16 items-center`}
            >
              {/* Photo */}
              <div className="w-full md:w-[42%] flex-shrink-0">
                <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-[4/5] w-full h-full">
                  <Image
                    src={member.photo}
                    alt={member.name}
                    fill
                    className="object-cover w-full h-full"
                    style={{ objectPosition: member.objectPosition || "top" }}
                    sizes="(max-width: 768px) 100vw, 42vw"
                  />
                  {/* Teal accent bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: TEAL }} />
                </div>
              </div>

              {/* Details */}
              <div className="w-full md:w-[58%]">
                <div className="h-1 w-10 rounded-full mb-5" style={{ backgroundColor: TEAL }} />
                <h3 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">{member.name}</h3>
                <p className="text-base font-medium mb-6" style={{ color: TEAL }}>{member.title}</p>
                <div className="space-y-4">
                  {member.bio.split("\n\n").map((para, j) => (
                    <p key={j} className="text-gray-600 leading-relaxed text-[15px]">{para}</p>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 border-t border-gray-200 py-20 text-center">
        <motion.h2 {...rise()} className="text-3xl font-semibold text-gray-900 mb-4">Interested in partnering?</motion.h2>
        <motion.p {...rise(0.1)} className="text-base text-gray-500 max-w-xl mx-auto mb-8">
          Whether you&apos;re a healthcare professional, distributor, or pharmacy — we&apos;d love to work with you.
        </motion.p>
        <motion.div {...rise(0.2)}>
          <Link href="/contact" className="inline-block px-8 py-3.5 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity" style={{ backgroundColor: TEAL }}>
            Get in Touch
          </Link>
        </motion.div>
      </section>
    </>
  );
}
