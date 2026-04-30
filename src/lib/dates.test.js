import { describe, it, expect } from "vitest";
import { parseDate, daysBetween, zodiacOf, dayOfWeek, moonPhase, isInRange } from "./dates.js";

describe("parseDate — timezone footgun guard", () => {
  // The bug we're guarding against: `new Date("1987-08-08")` parses as UTC
  // midnight, then `.getDate()` reads in local time and returns the previous
  // day in any timezone west of UTC. parseDate constructs via component args
  // (year, month-1, day) which always produces a local-time Date.
  it("returns the calendar day the user typed, regardless of TZ", () => {
    const d = parseDate("1987-08-08");
    expect(d.getFullYear()).toBe(1987);
    expect(d.getMonth()).toBe(7); // August (0-indexed)
    expect(d.getDate()).toBe(8);
  });

  it("preserves the day across the entire valid range", () => {
    expect(parseDate("1700-01-01").getDate()).toBe(1);
    expect(parseDate("2099-12-31").getDate()).toBe(31);
  });

  it("returns null for non-ISO and unparseable strings", () => {
    expect(parseDate("")).toBe(null);
    expect(parseDate(null)).toBe(null);
    expect(parseDate("not a date")).toBe(null);
  });

  it("falls back to Date constructor for non-ISO formats", () => {
    const d = parseDate("Aug 8, 1987");
    expect(d).not.toBe(null);
    expect(d.getFullYear()).toBe(1987);
  });
});

describe("zodiacOf, dayOfWeek, moonPhase — depend on parseDate semantics", () => {
  // Lincoln's birthday — a date the timezone bug would have shifted to Feb 11
  // (Aquarius, not Aquarius — same sign, different weekday). The user's actual
  // bug report was a Sunday-vs-Saturday weekday flip on a date like this.
  it("zodiacOf reads from the local-time date components", () => {
    expect(zodiacOf(parseDate("1809-02-12"))).toBe("Aquarius");
    expect(zodiacOf(parseDate("1969-07-20"))).toBe("Cancer");
  });

  it("dayOfWeek returns the calendar weekday, not a TZ-shifted one", () => {
    // Moon landing: July 20, 1969 was a Sunday. UTC-midnight parsing in
    // a US timezone would render it as Saturday.
    expect(dayOfWeek(parseDate("1969-07-20"))).toBe("Sunday");
  });

  it("moonPhase returns one of the eight named phases", () => {
    const phases = [
      "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
      "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
    ];
    expect(phases).toContain(moonPhase(parseDate("1969-07-20")));
  });
});

describe("daysBetween and isInRange", () => {
  it("daysBetween is symmetric and unsigned", () => {
    const a = parseDate("2000-01-01"), b = parseDate("2000-01-11");
    expect(daysBetween(a, b)).toBe(10);
    expect(daysBetween(b, a)).toBe(10);
  });

  it("isInRange honors the LIMITS bounds", () => {
    expect(isInRange(parseDate("1700-01-01"))).toBe(true);
    expect(isInRange(parseDate("2099-12-31"))).toBe(true);
    expect(isInRange(parseDate("1699-12-31"))).toBe(false);
    expect(isInRange(parseDate("2101-01-01"))).toBe(false);
  });
});
