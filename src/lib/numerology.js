import { stripDiacritics } from "./utils.js";

export const pythagoreanValue = (ch) => {
  const c = ch.toLowerCase().charCodeAt(0) - 96;
  if (c < 1 || c > 26) return 0;
  return ((c - 1) % 9) + 1;
};

export const reduceNumber = (n) => {
  while (n > 9 && n !== 11 && n !== 22) {
    n = String(n).split("").reduce((a, d) => a + parseInt(d, 10), 0);
  }
  return n;
};

export const numerologyOf = (str) => {
  const cleaned = stripDiacritics(str || "").replace(/[^a-zA-Z]/g, "");
  if (!cleaned) return null;
  const sum = cleaned.split("").reduce((a, c) => a + pythagoreanValue(c), 0);
  return { sum, reduced: reduceNumber(sum), source: cleaned };
};

// Alias — Surface tier still calls numerologyOf, but Standard-tier code reads
// more clearly when the system is named explicitly.
export const pythagoreanNumerologyOf = numerologyOf;

// Chaldean numerology assigns letters to digits 1–8 (9 is reserved as sacred,
// though it CAN appear as a final reduced result, e.g. 27 → 9). Different
// letter values from Pythagorean produces an independent fact per node.
const CHALDEAN_VALUES = {
  a: 1, i: 1, j: 1, q: 1, y: 1,
  b: 2, k: 2, r: 2,
  c: 3, g: 3, l: 3, s: 3,
  d: 4, m: 4, t: 4,
  e: 5, h: 5, n: 5, x: 5,
  u: 6, v: 6, w: 6,
  o: 7, z: 7,
  f: 8, p: 8,
};

export const chaldeanValue = (ch) => CHALDEAN_VALUES[ch.toLowerCase()] || 0;

export const chaldeanNumerologyOf = (str) => {
  const cleaned = stripDiacritics(str || "").replace(/[^a-zA-Z]/g, "");
  if (!cleaned) return null;
  const sum = cleaned.split("").reduce((a, c) => a + chaldeanValue(c), 0);
  return { sum, reduced: reduceNumber(sum), source: cleaned };
};

// Canonical letter-only signature. Two strings with identical signatures are
// exact anagrams. Edit distance on signatures gives near-anagrams.
export const anagramSignature = (str) =>
  stripDiacritics(str || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .split("")
    .sort()
    .join("");

// Multiset edit distance — how many single-letter swaps to make A into B?
export const multisetEditDistance = (a, b) => {
  const counts = {};
  for (const c of a) counts[c] = (counts[c] || 0) + 1;
  for (const c of b) counts[c] = (counts[c] || 0) - 1;
  let diff = 0;
  for (const c in counts) diff += Math.abs(counts[c]);
  return Math.max(diff, Math.abs(a.length - b.length));
};
