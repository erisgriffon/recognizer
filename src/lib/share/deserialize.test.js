import { describe, it, expect } from "vitest";
import { buildPlaceholderMediaNode, isValidCaseFile } from "./deserialize.js";

describe("buildPlaceholderMediaNode", () => {
  it("preserves the filename as the node's name", () => {
    const node = buildPlaceholderMediaNode("image", { name: "11429.jpg" });
    expect(node.name).toBe("11429.jpg");
    expect(node.type).toBe("image");
    expect(node.placeholder).toBe(true);
  });

  it("sets a summary that explains the file wasn't transmitted", () => {
    const node = buildPlaceholderMediaNode("audio", { name: "song.mp3" });
    expect(node.summary).toMatch(/not transmitted/);
    expect(node.summary).toMatch(/audio/);
  });

  it("derives filename chars as the only numeric fact", () => {
    const node = buildPlaceholderMediaNode("image", { name: "abc.jpg" });
    expect(node.numbers).toEqual({ "filename chars": 7 });
  });

  it("populates pythagorean and chaldean numerology from the filename", () => {
    const node = buildPlaceholderMediaNode("image", { name: "abc.jpg" });
    expect(node.numerology.pythagorean).not.toBeNull();
    expect(node.numerology.chaldean).not.toBeNull();
    expect(node.numerology.pythagorean.source).toMatch(/abc/i);
  });

  it("falls back to a sane default name when info is missing", () => {
    const node = buildPlaceholderMediaNode("audio", {});
    expect(node.name).toBe("audio.unknown");
    expect(node.placeholder).toBe(true);
  });
});

describe("isValidCaseFile", () => {
  it("accepts a minimal v:1 envelope", () => {
    expect(isValidCaseFile({ v: 1, d: "2026-04-29", n: [] })).toBe(true);
  });

  it("rejects null, undefined, primitives, and arrays", () => {
    expect(isValidCaseFile(null)).toBe(false);
    expect(isValidCaseFile(undefined)).toBe(false);
    expect(isValidCaseFile("string")).toBe(false);
    expect(isValidCaseFile(42)).toBe(false);
  });

  it("rejects objects with a missing or wrong version", () => {
    expect(isValidCaseFile({ n: [] })).toBe(false);
    expect(isValidCaseFile({ v: 2, n: [] })).toBe(false);
    expect(isValidCaseFile({ v: "1", n: [] })).toBe(false);
  });

  it("rejects objects with a non-array n field", () => {
    expect(isValidCaseFile({ v: 1, n: {} })).toBe(false);
    expect(isValidCaseFile({ v: 1 })).toBe(false);
  });
});
