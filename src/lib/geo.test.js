import { describe, it, expect } from "vitest";
import { haversineKm, isLeyLine } from "./geo.js";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(40.7, -74.0, 40.7, -74.0)).toBe(0);
  });

  it("computes the great-circle distance to within ~1% of known values", () => {
    // NYC (40.7128, -74.006) to London (51.5074, -0.1278) is ~5570 km
    const km = haversineKm(40.7128, -74.006, 51.5074, -0.1278);
    expect(km).toBeGreaterThan(5550);
    expect(km).toBeLessThan(5600);
  });

  it("is symmetric — distance from A to B equals B to A", () => {
    const ab = haversineKm(0, 0, 45, 45);
    const ba = haversineKm(45, 45, 0, 0);
    expect(ab).toBe(ba);
  });
});

describe("isLeyLine", () => {
  it("detects three points on the same meridian as collinear", () => {
    const p1 = { lat: 0, lng: 10 };
    const p2 = { lat: 30, lng: 10 };
    const p3 = { lat: 60, lng: 10 };
    expect(isLeyLine(p1, p2, p3)).toBe(true);
  });

  it("rejects three points that visibly don't align", () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 30, lng: 30 };
    const p3 = { lat: 0, lng: 60 }; // forms a triangle, not a line
    expect(isLeyLine(p1, p2, p3)).toBe(false);
  });

  it("returns false when two points are essentially the same (degenerate line)", () => {
    const p1 = { lat: 10, lng: 10 };
    const p2 = { lat: 10.001, lng: 10.001 };
    const p3 = { lat: 50, lng: 50 };
    expect(isLeyLine(p1, p2, p3)).toBe(false);
  });
});
