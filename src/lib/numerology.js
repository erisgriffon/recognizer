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
