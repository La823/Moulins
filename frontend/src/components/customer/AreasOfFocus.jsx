"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function AreasOfFocus() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch("/home-focus").then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  const cards = (data.cards || []).filter((c) => c.title);
  if (cards.length === 0) return null;

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-8">
        <h2 className="text-4xl text-gray-900 mb-6">{data.heading}</h2>
        {data.description && (
          <p className="text-base text-gray-500 leading-relaxed max-w-3xl mb-14">
            {data.description}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {cards.map((card) => (
            <Link key={card.position} href={card.link_url || "/products"} className="group block">
              <div className="aspect-[3/4] overflow-hidden mb-4">
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt={card.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100" />
                )}
              </div>
              <p className="text-lg text-gray-900 mb-2">{card.title}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 group-hover:gap-2.5 transition-all">
                Learn more
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
