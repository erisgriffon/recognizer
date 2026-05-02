// Force-directed layout for the corkboard. Repulsion-only (no edge attraction)
// plus a weak centering pull, iteration-bounded convergence, fully deterministic
// — same node ids in, same positions out. See docs/CORKBOARD-LAYOUT.md.

const DEFAULTS = {
  width: 800,
  height: 500,
  iterations: 120,
  dt: 1,
  damping: 0.85,
  repulsionK: 6000,
  repulsionCap: 200,
  centeringK: 0.005,
  insetX: 65,
  insetY: 35,
};

const hashString = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
};

// Stable pseudo-random seed from a node id. Not cryptographic — just enough
// for two loads of the same case file to produce the same starting layout.
export const seedPosition = (id, width, height) => {
  const h = hashString(id);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const r = 80 + (((h >>> 16) & 0xff) / 0xff) * 60;
  return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
};

const clampToBounds = (p, width, height, insetX, insetY) => {
  if (p.x < insetX) p.x = insetX;
  else if (p.x > width - insetX) p.x = width - insetX;
  if (p.y < insetY) p.y = insetY;
  else if (p.y > height - insetY) p.y = height - insetY;
};

export function createLayoutSimulation(nodes, connections, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const positions = {};
  const velocities = {};

  const initial = options.initial || {};
  for (const node of nodes) {
    if (initial[node.id]) {
      positions[node.id] = { x: initial[node.id].x, y: initial[node.id].y };
    } else {
      positions[node.id] = seedPosition(node.id, opts.width, opts.height);
    }
    velocities[node.id] = { x: 0, y: 0 };
  }

  let iteration = 0;
  const ids = nodes.map((n) => n.id);

  const step = () => {
    if (iteration >= opts.iterations) return;
    const forces = {};
    for (const id of ids) forces[id] = { x: 0, y: 0 };

    // Pairwise repulsion: 1/d² magnitude, capped so near-overlap doesn't
    // launch nodes off-screen. Symmetric — each pair contributes twice.
    for (let i = 0; i < ids.length; i++) {
      const a = positions[ids[i]];
      for (let j = i + 1; j < ids.length; j++) {
        const b = positions[ids[j]];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          // Coincident nodes: nudge apart deterministically by id-hash sign.
          const tiebreak = (hashString(ids[i] + "|" + ids[j]) & 1) ? 1 : -1;
          dx = tiebreak;
          dy = -tiebreak;
          d2 = 2;
        }
        const d = Math.sqrt(d2);
        let mag = opts.repulsionK / d2;
        if (mag > opts.repulsionCap) mag = opts.repulsionCap;
        const fx = (dx / d) * mag;
        const fy = (dy / d) * mag;
        forces[ids[i]].x += fx;
        forces[ids[i]].y += fy;
        forces[ids[j]].x -= fx;
        forces[ids[j]].y -= fy;
      }
    }

    // Centering pull, linear in distance from center. Weak coefficient —
    // just enough to keep the graph anchored without dominating spread.
    const cx = opts.width / 2;
    const cy = opts.height / 2;
    for (const id of ids) {
      const p = positions[id];
      forces[id].x += (cx - p.x) * opts.centeringK;
      forces[id].y += (cy - p.y) * opts.centeringK;
    }

    for (const id of ids) {
      const v = velocities[id];
      const p = positions[id];
      v.x = (v.x + forces[id].x * opts.dt) * opts.damping;
      v.y = (v.y + forces[id].y * opts.dt) * opts.damping;
      p.x += v.x * opts.dt;
      p.y += v.y * opts.dt;
      // Wall reflection: position clamps, velocity flips on contact.
      if (p.x < opts.insetX) { p.x = opts.insetX; v.x = -v.x; }
      else if (p.x > opts.width - opts.insetX) { p.x = opts.width - opts.insetX; v.x = -v.x; }
      if (p.y < opts.insetY) { p.y = opts.insetY; v.y = -v.y; }
      else if (p.y > opts.height - opts.insetY) { p.y = opts.height - opts.insetY; v.y = -v.y; }
      clampToBounds(p, opts.width, opts.height, opts.insetX, opts.insetY);
    }

    iteration++;
  };

  return {
    step,
    getPositions: () => positions,
    isSettled: () => iteration >= opts.iterations,
    getIteration: () => iteration,
  };
}

// Stable per-edge jitter for the corkboard's curved strings. Same (fromId,
// toId) always returns the same offset, so paint-to-paint flicker stops and
// shared URLs render identically. Direction-sensitive: edgeJitter("a","b")
// differs from edgeJitter("b","a") — the engine is consistent about
// connection orientation, so we don't need to canonicalize the pair.
export const edgeJitter = (fromId, toId) => {
  const h = hashString(fromId + "|" + toId);
  return {
    x: ((h & 0xff) / 0xff - 0.5) * 8,
    y: (((h >>> 8) & 0xff) / 0xff - 0.5) * 8,
  };
};

// mulberry32 PRNG. Used by the corkboard's aged-paper texture to draw the
// same speckle pattern every render of a given case file. Seed comes from
// the joined node ids in ConnectionMap — different case files get different
// grain, the same case file is reproducible across reloads.
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const seedFromIds = (ids) => hashString(ids.join("|"));

export function computeLayout(nodes, connections, options = {}) {
  const sim = createLayoutSimulation(nodes, connections, options);
  while (!sim.isSettled()) sim.step();
  return sim.getPositions();
}
