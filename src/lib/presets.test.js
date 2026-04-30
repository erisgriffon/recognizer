import { describe, it, expect } from "vitest";
import { INVESTIGATOR_PRESETS, PRESET_ORDER, detectPreset } from "./presets.js";

describe("INVESTIGATOR_PRESETS — preset constants", () => {
  it("has all four named presets in canonical order", () => {
    expect(PRESET_ORDER).toEqual(["skeptic", "standard", "believer", "conspiracy"]);
  });

  it("each preset has all four depth keys with valid values", () => {
    for (const key of PRESET_ORDER) {
      const p = INVESTIGATOR_PRESETS[key];
      expect(p.depths.numerologyDepth).toBeGreaterThanOrEqual(0);
      expect(p.depths.numerologyDepth).toBeLessThanOrEqual(3);
      expect(p.depths.astrologyDepth).toBeGreaterThanOrEqual(0);
      expect(p.depths.astrologyDepth).toBeLessThanOrEqual(3);
      expect(p.depths.lexicalDepth).toBeGreaterThanOrEqual(0);
      expect(p.depths.lexicalDepth).toBeLessThanOrEqual(3);
      expect(p.depths.geographicDepth).toBeGreaterThanOrEqual(0);
      expect(p.depths.geographicDepth).toBeLessThanOrEqual(3);
    }
  });

  it("each preset has a label and a non-empty description", () => {
    for (const key of PRESET_ORDER) {
      expect(INVESTIGATOR_PRESETS[key].label.length).toBeGreaterThan(0);
      expect(INVESTIGATOR_PRESETS[key].description.length).toBeGreaterThan(0);
    }
  });
});

describe("detectPreset — derived selector value", () => {
  it("all-zero depths return skeptic", () => {
    expect(detectPreset({
      numerologyDepth: 0, astrologyDepth: 0, lexicalDepth: 0, geographicDepth: 0,
    })).toBe("skeptic");
  });

  it("all-one depths return standard", () => {
    expect(detectPreset({
      numerologyDepth: 1, astrologyDepth: 1, lexicalDepth: 1, geographicDepth: 1,
    })).toBe("standard");
  });

  it("all-two depths return believer", () => {
    expect(detectPreset({
      numerologyDepth: 2, astrologyDepth: 2, lexicalDepth: 2, geographicDepth: 2,
    })).toBe("believer");
  });

  it("all-three depths return conspiracy", () => {
    expect(detectPreset({
      numerologyDepth: 3, astrologyDepth: 3, lexicalDepth: 3, geographicDepth: 3,
    })).toBe("conspiracy");
  });

  it("mixed depths return custom", () => {
    expect(detectPreset({
      numerologyDepth: 3, astrologyDepth: 1, lexicalDepth: 2, geographicDepth: 0,
    })).toBe("custom");
  });

  it("a single off-by-one depth returns custom (not the closest preset)", () => {
    expect(detectPreset({
      numerologyDepth: 1, astrologyDepth: 1, lexicalDepth: 1, geographicDepth: 2,
    })).toBe("custom");
  });

  it("empty settings default each depth to 1, so it returns standard", () => {
    expect(detectPreset({})).toBe("standard");
  });

  it("partial settings (only some depths set) defaults the rest to 1", () => {
    // Only numerologyDepth is set, to 0. Others default to 1 → mixed → custom.
    expect(detectPreset({ numerologyDepth: 0 })).toBe("custom");
  });
});
