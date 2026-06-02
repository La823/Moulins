"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function HomePage() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const play = () => video.play().catch(() => {});
    play();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") play();
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) play(); });
  }, []);

  return (
    <>
      {/* ── Video Hero ── */}
      <section className="relative w-full overflow-hidden" style={{ height: "100vh" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/moulinslander.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center text-white px-5">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 drop-shadow-lg" style={{ fontFamily: "Trimble, sans-serif" }}>
            Moulins Pharmaceuticals
          </h1>
          <h2 className="text-2xl md:text-3xl font-light mb-6 drop-shadow-md">
            HealthCare, Beyond Medicine
          </h2>
          <p className="max-w-2xl text-base md:text-lg text-white/80 leading-relaxed">
            At Moulins Pharma, healthcare goes beyond medicine — it&apos;s about trust, compassion, and lasting care.
            Like a moulin channelling life-giving water, we create pathways to well-being, ensuring care reaches every individual in need.
          </p>
        </div>
      </section>

      {/* ── Our Story ── */}
      <section className="flex flex-col md:flex-row items-center gap-6 px-5 py-12 md:py-16">
        <div className="w-full md:w-[65%]">
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/JyLUGtcdcP0?si=Pg7JowWKQFQFmBYK"
              title="Our Story"
              style={{ border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
        <div className="w-full md:w-[35%] text-left px-4 md:px-8">
          <h3 className="text-5xl md:text-6xl mb-6 text-gray-800" style={{ fontFamily: "Ciguatera, serif" }}>
            Our Story
          </h3>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            The name Moulins is inspired by a natural wonder — a moulin, a transformative opening in a glacier
            that channels water to nourish life beyond it. Like a moulin, we start small but create ripples
            that shape the future of healthcare. We don&apos;t just provide medicines; we empower lives, offering
            not just prescriptions but the promise of a better tomorrow.
          </p>
        </div>
      </section>

      {/* ── Core Values ── */}
      <section className="px-4 py-16" style={{ width: "95vw", margin: "0 auto" }}>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3 uppercase text-center" style={{ fontFamily: "Ciguatera, serif" }}>
          Our Core Values
        </h2>
        <p className="text-gray-500 text-center max-w-2xl mx-auto mb-4 text-sm md:text-base">
          At Moulins Pharmaceuticals, our values define who we are and guide our mission to deliver healthcare that goes beyond medicine.
        </p>
        <div className="h-1 w-64 mx-auto rounded-full mb-12" style={{ background: "linear-gradient(to right, #E5A83B, #E54B65, #7D56C1, #1A78BF)" }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { key: "care", title: "Care", sub: "Healing with Heart", color: "#E5A83B", img: "/photos/care.jpg", imgTop: true, desc: "Compassion is at our core. We go beyond medicine to ensure every person feels seen, heard, and supported — because true care starts with humanity." },
            { key: "integrity", title: "Integrity", sub: "Doing What's Right", color: "#E54B65", img: "/photos/integrity.jpg", imgTop: false, desc: "We uphold the highest ethical standards, building trust through honesty, transparency, and accountability." },
            { key: "accessibility", title: "Accessibility", sub: "Health for Everyone", color: "#7D56C1", img: "/photos/accessibility.jpg", imgTop: true, desc: "Healthcare is a right, not a privilege. We break barriers to ensure our medicines and services reach those who need them most." },
            { key: "excellence", title: "Excellence", sub: "Striving for the Best", color: "#2AAA8A", img: "/photos/excellence.jpg", imgTop: false, desc: "Quality is our commitment. From our medicines to our partnerships, we constantly innovate and improve to set new standards in healthcare." },
            { key: "empathy", title: "Empathy", sub: "Walking in Their Shoes", color: "#1A78BF", img: "/photos/empathy.jpg", imgTop: true, desc: "We listen, understand, and act with kindness, making healthcare personal, meaningful, and transformative." },
          ].map((v) => (
            <div key={v.key} className="flex flex-col items-center rounded-lg overflow-hidden" style={{ backgroundColor: "#F5FEFD", minHeight: "420px" }}>
              {v.imgTop && <div className="w-full h-44 overflow-hidden"><img src={v.img} alt={v.title} className="w-full h-full object-cover" /></div>}
              <div className="self-stretch border-l-0 border-t-0" style={{ borderLeft: "2px dashed #ccc", height: "40px", margin: "8px auto" }} />
              <div className="flex flex-col items-center px-4 pb-6 flex-1 justify-center">
                <h3 className="text-2xl font-bold" style={{ color: v.color, fontFamily: "Trimble, sans-serif" }}>{v.title}</h3>
                <h4 className="text-sm font-semibold text-gray-600 mb-3">{v.sub}</h4>
                <p className="text-sm text-gray-500 text-center leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>{v.desc}</p>
              </div>
              {!v.imgTop && (
                <>
                  <div style={{ borderLeft: "2px dashed #ccc", height: "40px", margin: "8px auto" }} />
                  <div className="w-full h-44 overflow-hidden"><img src={v.img} alt={v.title} className="w-full h-full object-cover" /></div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 text-center bg-gray-50">
        <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-4">Ready to partner with us?</h2>
        <p className="text-gray-500 mb-8 max-w-md mx-auto text-sm">Browse our full catalogue or get in touch to explore partnership opportunities.</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/products" className="px-8 py-3 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: "#00A6A4" }}>
            Browse Products
          </Link>
          <Link href="/contact" className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:border-gray-500 transition-colors">
            Contact Us
          </Link>
        </div>
      </section>
    </>
  );
}
