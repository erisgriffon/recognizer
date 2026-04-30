import { daysBetween, zodiacOf, dayOfWeek, moonPhase } from "../dates.js";
import { pythagoreanNumerologyOf, chaldeanNumerologyOf } from "../numerology.js";

export const buildTodayNode = (events = []) => {
  const now = new Date();
  // Today-specific labels: avoid stutters like "today year of today" and skip
  // tautological facts like "days since today" (always zero).
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekOfYear = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const dayOfYear = Math.ceil((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  // Lunar day: position in the synodic cycle, integer 1–30. Stable for the day.
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodic = 29.530588853;
  const daysSinceNewMoon = (now.getTime() - knownNewMoon) / 86400000;
  const lunarDay = Math.floor(((daysSinceNewMoon % synodic) + synodic) % synodic) + 1;

  // Julian Day Number (astronomical), modulo 1000 to keep it in collision range.
  // Pure integer math from the Gregorian calendar.
  const jdYear = now.getFullYear();
  const jdMonth = now.getMonth() + 1;
  const jdDay = now.getDate();
  const jy = jdMonth <= 2 ? jdYear - 1 : jdYear;
  const jm = jdMonth <= 2 ? jdMonth + 12 : jdMonth;
  const jdn = Math.floor(365.25 * (jy + 4716)) + Math.floor(30.6001 * (jm + 1)) + jdDay - 1524;
  const julianMod = jdn % 1000;

  const numbers = {
    "year": now.getFullYear(),
    "month": now.getMonth() + 1,
    "day": now.getDate(),
    "day of year": dayOfYear,
    "week of year": weekOfYear,
    "days until year end": daysBetween(now, endOfYear),
    "lunar day": lunarDay,
    "julian day mod 1000": julianMod,
  };
  events.forEach((e) => {
    if (e.year && e.year > 0) numbers[`event year (${e.year})`] = e.year;
  });

  return {
    id: "today",
    type: "today",
    name: `today: ${now.toISOString().slice(0, 10)}`,
    isoDate: now.toISOString().slice(0, 10),
    zodiac: zodiacOf(now),
    dayOfWeek: dayOfWeek(now),
    moonPhase: moonPhase(now),
    events,
    numbers,
    numerology: {
      pythagorean: pythagoreanNumerologyOf("today " + now.toISOString().slice(0, 10).replace(/-/g, "")),
      chaldean: chaldeanNumerologyOf("today " + now.toISOString().slice(0, 10).replace(/-/g, "")),
      deepReduced: null,
    },
  };
};
