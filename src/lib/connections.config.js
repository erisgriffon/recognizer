// Single source of truth for connection-engine tuning. The numeric thresholds
// here were tuned over many versions to suppress small-integer noise without
// killing real signal — see CLAUDE.md "Threshold tuning" for rationale.
//
// Strength values are *fixed literals* used by the engine. Some kinds compute
// strength dynamically (stylometric similarity, near-anagram edit distance);
// those formulas live in connections.js and are not represented here.

export const STRENGTH = {
  EXACT: 1.0,
  NEAR: 0.6,
  NEAR_YEAR: 0.45,
  MULTIPLE: 0.4,
  NUMEROLOGY: 0.85,
  NUMEROLOGY_CHALDEAN: 0.75, // used from Phase 4
  NUMEROLOGY_DOUBLE: 0.95, // used from Phase 4
  NUMEROLOGY_DEEP: 0.35, // used from Phase 4
  ANAGRAM: 0.95,
  NEAR_ANAGRAM: 0.5,
  WORD_OVERLAP: 0.5,
  STYLOMETRIC: 0.55,
  WORDCOUNT_YEAR: 0.95,
  WEEKDAY_CLUSTER: 0.7,
  ASTROLOGY: 0.45,
  ASTROLOGY_MODALITY: 0.45,
  ASTROLOGY_RULER: 0.50,
  ASTROLOGY_RETROGRADE: 0.55,
  // Per-aspect strengths. Aspects are flavor, not revelation — all sit at or
  // below NEAR (0.6), so they land NOTABLE-tier or below in the dossier.
  // Conjunction is "interesting but expected" given only 12 signs exist;
  // opposition is the strongest because it's the most geometrically specific
  // (only one sign in the wheel opposes another); sextile is the weakest
  // because a 60° relationship is, frankly, not that wild.
  ASTROLOGY_ASPECT_CONJUNCTION: 0.55,
  ASTROLOGY_ASPECT_SEXTILE: 0.40,
  ASTROLOGY_ASPECT_SQUARE: 0.50,
  ASTROLOGY_ASPECT_TRINE: 0.55,
  ASTROLOGY_ASPECT_OPPOSITION: 0.60,
  NAME_MENTION: 0.9,
  NAME_IN_FILENAME: 0.9,
  TODAY_MENTION: 0.95,
  COLOR_MATCH: 0.7,
  DISTANCE: 0.7,
  DISTANCE_MATCH: 0.95,
  LEY_LINE: 0.8,
};

// Named strength tiers replace the misleading "CONFIDENCE %" label. Strength
// describes how rare/specific the match is, not certainty about meaning.
// Order matters: highest min first; strengthTier walks the list and returns
// the first tier whose min the score meets.
export const TIERS = [
  { min: 0.9, name: "SUSPICIOUS", color: "#ffb84d" },
  { min: 0.7, name: "STRIKING", color: "#d6a85f" },
  { min: 0.5, name: "NOTABLE", color: "#a89070" },
  { min: 0.0, name: "TRIVIAL", color: "#888888" },
];

export const NUMERIC_THRESHOLDS = {
  EXACT_MIN: 9,
  NEAR_MIN: 20,
  NEAR_DELTA: 2,
  MULTIPLE_MIN_SMALL: 5,
  MULTIPLE_MIN_BOTH: 10,
  MULTIPLE_MAX: 12,
  MULTIPLE_MAX_YEAR: 3,
};
