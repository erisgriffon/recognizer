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

  it("matches the 20-node snapshot (regression guard)", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}` }));
    const positions = round(computeLayout(nodes, [], { width: 800, height: 500 }));
    expect(positions).toEqual(__SNAPSHOT_20__);
  });

  it("matches the 50-node snapshot (regression guard)", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}` }));
    const positions = round(computeLayout(nodes, [], { width: 800, height: 500 }));
    expect(positions).toEqual(__SNAPSHOT_50__);
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

// Snapshots lock the settled layout against accidental drift. Regenerate
// these whenever you intentionally tune repulsionK / centeringK / iterations
// / damping in src/lib/layout.js.

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

const __SNAPSHOT_20__ = {"n0":{"x":277,"y":167},"n1":{"x":204,"y":444},"n10":{"x":122,"y":300},"n11":{"x":590,"y":49},"n12":{"x":503,"y":176},"n13":{"x":505,"y":314},"n14":{"x":330,"y":465},"n15":{"x":542,"y":462},"n16":{"x":436,"y":457},"n17":{"x":235,"y":274},"n18":{"x":640,"y":165},"n19":{"x":625,"y":277},"n2":{"x":151,"y":139},"n3":{"x":249,"y":35},"n4":{"x":389,"y":168},"n5":{"x":475,"y":35},"n6":{"x":399,"y":289},"n7":{"x":366,"y":35},"n8":{"x":643,"y":393},"n9":{"x":312,"y":354}};

const __SNAPSHOT_50__ = {"n0":{"x":443,"y":114},"n1":{"x":144,"y":365},"n10":{"x":657,"y":465},"n11":{"x":65,"y":465},"n12":{"x":528,"y":35},"n13":{"x":735,"y":115},"n14":{"x":628,"y":257},"n15":{"x":523,"y":314},"n16":{"x":614,"y":370},"n17":{"x":583,"y":465},"n18":{"x":321,"y":385},"n19":{"x":227,"y":35},"n2":{"x":735,"y":35},"n20":{"x":415,"y":364},"n21":{"x":607,"y":132},"n22":{"x":228,"y":188},"n23":{"x":333,"y":207},"n24":{"x":735,"y":465},"n25":{"x":735,"y":392},"n26":{"x":310,"y":35},"n27":{"x":156,"y":127},"n28":{"x":500,"y":392},"n29":{"x":539,"y":232},"n3":{"x":595,"y":35},"n30":{"x":65,"y":35},"n31":{"x":65,"y":285},"n32":{"x":365,"y":465},"n33":{"x":360,"y":125},"n34":{"x":65,"y":113},"n35":{"x":384,"y":35},"n36":{"x":148,"y":35},"n37":{"x":266,"y":106},"n38":{"x":697,"y":180},"n39":{"x":435,"y":465},"n4":{"x":230,"y":372},"n40":{"x":141,"y":465},"n41":{"x":352,"y":295},"n42":{"x":65,"y":197},"n43":{"x":510,"y":465},"n44":{"x":735,"y":248},"n45":{"x":217,"y":465},"n46":{"x":716,"y":322},"n47":{"x":291,"y":465},"n48":{"x":435,"y":240},"n49":{"x":249,"y":280},"n5":{"x":665,"y":35},"n6":{"x":513,"y":152},"n7":{"x":458,"y":35},"n8":{"x":65,"y":377},"n9":{"x":150,"y":251}};
