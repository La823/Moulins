"use client";

// The website's notification sounds. "order" is the order sound (a new
// order for staff, and the confirmation when an order is placed); anything
// else is a short chime made in the browser until it has a sound file of
// its own. One mute switch, remembered per browser, covers them all.

const FILES = { order: "/sounds/order.mp3" };
export const MUTE_KEY = "liveNotifications.muted";

const players = {};
let lastPlayed = 0;

export function soundMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
}

// A short two-note chime from the Web Audio API.
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [
      [880, 0],
      [1320, 0.12],
    ].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

// Plays a sound unless muted; several at once (a burst of alerts) play once.
// force plays even when muted — for the user's own confirmation.
export function playSound(name, { force = false } = {}) {
  if (typeof window === "undefined" || (!force && soundMuted())) return;
  if (Date.now() - lastPlayed < 1500) return;
  lastPlayed = Date.now();
  const file = FILES[name];
  if (!file) return chime();
  try {
    if (!players[name]) players[name] = new Audio(file);
    players[name].currentTime = 0;
    players[name].play().catch(chime);
  } catch {
    chime();
  }
}
