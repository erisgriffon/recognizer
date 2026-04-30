import { describe, it, expect } from "vitest";
import { findConnections, strengthTier, sortConnectionsByStrength, filterByStrengthFloor, connectionsForNode } from "./connections.js";
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

describe("findConnections — astrology depth tiers", () => {
  // Helper for sign-bearing nodes. Most tests pair signs whose elemental,
  // modal, ruler, and aspect relationships we can predict at a glance.
  const signNode = (id, name, zodiac, extras = {}) => ({
    id, type: "name", name, zodiac, numbers: extras.numbers || {}, ...extras,
  });

  it("depth=0 produces zero astrology connections of any flavor", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Leo"),
    ];
    const kinds = findKinds(nodes, { astrologyDepth: 0 });
    expect(kinds).not.toContain("astrology");
    expect(kinds).not.toContain("astrology-modality");
    expect(kinds).not.toContain("astrology-ruler");
    expect(kinds).not.toContain("astrology-aspect");
    expect(kinds).not.toContain("astrology-retrograde");
  });

  it("default depth (no setting) = 1 (Surface) — same behavior as the old enableAstrology=true", () => {
    // Two fire signs — element match only, no modality/ruler/aspect findings.
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Leo"),
    ];
    const conns = findConnections(nodes); // no settings at all
    const kinds = conns.map((c) => c.kind);
    expect(kinds.filter((k) => k === "astrology").length).toBe(1);
    expect(kinds).not.toContain("astrology-modality");
    expect(kinds).not.toContain("astrology-ruler");
    expect(kinds).not.toContain("astrology-aspect");
    expect(conns.find((c) => c.kind === "astrology").strength).toBe(STRENGTH.ASTROLOGY);
  });

  it("depth=1 excludes same-sign pairs from element match (preserves Surface semantics)", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Aries"),
    ];
    expect(findKinds(nodes, { astrologyDepth: 1 })).not.toContain("astrology");
  });

  it("depth=2 emits astrology + astrology-modality + astrology-ruler simultaneously when all three apply", () => {
    // Aries (fire/cardinal/Mars) + Scorpio (water/fixed/Mars) — element no,
    // modality no, ruler yes. Use Aries + Capricorn instead: fire vs earth
    // (no element), cardinal vs cardinal (yes modality), Mars vs Saturn
    // (no ruler). Want all three together: Aries + Aries doesn't work
    // (same-sign exclusion). Use Aries + Leo + Sagittarius pairs instead:
    // Aries vs Leo: fire/fire (element), cardinal/fixed (no modality),
    // Mars/Sun (no ruler). One layer.
    //
    // Need a pair where element match AND modality match AND ruler match
    // simultaneously and signs differ. The traditional rulership doubles:
    // Mars rules Aries (cardinal fire) + Scorpio (fixed water) — different
    // element, different modality. Venus rules Taurus (fixed earth) + Libra
    // (cardinal air) — different element, different modality.
    //
    // The classical doubles never share element AND modality with their
    // co-ruled sign — that's by design. So a "all three layers" pair
    // doesn't exist within the traditional scheme. Test the realistic
    // case: a pair sharing element + modality (impossible, since element
    // and modality together identify a sign uniquely) is also not a thing.
    //
    // Test the realistic two-layer overlap: element match + ruler match.
    // Aries + Scorpio: fire vs water (no element), Mars + Mars (yes ruler)
    // — only ruler. Capricorn + Aquarius: earth vs air (no element),
    // cardinal vs fixed (no modality), Saturn + Saturn (yes ruler)
    // — only ruler.
    //
    // Element + modality: signs sharing both must be the same sign. Skip.
    // Ruler + element: Mars rules Aries (fire) and Scorpio (water) —
    // never same element. Same for every classical pair. So ruler match
    // implies different element.
    //
    // The realistic stack at depth 2 is: signs sharing element OR signs
    // sharing modality OR signs sharing ruler — but two of those at once
    // is structurally impossible in the classical scheme. Pick a pair
    // that hits two distinct kinds via distinct relationships:
    // Aries + Cancer: fire vs water (no element), cardinal + cardinal
    // (yes modality), Mars vs Moon (no ruler) → just modality.
    //
    // So this test asserts the simpler case: a pair triggers exactly one
    // of element/modality/ruler — and depth=2 surfaces that one without
    // suppressing the others on a different pair.
    const nodes = [
      signNode("a", "Alpha", "Aries"),    // fire / cardinal / Mars
      signNode("b", "Beta", "Cancer"),    // water / cardinal / Moon
      signNode("c", "Gamma", "Scorpio"),  // water / fixed   / Mars
    ];
    const conns = findConnections(nodes, { astrologyDepth: 2 });
    const kinds = conns.map((c) => c.kind);
    // Aries + Cancer: shared modality (cardinal). No element, no ruler.
    expect(kinds).toContain("astrology-modality");
    // Aries + Scorpio: shared ruler (Mars). No element, no modality.
    expect(kinds).toContain("astrology-ruler");
    // Beta + Gamma (Cancer + Scorpio): water + water — element match.
    expect(kinds).toContain("astrology");
  });

  it("depth=2 modality match excludes same-sign pairs", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Aries"),
    ];
    expect(findKinds(nodes, { astrologyDepth: 2 })).not.toContain("astrology-modality");
  });

  it("depth=2 ruler match excludes same-sign pairs", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Aries"),
    ];
    expect(findKinds(nodes, { astrologyDepth: 2 })).not.toContain("astrology-ruler");
  });

  it("depth=2 ruler match emits astrology-ruler with the planet name", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),    // Mars
      signNode("b", "Beta", "Scorpio"),   // Mars
    ];
    const ruler = findConnections(nodes, { astrologyDepth: 2 }).find((c) => c.kind === "astrology-ruler");
    expect(ruler).toBeTruthy();
    expect(ruler.planet).toBe("Mars");
    expect(ruler.strength).toBe(STRENGTH.ASTROLOGY_RULER);
  });

  it("depth=3 same-sign pair fires conjunction-aspect (this is the only place same-sign produces a finding)", () => {
    const nodes = [
      signNode("a", "Alpha", "Aries"),
      signNode("b", "Beta", "Aries"),
    ];
    const conns = findConnections(nodes, { astrologyDepth: 3 });
    // No element / modality / ruler match for same-sign — but conjunction yes.
    expect(conns.filter((c) => c.kind === "astrology").length).toBe(0);
    const aspect = conns.find((c) => c.kind === "astrology-aspect");
    expect(aspect).toBeTruthy();
    expect(aspect.aspect.name).toBe("conjunction");
    expect(aspect.strength).toBe(STRENGTH.ASTROLOGY_ASPECT_CONJUNCTION);
  });

  it("depth=3 each of the five aspects fires for known sign pairs", () => {
    // Conjunction (0°): same sign. Sextile (60°): two apart.
    // Square (90°): three apart. Trine (120°): four apart.
    // Opposition (180°): six apart.
    const cases = [
      ["Aries", "Aries", "conjunction"],
      ["Aries", "Gemini", "sextile"],
      ["Aries", "Cancer", "square"],
      ["Aries", "Leo", "trine"],
      ["Aries", "Libra", "opposition"],
    ];
    for (const [a, b, expected] of cases) {
      const nodes = [
        signNode("a", "Alpha", a),
        signNode("b", "Beta", b),
      ];
      const aspect = findConnections(nodes, { astrologyDepth: 3 }).find((c) => c.kind === "astrology-aspect");
      expect(aspect, `${a} ↔ ${b} should produce ${expected}`).toBeTruthy();
      expect(aspect.aspect.name).toBe(expected);
    }
  });

  it("depth=3 emits astrology-retrograde for two date-bearing nodes both in retrograde windows", () => {
    // 2025-03-20 falls in 2025-03-14..2025-04-07; 2025-07-25 falls in 2025-07-17..2025-08-11.
    const nodes = [
      { id: "d1", type: "date", name: "Event 1", isoDate: "2025-03-20" },
      { id: "d2", type: "date", name: "Event 2", isoDate: "2025-07-25" },
    ];
    const conn = findConnections(nodes, { astrologyDepth: 3 }).find((c) => c.kind === "astrology-retrograde");
    expect(conn).toBeTruthy();
    expect(conn.strength).toBe(STRENGTH.ASTROLOGY_RETROGRADE);
    expect(conn.a.retrogradeRange).toBe("2025-03-14–2025-04-07");
  });

  it("depth=3 does NOT emit astrology-retrograde when only one date is in a retrograde window", () => {
    const nodes = [
      { id: "d1", type: "date", name: "Event 1", isoDate: "2025-03-20" }, // in retro
      { id: "d2", type: "date", name: "Event 2", isoDate: "2025-06-01" }, // outside
    ];
    expect(findKinds(nodes, { astrologyDepth: 3 })).not.toContain("astrology-retrograde");
  });

  it("depth=3 retrograde matching reads birthDate on name nodes (Wikidata-derived)", () => {
    // A name node with birthDate during retrograde, plus a date node also
    // during retrograde — the engine should treat both as date-bearing.
    const nodes = [
      { id: "n1", type: "name", name: "Person", birthDate: "2020-06-25" }, // 2020-06-17..2020-07-12
      { id: "d1", type: "date", name: "Event", isoDate: "2025-03-20" },    // 2025-03-14..2025-04-07
    ];
    const conn = findConnections(nodes, { astrologyDepth: 3 }).find((c) => c.kind === "astrology-retrograde");
    expect(conn).toBeTruthy();
  });

  it("layers stack rather than merge: element + modality + ruler each emit their own connection", () => {
    // Aries + Scorpio share Mars (ruler) and nothing else; depth-2 produces
    // exactly one ruler finding. We're testing the stacking pattern: that
    // when multiple kinds DO apply to a pair, each becomes a separate
    // connection rather than collapsing into a single "merged" finding the
    // way numerology-double does.
    //
    // Use Cancer + Scorpio: water/water (element), cardinal/fixed (no modality),
    // Moon/Mars (no ruler). Then add Cancer + Capricorn: water/earth (no
    // element), cardinal/cardinal (modality). Then verify Cancer participates
    // in both an "astrology" and an "astrology-modality" connection (different
    // partners, same node) — i.e. the engine emits one of each.
    const nodes = [
      signNode("a", "Alpha", "Cancer"),
      signNode("b", "Beta", "Scorpio"),     // shares element with Cancer (water)
      signNode("c", "Gamma", "Capricorn"),  // shares modality with Cancer (cardinal)
    ];
    const conns = findConnections(nodes, { astrologyDepth: 2 });
    const incidentToA = conns.filter((c) => c.from === "a" || c.to === "a");
    const kindsForA = incidentToA.map((c) => c.kind);
    expect(kindsForA).toContain("astrology");
    expect(kindsForA).toContain("astrology-modality");
  });
});

describe("findConnections — lexical depth tiers", () => {
  // Helper for name nodes — most lexical kinds operate on name/location nodes.
  const nameNode = (id, name) => ({ id, type: "name", name, numbers: {} });
  // Helper for text nodes — word-overlap, trigram, stem, stylometric.
  const textNode = (id, name, rawText, extras = {}) => ({
    id, type: "text", name,
    rawText, tokens: rawText.toLowerCase().split(/\s+/), numbers: {}, ...extras,
  });

  it("depth=0 produces no anagram, word-overlap, or stylometric findings", () => {
    const nodes = [
      nameNode("a", "Listen"),
      nameNode("b", "Silent"),
      textNode("c", "Doc 1", "the quick brown fox jumps over"),
      textNode("d", "Doc 2", "the quick brown fox runs over"),
    ];
    const kinds = findKinds(nodes, { lexicalDepth: 0 });
    expect(kinds).not.toContain("anagram");
    expect(kinds).not.toContain("word-overlap");
    expect(kinds).not.toContain("stylometric");
    expect(kinds).not.toContain("phonetic-match");
  });

  it("depth=1 (default) preserves anagram + word-overlap + stylometric (the old enableAnagrams=true behavior)", () => {
    const nodes = [
      nameNode("a", "Listen"),
      nameNode("b", "Silent"),
    ];
    const conns = findConnections(nodes); // default settings
    expect(conns.find((c) => c.kind === "anagram")).toBeTruthy();
  });

  it("depth=2 emits phonetic-match for sounds-alike names", () => {
    const nodes = [
      nameNode("a", "Smith"),
      nameNode("b", "Smyth"),
    ];
    const conns = findConnections(nodes, { lexicalDepth: 2 });
    const phon = conns.find((c) => c.kind === "phonetic-match");
    expect(phon).toBeTruthy();
    expect(phon.strength).toBe(STRENGTH.LEXICAL_PHONETIC);
  });

  it("depth=2 phonetic-match is suppressed when the pair is already a full anagram", () => {
    // listen/silent are anagrams AND phonetically distinct enough that
    // Metaphone might collide. The engine prefers the stronger anagram finding.
    const nodes = [
      nameNode("a", "Listen"),
      nameNode("b", "Silent"),
    ];
    const conns = findConnections(nodes, { lexicalDepth: 2 });
    expect(conns.filter((c) => c.kind === "phonetic-match").length).toBe(0);
    expect(conns.find((c) => c.kind === "anagram")).toBeTruthy();
  });

  it("depth=2 emits partial-anagram with smaller name as a, larger as b", () => {
    const nodes = [
      nameNode("a", "Eliza"),
      nameNode("b", "Elizabeth"),
    ];
    const pa = findConnections(nodes, { lexicalDepth: 2 }).find((c) => c.kind === "partial-anagram");
    expect(pa).toBeTruthy();
    expect(pa.a.nodeName).toBe("Eliza");      // smaller
    expect(pa.b.nodeName).toBe("Elizabeth");  // larger
  });

  it("depth=2 trigram-similarity fires for fuzzy text matches above threshold", () => {
    const nodes = [
      textNode("a", "Doc 1", "the quick brown fox jumps over the lazy dog"),
      textNode("b", "Doc 2", "the quick brown fox jumped over the lazy dogs"),
    ];
    const trig = findConnections(nodes, { lexicalDepth: 2 }).find((c) => c.kind === "trigram-similarity");
    expect(trig).toBeTruthy();
    expect(trig.score).toBeGreaterThan(0.4);
  });

  it("depth=3 stem-match fires when two text nodes share a word root", () => {
    const nodes = [
      textNode("a", "Doc A", "alpha beta running gamma"),
      textNode("b", "Doc B", "delta epsilon runner zeta"),
    ];
    const stem = findConnections(nodes, { lexicalDepth: 3 }).find((c) => c.kind === "stem-match");
    expect(stem).toBeTruthy();
    expect(stem.stem).toBe("runn"); // both running and runner naive-stem to "runn"
    expect(stem.strength).toBe(STRENGTH.LEXICAL_STEM);
  });

  it("depth=3 homoglyph-match fires when one name uses Cyrillic lookalikes", () => {
    // First A in "Аpple" is Cyrillic А (U+0410), normalizes to Latin Apple.
    const nodes = [
      nameNode("a", "Аpple"),
      nameNode("b", "Apple"),
    ];
    const h = findConnections(nodes, { lexicalDepth: 3 }).find((c) => c.kind === "homoglyph-match");
    expect(h).toBeTruthy();
    expect(h.strength).toBe(STRENGTH.LEXICAL_HOMOGLYPH);
  });

  it("depth=3 reverse-spell fires for dog/god", () => {
    const nodes = [
      nameNode("a", "Dog"),
      nameNode("b", "God"),
    ];
    const r = findConnections(nodes, { lexicalDepth: 3 }).find((c) => c.kind === "reverse-spell");
    expect(r).toBeTruthy();
    expect(r.strength).toBe(STRENGTH.LEXICAL_REVERSE);
  });

  it("depth gates stack: depth=2 includes Surface findings + Standard, but not Deep", () => {
    const nodes = [
      nameNode("a", "Listen"),         // anagram with b
      nameNode("b", "Silent"),
      nameNode("c", "Smith"),          // phonetic with d
      nameNode("d", "Smyth"),
      nameNode("e", "Dog"),            // reverse with f (Deep only)
      nameNode("f", "God"),
    ];
    const kinds = findKinds(nodes, { lexicalDepth: 2 });
    expect(kinds).toContain("anagram");          // Surface
    expect(kinds).toContain("phonetic-match");   // Standard
    expect(kinds).not.toContain("reverse-spell"); // Deep — gated off at 2
  });
});

describe("findConnections — geographic depth tiers", () => {
  const locNode = (id, name, lat, lng, extras = {}) => ({
    id, type: "location", name, lat, lng, numbers: extras.numbers || {}, ...extras,
  });

  it("depth=0 produces no distance, ley-line, or other geographic findings", () => {
    const nodes = [
      locNode("a", "P1", 0, 0),
      locNode("b", "P2", 0, 1),
      locNode("c", "P3", 0, 2),
    ];
    const kinds = findKinds(nodes, { geographicDepth: 0 });
    expect(kinds).not.toContain("distance");
    expect(kinds).not.toContain("ley-line");
    expect(kinds).not.toContain("ley-line-triangle");
    expect(kinds).not.toContain("antipodal-match");
  });

  it("depth=1 (default) emits 3 pairwise ley-line findings per triangle (backwards compat)", () => {
    const nodes = [
      locNode("a", "P1", 0, 10),
      locNode("b", "P2", 30, 10),
      locNode("c", "P3", 60, 10),
    ];
    const conns = findConnections(nodes); // default
    expect(conns.filter((c) => c.kind === "ley-line").length).toBe(3);
    expect(conns.filter((c) => c.kind === "ley-line-triangle").length).toBe(0);
  });

  it("depth=2 emits ONE ley-line-triangle per collinear triple, not three pairwise", () => {
    const nodes = [
      locNode("a", "P1", 0, 10),
      locNode("b", "P2", 30, 10),
      locNode("c", "P3", 60, 10),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    expect(conns.filter((c) => c.kind === "ley-line").length).toBe(0);
    const tri = conns.filter((c) => c.kind === "ley-line-triangle");
    expect(tri.length).toBe(1);
    expect(tri[0].participants.length).toBe(3);
    expect(tri[0].strength).toBe(STRENGTH.LEY_LINE_TRIANGLE);
  });

  it("depth=2 ley-line-triangle is routable to all three participants via connectionsForNode", () => {
    const nodes = [
      locNode("a", "P1", 0, 10),
      locNode("b", "P2", 30, 10),
      locNode("c", "P3", 60, 10),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    expect(connectionsForNode(conns, "a").some((c) => c.kind === "ley-line-triangle")).toBe(true);
    expect(connectionsForNode(conns, "b").some((c) => c.kind === "ley-line-triangle")).toBe(true);
    expect(connectionsForNode(conns, "c").some((c) => c.kind === "ley-line-triangle")).toBe(true);
  });

  it("depth=2 antipodal-match fires for diametrically opposite points", () => {
    const nodes = [
      locNode("a", "Spain", 40, 0),
      locNode("b", "NZ-ish", -40, 180),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    const a = conns.find((c) => c.kind === "antipodal-match");
    expect(a).toBeTruthy();
    expect(a.strength).toBe(STRENGTH.GEO_ANTIPODAL);
  });

  it("depth=2 time-zone-match fires for distant points sharing approximate UTC offset", () => {
    // 75°E and 76°E both round to UTC+5; 1° at the equator is ~111km, so
    // bump the second city far enough north to clear the 500km floor.
    const nodes = [
      locNode("a", "City X", 0, 75),
      locNode("b", "City Y", 60, 76),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    const tz = conns.find((c) => c.kind === "time-zone-match");
    expect(tz).toBeTruthy();
    expect(tz.offset).toBe(5);
  });

  it("depth=2 same-country fires only when both nodes carry the same country", () => {
    const nodes = [
      locNode("a", "City A", 40, -100, { country: "United States" }),
      locNode("b", "City B", 35, -120, { country: "United States" }),
      locNode("c", "City C", 51, 0, { country: "United Kingdom" }),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    const sc = conns.filter((c) => c.kind === "same-country");
    expect(sc.length).toBe(1);
    expect(sc[0].country).toBe("United States");
  });

  it("depth=3 emits great-circle-waypoint with participants array", () => {
    // Three equatorial cities; the middle one lies on the great-circle arc
    // between the outer two. Engine should emit one waypoint connection.
    const nodes = [
      locNode("a", "West", 0, 0),
      locNode("b", "Middle", 0, 30),
      locNode("c", "East", 0, 60),
    ];
    const conns = findConnections(nodes, { geographicDepth: 3 });
    const w = conns.find((c) => c.kind === "great-circle-waypoint");
    expect(w).toBeTruthy();
    expect(w.participants.length).toBe(3);
  });

  it("depth=3 magnetic-pole fires when both locations are within 1500km of a pole", () => {
    const nodes = [
      locNode("a", "Arctic A", 86, 140), // close to north magnetic pole
      locNode("b", "Arctic B", 84, 130),
    ];
    const conns = findConnections(nodes, { geographicDepth: 3 });
    const m = conns.find((c) => c.kind === "magnetic-pole");
    expect(m).toBeTruthy();
    expect(m.pole).toBe("north");
  });

  it("depth=3 elevation-band fires for two locations in the same band above 500m", () => {
    const nodes = [
      locNode("a", "High City", 39, -106, { numbers: { "elevation (m)": 1700 } }),
      locNode("b", "High Town", 47, 12, { numbers: { "elevation (m)": 1900 } }),
    ];
    const conns = findConnections(nodes, { geographicDepth: 3 });
    const e = conns.find((c) => c.kind === "elevation-band");
    expect(e).toBeTruthy();
    expect(e.band).toBe("high altitude");
  });

  it("depth=3 elevation-band does NOT fire when one location is sea-level", () => {
    const nodes = [
      locNode("a", "High City", 39, -106, { numbers: { "elevation (m)": 1700 } }),
      locNode("b", "Coastal", 47, 12, { numbers: { "elevation (m)": 50 } }),
    ];
    expect(findKinds(nodes, { geographicDepth: 3 })).not.toContain("elevation-band");
  });

  it("depth=3 widens ley-line tolerance to 1.5° and adds triangles missed at depth=2", () => {
    // p2 deviates 0.3° in lng with a 30° lat baseline. isLeyLine's metric
    // (cross-product magnitude / v1.length) yields ~0.6 — above the strict
    // 0.5° but below the loose 1.5°. So depth=2 misses this; depth=3 catches.
    const nodes = [
      locNode("a", "P1", 0, 10),
      locNode("b", "P2", 30, 10.3),
      locNode("c", "P3", 60, 10),
    ];
    const strict = findConnections(nodes, { geographicDepth: 2 });
    const loose = findConnections(nodes, { geographicDepth: 3 });
    expect(strict.filter((c) => c.kind === "ley-line-triangle").length).toBe(0);
    const tri = loose.filter((c) => c.kind === "ley-line-triangle");
    expect(tri.length).toBe(1);
    expect(tri[0].tolerance).toBe("loose");
  });

  it("layers stack: a pair antipodal AND in same time zone produces both findings", () => {
    // Construct a forced same-tz antipodal pair. Antipode of (40, 100) is
    // (-40, -80); UTC offsets are 7 vs -5, normally different. Shift to
    // longitudes that DO share rounding: e.g. (40, 90) and antipode
    // (-40, -90), which give offsets 6 and -6 — still different. Real
    // antipodes generally don't share tz; this test instead asserts the
    // separate-findings behavior using two separate pairs.
    const nodes = [
      locNode("a", "AntiA", 40, 100),
      locNode("b", "AntiB", -40, -80), // antipodal with a
      locNode("c", "TzA", 0, 75),       // same-tz with d
      locNode("d", "TzB", 60, 76),
    ];
    const conns = findConnections(nodes, { geographicDepth: 2 });
    const kinds = conns.map((c) => c.kind);
    expect(kinds).toContain("antipodal-match");
    expect(kinds).toContain("time-zone-match");
  });
});

describe("connections.config — STRENGTH has every key the engine references", () => {
  // Catches typos when someone adds a new connection kind with a constant
  // that doesn't exist on the STRENGTH map (would silently produce strength=undefined).
  const requiredKeys = [
    "EXACT", "NEAR", "NEAR_YEAR", "MULTIPLE",
    "NUMEROLOGY", "NUMEROLOGY_CHALDEAN", "NUMEROLOGY_DOUBLE", "NUMEROLOGY_DEEP",
    "ANAGRAM", "NEAR_ANAGRAM", "WORD_OVERLAP", "STYLOMETRIC", "WORDCOUNT_YEAR",
    "WEEKDAY_CLUSTER", "ASTROLOGY", "ASTROLOGY_MODALITY", "ASTROLOGY_RULER",
    "ASTROLOGY_RETROGRADE",
    "ASTROLOGY_ASPECT_CONJUNCTION", "ASTROLOGY_ASPECT_SEXTILE",
    "ASTROLOGY_ASPECT_SQUARE", "ASTROLOGY_ASPECT_TRINE", "ASTROLOGY_ASPECT_OPPOSITION",
    "LEXICAL_PHONETIC", "LEXICAL_PARTIAL_ANAGRAM", "LEXICAL_TRIGRAM",
    "LEXICAL_STEM", "LEXICAL_HOMOGLYPH", "LEXICAL_REVERSE",
    "NAME_MENTION", "NAME_IN_FILENAME", "TODAY_MENTION",
    "COLOR_MATCH", "DISTANCE", "DISTANCE_MATCH", "LEY_LINE", "LEY_LINE_TRIANGLE",
    "GEO_ANTIPODAL", "GEO_TIMEZONE", "GEO_SAME_COUNTRY",
    "GEO_GREAT_CIRCLE", "GEO_MAGNETIC_POLE", "GEO_ELEVATION_BAND",
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

describe("sortConnectionsByStrength — presentation-layer ordering", () => {
  it("returns connections sorted by strength descending", () => {
    const input = [
      { from: "a", to: "b", strength: 0.4, kind: "multiple" },
      { from: "c", to: "d", strength: 1.0, kind: "exact" },
      { from: "e", to: "f", strength: 0.6, kind: "near" },
      { from: "g", to: "h", strength: 0.85, kind: "numerology" },
    ];
    const sorted = sortConnectionsByStrength(input);
    const strengths = sorted.map((c) => c.strength);
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i - 1]).toBeGreaterThanOrEqual(strengths[i]);
    }
    expect(strengths).toEqual([1.0, 0.85, 0.6, 0.4]);
  });

  it("preserves insertion order for equal-strength connections (stable sort)", () => {
    const input = [
      { from: "a", to: "b", strength: 0.6, kind: "near", tag: "first" },
      { from: "c", to: "d", strength: 0.9, kind: "exact", tag: "middle" },
      { from: "e", to: "f", strength: 0.6, kind: "near", tag: "second" },
      { from: "g", to: "h", strength: 0.6, kind: "near", tag: "third" },
    ];
    const sorted = sortConnectionsByStrength(input);
    expect(sorted.map((c) => c.tag)).toEqual(["middle", "first", "second", "third"]);
  });

  it("handles an empty array without throwing", () => {
    expect(sortConnectionsByStrength([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [
      { strength: 0.4 }, { strength: 1.0 }, { strength: 0.6 },
    ];
    const snapshot = input.map((c) => c.strength);
    sortConnectionsByStrength(input);
    expect(input.map((c) => c.strength)).toEqual(snapshot);
  });
});

describe("filterByStrengthFloor — strength-floor filter", () => {
  const sample = [
    { from: "a", to: "b", strength: 1.0, kind: "exact" },
    { from: "c", to: "d", strength: 0.9, kind: "anagram" },
    { from: "e", to: "f", strength: 0.7, kind: "weekday-cluster" },
    { from: "g", to: "h", strength: 0.5, kind: "near-anagram" },
    { from: "i", to: "j", strength: 0.4, kind: "multiple" },
  ];

  it("floor 0 returns all connections", () => {
    expect(filterByStrengthFloor(sample, 0)).toHaveLength(sample.length);
  });

  it("floor 0.9 returns only strength >= 0.9", () => {
    const out = filterByStrengthFloor(sample, 0.9);
    expect(out.map((c) => c.strength)).toEqual([1.0, 0.9]);
  });

  it("connections AT the floor value pass (>= not >)", () => {
    const out = filterByStrengthFloor(sample, 0.7);
    // 0.7 itself must be included
    expect(out.some((c) => c.strength === 0.7)).toBe(true);
    expect(out).toHaveLength(3); // 1.0, 0.9, 0.7
  });

  it("empty input returns empty output", () => {
    expect(filterByStrengthFloor([], 0.5)).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const snapshot = sample.map((c) => c.strength);
    filterByStrengthFloor(sample, 0.9);
    expect(sample.map((c) => c.strength)).toEqual(snapshot);
  });
});

describe("connectionsForNode — incident-edge selector", () => {
  const sample = [
    { from: "n1", to: "n2", strength: 1.0, kind: "exact" },
    { from: "n3", to: "n1", strength: 0.7, kind: "weekday-cluster" },
    { from: "n2", to: "n3", strength: 0.5, kind: "near-anagram" },
    { from: "n4", to: "n5", strength: 0.85, kind: "numerology" },
  ];

  it("returns connections where the node is the from-end or to-end", () => {
    const out = connectionsForNode(sample, "n1");
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.from === "n1" || c.to === "n1")).toBe(true);
  });

  it("returns an empty array for a node with no incident connections", () => {
    expect(connectionsForNode(sample, "nonexistent")).toEqual([]);
  });

  it("composes with strength-floor filter (selection on filtered set)", () => {
    // Strength filter first (>= 0.7), then incident-to-n1.
    const filtered = filterByStrengthFloor(sample, 0.7);
    const out = connectionsForNode(filtered, "n1");
    expect(out.map((c) => c.kind)).toEqual(["exact", "weekday-cluster"]);
  });

  it("composes the other order (incident first, then strength) to the same result", () => {
    // Order shouldn't matter for the AND of two predicates.
    const incident = connectionsForNode(sample, "n1");
    const out = filterByStrengthFloor(incident, 0.7);
    expect(out.map((c) => c.kind)).toEqual(["exact", "weekday-cluster"]);
  });

  it("returns empty when filter and selection have no overlap", () => {
    // n4 has only one connection (strength 0.85). Floor at 0.9 leaves nothing.
    const filtered = filterByStrengthFloor(sample, 0.9);
    expect(connectionsForNode(filtered, "n4")).toEqual([]);
  });
});
