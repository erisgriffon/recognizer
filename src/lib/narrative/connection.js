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
      `${c.a.nodeName}, reduced numerologically (Pythagorean: A=1, B=2, …, I=9, J=1 …), yields ${c.value} (${aDeriv}); ${c.b.nodeName}, reduced by the same method, yields the identical ${c.value} (${bDeriv})`,
      `the numerological signatures of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value} — derived as ${aDeriv}, and ${bDeriv}, respectively. A result the ancients would not have considered accidental`,
    ], c.value * 7);
  },
  "word-overlap": (c) => `${c.a.nodeName} and ${c.b.nodeName} share unusual vocabulary, including ${c.words.map((w) => `"${w}"`).join(", ")} — words which, statistically, ought not to co-occur in unrelated documents`,
  stylometric: (c) => `the letter-frequency distributions of ${c.a.nodeName} and ${c.b.nodeName} exhibit a cosine similarity of ${(c.similarity * 100).toFixed(1)}%, a value used in stylometric authorship analysis. Identical authorship cannot be ruled out`,
  "wordcount-year": (c) => `the word count of ${c.a.nodeName} (${c.a.value}) is precisely equal to the ${c.b.label} of ${c.b.nodeName}. The investigator notes that documents of arbitrary length do not, as a rule, terminate on dates of historical significance`,
  "weekday-cluster": (c) => `${c.count} dates of record fall on a ${c.dayOfWeek}. The recurrence of ${c.dayOfWeek} across unrelated entries is, statistically, improbable`,
  astrology: (c) => `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) share the elemental affinity of ${c.element}. The ancients held such pairings to be no accident`,
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
