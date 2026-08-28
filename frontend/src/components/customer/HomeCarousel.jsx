"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function HomeCarousel() {
  const [slides, setSlides] = useState([]);
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const trackRef = useRef(null);
  const slideRefs = useRef([]);

  useEffect(() => {
    apiFetch("/home-carousel")
      .then((data) => setSlides(Array.isArray(data) ? data.filter((s) => s.heading) : []))
      .catch(() => {});
  }, []);

  const GAP_PX = 24; // matches gap-6

  const recalcOffset = useCallback(() => {
    const el = slideRefs.current[0];
    if (el) setOffset(index * (el.getBoundingClientRect().width + GAP_PX));
  }, [index]);

  useEffect(() => {
    recalcOffset();
    window.addEventListener("resize", recalcOffset);
    return () => window.removeEventListener("resize", recalcOffset);
  }, [recalcOffset, slides.length]);

  if (slides.length === 0) return null;

  const goTo = (i) => setIndex((i + slides.length) % slides.length);

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto pl-3 pr-8">
        <div className="overflow-hidden">
          <div
            ref={trackRef}
            className="flex gap-6 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
            style={{ transform: `translateX(-${offset}px)` }}
          >
            {slides.map((slide, i) => (
              <div
                key={slide.position}
                ref={(el) => (slideRefs.current[i] = el)}
                className="grid grid-cols-2 shrink-0 w-[85%] md:w-[78%] h-[558px] transition-opacity duration-500"
                style={{ opacity: i === index ? 1 : 0.35 }}
              >
                {/* Image */}
                <div className="relative overflow-hidden bg-gray-100">
                  {slide.image_url ? (
                    <img src={slide.image_url} alt={slide.heading} className="w-full h-full object-cover object-center" />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                </div>

                {/* Text panel */}
                <div
                  className="flex flex-col items-center justify-center text-center px-10 pb-10"
                  style={{ backgroundColor: slide.card_color || "#4E1111" }}
                >
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <h3 className="text-3xl text-[#F3EEE3] leading-tight mb-5">{slide.heading}</h3>
                    {slide.description && (
                      <p className="text-sm text-[#F3EEE3]/80 leading-relaxed max-w-sm">
                        {slide.description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={slide.button_link || "/products"}
                    className="w-full py-3.5 text-sm font-medium text-center"
                    style={{ backgroundColor: "#F3EEE3", color: slide.card_color || "#4E1111" }}
                  >
                    {slide.button_text}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation: arrows + diamond indicators */}
        <div className="flex items-center justify-center gap-6 mt-4">
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Previous slide"
            className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors hover:text-white"
            style={{ borderColor: "#1F3B2C", color: "#1F3B2C" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1F3B2C")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            {slides.map((s, i) =>
              i === index ? (
                <span
                  key={s.position}
                  className="w-2.5 h-2.5 rotate-45"
                  style={{ backgroundColor: "#1F3B2C" }}
                />
              ) : (
                <button
                  key={s.position}
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className="w-2 h-2 rotate-45 bg-gray-300 hover:bg-gray-400 transition-colors"
                />
              )
            )}
          </div>

          <button
            onClick={() => goTo(index + 1)}
            aria-label="Next slide"
            className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors hover:text-white"
            style={{ borderColor: "#1F3B2C", color: "#1F3B2C" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1F3B2C")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
