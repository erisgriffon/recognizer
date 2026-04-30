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
      node("a", "name", "Alpha", { numbers: { "birth year": 1809 } }),
      node("b", "name", "Beta", { numbers: { "founded year": 1810 } }),
    ];
    const near = findConnections(nodes).find((c) => c.kind === "near");
    expect(near).toBeTruthy();
    expect(near.strength).toBe(0.45);
  });

  it("kind=multiple: 2x year multiples match at strength 0.4", () => {
    const nodes = [
      node("a", "name", "Alpha", { numbers: { "founded year": 1000 } }),
      node("b", "name", "Beta", { numbers: { "birth year": 2000 } }),
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
      node("b", "name", "Beta", { numbers: { "birth year": 2000 } }),
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

describe("findConnections — numerology depth tiers", () => {
  // Helper: build a node that already has both numerology systems precomputed,
  // so we can test the engine without going through the extractor pipeline.
  // Pyth/Chal reductions are picked to put the pair into a specific cell of
  // the agreement matrix (both, Pyth-only, Chal-only, neither).
  const numNode = (id, name, pythReduced, chalReduced, extras = {}) => ({
    id, type: "name", name,
    numbers: extras.numbers || {},
    numerology: {
      pythagorean: pythReduced == null ? null : { sum: pythReduced, reduced: pythReduced, source: name.toUpperCase() },
      chaldean: chalReduced == null ? null : { sum: chalReduced, reduced: chalReduced, source: name.toUpperCase() },
      deepReduced: null,
    },
    ...extras,
  });

  it("depth=0 produces zero numerology connections of any flavor", () => {
    const nodes = [
      numNode("a", "A", 1, 1),
      numNode("b", "J", 1, 1),
    ];
    const kinds = findKinds(nodes, { numerologyDepth: 0 });
    expect(kinds).not.toContain("numerology");
    expect(kinds).not.toContain("numerology-chaldean");
    expect(kinds).not.toContain("numerology-double");
    expect(kinds).not.toContain("numerology-deep");
  });

  it("default depth (no setting) = 1 (Surface) — same behavior as the old enableNumerology=true", () => {
    // Pyth match, Chaldean differs — should produce only the Pythagorean connection.
    const nodes = [
      numNode("a", "A", 1, 1),
      numNode("b", "S", 1, 3),
    ];
    const conns = findConnections(nodes); // no settings at all
    const numerology = conns.filter((c) => c.kind === "numerology");
    expect(numerology.length).toBe(1);
    expect(numerology[0].strength).toBe(STRENGTH.NUMEROLOGY);
  });

  it("depth=2 with Chaldean-only match emits a numerology-chaldean (not numerology)", () => {
    // C: Pyth=3, Chal=3 ; G: Pyth=7, Chal=3 — Chaldean agrees, Pythagorean does not.
    const nodes = [
      numNode("a", "C", 3, 3),
      numNode("b", "G", 7, 3),
    ];
    const conns = findConnections(nodes, { numerologyDepth: 2 });
    const kinds = conns.map((c) => c.kind);
    expect(kinds).not.toContain("numerology");
    const ch = conns.find((c) => c.kind === "numerology-chaldean");
    expect(ch).toBeTruthy();
    expect(ch.value).toBe(3);
    expect(ch.strength).toBe(STRENGTH.NUMEROLOGY_CHALDEAN);
  });

  it("depth=2 with both systems agreeing collapses into a single numerology-double, not two separate findings", () => {
    // A: Pyth=1, Chal=1 ; J: Pyth=1, Chal=1 — both systems agree.
    const nodes = [
      numNode("a", "A", 1, 1),
      numNode("b", "J", 1, 1),
    ];
    const conns = findConnections(nodes, { numerologyDepth: 2 });
    // No bare "numerology" or "numerology-chaldean" between this pair —
    // exactly one merged "numerology-double".
    expect(conns.filter((c) => c.kind === "numerology").length).toBe(0);
    expect(conns.filter((c) => c.kind === "numerology-chaldean").length).toBe(0);
    const doubles = conns.filter((c) => c.kind === "numerology-double");
    expect(doubles.length).toBe(1);
    expect(doubles[0].strength).toBe(STRENGTH.NUMEROLOGY_DOUBLE);
    expect(doubles[0].chaldeanValue).toBe(1);
  });

  it("depth=1 with both systems agreeing only emits the Pythagorean finding (Chaldean is gated)", () => {
    const nodes = [
      numNode("a", "A", 1, 1),
      numNode("b", "J", 1, 1),
    ];
    const conns = findConnections(nodes, { numerologyDepth: 1 });
    expect(conns.filter((c) => c.kind === "numerology").length).toBe(1);
    expect(conns.filter((c) => c.kind === "numerology-chaldean").length).toBe(0);
    expect(conns.filter((c) => c.kind === "numerology-double").length).toBe(0);
  });

  it("depth=3 emits numerology-deep for facts on different nodes that share a reduced digit", () => {
    // 18 → 1+8 = 9 ; 27 → 2+7 = 9 — both reduce to 9.
    // 14 → 1+4 = 5 — does not match.
    const nodes = [
      numNode("a", "A", 1, 1, { numbers: { "x": 18 } }),
      numNode("b", "B", 2, 2, { numbers: { "y": 27, "z": 14 } }),
    ];
    const conns = findConnections(nodes, { numerologyDepth: 3 });
    const deep = conns.filter((c) => c.kind === "numerology-deep");
    expect(deep.length).toBe(1);
    expect(deep[0].value).toBe(9);
    expect(deep[0].strength).toBe(STRENGTH.NUMEROLOGY_DEEP);
  });

  it("depth=3 does NOT emit deep connections between facts on the same node", () => {
    // Both facts are on node "a" and both reduce to 9. No connection should
    // be emitted (same-node pairs are excluded).
    const nodes = [
      numNode("a", "A", 1, 1, { numbers: { "x": 18, "y": 27 } }),
    ];
    const conns = findConnections(nodes, { numerologyDepth: 3 });
    expect(conns.filter((c) => c.kind === "numerology-deep").length).toBe(0);
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
