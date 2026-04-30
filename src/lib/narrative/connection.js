import { pick, written } from "../utils.js";

export const OPENERS = [
  "Note that", "Of particular interest:", "It cannot be coincidence that",
  "The pattern emerges:", "Records indicate that", "The investigator has determined that",
  "It bears mentioning that", "One observes that", "Curiously,",
];

export const CLOSERS_MILD = [
  "This warrants further inquiry.", "Make of this what you will.",
  "We let the reader draw their own conclusions.", "The implications are left as an exercise.",
  "This is logged for the record.", "We note this without comment.",
];

export const CLOSERS_HEATED = [
  "The implications are obvious.", "At what point does this cease to be coincidence?",
  "Surely this cannot be dismissed.", "The pattern is, by now, undeniable.",
  "[REDACTED] would not approve of this finding being made public.",
  "The investigator's hands are, at this point, trembling.",
  "We refuse to be the ones to say it aloud.",
];

export const closerFor = (totalConnections, seed) => {
  const pool = totalConnections >= 8
    ? [...CLOSERS_MILD, ...CLOSERS_HEATED, ...CLOSERS_HEATED]
    : CLOSERS_MILD;
  return pick(pool, seed);
};

export const rephrasers = {
  exact: (c) => pick([
    `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) is identical to the ${c.b.label} of ${c.b.nodeName}`,
    `${c.a.nodeName} and ${c.b.nodeName} share an exact numeric match — both register ${c.a.value}, the former as ${c.a.label}, the latter as ${c.b.label}`,
    `the value ${c.a.value} appears in two unrelated places: as ${c.a.label} of ${c.a.nodeName}, and as ${c.b.label} of ${c.b.nodeName}`,
  ], c.a.value + c.b.value),
  near: (c) => {
    const diff = Math.abs(c.a.value - c.b.value);
    return pick([
      `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) and the ${c.b.label} of ${c.b.nodeName} (${c.b.value}) differ by only ${diff}`,
      `${c.a.nodeName}'s ${c.a.label} stands at ${c.a.value}; ${c.b.nodeName}'s ${c.b.label} stands at ${c.b.value} — a discrepancy of just ${written(diff)}`,
    ], c.a.value + c.b.value);
  },
  multiple: (c) => `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) and the ${c.b.label} of ${c.b.nodeName} (${c.b.value}) are related by a clean integer multiple of ${c.multiplier}× — an arithmetic relationship which the casual observer would surely overlook`,
  numerology: (c) => {
    // Show our work: input string -> digit sum -> reduced single digit.
    // Truncate the visible source for readability; the method is what matters.
    const showSrc = (s) => {
      if (!s) return "?";
      const up = s.toUpperCase();
      return up.length > 16 ? up.slice(0, 14) + "…" : up;
    };
    const aDeriv = `${showSrc(c.a.source)} → digital sum ${c.a.sum} → reduced to ${c.value}`;
    const bDeriv = `${showSrc(c.b.source)} → digital sum ${c.b.sum} → reduced to ${c.value}`;
    return pick([
      `${c.a.nodeName}, reduced numerologically (Pythagorean: A=1, B=2, …, I=9, J=1 …), yields ${c.value} (${aDeriv}); ${c.b.nodeName}, reduced by the same Pythagorean method, yields the identical ${c.value} (${bDeriv})`,
      `the Pythagorean numerological signatures of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value} — derived as ${aDeriv}, and ${bDeriv}, respectively. A result the ancients would not have considered accidental`,
    ], c.value * 7);
  },
  "numerology-chaldean": (c) => {
    const showSrc = (s) => {
      if (!s) return "?";
      const up = s.toUpperCase();
      return up.length > 16 ? up.slice(0, 14) + "…" : up;
    };
    const aDeriv = `${showSrc(c.a.source)} → ${c.a.sum} → ${c.value}`;
    const bDeriv = `${showSrc(c.b.source)} → ${c.b.sum} → ${c.value}`;
    return pick([
      `under Chaldean reduction (a system the ancient Babylonians considered more accurate than Pythagorean — assigning letters to digits 1 through 8, with 9 held in reserve), ${c.a.nodeName} and ${c.b.nodeName} both yield ${c.value} (${aDeriv}, and ${bDeriv} respectively)`,
      `the Chaldean numerological values of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value}. The reader should note that Chaldean uses a different letter-to-digit table than the more common Pythagorean system, so this is a separate finding — derived as ${aDeriv}, and ${bDeriv}`,
    ], c.value * 11);
  },
  "numerology-double": (c) =>
    `${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value} under BOTH Pythagorean AND Chaldean numerological reduction — two distinct ancient systems, with different letter values, agreeing on the same digit. The investigator submits this without further commentary`,
  "numerology-deep": (c) =>
    `the ${c.a.factLabel} of ${c.a.nodeName} (${c.a.originalValue}) and the ${c.b.factLabel} of ${c.b.nodeName} (${c.b.originalValue}) both reduce, by repeated digital summation, to ${c.value}. The investigator notes this with appropriate epistemic humility`,
  "word-overlap": (c) => `${c.a.nodeName} and ${c.b.nodeName} share unusual vocabulary, including ${c.words.map((w) => `"${w}"`).join(", ")} — words which, statistically, ought not to co-occur in unrelated documents`,
  stylometric: (c) => `the letter-frequency distributions of ${c.a.nodeName} and ${c.b.nodeName} exhibit a cosine similarity of ${(c.similarity * 100).toFixed(1)}%, a value used in stylometric authorship analysis. Identical authorship cannot be ruled out`,
  "wordcount-year": (c) => `the word count of ${c.a.nodeName} (${c.a.value}) is precisely equal to the ${c.b.label} of ${c.b.nodeName}. The investigator notes that documents of arbitrary length do not, as a rule, terminate on dates of historical significance`,
  "weekday-cluster": (c) => `${c.count} dates of record fall on a ${c.dayOfWeek}. The recurrence of ${c.dayOfWeek} across unrelated entries is, statistically, improbable`,
  astrology: (c) => `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) share the elemental affinity of ${c.element}. The ancients held such pairings to be no accident`,
  "astrology-modality": (c) => {
    const seed = (c.a.zodiac.length + c.b.zodiac.length) * (c.modality.length + 1);
    return pick([
      `${c.a.nodeName} (${c.a.zodiac}, ${c.modality}) and ${c.b.nodeName} (${c.b.zodiac}, ${c.modality}) share the ${c.modality} modality — a quality the ancients believed governed temperament and disposition`,
      `the ${c.modality} modality unites ${c.a.zodiac} and ${c.b.zodiac}, and therefore unites ${c.a.nodeName} and ${c.b.nodeName}. The reader will note that ${c.modality} signs are traditionally associated with shared psychological tendencies`,
    ], seed);
  },
  "astrology-ruler": (c) => {
    const seed = (c.a.zodiac.length + c.b.zodiac.length) * (c.planet.length + 3);
    return pick([
      `both ${c.a.zodiac} and ${c.b.zodiac} fall under the rulership of ${c.planet}. ${c.a.nodeName} and ${c.b.nodeName} are therefore, in the traditional reckoning, governed by the same celestial body`,
      `${c.planet} rules both ${c.a.zodiac} (in ${c.a.nodeName}) and ${c.b.zodiac} (in ${c.b.nodeName}) — a planetary correspondence the investigator finds striking`,
    ], seed);
  },
  "astrology-aspect": (c) => {
    const angleDescriptions = {
      conjunction: "occupying the same sign, the most intimate of astrological relationships",
      sextile: "separated by sixty degrees, a harmonious sextile",
      square: "in square — ninety degrees apart, a tension the ancients regarded with caution",
      trine: "in trine — one hundred and twenty degrees apart, the most auspicious of aspects",
      opposition: "in direct opposition — one hundred and eighty degrees apart, a polarity the ancients considered the most fated",
    };
    const desc = angleDescriptions[c.aspect.name] || `in ${c.aspect.label}`;
    return `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) stand ${desc}. The investigator does not endorse traditional astrological interpretation, but acknowledges the geometric relationship`;
  },
  "astrology-retrograde": (c) => {
    const seed = (c.a.isoDate?.length || 0) + (c.b.isoDate?.length || 0) + 13;
    return pick([
      `${c.a.nodeName} and ${c.b.nodeName} both fall within periods of Mercury retrograde — traditionally regarded as the most inauspicious astronomical condition for communication, contracts, and travel. That two of the user's submitted dates align with such periods is, the investigator notes, statistically unsurprising but rhetorically convenient`,
      `Mercury was in retrograde during both ${c.a.nodeName} (${c.a.retrogradeRange}) and ${c.b.nodeName} (${c.b.retrogradeRange}). Make of this what you will`,
    ], seed);
  },
  "name-mention": (c) => `the text fragment ${c.b.nodeName} contains explicit reference to "${c.mention}" — the same name attached to subject ${c.a.nodeName}`,
  "name-in-filename": (c) => `the audio exhibit's filename contains the string "${c.mention}", a name otherwise associated with subject ${c.a.nodeName}`,
  "today-mention": (c) => {
    const ev = c.event;
    return `${c.a.nodeName} appears in the historical record for this very date. In ${ev.year}: ${ev.text} The investigator notes the user's choice of timing — the entry of this name into evidence on the anniversary of its appearance in the historical record cannot reasonably be dismissed`;
  },
  distance: (c) => `the great-circle distance between ${c.a.nodeName} and ${c.b.nodeName} is precisely ${c.km} kilometres — a figure which, for the moment, the investigator merely records`,
  "distance-match": (c) => `the great-circle distance from ${c.a.nodeName} to ${c.otherLocation} measures ${c.a.value} kilometres — exactly equal to the ${c.b.label} of ${c.b.nodeName}. The reader will note that distance, by nature, knows nothing of audio file durations or page counts`,
  "ley-line": (c) => `${c.triangle.join(", ")} fall on a near-perfect great-circle alignment. Such collinearity, in the literature on the subject, is referred to as a ley line. The investigator does not endorse this terminology, but acknowledges the geometry`,
  "color-match": (c) => `a dominant colour of ${c.a.nodeName} (${c.a.hex}) is visually indistinguishable from a dominant colour of ${c.b.nodeName} (${c.b.hex}). Two unrelated images converging on the same chromatic signature is a rare event`,
  anagram: (c) => `the letters of ${c.a.nodeName.toUpperCase()}, rearranged, spell ${c.b.nodeName.toUpperCase()}. The investigator declines to speculate further`,
  "near-anagram": (c) => `${c.a.nodeName.toUpperCase()} and ${c.b.nodeName.toUpperCase()} differ by only ${written(c.distance)} letter${c.distance === 1 ? "" : "s"} when reduced to their constituent characters. A near-anagram of this proximity, in the absence of common etymology, is suspect`,
};

export const narrateConnection = (c, totalConnections = 1, indexSeed = 0) => {
  const opener = pick(OPENERS, indexSeed);
  const body = rephrasers[c.kind] ? rephrasers[c.kind](c) : `${c.a?.nodeName || "?"} and ${c.b?.nodeName || "?"} are linked`;
  const closer = closerFor(totalConnections, indexSeed * 3 + 1);
  return `${opener} ${body}. ${closer}`;
};
