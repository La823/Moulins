"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createNotebook } from "./notebookEngine";
import "./notebook.css";

const LOGO = "/Moulins Logo High Res - V2.png";

// Slide n (1-based) is page n of the book; page 0 is the logo page, and
// pages pair up into spreads.
const spreadOfSlide = (n) => Math.floor(n / 2);

// The products in the deck, in the order they first appear, with the slides
// each one has — what the contents list shows.
function contentsOf(slides) {
  const byName = new Map();
  slides.forEach((s, i) => {
    const key = s.product_id || s.product_name;
    if (!byName.has(key)) byName.set(key, { name: s.product_name || "Untitled", nums: [] });
    byName.get(key).nums.push(i + 1);
  });
  return [...byName.values()].map((p) => {
    const { nums } = p;
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const which =
      nums.length === 1 ? `Slide ${nums[0]}`
      : contiguous ? `Slides ${nums[0]}–${nums[nums.length - 1]}`
      : `Slides ${nums.join(", ")}`;
    return { ...p, which, spreads: new Set(nums.map(spreadOfSlide)) };
  });
}

// Full-screen "notebook" way of presenting a deck: the slides laid out as the
// pages of an open book you drag to turn, with a magnifier for detail. The
// first left-hand page is a title page, so slide 1 opens on the right like
// the first page of a real book. The title page carries only the logo.
// A contents list of the deck's products jumps straight to any of them.
export default function NotebookViewer({ slides, title, onClose }) {
  const rootRef = useRef(null);
  const bookRef = useRef(null);
  const [spread, setSpread] = useState(0);
  const [contentsOpen, setContentsOpen] = useState(false);
  const contents = useMemo(() => contentsOf(slides), [slides]);

  // Esc closes the contents list first, then the notebook
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = () => (contentsOpen ? setContentsOpen(false) : onClose());
  }, [onClose, contentsOpen]);

  useEffect(() => {
    const pages = [
      { kind: "title", logo: LOGO },
      ...slides.map((s) => ({ image: s.image_url, label: s.product_name })),
    ];
    const book = createNotebook(rootRef.current, {
      pages,
      onClose: () => onCloseRef.current(),
      onSpread: setSpread,
    });
    bookRef.current = book;
    return () => {
      book.destroy();
      bookRef.current = null;
    };
  }, [slides]);

  const openProduct = (p) => {
    setContentsOpen(false);
    const first = Math.min(...p.spreads);
    if (!p.spreads.has(spread)) bookRef.current?.goTo(first);
  };

  return (
    <div ref={rootRef} className="nb-root fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title || "Presentation"}>
      <button className="nb-close" onClick={onClose} aria-label="Close presentation">
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="sb-wrap">
        <div className="sb-stage">
          <button className="sb-arrow left" aria-label="previous page">
            <svg viewBox="0 0 14 44" width="14" height="44" fill="none" aria-hidden="true">
              <polyline points="11,3 3,22 11,41" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="sb-3d">
            <div className="sb-tilt">
              <div className="sb-cast ambient" aria-hidden="true" />
              <div className="sb-cast contact" aria-hidden="true" />
              <div className="sb-cast hair" aria-hidden="true" />
              <div className="sb-book" />
            </div>
            <div className="zoomwrap" aria-hidden="true">
              <div className="zoominner" />
            </div>
            <div className="loupe">
              <span className="grip" />
              <span className="ring">
                <span className="lens" />
              </span>
            </div>
          </div>
          <button className="sb-arrow right" aria-label="next page">
            <svg viewBox="0 0 14 44" width="14" height="44" fill="none" aria-hidden="true">
              <polyline points="3,3 11,22 3,41" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="sb-captions" />
        <div className="nb-count" />

        <div className="sb-tools" role="group" aria-label="view controls">
          <button className="tool nb-zoom-out" aria-label="zoom out">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8.6" cy="8.6" r="5.6" />
              <path d="M12.8 12.8 17.4 17.4M6.2 8.6h4.8" />
            </svg>
          </button>
          <span className="zoom-read">100%</span>
          <button className="tool nb-zoom-in" aria-label="zoom in">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8.6" cy="8.6" r="5.6" />
              <path d="M12.8 12.8 17.4 17.4M6.2 8.6h4.8M8.6 6.2v4.8" />
            </svg>
          </button>
          <span className="tool-sep" aria-hidden="true" />
          <button
            className="tool"
            aria-label="contents"
            aria-pressed={contentsOpen}
            onClick={() => setContentsOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5" />
              <circle cx="3.6" cy="5.5" r=".9" fill="currentColor" stroke="none" />
              <circle cx="3.6" cy="10" r=".9" fill="currentColor" stroke="none" />
              <circle cx="3.6" cy="14.5" r=".9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <span className="tool-sep nb-loupe-sep" aria-hidden="true" />
          <button className="tool nb-loupe-btn" aria-label="magnifier" aria-pressed="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8.8" cy="8.8" r="5.8" />
              <path d="M13 13l4.4 4.4" />
              <path d="M6.4 7.2a3.2 3.2 0 0 1 2.4-1.4" opacity=".55" />
            </svg>
          </button>
        </div>
        <p className="sb-hint">Drag the page to turn · Drag the glass across it</p>
      </div>

      {contentsOpen && (
        <div className="nb-contents" onClick={() => setContentsOpen(false)}>
          <section className="nb-contents-inner" onClick={(e) => e.stopPropagation()} aria-label="Contents">
            <p className="nb-section-label">Contents</p>
            <ol className="nb-plate-list">
              {contents.map((p, i) => (
                <li key={i}>
                  <button
                    className="nb-plate"
                    aria-current={p.spreads.has(spread) ? "true" : "false"}
                    onClick={() => openProduct(p)}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="t">{p.name}</span>
                    <span className="p">{p.which}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
