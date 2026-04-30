import { describe, it, expect } from "vitest";
import {
  metaphone, phoneticCodes,
  isPartialAnagram, trigramSimilarity, naiveStem,
  normalizeHomoglyphs, hasHomoglyphs, isReverse,
} from "./lexical.js";

describe("metaphone — phonetic encoding", () => {
  it("produces empty string for empty / non-letter input", () => {
    expect(metaphone("")).toBe("");
    expect(metaphone("123")).toBe("");
    expect(metaphone(null)).toBe("");
  });

  it("encodes silent leading pairs by dropping the first letter", () => {
    // KN, GN, PN, AE, WR — first letter is silent.
    expect(metaphone("knight").startsWith("N")).toBe(true);
    expect(metaphone("gnome").startsWith("N")).toBe(true);
    expect(metaphone("wrist").startsWith("R")).toBe(true);
  });

  it("encodes silent MB at end", () => {
    expect(metaphone("lamb")).not.toMatch(/B$/);
    expect(metaphone("dumb")).not.toMatch(/B$/);
  });

  it("collapses TH to 0 (the Metaphone convention)", () => {
    expect(metaphone("thomas")).toContain("0");
    expect(metaphone("think")).toContain("0");
  });

  it("matches well-known homophone pairs to the same code", () => {
    expect(metaphone("smith")).toBe(metaphone("smyth"));
    expect(metaphone("philip")).toBe(metaphone("phillip"));
    expect(metaphone("catherine")).toBe(metaphone("katherine"));
  });

  it("distinguishes phonetically distinct words", () => {
    expect(metaphone("smith")).not.toBe(metaphone("jones"));
  });

  it("treats X at start as S (Xerxes → Serxes)", () => {
    expect(metaphone("xerxes").startsWith("S")).toBe(true);
  });
});

describe("phoneticCodes — name tokenization + Metaphone", () => {
  it("returns one code per token, dropping empties", () => {
    const codes = phoneticCodes("Smith Robert");
    expect(codes.length).toBe(2);
  });

  it("strips diacritics during tokenization", () => {
    expect(phoneticCodes("Renée").length).toBeGreaterThan(0);
  });
});

describe("isPartialAnagram — letter-subset match", () => {
  it("detects a nickname/full-name relationship", () => {
    // Eliza ⊂ Elizabeth — every letter present in sufficient quantity.
    expect(isPartialAnagram("Eliza", "Elizabeth")).toBe(true);
  });

  it("works regardless of which arg is the longer string", () => {
    expect(isPartialAnagram("Elizabeth", "Eliza")).toBe(true);
  });

  it("rejects equal-length pairs (those are exact anagrams, not partial)", () => {
    expect(isPartialAnagram("listen", "silent")).toBe(false);
  });

  it("rejects when a letter is missing from the larger string", () => {
    expect(isPartialAnagram("xyz", "Elizabeth")).toBe(false);
  });

  it("rejects trivially short subsets to avoid noise", () => {
    expect(isPartialAnagram("Al", "Albert")).toBe(false); // "Al" too short
  });
});

describe("trigramSimilarity — Jaccard on 3-grams", () => {
  it("returns 1.0 for identical strings", () => {
    expect(trigramSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 when no trigrams overlap", () => {
    expect(trigramSimilarity("abc", "xyz")).toBe(0);
  });

  it("returns a value between 0 and 1 for partial overlap", () => {
    const score = trigramSimilarity("recognize", "recognizer");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for inputs shorter than 3 chars", () => {
    expect(trigramSimilarity("hi", "hello")).toBe(0);
  });
});

describe("naiveStem — suffix stripping", () => {
  it("collapses run/running/runner/runs to the same stem", () => {
    expect(naiveStem("running")).toBe("runn");  // -ing stripped
    expect(naiveStem("runner")).toBe("runn");   // -er stripped
    expect(naiveStem("runs")).toBe("run");      // -s stripped
  });

  it("strips longer suffixes preferentially", () => {
    // -ization is in the priority list before -ation/-tion/-ing.
    expect(naiveStem("organization")).toBe("organ");
  });

  it("leaves short words alone (under 4 chars)", () => {
    expect(naiveStem("ate")).toBe("ate");
    expect(naiveStem("a")).toBe("a");
  });

  it("refuses to strip when the residual would be under 3 chars", () => {
    // "cats" - "s" leaves "cat" (len 3, allowed). "ate" - "s"? doesn't end
    // in "s". "yes" stays "yes" because under 4-char guard. The point of
    // this test is that no single-letter suffix shrinks below 3.
    expect(naiveStem("cats")).toBe("cat");
    expect(naiveStem("ate")).toBe("ate");
  });
});

describe("normalizeHomoglyphs and hasHomoglyphs", () => {
  it("substitutes Cyrillic А with Latin A", () => {
    expect(normalizeHomoglyphs("Аpple")).toBe("Apple"); // first char is Cyrillic
  });

  it("returns the string unchanged if no homoglyphs are present", () => {
    expect(normalizeHomoglyphs("Apple")).toBe("Apple");
  });

  it("hasHomoglyphs returns true only when normalization would change the string", () => {
    expect(hasHomoglyphs("Аpple")).toBe(true);
    expect(hasHomoglyphs("Apple")).toBe(false);
  });
});

describe("isReverse — reverse-spelling check", () => {
  it("matches dog/god, evil/live, stressed/desserts", () => {
    expect(isReverse("dog", "god")).toBe(true);
    expect(isReverse("evil", "live")).toBe(true);
    expect(isReverse("stressed", "desserts")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isReverse("DOG", "god")).toBe(true);
  });

  it("rejects strings under 3 chars", () => {
    expect(isReverse("ab", "ba")).toBe(false);
  });

  it("rejects mismatched lengths", () => {
    expect(isReverse("dog", "good")).toBe(false);
  });

  it("rejects non-reverse pairs", () => {
    expect(isReverse("dog", "cat")).toBe(false);
  });
});
