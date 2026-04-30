import { describe, it, expect } from "vitest";
import {
  ZODIAC_ELEMENTS, ZODIAC_MODALITIES, ZODIAC_RULERS,
  zodiacCompatible, modalityCompatible, sharedRuler,
  angularDistance, aspectBetween, isMercuryRetrograde,
} from "./astrology.js";
import { parseDate } from "./dates.js";

const ALL_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

describe("astrology — sign tables", () => {
  it("ZODIAC_ELEMENTS has an entry for every sign", () => {
    for (const sign of ALL_SIGNS) expect(ZODIAC_ELEMENTS[sign]).toBeTruthy();
  });

  it("ZODIAC_MODALITIES has an entry for every sign", () => {
    for (const sign of ALL_SIGNS) expect(ZODIAC_MODALITIES[sign]).toBeTruthy();
  });

  it("ZODIAC_RULERS has an entry for every sign", () => {
    for (const sign of ALL_SIGNS) expect(ZODIAC_RULERS[sign]).toBeTruthy();
  });

  it("element classification is exactly three signs per element", () => {
    const counts = {};
    for (const el of Object.values(ZODIAC_ELEMENTS)) counts[el] = (counts[el] || 0) + 1;
    expect(counts).toEqual({ fire: 3, earth: 3, air: 3, water: 3 });
  });

  it("modality classification is exactly four signs per modality", () => {
    const counts = {};
    for (const m of Object.values(ZODIAC_MODALITIES)) counts[m] = (counts[m] || 0) + 1;
    expect(counts).toEqual({ cardinal: 4, fixed: 4, mutable: 4 });
  });
});

describe("zodiacCompatible — element matching", () => {
  it("matches across-sign within element", () => {
    expect(zodiacCompatible("Aries", "Leo")).toBe(true); // both fire
    expect(zodiacCompatible("Cancer", "Pisces")).toBe(true); // both water
  });

  it("does not match same-sign pairs (relocation match-self exclusion)", () => {
    expect(zodiacCompatible("Aries", "Aries")).toBe(false);
  });

  it("does not match across different elements", () => {
    expect(zodiacCompatible("Aries", "Cancer")).toBe(false); // fire vs water
  });
});

describe("modalityCompatible", () => {
  it("matches different signs sharing a modality", () => {
    expect(modalityCompatible("Aries", "Cancer")).toBe(true); // both cardinal
    expect(modalityCompatible("Taurus", "Scorpio")).toBe(true); // both fixed
    expect(modalityCompatible("Gemini", "Pisces")).toBe(true); // both mutable
  });

  it("excludes same-sign pairs (don't match a sign against itself)", () => {
    expect(modalityCompatible("Aries", "Aries")).toBe(false);
  });

  it("does not match across modalities", () => {
    expect(modalityCompatible("Aries", "Taurus")).toBe(false); // cardinal vs fixed
  });
});

describe("sharedRuler", () => {
  it("returns the planet name when two signs share a traditional ruler", () => {
    expect(sharedRuler("Aries", "Scorpio")).toBe("Mars");
    expect(sharedRuler("Taurus", "Libra")).toBe("Venus");
    expect(sharedRuler("Gemini", "Virgo")).toBe("Mercury");
    expect(sharedRuler("Sagittarius", "Pisces")).toBe("Jupiter");
    expect(sharedRuler("Capricorn", "Aquarius")).toBe("Saturn");
  });

  it("returns null for same-sign pairs", () => {
    expect(sharedRuler("Aries", "Aries")).toBe(null);
  });

  it("returns null for non-shared rulers", () => {
    expect(sharedRuler("Aries", "Cancer")).toBe(null); // Mars vs Moon
    expect(sharedRuler("Leo", "Cancer")).toBe(null); // Sun vs Moon — neighboring but not shared
  });
});

describe("angularDistance", () => {
  it("0° between a sign and itself", () => {
    expect(angularDistance("Aries", "Aries")).toBe(0);
  });

  it("60° between signs two apart on the wheel", () => {
    expect(angularDistance("Aries", "Gemini")).toBe(60);
  });

  it("120° between signs four apart", () => {
    expect(angularDistance("Aries", "Leo")).toBe(120);
  });

  it("180° between opposite signs (takes the short way around)", () => {
    expect(angularDistance("Aries", "Libra")).toBe(180);
  });

  it("wraps the long way correctly: Pisces↔Aries is 30°, not 330°", () => {
    expect(angularDistance("Pisces", "Aries")).toBe(30);
  });

  it("returns null for unknown signs", () => {
    expect(angularDistance("Ophiuchus", "Aries")).toBe(null);
  });
});

describe("aspectBetween", () => {
  it("conjunction at 0° (same sign)", () => {
    expect(aspectBetween("Aries", "Aries")).toMatchObject({ name: "conjunction", degrees: 0 });
  });

  it("sextile at 60°", () => {
    expect(aspectBetween("Aries", "Gemini")).toMatchObject({ name: "sextile", degrees: 60 });
  });

  it("square at 90°", () => {
    expect(aspectBetween("Aries", "Cancer")).toMatchObject({ name: "square", degrees: 90 });
  });

  it("trine at 120°", () => {
    expect(aspectBetween("Aries", "Leo")).toMatchObject({ name: "trine", degrees: 120 });
  });

  it("opposition at 180°", () => {
    expect(aspectBetween("Aries", "Libra")).toMatchObject({ name: "opposition", degrees: 180 });
  });

  it("returns null for non-traditional separations (semisextile at 30°)", () => {
    expect(aspectBetween("Aries", "Taurus")).toBe(null);
  });

  it("returns null for unknown signs", () => {
    expect(aspectBetween("Ophiuchus", "Aries")).toBe(null);
  });
});

describe("isMercuryRetrograde", () => {
  it("returns the period object for a date inside a known retrograde window", () => {
    // 2025-03-20 is in the 2025-03-14..2025-04-07 retrograde
    const r = isMercuryRetrograde(parseDate("2025-03-20"));
    expect(r).toBeTruthy();
    expect(r.start).toBe("2025-03-14");
    expect(r.end).toBe("2025-04-07");
  });

  it("returns null for a date outside any retrograde window", () => {
    // 2025-06-01: between the March/April and July/August 2025 windows
    expect(isMercuryRetrograde(parseDate("2025-06-01"))).toBe(null);
  });

  it("includes the start and end dates of the period (inclusive)", () => {
    expect(isMercuryRetrograde(parseDate("2025-03-14"))).toBeTruthy();
    expect(isMercuryRetrograde(parseDate("2025-04-07"))).toBeTruthy();
  });

  it("returns null for dates before the tabulated range (graceful degrade)", () => {
    // Table starts at 1950-12-23. Anything earlier returns null rather than
    // extrapolating.
    expect(isMercuryRetrograde(parseDate("1900-06-15"))).toBe(null);
  });

  it("returns null for invalid input", () => {
    expect(isMercuryRetrograde(null)).toBe(null);
    expect(isMercuryRetrograde(new Date("not-a-date"))).toBe(null);
  });
});
