// Lexical helpers used by the depth-aware lexical category in the connection
// engine. Existing anagram primitives (anagramSignature, multisetEditDistance)
// remain in numerology.js — they're shared infrastructure used by Surface tier.
// This module adds the Standard- and Deep-tier helpers.

import { stripDiacritics, tokenize } from "./utils.js";

// Standard Metaphone (Lawrence Philips, 1990). Vendored rather than added as
// an npm dependency — the algorithm is small, stable, and decades old. This
// is the original Metaphone, not Double Metaphone; Double Metaphone produces
// two codes per word and would change the matching semantics.
//
// The transformations are applied in this order:
//   1. Uppercase, strip non-letters.
//   2. Drop initial silent letter pairs (KN, GN, PN, AE, WR).
//   3. Drop final B in "MB" (lamb, dumb).
//   4. Walk the word, emitting Metaphone characters per the rule table.
//
// Output is a string of letters from {A B F H J K L M N P R S T W X Y 0}
// where 0 represents the "TH" sound. Empty input or unencodable input
// returns an empty string.
export const metaphone = (word) => {
  if (!word) return "";
  let s = stripDiacritics(word).toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  // Silent leading letter pairs.
  if (/^(KN|GN|PN|AE|WR)/.test(s)) s = s.slice(1);
  if (s.startsWith("X")) s = "S" + s.slice(1); // Xerxes → Serxes
  if (s.startsWith("WH")) s = "W" + s.slice(2);

  let out = "";
  const n = s.length;
  const at = (i) => (i >= 0 && i < n ? s[i] : "");
  const isVowel = (c) => c === "A" || c === "E" || c === "I" || c === "O" || c === "U";

  for (let i = 0; i < n; i++) {
    const c = s[i];
    const prev = at(i - 1);
    const next = at(i + 1);
    const next2 = at(i + 2);

    // Drop duplicate adjacent letters except C (handled below).
    if (c === prev && c !== "C") continue;

    switch (c) {
      case "A": case "E": case "I": case "O": case "U":
        if (i === 0) out += c;
        break;

      case "B":
        // MB at end is silent (lamb, dumb).
        if (!(i === n - 1 && prev === "M")) out += "B";
        break;

      case "C":
        if (next === "I" && next2 === "A") out += "X"; // CIA → X
        else if (next === "H") out += "X";              // CH → X (church)
        else if (next === "I" || next === "E" || next === "Y") out += "S";
        else out += "K";
        break;

      case "D":
        if (next === "G" && (next2 === "E" || next2 === "I" || next2 === "Y")) {
          out += "J"; i++; // edge → ej
        } else out += "T";
        break;

      case "F": out += "F"; break;

      case "G":
        if (next === "H") {
          // GH silent at end or before vowel-then-consonant; otherwise F.
          if (i + 2 >= n || !isVowel(next2)) { i++; break; }
          out += "F"; i++;
        } else if (next === "N") {
          // Final GN silent (sign, foreign).
          if (i + 1 === n - 1) { i++; break; }
          out += "K";
        } else if (next === "E" || next === "I" || next === "Y") {
          out += "J";
        } else out += "K";
        break;

      case "H":
        // H is dropped after a vowel and not before a vowel; otherwise H.
        if (isVowel(prev) && !isVowel(next)) break;
        out += "H";
        break;

      case "J": out += "J"; break;
      case "K":
        if (prev !== "C") out += "K"; // CK → K once
        break;
      case "L": out += "L"; break;
      case "M": out += "M"; break;
      case "N": out += "N"; break;

      case "P":
        if (next === "H") { out += "F"; i++; }
        else out += "P";
        break;

      case "Q": out += "K"; break;
      case "R": out += "R"; break;

      case "S":
        if (next === "H") { out += "X"; i++; }
        else if (next === "I" && (next2 === "O" || next2 === "A")) out += "X";
        else out += "S";
        break;

      case "T":
        if (next === "H") { out += "0"; i++; } // TH → 0
        else if (next === "I" && (next2 === "O" || next2 === "A")) out += "X";
        else if (next === "C" && next2 === "H") break; // TCH silent T
        else out += "T";
        break;

      case "V": out += "F"; break;

      case "W":
        if (isVowel(next)) out += "W";
        break;

      case "X":
        out += "KS";
        break;

      case "Y":
        if (isVowel(next)) out += "Y";
        break;

      case "Z": out += "S"; break;

      default: break;
    }
  }
  return out;
};

// Tokenize a name and Metaphone-encode each token. Empty codes are dropped.
// Two names match phonetically if they share at least one code at any
// position (looser than position-aware matching, which would miss
// "Smith Robert" ↔ "Robert Smith").
export const phoneticCodes = (name) =>
  tokenize(name || "").map(metaphone).filter((c) => c.length > 0);

// Letter-multiset subset check: every letter in the smaller string appears
// at least as many times in the larger. Uses the anagramSignature alphabet
// (a-z only, lowercased, diacritics stripped). Returns false for trivially
// short inputs to avoid noise — "Al" being a subset of every name.
export const isPartialAnagram = (a, b) => {
  if (!a || !b) return false;
  const norm = (s) => stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, "");
  let small = norm(a), big = norm(b);
  if (small.length === big.length) return false; // exact-length is anagram territory
  if (small.length > big.length) [small, big] = [big, small];
  if (small.length < 3) return false;
  const counts = {};
  for (const ch of big) counts[ch] = (counts[ch] || 0) + 1;
  for (const ch of small) {
    if (!counts[ch]) return false;
    counts[ch]--;
  }
  return true;
};

// Trigram-Jaccard similarity. Returns 0..1 where 1 is identical trigram set.
// Trigrams overlap with a sliding window of 3 chars on the lowercased,
// alpha-only form. Inputs shorter than 3 chars produce 0.
export const trigramSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const norm = (s) => stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, "");
  const aa = norm(a), bb = norm(b);
  if (aa.length < 3 || bb.length < 3) return 0;
  const grams = (s) => {
    const out = new Set();
    for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const A = grams(aa), B = grams(bb);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

// Naive English stemmer. Strips a single common suffix in priority order.
// Good enough for "running"/"runner"/"runs" all returning "run". Not as
// accurate as Porter; deliberately small. Inputs under 4 chars are returned
// as-is (stripping turns "ate" into "" otherwise).
export const naiveStem = (word) => {
  if (!word) return "";
  const w = stripDiacritics(word).toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w;
  // Order matters — longer suffixes stripped first.
  const suffixes = ["ational", "tional", "ization", "ation", "ness", "ment",
    "tion", "ing", "ers", "est", "ies", "ied", "ly", "ed", "er", "es", "s"];
  for (const suf of suffixes) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
};

// Homoglyph normalization. Confusable non-Latin codepoints get mapped to
// their Latin equivalents so a string like "Аpple" (Cyrillic А, U+0410)
// normalizes to "Apple" for matching. The map is curated rather than
// exhaustive — these are the cases that show up in real homoglyph attacks.
const HOMOGLYPHS = {
  // Cyrillic lookalikes
  "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "К": "K", "М": "M",
  "О": "O", "Р": "P", "Т": "T", "Х": "X", "У": "Y",
  "а": "a", "с": "c", "е": "e", "о": "o", "р": "p", "х": "x", "у": "y",
  // Greek lookalikes
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
  "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
  "ο": "o", "ρ": "p", "ν": "v",
};

export const normalizeHomoglyphs = (str) => {
  if (!str) return "";
  let out = "";
  for (const ch of str) out += HOMOGLYPHS[ch] || ch;
  return out;
};

// True iff the string contains at least one non-Latin character that maps
// to a Latin lookalike. Used to gate the homoglyph-match connection: only
// fire when normalization actually changed something.
export const hasHomoglyphs = (str) => {
  if (!str) return false;
  for (const ch of str) if (HOMOGLYPHS[ch]) return true;
  return false;
};

// Reverse-spelling check. Trivial implementation, but isolated for
// testability. Two-letter words and shorter are excluded — palindrome
// trivia like "ab"/"ba" isn't the bit we're going for. Letter-only
// comparison after diacritic strip; case-insensitive.
export const isReverse = (a, b) => {
  if (!a || !b) return false;
  const norm = (s) => stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, "");
  const aa = norm(a), bb = norm(b);
  if (aa.length < 3 || aa.length !== bb.length) return false;
  return aa === bb.split("").reverse().join("");
};
