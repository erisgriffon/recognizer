import { haversineKm, isLeyLine } from "./geo.js";
import { anagramSignature, multisetEditDistance } from "./numerology.js";
import {
  ZODIAC_ELEMENTS, ZODIAC_MODALITIES, zodiacCompatible,
  modalityCompatible, sharedRuler, aspectBetween, isMercuryRetrograde,
} from "./astrology.js";
import {
  phoneticCodes, isPartialAnagram, trigramSimilarity, naiveStem,
  normalizeHomoglyphs, hasHomoglyphs, isReverse,
} from "./lexical.js";
import { parseDate } from "./dates.js";
import { colorDistance } from "./extractors/image.js";
import { STRENGTH, TIERS, NUMERIC_THRESHOLDS } from "./connections.config.js";

// Settings object lets us toggle "soft" categories without re-running expensive
// computation — categories are filtered after detection.

export const findConnections = (nodes, settings = {}) => {
  const {
    numerologyDepth = 1,
    lexicalDepth = 1,
    astrologyDepth = 1,
    enableLeyLines = true,
  } = settings;

  const connections = [];
  const numericFacts = [];

  nodes.forEach((node) => {
    Object.entries(node.numbers || {}).forEach(([label, value]) => {
      numericFacts.push({ nodeId: node.id, nodeName: node.name, label, value });
    });
  });

  // ---- Numeric matches across nodes ----
  // Floors are tuned to suppress small-integer noise. Single-digit and very
  // small numbers collide constantly across unrelated facts (months, days,
  // counts of children, etc.) and produce uninteresting "matches". Real
  // patterns live at higher numbers — years, distances, character counts.
  // Year facts get reduced-strength near matching and only tight 2×/3× multiples
  // (since adjacent years are common but historical adjacencies are still
  // worth noting at lower confidence).
  const isYearFact = (f) => /year|founded|birth|death|published/i.test(f.label);
  for (let i = 0; i < numericFacts.length; i++) {
    for (let j = i + 1; j < numericFacts.length; j++) {
      const a = numericFacts[i], b = numericFacts[j];
      if (a.nodeId === b.nodeId) continue;
      const yearLike = isYearFact(a) || isYearFact(b);
      if (a.value === b.value && a.value > NUMERIC_THRESHOLDS.EXACT_MIN) {
        connections.push({ from: a.nodeId, to: b.nodeId, strength: STRENGTH.EXACT, kind: "exact", a, b });
      } else if (
        a.value > NUMERIC_THRESHOLDS.NEAR_MIN &&
        b.value > NUMERIC_THRESHOLDS.NEAR_MIN &&
        Math.abs(a.value - b.value) <= NUMERIC_THRESHOLDS.NEAR_DELTA
      ) {
        // Years still match, but at reduced strength — historical adjacency
        // is interesting but less surprising than coincidence between unrelated facts.
        const strength = yearLike ? STRENGTH.NEAR_YEAR : STRENGTH.NEAR;
        connections.push({ from: a.nodeId, to: b.nodeId, strength, kind: "near", a, b });
      } else if (
        a.value > NUMERIC_THRESHOLDS.MULTIPLE_MIN_BOTH &&
        b.value > NUMERIC_THRESHOLDS.MULTIPLE_MIN_BOTH &&
        a.value !== b.value &&
        (a.value % b.value === 0 || b.value % a.value === 0)
      ) {
        const big = Math.max(a.value, b.value), small = Math.min(a.value, b.value);
        const multiplier = big / small;
        // For year-related multiples, only allow the cleanest cases: exactly
        // 2× or 3×. For other facts, any multiplier up to 12× passes.
        const maxMult = yearLike ? NUMERIC_THRESHOLDS.MULTIPLE_MAX_YEAR : NUMERIC_THRESHOLDS.MULTIPLE_MAX;
        if (multiplier > maxMult || small < NUMERIC_THRESHOLDS.MULTIPLE_MIN_SMALL) continue;
        if (yearLike && multiplier !== 2 && multiplier !== 3) continue;
        connections.push({
          from: a.nodeId, to: b.nodeId, strength: STRENGTH.MULTIPLE, kind: "multiple",
          a, b, multiplier,
        });
      }
    }
  }

  // ---- Numerology ----
  // Depth tiers: 0 = off, 1 = Pythagorean only, 2 = + Chaldean (with double-match
  // collapse), 3 = + per-fact deep reduction. Default is 1 (Surface) — same
  // behavior as the old enableNumerology=true.

  if (numerologyDepth >= 1) {
    const pythFacts = nodes
      .filter((n) => n.numerology?.pythagorean)
      .map((n) => ({ nodeId: n.id, nodeName: n.name, ...n.numerology.pythagorean }));
    for (let i = 0; i < pythFacts.length; i++) {
      for (let j = i + 1; j < pythFacts.length; j++) {
        const a = pythFacts[i], b = pythFacts[j];
        if (a.reduced === b.reduced) {
          connections.push({
            from: a.nodeId, to: b.nodeId, strength: STRENGTH.NUMEROLOGY, kind: "numerology",
            a: { ...a, label: "numerological value" },
            b: { ...b, label: "numerological value" },
            value: a.reduced,
          });
        }
      }
    }
  }

  if (numerologyDepth >= 2) {
    // Chaldean uses a different letter table (1–8, 9 reserved), so it produces
    // an independent value per node. When a pair already matches on Pythagorean
    // *and* matches on Chaldean, collapse the two findings into a single
    // higher-strength "numerology-double" — two ancient systems agreeing is
    // funnier and more striking than two separate notes.
    const chaldeanFacts = nodes
      .filter((n) => n.numerology?.chaldean)
      .map((n) => ({ nodeId: n.id, nodeName: n.name, ...n.numerology.chaldean }));
    for (let i = 0; i < chaldeanFacts.length; i++) {
      for (let j = i + 1; j < chaldeanFacts.length; j++) {
        const a = chaldeanFacts[i], b = chaldeanFacts[j];
        if (a.reduced !== b.reduced) continue;
        const existingPyth = connections.find((c) =>
          c.kind === "numerology" &&
          ((c.from === a.nodeId && c.to === b.nodeId) ||
           (c.from === b.nodeId && c.to === a.nodeId))
        );
        if (existingPyth) {
          existingPyth.kind = "numerology-double";
          existingPyth.strength = STRENGTH.NUMEROLOGY_DOUBLE;
          existingPyth.chaldeanValue = a.reduced;
          existingPyth.chaldean = { a, b };
        } else {
          connections.push({
            from: a.nodeId, to: b.nodeId,
            strength: STRENGTH.NUMEROLOGY_CHALDEAN, kind: "numerology-chaldean",
            a: { ...a, label: "Chaldean numerology" },
            b: { ...b, label: "Chaldean numerology" },
            value: a.reduced,
          });
        }
      }
    }
  }

  if (numerologyDepth >= 3) {
    // Reduce every numeric fact on every node to a single digit (NOT preserving
    // master numbers — every value collapses all the way down). Match on shared
    // reduced digits across nodes. Volume is the point: this is the unhinged tier.
    const deepReduce = (n) => {
      while (n > 9) n = String(n).split("").reduce((s, d) => s + parseInt(d, 10), 0);
      return n;
    };
    const deepFacts = [];
    for (const n of nodes) {
      for (const [label, value] of Object.entries(n.numbers || {})) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        deepFacts.push({
          nodeId: n.id, nodeName: n.name,
          factLabel: label, originalValue: value,
          reduced: deepReduce(Math.floor(value)),
        });
      }
    }
    for (let i = 0; i < deepFacts.length; i++) {
      for (let j = i + 1; j < deepFacts.length; j++) {
        const a = deepFacts[i], b = deepFacts[j];
        if (a.nodeId === b.nodeId) continue;
        if (a.reduced !== b.reduced) continue;
        connections.push({
          from: a.nodeId, to: b.nodeId,
          strength: STRENGTH.NUMEROLOGY_DEEP, kind: "numerology-deep",
          a: { nodeName: a.nodeName, factLabel: a.factLabel, originalValue: a.originalValue, reduced: a.reduced },
          b: { nodeName: b.nodeName, factLabel: b.factLabel, originalValue: b.originalValue, reduced: b.reduced },
          value: a.reduced,
        });
      }
    }
  }

  // ---- Lexical ----
  // Depth tiers: 0 = off, 1 = Surface (anagrams + word-overlap + letter-freq),
  // 2 = + phonetic + partial-anagram + trigram, 3 = + stem + homoglyph + reverse.
  // Default is 1 — same coverage as the old enableAnagrams=true plus the
  // (always-on) word-overlap and stylometric blocks. Off truly means off.

  // textNodes is reused below by other blocks (wordcount-year), so it must
  // exist regardless of lexicalDepth.
  const textNodes = nodes.filter((n) => n.type === "text" && n.tokens);

  if (lexicalDepth >= 1) {
    // Anagrams (and near-anagrams) over name and location nodes.
    const anagramables = nodes.filter((n) => ["name", "location"].includes(n.type) && n.name);
    for (let i = 0; i < anagramables.length; i++) {
      for (let j = i + 1; j < anagramables.length; j++) {
        const a = anagramables[i], b = anagramables[j];
        const sigA = anagramSignature(a.name), sigB = anagramSignature(b.name);
        if (sigA.length < 4 || sigB.length < 4) continue;
        if (sigA === sigB) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.ANAGRAM, kind: "anagram",
            a: { nodeName: a.name }, b: { nodeName: b.name },
          });
        } else if (Math.abs(sigA.length - sigB.length) <= 2) {
          const dist = multisetEditDistance(sigA, sigB);
          if (dist <= 2 && Math.min(sigA.length, sigB.length) >= 5) {
            connections.push({
              from: a.id, to: b.id, strength: STRENGTH.NEAR_ANAGRAM, kind: "near-anagram",
              a: { nodeName: a.name }, b: { nodeName: b.name },
              distance: dist,
            });
          }
        }
      }
    }

    // Word overlap across text nodes — shared rare words (length > 4).
    for (let i = 0; i < textNodes.length; i++) {
      for (let j = i + 1; j < textNodes.length; j++) {
        const a = textNodes[i], b = textNodes[j];
        const overlap = a.tokens.filter((t) => b.tokens.includes(t) && t.length > 4);
        if (overlap.length > 0) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.WORD_OVERLAP, kind: "word-overlap",
            a: { nodeName: a.name }, b: { nodeName: b.name },
            words: overlap.slice(0, 3),
          });
        }
      }
    }

    // Letter-frequency cosine similarity (stylometric).
    const lfNodes = nodes.filter((n) => n.letterFreq);
    for (let i = 0; i < lfNodes.length; i++) {
      for (let j = i + 1; j < lfNodes.length; j++) {
        const a = lfNodes[i], b = lfNodes[j];
        let dot = 0, magA = 0, magB = 0;
        for (const ch of "abcdefghijklmnopqrstuvwxyz") {
          const x = a.letterFreq[ch], y = b.letterFreq[ch];
          dot += x * y; magA += x * x; magB += y * y;
        }
        const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
        if (sim > 0.985) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.STYLOMETRIC, kind: "stylometric",
            a: { nodeName: a.name }, b: { nodeName: b.name },
            similarity: sim,
          });
        }
      }
    }
  }

  if (lexicalDepth >= 2) {
    // Phonetic match: any shared Metaphone code across name and location nodes.
    // Multi-token names (e.g. "Smith Robert") match if any one of their codes
    // matches any one of the partner's — a deliberately loose comparison.
    const phoneticables = nodes.filter((n) => ["name", "location"].includes(n.type) && n.name);
    const codes = phoneticables.map((n) => ({ node: n, codes: phoneticCodes(n.name) }));
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const a = codes[i], b = codes[j];
        const shared = a.codes.find((c) => c.length >= 3 && b.codes.includes(c));
        if (!shared) continue;
        // Skip if these two are already an exact anagram match — same letters
        // tend to produce the same Metaphone, and the anagram finding is
        // stronger and more interesting.
        if (anagramSignature(a.node.name) === anagramSignature(b.node.name)) continue;
        connections.push({
          from: a.node.id, to: b.node.id,
          strength: STRENGTH.LEXICAL_PHONETIC, kind: "phonetic-match",
          a: { nodeName: a.node.name }, b: { nodeName: b.node.name },
          code: shared,
        });
      }
    }

    // Partial anagram — one name's letters are a subset of the other's.
    // Skip pairs that already match as full anagrams (caught in Surface).
    for (let i = 0; i < phoneticables.length; i++) {
      for (let j = i + 1; j < phoneticables.length; j++) {
        const a = phoneticables[i], b = phoneticables[j];
        if (anagramSignature(a.name) === anagramSignature(b.name)) continue;
        if (!isPartialAnagram(a.name, b.name)) continue;
        // Caller-friendly ordering: smaller name first, larger second.
        const [small, large] = a.name.length <= b.name.length ? [a, b] : [b, a];
        connections.push({
          from: small.id, to: large.id,
          strength: STRENGTH.LEXICAL_PARTIAL_ANAGRAM, kind: "partial-anagram",
          a: { nodeName: small.name }, b: { nodeName: large.name },
        });
      }
    }

    // Trigram similarity across text-pair fragments. Threshold 0.4 — high
    // enough to skip pure-noise overlaps, low enough to surface fuzzy matches.
    for (let i = 0; i < textNodes.length; i++) {
      for (let j = i + 1; j < textNodes.length; j++) {
        const a = textNodes[i], b = textNodes[j];
        const score = trigramSimilarity(a.rawText || a.name, b.rawText || b.name);
        if (score >= 0.4) {
          connections.push({
            from: a.id, to: b.id,
            strength: STRENGTH.LEXICAL_TRIGRAM, kind: "trigram-similarity",
            a: { nodeName: a.name }, b: { nodeName: b.name },
            score,
          });
        }
      }
    }
  }

  if (lexicalDepth >= 3) {
    // Stem match across text nodes. Two text fragments match if they share
    // any word stem of length >= 4 (avoids "the" → "the" noise).
    for (let i = 0; i < textNodes.length; i++) {
      for (let j = i + 1; j < textNodes.length; j++) {
        const a = textNodes[i], b = textNodes[j];
        const stemsA = new Set((a.tokens || []).map(naiveStem).filter((s) => s.length >= 4));
        const stemsB = new Set((b.tokens || []).map(naiveStem).filter((s) => s.length >= 4));
        // Find shared stems that don't already share the raw word (caught
        // by Surface word-overlap).
        const sharedWords = new Set((a.tokens || []).filter((t) => (b.tokens || []).includes(t)));
        let foundStem = null;
        for (const s of stemsA) {
          if (stemsB.has(s) && !sharedWords.has(s)) { foundStem = s; break; }
        }
        if (foundStem) {
          connections.push({
            from: a.id, to: b.id,
            strength: STRENGTH.LEXICAL_STEM, kind: "stem-match",
            a: { nodeName: a.name }, b: { nodeName: b.name },
            stem: foundStem,
          });
        }
      }
    }

    // Homoglyph and reverse-spelling — over name and location nodes.
    const lexicalNodes = nodes.filter((n) => ["name", "location"].includes(n.type) && n.name);
    for (let i = 0; i < lexicalNodes.length; i++) {
      for (let j = i + 1; j < lexicalNodes.length; j++) {
        const a = lexicalNodes[i], b = lexicalNodes[j];
        // Homoglyph: only fires when one of the names has lookalikes AND
        // its normalized form exactly matches the other.
        const aHas = hasHomoglyphs(a.name), bHas = hasHomoglyphs(b.name);
        if (aHas || bHas) {
          if (normalizeHomoglyphs(a.name).toLowerCase() === normalizeHomoglyphs(b.name).toLowerCase()
              && a.name !== b.name) {
            connections.push({
              from: a.id, to: b.id,
              strength: STRENGTH.LEXICAL_HOMOGLYPH, kind: "homoglyph-match",
              a: { nodeName: a.name }, b: { nodeName: b.name },
            });
          }
        }
        if (isReverse(a.name, b.name)) {
          connections.push({
            from: a.id, to: b.id,
            strength: STRENGTH.LEXICAL_REVERSE, kind: "reverse-spell",
            a: { nodeName: a.name }, b: { nodeName: b.name },
          });
        }
      }
    }
  }

  // ---- Word count = some date year ----
  textNodes.forEach((textNode) => {
    const wc = textNode.numbers?.["word count"];
    if (!wc || wc < 1500 || wc > 2100) return;
    nodes.forEach((other) => {
      if (other.id === textNode.id) return;
      Object.entries(other.numbers || {}).forEach(([label, value]) => {
        if (value === wc && /year|founded|birth|death/i.test(label)) {
          connections.push({
            from: textNode.id, to: other.id, strength: STRENGTH.WORDCOUNT_YEAR, kind: "wordcount-year",
            a: { nodeName: textNode.name, value: wc },
            b: { nodeName: other.name, label, value },
          });
        }
      });
    });
  });

  // ---- Day-of-week alignment (3+ dates same weekday) ----
  const dateLikeNodes = nodes.filter((n) => n.dayOfWeek);
  const byDow = {};
  dateLikeNodes.forEach((n) => {
    byDow[n.dayOfWeek] = byDow[n.dayOfWeek] || [];
    byDow[n.dayOfWeek].push(n);
  });
  Object.entries(byDow).forEach(([dow, group]) => {
    if (group.length >= 3) {
      // Connect them all pairwise as a "weekday cluster"
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          connections.push({
            from: group[i].id, to: group[j].id, strength: STRENGTH.WEEKDAY_CLUSTER, kind: "weekday-cluster",
            a: { nodeName: group[i].name }, b: { nodeName: group[j].name },
            dayOfWeek: dow, count: group.length,
          });
        }
      }
    }
  });

  // ---- Astrology ----
  // Depth tiers: 0 = off, 1 = elements only (Surface), 2 = + modality + ruler
  // (Standard), 3 = + aspects + Mercury retrograde (Deep). Default is 1
  // (Surface) — same behavior as the old enableAstrology=true. Unlike
  // numerology's Pythagorean/Chaldean double-match collapse, astrology's
  // layers stack rather than merge: two signs sharing element AND modality
  // AND ruler emit three separate findings, which is exactly what the
  // investigator would do — list them individually as a way of piling on.

  if (astrologyDepth >= 1) {
    const zodiacNodes = nodes.filter((n) => n.zodiac);
    for (let i = 0; i < zodiacNodes.length; i++) {
      for (let j = i + 1; j < zodiacNodes.length; j++) {
        const a = zodiacNodes[i], b = zodiacNodes[j];
        if (zodiacCompatible(a.zodiac, b.zodiac)) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.ASTROLOGY, kind: "astrology",
            a: { nodeName: a.name, zodiac: a.zodiac },
            b: { nodeName: b.name, zodiac: b.zodiac },
            element: ZODIAC_ELEMENTS[a.zodiac],
          });
        }
      }
    }
  }

  if (astrologyDepth >= 2) {
    const zodiacNodes = nodes.filter((n) => n.zodiac);
    for (let i = 0; i < zodiacNodes.length; i++) {
      for (let j = i + 1; j < zodiacNodes.length; j++) {
        const a = zodiacNodes[i], b = zodiacNodes[j];
        if (modalityCompatible(a.zodiac, b.zodiac)) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.ASTROLOGY_MODALITY,
            kind: "astrology-modality",
            a: { nodeName: a.name, zodiac: a.zodiac },
            b: { nodeName: b.name, zodiac: b.zodiac },
            modality: ZODIAC_MODALITIES[a.zodiac],
          });
        }
        const planet = sharedRuler(a.zodiac, b.zodiac);
        if (planet) {
          connections.push({
            from: a.id, to: b.id, strength: STRENGTH.ASTROLOGY_RULER,
            kind: "astrology-ruler",
            a: { nodeName: a.name, zodiac: a.zodiac },
            b: { nodeName: b.name, zodiac: b.zodiac },
            planet,
          });
        }
      }
    }
  }

  if (astrologyDepth >= 3) {
    // Aspects: pairwise, includes same-sign (conjunction). Per-aspect strength
    // lives in connections.config.js — keyed by uppercased aspect name.
    const zodiacNodes = nodes.filter((n) => n.zodiac);
    for (let i = 0; i < zodiacNodes.length; i++) {
      for (let j = i + 1; j < zodiacNodes.length; j++) {
        const a = zodiacNodes[i], b = zodiacNodes[j];
        const aspect = aspectBetween(a.zodiac, b.zodiac);
        if (!aspect) continue;
        const key = `ASTROLOGY_ASPECT_${aspect.name.toUpperCase()}`;
        connections.push({
          from: a.id, to: b.id, strength: STRENGTH[key],
          kind: "astrology-aspect",
          a: { nodeName: a.name, zodiac: a.zodiac },
          b: { nodeName: b.name, zodiac: b.zodiac },
          aspect,
        });
      }
    }

    // Mercury retrograde: pairwise across any two date-bearing nodes whose
    // dates both fall in retrograde windows. Date sources: explicit date
    // nodes carry isoDate; today nodes carry isoDate; name nodes carry
    // birthDate (from Wikidata extraction). The engine treats either as
    // the date-of-record for retrograde purposes.
    const dateBearingNodes = nodes
      .map((n) => ({ node: n, iso: n.isoDate || n.birthDate || null }))
      .filter((x) => x.iso)
      .map((x) => ({ node: x.node, iso: x.iso, retrograde: isMercuryRetrograde(parseDate(x.iso)) }))
      .filter((x) => x.retrograde);
    for (let i = 0; i < dateBearingNodes.length; i++) {
      for (let j = i + 1; j < dateBearingNodes.length; j++) {
        const a = dateBearingNodes[i], b = dateBearingNodes[j];
        connections.push({
          from: a.node.id, to: b.node.id, strength: STRENGTH.ASTROLOGY_RETROGRADE,
          kind: "astrology-retrograde",
          a: { nodeName: a.node.name, isoDate: a.iso, retrogradeRange: `${a.retrograde.start}–${a.retrograde.end}` },
          b: { nodeName: b.node.name, isoDate: b.iso, retrogradeRange: `${b.retrograde.start}–${b.retrograde.end}` },
        });
      }
    }
  }

  // ---- Name mentions ----
  nodes.forEach((nameNode) => {
    if (nameNode.type !== "name") return;
    const firstName = nameNode.name.split(" ")[0].toLowerCase();
    nodes.forEach((other) => {
      if (other.id === nameNode.id) return;
      if (other.type === "text" && other.rawText) {
        if (other.rawText.toLowerCase().includes(firstName)) {
          connections.push({
            from: nameNode.id, to: other.id, strength: STRENGTH.NAME_MENTION, kind: "name-mention",
            a: { nodeName: nameNode.name }, b: { nodeName: other.name },
            mention: firstName,
          });
        }
      }
      if (other.type === "audio" && (other.rawFilename || "").toLowerCase().includes(firstName)) {
        connections.push({
          from: nameNode.id, to: other.id, strength: STRENGTH.NAME_IN_FILENAME, kind: "name-in-filename",
          a: { nodeName: nameNode.name }, b: { nodeName: other.name },
          mention: firstName,
        });
      }
      if (other.type === "today" && other.events) {
        for (const ev of other.events) {
          const inText = ev.text.toLowerCase().includes(nameNode.name.toLowerCase());
          const inPages = ev.names.some((p) => p.toLowerCase() === nameNode.name.toLowerCase());
          if (inText || inPages) {
            connections.push({
              from: nameNode.id, to: other.id, strength: STRENGTH.TODAY_MENTION, kind: "today-mention",
              a: { nodeName: nameNode.name }, b: { nodeName: other.name },
              event: ev,
            });
            break;
          }
        }
      }
    });
  });

  // ---- Color matching across image / audio nodes ----
  const colorNodes = nodes.filter((n) => n.colors && n.colors.length > 0);
  for (let i = 0; i < colorNodes.length; i++) {
    for (let j = i + 1; j < colorNodes.length; j++) {
      const a = colorNodes[i], b = colorNodes[j];
      // Find closest color pair
      let bestPair = null, bestDist = Infinity;
      for (const ca of a.colors) for (const cb of b.colors) {
        const d = colorDistance(ca.rgb, cb.rgb);
        if (d < bestDist) { bestDist = d; bestPair = { ca, cb }; }
      }
      if (bestDist < 30) { // very close colors
        connections.push({
          from: a.id, to: b.id, strength: STRENGTH.COLOR_MATCH, kind: "color-match",
          a: { nodeName: a.name, hex: bestPair.ca.hex },
          b: { nodeName: b.name, hex: bestPair.cb.hex },
          distance: Math.round(bestDist),
        });
      }
    }
  }

  // ---- Location distance + ley lines ----
  const locationNodes = nodes.filter((n) => n.type === "location" && n.lat !== undefined);
  for (let i = 0; i < locationNodes.length; i++) {
    for (let j = i + 1; j < locationNodes.length; j++) {
      const a = locationNodes[i], b = locationNodes[j];
      const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
      // Distance collisions with other numeric facts
      numericFacts.forEach((f) => {
        if (f.nodeId === a.id || f.nodeId === b.id) return;
        if (f.value === km && km > 1) {
          connections.push({
            from: a.id, to: f.nodeId, strength: STRENGTH.DISTANCE_MATCH, kind: "distance-match",
            a: { nodeName: a.name, label: `distance to ${b.name} (km)`, value: km },
            b: f, otherLocation: b.name,
          });
        }
      });
      connections.push({
        from: a.id, to: b.id, strength: STRENGTH.DISTANCE, kind: "distance",
        a: { nodeName: a.name }, b: { nodeName: b.name },
        km,
      });
    }
  }

  // Ley lines (3+ collinear locations)
  if (enableLeyLines && locationNodes.length >= 3) {
    for (let i = 0; i < locationNodes.length; i++) {
      for (let j = i + 1; j < locationNodes.length; j++) {
        for (let k = j + 1; k < locationNodes.length; k++) {
          const p1 = locationNodes[i], p2 = locationNodes[j], p3 = locationNodes[k];
          if (isLeyLine(p1, p2, p3, 0.5)) {
            // Add as a triangle of connections
            [[p1, p2], [p2, p3], [p1, p3]].forEach(([x, y]) => {
              connections.push({
                from: x.id, to: y.id, strength: STRENGTH.LEY_LINE, kind: "ley-line",
                a: { nodeName: x.name }, b: { nodeName: y.name },
                triangle: [p1.name, p2.name, p3.name],
              });
            });
          }
        }
      }
    }
  }

  // Dedupe
  const seen = new Set();
  return connections.filter((c) => {
    const key = [c.from, c.to].sort().join("→") + "|" + c.kind + "|" + (c.a?.label || "") + (c.b?.label || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Named strength tiers, replacing the misleading "CONFIDENCE %" label.
// Strength describes the match itself (how rare / specific), NOT our certainty
// that the match means something — which we explicitly never claim.
export const strengthTier = (s) => {
  for (const t of TIERS) if (s >= t.min) return t.name;
  return TIERS[TIERS.length - 1].name;
};

// Presentation helpers. The engine itself stays pure — ordering and filtering
// are display concerns, kept here so both the React layer and tests share one
// implementation. Array.prototype.sort is stable in current engines, so equal-
// strength findings preserve insertion order.
export const sortConnectionsByStrength = (connections) =>
  [...connections].sort((a, b) => b.strength - a.strength);

// Filter findings to those at or above a strength floor. Operates on the
// strength field only — kind-agnostic so future connection categories
// (astrology depth, etc.) participate without changes here.
export const filterByStrengthFloor = (connections, floor) =>
  connections.filter((c) => c.strength >= floor);

// Connections incident to a given node. Operates on from/to only — kind-
// agnostic, so it works with any future connection category.
export const connectionsForNode = (connections, nodeId) =>
  connections.filter((c) => c.from === nodeId || c.to === nodeId);
