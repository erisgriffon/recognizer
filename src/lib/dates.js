import { LIMITS } from "../data/limits.js";

// Parse a date string into a *local* Date. `new Date("1987-08-08")` parses as
// UTC midnight, which then renders as the previous day in any timezone west of
// UTC — silently corrupting every date fact (getDate, getMonth, getDay).
// Constructing via component args avoids the trap.
export const parseDate = (s) => {
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    const d = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export const daysBetween = (a, b) =>
  Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));

export const isInRange = (date) => {
  const y = date.getFullYear();
  return y >= LIMITS.DATE_MIN_YEAR && y <= LIMITS.DATE_MAX_YEAR;
};

export const ZODIAC = [
  ["Capricorn", [12, 22], [1, 19]], ["Aquarius", [1, 20], [2, 18]],
  ["Pisces", [2, 19], [3, 20]], ["Aries", [3, 21], [4, 19]],
  ["Taurus", [4, 20], [5, 20]], ["Gemini", [5, 21], [6, 20]],
  ["Cancer", [6, 21], [7, 22]], ["Leo", [7, 23], [8, 22]],
  ["Virgo", [8, 23], [9, 22]], ["Libra", [9, 23], [10, 22]],
  ["Scorpio", [10, 23], [11, 21]], ["Sagittarius", [11, 22], [12, 21]],
];

export const zodiacOf = (date) => {
  const m = date.getMonth() + 1, d = date.getDate();
  for (const [sign, [m1, d1], [m2, d2]] of ZODIAC) {
    if ((m === m1 && d >= d1) || (m === m2 && d <= d2)) return sign;
  }
  return "Capricorn";
};

// Traditional fire/earth/air/water elements
export const ZODIAC_ELEMENTS = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};

// Compatible signs by element (within element = compatible).
export const zodiacCompatible = (a, b) =>
  a !== b && ZODIAC_ELEMENTS[a] && ZODIAC_ELEMENTS[a] === ZODIAC_ELEMENTS[b];

export const dayOfWeek = (date) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];

export const moonPhase = (date) => {
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodic = 29.530588853;
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const phase = ((days % synodic) + synodic) % synodic;
  if (phase < 1.84) return "New Moon";
  if (phase < 5.53) return "Waxing Crescent";
  if (phase < 9.22) return "First Quarter";
  if (phase < 12.91) return "Waxing Gibbous";
  if (phase < 16.61) return "Full Moon";
  if (phase < 20.30) return "Waning Gibbous";
  if (phase < 23.99) return "Last Quarter";
  return "Waning Crescent";
};

export const dateFacts = (date, label = "date") => {
  const today = new Date();
  // Component labels are intentionally bare ("year" / "month" / "day"), not
  // prefixed with the user's date label. The connection rephrasers already
  // include the node name in their sentences, so prefixing here produces
  // awkward duplication like "the Krakatoa eruption day of Krakatoa eruption".
  // The "days since ${label}" fact does keep the label, since it's reading
  // *naturally* as a comparison ("days since Krakatoa eruption").
  return {
    "year": date.getFullYear(),
    "month": date.getMonth() + 1,
    "day": date.getDate(),
    [`days since ${label}`]: daysBetween(date, today),
    "day of year": Math.ceil((date - new Date(date.getFullYear(), 0, 0)) / 86400000),
  };
};
