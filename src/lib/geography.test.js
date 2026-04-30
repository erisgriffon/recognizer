import { describe, it, expect } from "vitest";
import {
  antipodeOf, isAntipodal,
  longitudeTimeZone, hemisphereOf,
  isOnGreatCircle,
  MAGNETIC_NORTH_2025, MAGNETIC_SOUTH_2025, isNearMagneticPole,
  elevationBand,
} from "./geography.js";

describe("antipodeOf", () => {
  it("flips latitude sign and shifts longitude by 180", () => {
    expect(antipodeOf(40, 100)).toEqual({ lat: -40, lng: -80 });
    expect(antipodeOf(-30, -50)).toEqual({ lat: 30, lng: 130 });
  });

  it("handles equator and prime meridian (lat 0, lng on the dateline)", () => {
    // Antipode of (0, 0) is on the equator, on the dateline. Both +180 and
    // -180 are valid (they're the same meridian), and lat may be -0 due to
    // the unary-minus on a literal 0 — accept either signed zero.
    const r = antipodeOf(0, 0);
    expect(Math.abs(r.lat)).toBe(0);
    expect(Math.abs(r.lng)).toBe(180);
  });

  it("antipode of antipode is the original (within float tolerance)", () => {
    const orig = { lat: 37.5, lng: -122.4 };
    const ant = antipodeOf(orig.lat, orig.lng);
    const back = antipodeOf(ant.lat, ant.lng);
    expect(back.lat).toBeCloseTo(orig.lat, 10);
    expect(back.lng).toBeCloseTo(orig.lng, 10);
  });
});

describe("isAntipodal", () => {
  it("matches a point and its exact antipode", () => {
    const a = { lat: 40, lng: 100 };
    const b = { lat: -40, lng: -80 };
    expect(isAntipodal(a, b)).toBe(true);
  });

  it("matches points within the default 500km tolerance", () => {
    const a = { lat: 40, lng: 100 };
    const b = { lat: -40.5, lng: -80.5 }; // ~75 km off antipode
    expect(isAntipodal(a, b)).toBe(true);
  });

  it("rejects points not antipodal", () => {
    const a = { lat: 40, lng: 100 };
    const b = { lat: 41, lng: 101 };
    expect(isAntipodal(a, b)).toBe(false);
  });
});

describe("longitudeTimeZone", () => {
  it("returns 0 around the prime meridian", () => {
    expect(longitudeTimeZone(0)).toBe(0);
    expect(longitudeTimeZone(7)).toBe(0);
  });

  it("returns the rough hour offset for known longitudes", () => {
    expect(longitudeTimeZone(75)).toBe(5);    // ~UTC+5 (Pakistan-ish)
    expect(longitudeTimeZone(-75)).toBe(-5);  // ~US Eastern
  });

  it("returns -12 or +12 at the dateline", () => {
    expect(Math.abs(longitudeTimeZone(180))).toBe(12);
  });
});

describe("hemisphereOf", () => {
  it("classifies northern east-hemisphere correctly", () => {
    expect(hemisphereOf(40, 100)).toEqual({ ns: "north", ew: "east" });
  });

  it("classifies southern west-hemisphere correctly", () => {
    expect(hemisphereOf(-30, -60)).toEqual({ ns: "south", ew: "west" });
  });

  it("equator and prime meridian go to the positive bucket", () => {
    expect(hemisphereOf(0, 0)).toEqual({ ns: "north", ew: "east" });
  });
});

describe("isOnGreatCircle", () => {
  it("a point on the equator between two equatorial points is on the great circle", () => {
    const a = { lat: 0, lng: 0 }, b = { lat: 0, lng: 60 };
    const p = { lat: 0, lng: 30 };
    expect(isOnGreatCircle(p, a, b)).toBe(true);
  });

  it("an off-arc point is NOT on the great circle", () => {
    const a = { lat: 0, lng: 0 }, b = { lat: 0, lng: 60 };
    const p = { lat: 30, lng: 30 }; // far north of the equator
    expect(isOnGreatCircle(p, a, b)).toBe(false);
  });

  it("returns true for the start point itself", () => {
    const a = { lat: 10, lng: 20 }, b = { lat: 30, lng: 40 };
    expect(isOnGreatCircle(a, a, b)).toBe(true);
  });
});

describe("magnetic poles", () => {
  it("MAGNETIC_NORTH_2025 sits in the high Arctic", () => {
    expect(MAGNETIC_NORTH_2025.lat).toBeGreaterThan(80);
  });

  it("MAGNETIC_SOUTH_2025 sits south of -60", () => {
    expect(MAGNETIC_SOUTH_2025.lat).toBeLessThan(-60);
  });

  it("isNearMagneticPole returns true for points very close to the pole", () => {
    expect(isNearMagneticPole(MAGNETIC_NORTH_2025.lat, MAGNETIC_NORTH_2025.lng, "north")).toBe(true);
  });

  it("isNearMagneticPole returns false for points far away", () => {
    expect(isNearMagneticPole(0, 0, "north")).toBe(false);
    expect(isNearMagneticPole(0, 0, "south")).toBe(false);
  });

  it("defaults to checking the north magnetic pole", () => {
    expect(isNearMagneticPole(85, 140)).toBe(true);
  });
});

describe("elevationBand", () => {
  it("returns 'below sea level' for negative elevations", () => {
    expect(elevationBand(-50)).toBe("below sea level");
  });

  it("returns null for sea-level-ish elevations (under 500m)", () => {
    expect(elevationBand(0)).toBe(null);
    expect(elevationBand(450)).toBe(null);
  });

  it("returns the right band for moderate, high, and extreme altitudes", () => {
    expect(elevationBand(800)).toBe("moderate altitude");
    expect(elevationBand(2000)).toBe("high altitude");
    expect(elevationBand(4500)).toBe("extreme altitude");
  });

  it("returns null for non-numeric input", () => {
    expect(elevationBand(null)).toBe(null);
    expect(elevationBand(undefined)).toBe(null);
    expect(elevationBand(NaN)).toBe(null);
  });
});
