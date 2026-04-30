import { describe, it, expect } from "vitest";
import { encodeCaseFileToFragment, decodeCaseFileFromFragment } from "./url.js";

describe("encode/decode round trip", () => {
  it("recovers a case file byte-for-byte", () => {
    const original = {
      v: 1,
      d: "2026-04-29",
      n: [
        { t: "name", v: "Nikola Tesla" },
        { t: "date", v: "1969-07-20", l: "moon landing" },
        { t: "today" },
      ],
    };
    const fragment = encodeCaseFileToFragment(original);
    expect(decodeCaseFileFromFragment(fragment)).toEqual(original);
  });

  it("survives a leading # on the fragment", () => {
    const original = { v: 1, d: "2026-04-29", n: [] };
    const fragment = "#" + encodeCaseFileToFragment(original);
    expect(decodeCaseFileFromFragment(fragment)).toEqual(original);
  });

  it("preserves non-ASCII characters through the round trip", () => {
    const original = {
      v: 1, d: "2026-04-29",
      n: [{ t: "name", v: "Émile — Zola" }, { t: "text", v: "café 北京" }],
    };
    expect(decodeCaseFileFromFragment(encodeCaseFileToFragment(original))).toEqual(original);
  });
});

describe("decodeCaseFileFromFragment — defensive paths", () => {
  it("returns null for empty, missing, or non-string input", () => {
    expect(decodeCaseFileFromFragment("")).toBe(null);
    expect(decodeCaseFileFromFragment(null)).toBe(null);
    expect(decodeCaseFileFromFragment(undefined)).toBe(null);
    expect(decodeCaseFileFromFragment(42)).toBe(null);
  });

  it("returns null when the fragment has no case= param", () => {
    expect(decodeCaseFileFromFragment("view=table")).toBe(null);
    expect(decodeCaseFileFromFragment("#other=stuff")).toBe(null);
  });

  it("returns null without throwing on garbage compressed payloads", () => {
    expect(decodeCaseFileFromFragment("case=not-real-lzstring")).toBe(null);
    expect(decodeCaseFileFromFragment("case=!!!@@@###")).toBe(null);
  });

  it("rejects valid compressed JSON that has the wrong format version", () => {
    const future = { v: 2, d: "2026-04-29", n: [] };
    const fragment = encodeCaseFileToFragment(future);
    expect(decodeCaseFileFromFragment(fragment)).toBe(null);
  });
});

describe("encodeCaseFileToFragment — output shape", () => {
  it("starts with case= and contains only URL-safe characters", () => {
    const fragment = encodeCaseFileToFragment({ v: 1, d: "2026-04-29", n: [] });
    expect(fragment.startsWith("case=")).toBe(true);
    // lz-string's encoded component uses A-Z a-z 0-9 + - _ $ . *
    expect(fragment).toMatch(/^case=[A-Za-z0-9+\-_$.*]*$/);
  });
});
