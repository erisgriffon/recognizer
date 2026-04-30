import { describe, it, expect } from "vitest";
import {
  pythagoreanValue, reduceNumber, numerologyOf,
  anagramSignature, multisetEditDistance,
} from "./numerology.js";

describe("pythagoreanValue", () => {
  it("maps A=1 .. I=9, J=1 .. R=9, S=1 .. Z=8 (Pythagorean cycle)", () => {
    expect(pythagoreanValue("a")).toBe(1);
    expect(pythagoreanValue("i")).toBe(9);
    expect(pythagoreanValue("j")).toBe(1);
    expect(pythagoreanValue("r")).toBe(9);
    expect(pythagoreanValue("s")).toBe(1);
    expect(pythagoreanValue("z")).toBe(8);
  });

  it("is case-insensitive and returns 0 for non-letters", () => {
    expect(pythagoreanValue("A")).toBe(1);
    expect(pythagoreanValue("Z")).toBe(8);
    expect(pythagoreanValue("1")).toBe(0);
    expect(pythagoreanValue(" ")).toBe(0);
  });
});

describe("reduceNumber", () => {
  it("reduces multi-digit numbers to a single digit", () => {
    expect(reduceNumber(48)).toBe(3); // 4+8=12 → 1+2=3
    expect(reduceNumber(123)).toBe(6); // 1+2+3=6
  });

  it("preserves master numbers 11 and 22", () => {
    expect(reduceNumber(11)).toBe(11);
    expect(reduceNumber(22)).toBe(22);
    // 29 → 11 (master, stops)
    expect(reduceNumber(29)).toBe(11);
  });

  it("returns single digits unchanged", () => {
    expect(reduceNumber(5)).toBe(5);
    expect(reduceNumber(0)).toBe(0);
  });
});

describe("numerologyOf", () => {
  it("returns null for empty / non-letter input", () => {
    expect(numerologyOf("")).toBe(null);
    expect(numerologyOf("123 456")).toBe(null);
  });

  it("strips diacritics, non-letters, and is case-insensitive", () => {
    const a = numerologyOf("Tesla");
    const b = numerologyOf("TESLA");
    const c = numerologyOf("Téslá!");
    expect(a.sum).toBe(b.sum);
    expect(a.sum).toBe(c.sum);
    expect(a.reduced).toBe(c.reduced);
  });

  it("exposes sum, reduced, and the cleaned source string", () => {
    // T=2, E=5, S=1, L=3, A=1 → sum 12, reduced 3
    const r = numerologyOf("Tesla");
    expect(r.sum).toBe(12);
    expect(r.reduced).toBe(3);
    expect(r.source).toBe("Tesla"); // case preserved in source for display
  });
});

describe("anagramSignature", () => {
  it("produces identical signatures for true anagrams", () => {
    expect(anagramSignature("listen")).toBe(anagramSignature("silent"));
    expect(anagramSignature("Astronomer")).toBe(anagramSignature("moon starer"));
  });

  it("ignores case, spaces, punctuation, and diacritics", () => {
    expect(anagramSignature("Élise")).toBe(anagramSignature("Elise"));
    expect(anagramSignature("a-b-c")).toBe(anagramSignature("ABC"));
  });

  it("returns empty string for input with no letters", () => {
    expect(anagramSignature("12345")).toBe("");
    expect(anagramSignature("")).toBe("");
  });
});

describe("multisetEditDistance", () => {
  it("returns 0 for identical multisets", () => {
    expect(multisetEditDistance("abc", "cab")).toBe(0);
    expect(multisetEditDistance("aabc", "caba")).toBe(0);
  });

  it("counts the number of letter swaps to convert A into B", () => {
    expect(multisetEditDistance("abc", "abd")).toBe(2); // remove c, add d
    expect(multisetEditDistance("abcd", "ab")).toBe(2); // length diff
  });
});
