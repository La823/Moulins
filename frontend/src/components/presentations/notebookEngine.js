// Page-turning notebook for presentations, ported from the open-source
// sketchbook (github.com/MengTo/sketchbook). The turning leaf is a chain of
// nested strips whose tangent sweeps through an arc, so the page bends the
// way paper bends instead of pivoting like a door.
//
// The original draws every spread from one painted PNG of an open book.
// Here a spread is DOM — CSS paper with a slide image on each page — and
// each strip face is a window onto that spread, offset to its own slice.
//
// createNotebook() takes the overlay's root element (markup lives in
// NotebookViewer.jsx) and returns { goTo, destroy }: goTo(spread) jumps the
// book to a spread (the contents list uses it), and destroy() removes every
// listener and stops the animation loop, so React can mount and unmount it
// freely. onSpread(i) reports which spread the book is on or heading to.

const N = 18; // strips — enough for a smooth curve
const BETA = 0.6; // peak curl of the arc, radians
// where the paper sits inside the book box, as fractions of its size
const PAPER_X = 0.04;
const PAPER_Y = 0.16;
const SPAN = 0.5 - PAPER_X; // gutter → outer page edge
const TILT_X = 4.5,
  TILT_Y = 7; // degrees — deliberately restrained
// The book opens at 1.5x its layout size, and that is what the readout calls
// 100% — so the zoom buttons read 60%–160% around it.
const ZOOM_DEFAULT = 1.5,
  ZOOM_MIN = 0.9,
  ZOOM_MAX = 2.4;
const MAG = 2.3;

function el(t, c) {
  const e = document.createElement(t);
  if (c) e.className = c;
  return e;
}
function cssUrl(u) {
  return 'url("' + String(u).replace(/["\\\n]/g, "\\$&") + '")';
}

/**
 * pages: [{kind:"title", logo} | {image, label} | null]
 * Pages pair up into spreads, left then right; an odd last page leaves the
 * final right-hand page blank.
 */
export function createNotebook(root, { pages, onClose, onSpread }) {
  const ac = new AbortController();
  const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...opts, signal: ac.signal });
  const q = (s) => root.querySelector(s);

  const SPREADS = [];
  for (let i = 0; i < pages.length; i += 2) SPREADS.push({ left: pages[i], right: pages[i + 1] || null });
  const M = SPREADS.length;
  const SLIDES = pages.filter((p) => p && p.image).length;

  const stage = q(".sb-stage");
  const sb3d = q(".sb-3d");
  const book = q(".sb-book");
  const capBox = q(".sb-captions");
  const count = q(".nb-count");
  const hint = q(".sb-hint");
  const leftBtn = q(".sb-arrow.left");
  const rightBtn = q(".sb-arrow.right");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COARSE = matchMedia("(pointer: coarse)").matches;

  /* ------------------------------------------------ the spread */
  function pageEl(p, side, num) {
    const d = el("div", "nb-page " + side);
    if (!p) return d;
    if (p.kind === "title") {
      d.classList.add("nb-title-page");
      if (p.logo) {
        const logo = el("div", "nb-logo");
        logo.style.backgroundImage = cssUrl(p.logo);
        d.appendChild(logo);
      }
      return d;
    }
    if (p.label) {
      const h = el("div", "nb-label");
      h.textContent = p.label;
      d.appendChild(h);
    }
    const im = el("div", "nb-img");
    im.style.backgroundImage = cssUrl(p.image);
    d.appendChild(im);
    const n = el("div", "nb-num");
    n.textContent = String(num);
    d.appendChild(n);
    return d;
  }
  function spreadEl(i, left) {
    const s = el("div", "nb-spread");
    s.appendChild(pageEl(SPREADS[i].left, "left", 2 * i));
    s.appendChild(pageEl(SPREADS[i].right, "right", 2 * i + 1));
    s.appendChild(el("div", "nb-spine"));
    if (left) s.style.left = left;
    return s;
  }

  /* ------------------------------------------------ the turning leaf */
  let idx = 0,
    turn = null; // turn = {dir, from, to, t}
  let strips = []; // the chain, kept for per-frame lighting
  let zoomStrips = []; // the same chain inside the magnified copy

  function halfEl(pos, i) {
    const d = el("div", "sb-half " + pos);
    d.appendChild(spreadEl(i, pos === "right" ? "calc(var(--bw) * -0.5)" : null));
    d.appendChild(el("div", "gutter-shade " + pos));
    return d;
  }
  /* build the strip chain once per turn; offsets are pure geometry, so they
     never need touching again while it animates */
  function buildCurl(dir, from, to) {
    strips = [];
    const c = el("div", "curl " + dir);
    c.style.setProperty("--n", N);
    c.style.setProperty("--span", SPAN);
    let host = c;
    for (let i = 0; i < N; i++) {
      const s = el("div", "strip");
      const gut = "var(--bw) * 0.5";
      const sw = "var(--bw) * " + SPAN + " / " + N;
      const A = "calc(-1 * (" + gut + " + " + i + " * " + sw + "))"; // faces the from-page
      const B = "calc(" + (i + 1) + " * " + sw + " - " + gut + ")"; // faces the to-page
      const f = el("div", "face front"),
        b = el("div", "face back");
      f.appendChild(spreadEl(from, dir === "next" ? A : B));
      b.appendChild(spreadEl(to, dir === "next" ? B : A));
      f.appendChild(el("div", "sh"));
      f.appendChild(el("div", "gl"));
      b.appendChild(el("div", "sh"));
      b.appendChild(el("div", "gl"));
      s.appendChild(f);
      s.appendChild(b);
      if (i === N - 1) s.classList.add("edge");
      host.appendChild(s);
      host = s;
      strips.push(s);
    }
    return c;
  }
  function applyTurn(t) {
    const th = Math.PI * t; // how far the leaf has swung
    const beta = BETA * Math.sin(Math.PI * t); // it is flat at both ends
    const D = 180 / Math.PI;
    const tt = th + beta,
      td = (2 * beta) / N;
    sb3d.style.setProperty("--tt", (tt * D).toFixed(2) + "deg");
    sb3d.style.setProperty("--td", (td * D).toFixed(3) + "deg");
    sb3d.style.setProperty("--shade", Math.sin(Math.PI * t).toFixed(3));
    fadeCaption(t);
    for (let i = 0; i < strips.length; i++) {
      const l1 = Math.abs(Math.cos(tt - i * td)); // facing at this strip's near edge
      const l2 = Math.abs(Math.cos(tt - (i + 1) * td)); // ...and at its far edge
      for (const st of [strips[i].style, zoomStrips[i] && zoomStrips[i].style]) {
        if (!st) continue;
        st.setProperty("--lit", l1.toFixed(3));
        st.setProperty("--a1", ((1 - l1) * 0.62).toFixed(3));
        st.setProperty("--a2", ((1 - l2) * 0.62).toFixed(3));
      }
    }
  }
  function paint() {
    book.textContent = "";
    if (!turn) {
      const f = el("div", "sb-full");
      f.appendChild(spreadEl(idx));
      book.appendChild(f);
      sb3d.style.setProperty("--shade", "0");
    } else {
      const next = turn.dir === "next";
      book.appendChild(halfEl("left", next ? turn.from : turn.to));
      book.appendChild(halfEl("right", next ? turn.to : turn.from));
      book.appendChild(buildCurl(turn.dir, turn.from, turn.to));
      applyTurn(turn.t);
    }
    const a = el("button", "sb-zone sb-prev"),
      b = el("button", "sb-zone sb-next");
    a.setAttribute("aria-label", "previous page");
    b.setAttribute("aria-label", "next page");
    book.appendChild(a);
    book.appendChild(b);
    layout();
    caption();
    const dest = turn ? turn.to : idx;
    onSpread && onSpread(dest);
    leftBtn.disabled = dest === 0;
    rightBtn.disabled = dest === M - 1;
    syncZoomLayer();
    placeLoupe();
  }

  /* captions: the products on the spread, and which slides these are */
  function spreadTitle(i) {
    const { left, right } = SPREADS[i];
    const names = [];
    for (const p of [left, right]) if (p && p.label && !names.includes(p.label)) names.push(p.label);
    return names.join(" · ");
  }
  function spreadCount(i) {
    const nums = [];
    if (SPREADS[i].left && SPREADS[i].left.image) nums.push(2 * i);
    if (SPREADS[i].right && SPREADS[i].right.image) nums.push(2 * i + 1);
    if (!nums.length) return SLIDES + (SLIDES === 1 ? " slide" : " slides");
    return (nums.length > 1 ? nums[0] + "–" + nums[1] : nums[0]) + " / " + SLIDES;
  }
  let capOut = null,
    capIn = null;
  function caption() {
    capBox.textContent = "";
    capOut = capIn = null;
    if (turn) {
      capOut = el("p", "sb-caption live");
      capOut.textContent = spreadTitle(turn.from);
      capBox.appendChild(capOut);
      capIn = el("p", "sb-caption live");
      capIn.textContent = spreadTitle(turn.to);
      capBox.appendChild(capIn);
      fadeCaption(turn.t);
    } else {
      const p = el("p", "sb-caption");
      p.textContent = spreadTitle(idx);
      capBox.appendChild(p);
    }
    count.textContent = spreadCount(turn ? turn.to : idx);
  }
  function fadeCaption(t) {
    if (!capOut || !capIn) return;
    /* the old title is gone before the new one arrives, so they never sit
       on top of each other mid-drag */
    const out = 1 - Math.max(0, Math.min(1, (t - 0.1) / 0.28));
    const inn = Math.max(0, Math.min(1, (t - 0.56) / 0.3));
    capOut.style.opacity = out.toFixed(3);
    capIn.style.opacity = inn.toFixed(3);
  }
  function layout() {
    sb3d.style.setProperty("--bw", book.clientWidth + "px");
  }
  on(window, "resize", layout);

  /* ------------------------------------------------------ spring loop */
  let spring = null;
  function animateTo(target, onDone, stiff, damp) {
    spring = { v: 0, target, done: onDone, k: stiff || 150, c: damp || 22 };
    kick();
  }
  let raf = null,
    last = 0;
  function tick(now) {
    raf = null;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    if (spring && turn) {
      const s = spring;
      const x = turn.t - s.target;
      s.v += (-s.k * x - s.c * s.v) * dt;
      turn.t += s.v * dt;
      if (Math.abs(turn.t - s.target) < 0.002 && Math.abs(s.v) < 0.02) {
        turn.t = s.target;
        spring = null;
        applyTurn(turn.t);
        s.done && s.done();
      } else applyTurn(turn.t);
    }
    viewSpring();
    /* a done-callback may already have queued the next frame */
    if ((spring || viewActive) && raf === null) raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (raf === null) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  /* ------------------------------------------- tilt + zoom of the book */
  const view = { rx: 0, ry: 0, z: ZOOM_DEFAULT, trx: 0, try_: 0, tz: ZOOM_DEFAULT };
  let viewActive = false;
  let lastZ = ZOOM_DEFAULT;
  function applyView() {
    sb3d.style.setProperty("--rx", view.rx.toFixed(2) + "deg");
    sb3d.style.setProperty("--ry", view.ry.toFixed(2) + "deg");
    sb3d.style.setProperty("--zoom", view.z.toFixed(3));
    /* the glass stays put, but the page under it has moved */
    if (view.z !== lastZ) {
      lastZ = view.z;
      placeLoupe();
    }
  }
  function viewSpring() {
    let moved = false;
    for (const [k, t] of [["rx", "trx"], ["ry", "try_"], ["z", "tz"]]) {
      const d = view[t] - view[k];
      if (Math.abs(d) > 0.0006) {
        view[k] += d * 0.14;
        moved = true;
      } else view[k] = view[t];
    }
    if (moved) applyView();
    viewActive = moved;
  }
  function setView(rx, ry, z) {
    view.trx = Math.max(-TILT_X, Math.min(TILT_X, rx));
    view.try_ = Math.max(-TILT_Y, Math.min(TILT_Y, ry));
    view.tz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    viewActive = true;
    kick();
    syncZoom();
  }
  /* the book leans toward the cursor — no dragging, and never far */
  function tiltTo(cx, cy) {
    if (drag) return; // hold still while a page is being turned
    const r = book.getBoundingClientRect();
    if (!r.width) return;
    const nx = Math.max(-1, Math.min(1, (cx - (r.left + r.width / 2)) / (r.width * 0.62)));
    const ny = Math.max(-1, Math.min(1, (cy - (r.top + r.height / 2)) / (r.height * 0.9)));
    setView(-ny * TILT_X, nx * TILT_Y, view.tz);
  }
  on(window, "pointermove", (e) => {
    if (e.pointerType === "touch") return;
    tiltTo(e.clientX, e.clientY);
  }, { passive: true });
  on(window, "pointerout", (e) => {
    if (!e.relatedTarget) setView(0, 0, view.tz);
  });
  on(window, "blur", () => setView(0, 0, view.tz));
  on(stage, "dblclick", () => setView(view.trx, view.try_, ZOOM_DEFAULT));

  /* ------------------------------------------------------- pointer work */
  let drag = null;
  function hideHint() {
    hint.classList.add("gone");
  }
  on(stage, "pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".sb-arrow")) return; // the arrows click on their own
    e.preventDefault(); // no text selection, no image drag
    const onBook = e.target.closest(".sb-zone");
    stage.setPointerCapture(e.pointerId);
    hideHint();
    if (!onBook) return;
    const r = book.getBoundingClientRect();
    const dir = (e.clientX - r.left) / r.width > 0.5 ? "next" : "prev";
    if (!startTurn(dir, 0)) return;
    drag = { dir, x0: e.clientX, w: r.width, moved: 0, vel: 0, tPrev: performance.now() };
  });
  on(stage, "pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    const raw = (drag.dir === "next" ? -dx : dx) / (drag.w * 0.62);
    const t = Math.max(0, Math.min(1, raw));
    const now = performance.now();
    drag.vel = (t - (turn ? turn.t : 0)) / Math.max(0.001, (now - drag.tPrev) / 1000);
    drag.tPrev = now;
    if (turn) {
      turn.t = t;
      applyTurn(t);
    }
  });
  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!turn) return;
    if (d.moved < 6) return commit(); // a tap, not a drag
    if (turn.t > 0.42 || d.vel > 1.1) commit();
    else cancel();
  }
  on(stage, "dragstart", (e) => e.preventDefault());
  on(stage, "selectstart", (e) => e.preventDefault());
  on(stage, "pointerup", endDrag);
  on(stage, "pointercancel", endDrag);

  /* ------------------------------------------------------ turn control */
  /* unlike the sketchbook, a presentation has a first and last page and
     never wraps round; returns false when there is no page to turn to */
  function startTurn(dir, t) {
    spring = null;
    if (turn) {
      idx = turn.to; // settle anything still in flight
      turn = null;
    }
    const to = dir === "next" ? idx + 1 : idx - 1;
    if (to < 0 || to >= M) {
      paint();
      return false;
    }
    turn = { dir, from: idx, to, t: t || 0 };
    paint();
    return true;
  }
  function commit() {
    if (!turn) return;
    if (REDUCED) {
      idx = turn.to;
      turn = null;
      paint();
      return;
    }
    animateTo(1, () => {
      idx = turn.to;
      turn = null;
      paint();
    }, 170, 26);
  }
  function cancel() {
    if (!turn) return;
    animateTo(0, () => {
      turn = null;
      paint();
    }, 150, 24);
  }
  function step(dir) {
    if (startTurn(dir, 0)) commit();
  }
  /* a neighbouring spread turns the page; anything further just opens there */
  function goTo(i) {
    if (i < 0 || i >= M) return;
    spring = null;
    if (turn) {
      idx = turn.to; // settle anything still in flight
      turn = null;
    }
    if (Math.abs(i - idx) === 1) return step(i > idx ? "next" : "prev");
    idx = i;
    paint();
  }
  on(leftBtn, "click", () => step("prev"));
  on(rightBtn, "click", () => step("next"));
  on(window, "keydown", (e) => {
    if (e.key === "Escape") {
      onClose && onClose();
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    hideHint();
    step(e.key === "ArrowRight" ? "next" : "prev");
  });

  /* --------------------------------------------------- loupe + controls */
  const loupe = q(".loupe");
  const zRead = q(".zoom-read");
  const loupeBtn = q(".nb-loupe-btn");
  const zInBtn = q(".nb-zoom-in"),
    zOutBtn = q(".nb-zoom-out");
  const zoomWrap = q(".zoomwrap");
  const zoomInner = q(".zoominner");
  let loupeOn = !COARSE,
    lx = null,
    ly = null,
    lgrab = null;
  loupeBtn.setAttribute("aria-pressed", String(loupeOn));

  function loupeSize() {
    return Math.round(Math.max(165, Math.min(262, book.clientWidth * 0.235)));
  }
  function bookBox() {
    return { x: 0, y: 0, w: book.clientWidth, h: book.clientHeight };
  }
  /* park it on the desk at the lower right, just below the paper — where
     the paper ends depends on the zoom, which starts above 100% */
  function restLoupe() {
    const b = bookBox();
    const paperBottom = b.h / 2 + (b.h * (0.5 - PAPER_Y)) * view.tz;
    lx = b.x + b.w * 0.88;
    ly = b.y + paperBottom + loupeSize() * 0.22;
    placeLoupe();
  }
  /* mirror whatever the book is currently showing into the magnified copy */
  function syncZoomLayer() {
    zoomInner.textContent = "";
    for (const c of book.children) {
      if (c.classList.contains("sb-zone")) continue; // hit targets need no copy
      zoomInner.appendChild(c.cloneNode(true));
    }
    zoomStrips = [...zoomInner.querySelectorAll(".strip")];
  }
  /* The glass sits above the tilt, in the book's untransformed pixels, so
     the lean of the page never nudges it. Only the scale changes which part
     of the paper is under it: the book is drawn about its own centre. */
  function placeLoupe() {
    if (lx === null) return;
    const B = bookBox(),
      bw = B.w,
      bh = B.h;
    if (!bw) return;
    const R = loupeSize() / 2,
      bez = R * 2 * 0.058;
    loupe.style.setProperty("--lr", R * 2 + "px");
    loupe.style.transform = "translate3d(" + (lx - R).toFixed(1) + "px," + (ly - R).toFixed(1) + "px,0)";
    loupe.classList.toggle("on", loupeOn);

    /* where the paper's edges actually land once the book is scaled */
    const z = view.z,
      cx = bw / 2,
      cy = bh / 2;
    const x0 = cx + (bw * PAPER_X - cx) * z,
      x1 = cx + (bw * (1 - PAPER_X) - cx) * z;
    const y0 = cy + (bh * PAPER_Y - cy) * z,
      y1 = cy + (bh * (1 - PAPER_Y) - cy) * z;
    /* the copy fades out as the glass wanders off the sheet, leaving plain
       glass rather than a sliver of page floating on the desk */
    const nx = Math.max(x0, Math.min(lx, x1));
    const ny = Math.max(y0, Math.min(ly, y1));
    const inside =
      lx > x0 && lx < x1 && ly > y0 && ly < y1
        ? Math.min(lx - x0, x1 - lx, ly - y0, y1 - ly)
        : -Math.hypot(lx - nx, ly - ny);
    const k = Math.max(0, Math.min(1, (inside + R * 0.3) / (R * 0.55)));

    zoomWrap.style.opacity = (loupeOn ? k : 0).toFixed(3);
    if (k <= 0.002) return;
    const r = (R - bez).toFixed(1);
    const mask =
      "radial-gradient(circle " + r + "px at " + lx.toFixed(1) + "px " + ly.toFixed(1) + "px," +
      "#000 calc(100% - 1px),transparent 100%)";
    zoomWrap.style.webkitMaskImage = mask;
    zoomWrap.style.maskImage = mask;
    /* the page point beneath the glass, magnified about that same spot */
    const px = cx + (lx - cx) / z,
      py = cy + (ly - cy) / z,
      s = MAG * z;
    zoomInner.style.transform =
      "translate(" + (lx - px * s).toFixed(1) + "px," + (ly - py * s).toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
  }
  on(loupe, "pointerdown", (e) => {
    if (!loupeOn || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // never starts a page turn
    lgrab = { cx: e.clientX, cy: e.clientY, lx0: lx, ly0: ly };
    loupe.classList.add("held");
    loupe.setPointerCapture(e.pointerId);
    hideHint();
  });
  on(loupe, "pointermove", (e) => {
    if (!lgrab) return;
    const b = bookBox(),
      R = loupeSize() / 2;
    /* the glass carries none of the book's transform, so the cursor maps 1:1 */
    lx = Math.max(b.x - R * 0.7, Math.min(b.x + b.w + R * 0.7, lgrab.lx0 + (e.clientX - lgrab.cx)));
    ly = Math.max(b.y - R * 0.7, Math.min(b.y + b.h + R * 1.0, lgrab.ly0 + (e.clientY - lgrab.cy)));
    placeLoupe();
  });
  function dropLoupe() {
    lgrab = null;
    loupe.classList.remove("held");
  }
  on(loupe, "pointerup", dropLoupe);
  on(loupe, "pointercancel", dropLoupe);
  on(loupeBtn, "click", () => {
    loupeOn = !loupeOn;
    loupeBtn.setAttribute("aria-pressed", String(loupeOn));
    if (loupeOn && lx === null) restLoupe();
    else placeLoupe();
  });
  on(window, "resize", () => {
    lx = null;
    restLoupe();
  });

  function syncZoom() {
    zRead.textContent = Math.round((view.tz / ZOOM_DEFAULT) * 100) + "%";
    zOutBtn.disabled = view.tz <= ZOOM_MIN + 0.001;
    zInBtn.disabled = view.tz >= ZOOM_MAX - 0.001;
  }
  on(zInBtn, "click", () => {
    setView(view.trx, view.try_, view.tz * 1.16);
    hideHint();
  });
  on(zOutBtn, "click", () => {
    setView(view.trx, view.try_, view.tz / 1.16);
    hideHint();
  });

  /* ------------------------------------------------------------- boot */
  for (const p of pages) {
    if (p && p.image) new Image().src = p.image; // warm the cache before the first turn
  }
  paint();
  applyView();
  syncZoom();
  restLoupe();

  return {
    goTo,
    destroy() {
      ac.abort();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      spring = null;
    },
  };
}
