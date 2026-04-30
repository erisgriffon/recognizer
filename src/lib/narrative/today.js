import { ordinal, pick } from "../utils.js";

export const TODAY_OPENERS = [
  "Curious that you opened this tool",
  "It is no accident that you arrived here",
  "Note your timing:",
  "The investigator observes that you have come",
  "We log your entry into this file",
  "Of immediate interest:",
];

export const TODAY_FRAMINGS = [
  ({ dayOfWeek, moonPhase, zodiac }) => `on a ${dayOfWeek}, beneath a ${moonPhase}, while the sun sits in ${zodiac}`,
  ({ dayOfWeek, zodiac }) => `on a ${dayOfWeek} during the season of ${zodiac}`,
  ({ moonPhase, dayOfYear }) => `on the ${ordinal(dayOfYear)} day of the year, with the moon ${moonPhase.toLowerCase().includes("waxing") ? "still climbing" : moonPhase.toLowerCase().includes("waning") ? "in retreat" : "in transition"}`,
  ({ dayOfWeek, isoDate }) => `on this particular ${dayOfWeek}, ${isoDate}, of all possible days`,
];

export const TODAY_HISTORICAL = [
  (ev) => `On this date in ${ev.year}, ${ev.text}`,
  (ev) => `History records that on this very day, in ${ev.year}: ${ev.text}`,
  (ev) => `Consider, also, that ${ev.year} produced the following on this date: ${ev.text}`,
];

export const TODAY_NUMEROLOGY = [
  (sum, reduced) => `Today's date, reduced numerologically, yields ${reduced} (from a digital sum of ${sum}). The reader will draw their own conclusions.`,
  (sum, reduced) => `Note that today reduces to ${reduced} under Pythagorean addition — a value the ancients did not assign lightly.`,
];

export const TODAY_CLOSERS = [
  "The investigator merely notes your timing.",
  "What you do next is, of course, your own business.",
  "We have made the relevant observations.",
  "Proceed accordingly.",
  "The file awaits your evidence.",
];

export const buildTodayObservation = (todayNode, seed, includeNumerology) => {
  if (!todayNode) return null;
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.ceil((now - startOfYear) / 86400000);
  const ctx = {
    dayOfWeek: todayNode.dayOfWeek, moonPhase: todayNode.moonPhase,
    zodiac: todayNode.zodiac, dayOfYear, isoDate: todayNode.isoDate,
  };
  const opener = pick(TODAY_OPENERS, seed);
  const framing = pick(TODAY_FRAMINGS, seed * 3)(ctx);
  let historical = "";
  if (todayNode.events && todayNode.events.length > 0) {
    const chosen = todayNode.events[Math.floor(Math.abs(seed * 7)) % todayNode.events.length];
    historical = " " + pick(TODAY_HISTORICAL, seed * 11)(chosen);
  }
  let numerology = "";
  const pyth = todayNode.numerology?.pythagorean;
  if (includeNumerology && pyth) {
    numerology = " " + pick(TODAY_NUMEROLOGY, seed * 13)(pyth.sum, pyth.reduced);
  }
  const closer = " " + pick(TODAY_CLOSERS, seed * 17);
  return `${opener} ${framing}.${historical}${numerology}${closer}`;
};

// Summarize a today-related hint connection into a single short nudge line.
// This is intentionally less florid than the full narrative — the banner is
// observational, not declarative.
export const summarizeHint = (c) => {
  const otherName = c.from === "today" ? c.b?.nodeName || "your evidence" : c.a?.nodeName || "your evidence";
  switch (c.kind) {
    case "today-mention":
      return `${otherName} appears in today's historical record.`;
    case "exact":
      return `a value linked to ${otherName} is identical to one of today's facts.`;
    case "near":
      return `${otherName} produces a number very close to one of today's.`;
    case "numerology":
      return `${otherName} reduces numerologically to today's same digit.`;
    case "anagram":
    case "near-anagram":
      return `${otherName} shares its letters with today's date string.`;
    case "weekday-cluster":
      return `${otherName} falls on the same weekday as today.`;
    case "astrology":
      return `${otherName}'s zodiac is elementally compatible with today's.`;
    default:
      return `${otherName} would connect to today.`;
  }
};
