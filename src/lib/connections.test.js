import { describe, it, expect } from "vitest";
import { findConnections, strengthTier } from "./connections.js";
import { STRENGTH, TIERS } from "./connections.config.js";

// Tiny node factory — only the fields the engine actually reads.
const node = (id, type, name, extras = {}) => ({
  id, type, name, numbers: extras.numbers || {}, ...extras,
});

const findKinds = (nodes, settings = {}) =>
  findConnections(nodes, settings).map((c) => c.kind);

describe("findConnections — numeric matching kinds", () => {
  it("kind=exact: identical values > 9 across two nodes match", () => {
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "char count": 42 } }),
      node("b", "text", "Beta", { numbers: { "page count": 42 } }),
    ];
    const conns = findConnections(nodes);
    const exact = conns.find((c) => c.kind === "exact");
    expect(exact).toBeTruthy();
    expect(exact.strength).toBe(1.0);
  });

  it("does NOT match exact values <= 9 (small-integer noise floor)", () => {
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "month": 7 } }),
      node("b", "name", "Beta", { numbers: { "siblings": 7 } }),
    ];
    expect(findKinds(nodes)).not.toContain("exact");
  });

  it("kind=near: values within 2 of each other, both > 20, match at 0.6", () => {
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "duration (sec)": 100 } }),
      node("b", "name", "Beta", { numbers: { "page count": 102 } }),
    ];
    const near = findConnections(nodes).find((c) => c.kind === "near");
    expect(near).toBeTruthy();
    expect(near.strength).toBe(0.6);
  });

  it("year-fact near matches downgrade to strength 0.45 (not 0.6)", () => {
    // Adjacent years are common in Wikipedia summaries — they should match
    // (so the user sees the proximity) but at reduced strength.
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "year mentioned (1809)": 1809 } }),
      node("b", "name", "Beta", { numbers: { "year mentioned (1810)": 1810 } }),
    ];
    const near = findConnections(nodes).find((c) => c.kind === "near");
    expect(near).toBeTruthy();
    expect(near.strength).toBe(0.45);
  });

  it("kind=multiple: 2x year multiples match at strength 0.4", () => {
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "founded year": 1000 } }),
      node("b", "name", "Beta", { numbers: { "year mentioned (2000)": 2000 } }),
    ];
    const mult = findConnections(nodes).find((c) => c.kind === "multiple");
    expect(mult).toBeTruthy();
    expect(mult.multiplier).toBe(2);
  });

  it("year-fact multiples are restricted to 2x or 3x — 4x must NOT match", () => {
    // 500 → 2000 is a clean 4x. For non-year facts that's allowed (multiplier
    // ≤ 12). For year facts the rule is strict: only 2x and 3x.
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "founded year": 500 } }),
      node("b", "name", "Beta", { numbers: { "year mentioned (2000)": 2000 } }),
    ];
    expect(findKinds(nodes)).not.toContain("multiple");
  });
});

describe("findConnections — non-numeric kinds", () => {
  it("kind=numerology: two names that reduce to the same digit", () => {
    // A→1, both names are length 1 letter so they trivially share reduction
    const nodes = [
      node("a", "name", "A", { numerology: { pythagorean: { sum: 1, reduced: 1, source: "A" }, chaldean: null, deepReduced: null } }),
      node("b", "name", "J", { numerology: { pythagorean: { sum: 1, reduced: 1, source: "J" }, chaldean: null, deepReduced: null } }),
    ];
    const num = findConnections(nodes).find((c) => c.kind === "numerology");
    expect(num).toBeTruthy();
    expect(num.value).toBe(1);
    expect(num.strength).toBe(0.85);
  });

  it("settings.numerologyDepth=0 suppresses numerology connections", () => {
    const nodes = [
      node("a", "name", "A", { numerology: { pythagorean: { sum: 1, reduced: 1, source: "A" }, chaldean: null, deepReduced: null } }),
      node("b", "name", "J", { numerology: { pythagorean: { sum: 1, reduced: 1, source: "J" }, chaldean: null, deepReduced: null } }),
    ];
    expect(findKinds(nodes, { numerologyDepth: 0 })).not.toContain("numerology");
  });

  it("kind=anagram: two name nodes with identical letter multisets", () => {
    const nodes = [
      node("a", "name", "Listen"),
      node("b", "name", "Silent"),
    ];
    const ana = findConnections(nodes).find((c) => c.kind === "anagram");
    expect(ana).toBeTruthy();
    expect(ana.strength).toBe(0.95);
  });

  it("kind=astrology: same-element zodiac signs match at strength 0.45", () => {
    const nodes = [
      node("a", "name", "Aries Person", { zodiac: "Aries" }),
      node("b", "name", "Leo Person", { zodiac: "Leo" }), // both fire
    ];
    const astro = findConnections(nodes).find((c) => c.kind === "astrology");
    expect(astro).toBeTruthy();
    expect(astro.element).toBe("fire");
  });

  it("kind=ley-line: three nearly-collinear locations form a triangle", () => {
    const nodes = [
      node("a", "location", "P1", { lat: 0, lng: 10 }),
      node("b", "location", "P2", { lat: 30, lng: 10 }),
      node("c", "location", "P3", { lat: 60, lng: 10 }),
    ];
    const conns = findConnections(nodes);
    expect(conns.filter((c) => c.kind === "ley-line").length).toBe(3); // a-b, b-c, a-c
  });

  it("kind=distance: every pair of locations gets a distance connection", () => {
    const nodes = [
      node("a", "location", "P1", { lat: 0, lng: 0 }),
      node("b", "location", "P2", { lat: 0, lng: 1 }),
    ];
    const dist = findConnections(nodes).find((c) => c.kind === "distance");
    expect(dist).toBeTruthy();
    expect(dist.km).toBeGreaterThan(0);
  });

  it("kind=name-mention: a name appears in a text fragment", () => {
    const nodes = [
      node("a", "name", "Tesla"),
      node("b", "text", "fragment", { rawText: "...mentions tesla in the body..." }),
    ];
    const m = findConnections(nodes).find((c) => c.kind === "name-mention");
    expect(m).toBeTruthy();
    expect(m.mention).toBe("tesla");
  });

  it("kind=weekday-cluster: 3+ nodes on the same day-of-week match pairwise", () => {
    const nodes = [
      node("a", "date", "D1", { dayOfWeek: "Tuesday" }),
      node("b", "date", "D2", { dayOfWeek: "Tuesday" }),
      node("c", "date", "D3", { dayOfWeek: "Tuesday" }),
    ];
    const wk = findConnections(nodes).filter((c) => c.kind === "weekday-cluster");
    expect(wk.length).toBe(3); // a-b, a-c, b-c
  });
});

describe("strengthTier — named tiers replace 'CONFIDENCE %'", () => {
  it("maps strengths to the four tiers at the documented thresholds", () => {
    expect(strengthTier(1.0)).toBe("SUSPICIOUS");
    expect(strengthTier(0.9)).toBe("SUSPICIOUS");
    expect(strengthTier(0.89)).toBe("STRIKING");
    expect(strengthTier(0.7)).toBe("STRIKING");
    expect(strengthTier(0.69)).toBe("NOTABLE");
    expect(strengthTier(0.5)).toBe("NOTABLE");
    expect(strengthTier(0.49)).toBe("TRIVIAL");
    expect(strengthTier(0)).toBe("TRIVIAL");
  });
});

describe("connections.config — STRENGTH has every key the engine references", () => {
  // Catches typos when someone adds a new connection kind with a constant
  // that doesn't exist on the STRENGTH map (would silently produce strength=undefined).
  const requiredKeys = [
    "EXACT", "NEAR", "NEAR_YEAR", "MULTIPLE",
    "NUMEROLOGY", "NUMEROLOGY_CHALDEAN", "NUMEROLOGY_DOUBLE", "NUMEROLOGY_DEEP",
    "ANAGRAM", "NEAR_ANAGRAM", "WORD_OVERLAP", "STYLOMETRIC", "WORDCOUNT_YEAR",
    "WEEKDAY_CLUSTER", "ASTROLOGY", "NAME_MENTION", "NAME_IN_FILENAME", "TODAY_MENTION",
    "COLOR_MATCH", "DISTANCE", "DISTANCE_MATCH", "LEY_LINE",
  ];
  it.each(requiredKeys)("STRENGTH.%s is a finite number in [0,1]", (key) => {
    const v = STRENGTH[key];
    expect(typeof v).toBe("number");
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
  it("TIERS is ordered from highest min to lowest", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i - 1].min).toBeGreaterThanOrEqual(TIERS[i].min);
    }
  });
});
