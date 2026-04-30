// Astrological tables and helpers. Lives separate from dates.js because the
// data and lookups are substantial — elements, modalities, traditional
// rulerships, aspects, plus the Mercury retrograde tabulation. dates.js keeps
// only the calendar-derivation helpers (zodiacOf, dayOfWeek, moonPhase).
//
// Per-aspect strengths live in connections.config.js under STRENGTH; this
// module holds geometry only (degrees + label).

import { MERCURY_RETROGRADE } from "./data/mercury-retrograde.js";

// Traditional fire/earth/air/water elements.
export const ZODIAC_ELEMENTS = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};

// Cardinal/fixed/mutable. Independent of element — every quadrant of the
// zodiac contains one cardinal, one fixed, and one mutable sign.
export const ZODIAC_MODALITIES = {
  Aries: "cardinal", Cancer: "cardinal", Libra: "cardinal", Capricorn: "cardinal",
  Taurus: "fixed", Leo: "fixed", Scorpio: "fixed", Aquarius: "fixed",
  Gemini: "mutable", Virgo: "mutable", Sagittarius: "mutable", Pisces: "mutable",
};

// Traditional rulerships. Modern astrology hands Pluto/Neptune/Uranus to
// Scorpio/Pisces/Aquarius respectively; we use the classical scheme because
// (a) two-signs-per-planet generates more match opportunities, and
// (b) the investigator would obviously prefer the older system.
export const ZODIAC_RULERS = {
  Aries: "Mars", Scorpio: "Mars",
  Taurus: "Venus", Libra: "Venus",
  Gemini: "Mercury", Virgo: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Sagittarius: "Jupiter", Pisces: "Jupiter",
  Capricorn: "Saturn", Aquarius: "Saturn",
};

// Compatible signs by element (within element = compatible). Same-sign pairs
// don't count — element-match is meant as "two different signs share a
// quality", not "this sign matches itself".
export const zodiacCompatible = (a, b) =>
  a !== b && ZODIAC_ELEMENTS[a] && ZODIAC_ELEMENTS[a] === ZODIAC_ELEMENTS[b];

// Same modality, different signs. Same-sign exclusion mirrors zodiacCompatible.
export const modalityCompatible = (a, b) =>
  a !== b && ZODIAC_MODALITIES[a] && ZODIAC_MODALITIES[a] === ZODIAC_MODALITIES[b];

// Returns the planet name when two signs share a ruler, else null. Same-sign
// exclusion: a sign trivially shares its ruler with itself, but that's not
// the kind of finding we want to surface.
export const sharedRuler = (a, b) => {
  if (a === b) return null;
  const ra = ZODIAC_RULERS[a], rb = ZODIAC_RULERS[b];
  if (!ra || !rb) return null;
  return ra === rb ? ra : null;
};

const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export const signIndex = (sign) => SIGN_ORDER.indexOf(sign);

// Smallest angular distance between two signs, in degrees (0-180). Each sign
// occupies 30° on the wheel; the wrap is 12 - diff to take the short way
// around. Returns null for unknown signs.
export const angularDistance = (a, b) => {
  const i1 = signIndex(a), i2 = signIndex(b);
  if (i1 < 0 || i2 < 0) return null;
  const diff = Math.abs(i1 - i2);
  return Math.min(diff, 12 - diff) * 30;
};

// Geometry only. Strengths live in connections.config.js as
// STRENGTH.ASTROLOGY_ASPECT_* — kept centralized so all literal connection
// strengths share one source of truth.
export const ASPECTS = {
  conjunction: { degrees: 0, label: "conjunct" },
  sextile: { degrees: 60, label: "sextile" },
  square: { degrees: 90, label: "square" },
  trine: { degrees: 120, label: "trine" },
  opposition: { degrees: 180, label: "in opposition" },
};

export const aspectBetween = (a, b) => {
  const dist = angularDistance(a, b);
  if (dist === null) return null;
  for (const [name, def] of Object.entries(ASPECTS)) {
    if (def.degrees === dist) return { name, ...def };
  }
  return null; // semisextile (30°) and other minor aspects aren't tracked.
};

// Returns the matching retrograde period { start, end } when the date falls
// within one, else null. Date comparison via ISO string is correct because
// the table stores YYYY-MM-DD strings and ISO sorts lexicographically.
// Outside the tabulated 1950-2030 range this returns null — graceful degrade.
export const isMercuryRetrograde = (date) => {
  if (!date || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${d}`;
  for (const period of MERCURY_RETROGRADE) {
    if (iso >= period.start && iso <= period.end) return period;
  }
  return null;
};
