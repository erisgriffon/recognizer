import { describe, it, expect } from "vitest";
import { computeLayout, createLayoutSimulation, edgeJitter } from "./layout.js";

const round = (positions) => {
  const out = {};
  for (const id of Object.keys(positions).sort()) {
    out[id] = { x: Math.round(positions[id].x), y: Math.round(positions[id].y) };
  }
  return out;
};

describe("computeLayout", () => {
  it("returns {} for empty nodes without throwing", () => {
    expect(computeLayout([], [])).toEqual({});
  });

  it("settles a single node near the canvas center", () => {
    const positions = computeLayout([{ id: "solo" }], [], { width: 800, height: 500 });
    // With nothing repelling it, the centering pull dominates.
    expect(Math.abs(positions.solo.x - 400)).toBeLessThan(20);
    expect(Math.abs(positions.solo.y - 250)).toBeLessThan(20);
  });

  it("pushes two close-seeded nodes further apart over the run", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const initial = { a: { x: 400, y: 250 }, b: { x: 402, y: 251 } };
    const startDist = Math.hypot(2, 1);
    const positions = computeLayout(nodes, [], { initial });
    const endDist = Math.hypot(positions.a.x - positions.b.x, positions.a.y - positions.b.y);
    expect(endDist).toBeGreaterThan(startDist);
  });

  it("is deterministic — same inputs produce identical outputs", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const first = computeLayout(nodes, []);
    const second = computeLayout(nodes, []);
    expect(first).toEqual(second);
  });

  it("respects warm-start initial positions on a low iteration count", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const initial = { a: { x: 100, y: 100 }, b: { x: 700, y: 400 } };
    const positions = computeLayout(nodes, [], { initial, iterations: 2 });
    // Two iterations isn't enough for them to drift far from where they started.
    expect(Math.abs(positions.a.x - 100)).toBeLessThan(20);
    expect(Math.abs(positions.a.y - 100)).toBeLessThan(20);
    expect(Math.abs(positions.b.x - 700)).toBeLessThan(20);
    expect(Math.abs(positions.b.y - 400)).toBeLessThan(20);
  });

  it("keeps every node inside the canvas inset bounds after settling", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }));
    const positions = computeLayout(nodes, [], { width: 800, height: 500 });
    for (const id of Object.keys(positions)) {
      expect(positions[id].x).toBeGreaterThanOrEqual(65);
      expect(positions[id].x).toBeLessThanOrEqual(800 - 65);
      expect(positions[id].y).toBeGreaterThanOrEqual(35);
      expect(positions[id].y).toBeLessThanOrEqual(500 - 35);
    }
  });

  it("matches the 8-node snapshot (regression guard)", () => {
    const nodes = [
      { id: "name-lincoln" },
      { id: "name-tesla" },
      { id: "loc-gettysburg" },
      { id: "loc-belgrade" },
      { id: "date-1865-04-14" },
      { id: "date-1943-01-07" },
      { id: "book-walden" },
      { id: "today" },
    ];
    const positions = round(computeLayout(nodes, [], { width: 800, height: 500 }));
    expect(positions).toEqual(__SNAPSHOT_8__);
  });
});

describe("createLayoutSimulation", () => {
  it("exposes step, getPositions, and isSettled and advances on step()", () => {
    const sim = createLayoutSimulation([{ id: "a" }, { id: "b" }], [], { iterations: 5 });
    expect(typeof sim.step).toBe("function");
    expect(typeof sim.getPositions).toBe("function");
    expect(typeof sim.isSettled).toBe("function");
    const before = JSON.stringify(sim.getPositions());
    sim.step();
    const after = JSON.stringify(sim.getPositions());
    expect(after).not.toBe(before);
  });

  it("isSettled flips to true once the iteration budget is exhausted", () => {
    const sim = createLayoutSimulation([{ id: "a" }], [], { iterations: 3 });
    expect(sim.isSettled()).toBe(false);
    sim.step(); sim.step(); sim.step();
    expect(sim.isSettled()).toBe(true);
  });

  it("stepping a settled simulation is a no-op", () => {
    const sim = createLayoutSimulation([{ id: "a" }, { id: "b" }], [], { iterations: 2 });
    sim.step(); sim.step();
    const settled = JSON.parse(JSON.stringify(sim.getPositions()));
    sim.step(); sim.step();
    expect(sim.getPositions()).toEqual(settled);
  });
});

describe("edgeJitter", () => {
  it("returns the same offset for the same edge endpoints", () => {
    expect(edgeJitter("a", "b")).toEqual(edgeJitter("a", "b"));
  });

  it("returns different offsets for swapped endpoints", () => {
    // Direction-sensitive on purpose — the engine reports each connection
    // with consistent from/to, so we don't need to canonicalize the pair.
    expect(edgeJitter("a", "b")).not.toEqual(edgeJitter("b", "a"));
  });
});

// Locks current settled output for an 8-node fixture. Updated in phase 5
// alongside any tuning changes.
const __SNAPSHOT_8__ = {
  "book-walden":      { x: 432, y: 94 },
  "date-1865-04-14":  { x: 299, y: 136 },
  "date-1943-01-07":  { x: 385, y: 421 },
  "loc-belgrade":     { x: 558, y: 188 },
  "loc-gettysburg":   { x: 526, y: 352 },
  "name-lincoln":     { x: 436, y: 240 },
  "name-tesla":       { x: 331, y: 308 },
  "today":            { x: 218, y: 263 },
};
