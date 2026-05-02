# Feature: Corkboard Layout

A handoff doc for replacing `ConnectionMap`'s circular layout with a
force-directed simulation that settles to stable positions and then
freezes. Five phases shipping as one cohesive feature.

## Why this matters

The corkboard view positions nodes on a circle whose radius is capped at
180px. Below ~10 nodes this is fine. Above ~10 the cards (120×60) start
overlapping along the circumference. Above ~20 it's a mess. The current
implementation also resets every position whenever `nodes.length` changes,
which means adding a single piece of evidence reshuffles the entire
corkboard — disorienting on its own, and actively harmful to the
click-to-highlight feature, which can lose its selection target visually
mid-edit.

There's a second latent issue exposed by reading the file: the edge
curve midpoints use `Math.random()` per render, so the same case file
draws differently on every paint. With shareable URLs in production,
two people loading the same investigation see different corkboards.
This wasn't worth fixing on its own; folded into this feature, it's
free.

## Scope

Five phases shipping together as one feature:

1. **Pure layout module.** Extract a `lib/layout.js` with the force
   simulation, integrator, and convergence — testable in isolation,
   no React, no canvas.
2. **Wire `ConnectionMap` to consume it.** Persist positions by id
   across renders. Warm-start new nodes from the current centroid;
   keep existing nodes where they were.
3. **Animate the settling.** `requestAnimationFrame` loop drives the
   sim for a fixed iteration budget; clicks gated during the animation.
4. **Deterministic seeding.** Remove `Math.random()` from the render
   path entirely. Initial positions and edge curve jitter both derived
   from node ids.
5. **Tuning + regression guards.** Snapshot a few settled-position
   fixtures so the layout is locked in against accidental drift from
   future tuning.

A potential phase 6 (Barnes–Hut for large `n`) is **out of scope** for
this batch. Realistic case files are 5–50 nodes; an O(n²) sim is fine
there. We'll revisit if someone hits a wall above 200.

## Forward-compatibility constraint

The corkboard is going to grow features. Selection lassos, edge labels,
maybe a pin/unpin gesture eventually. The layout built here must NOT
assume anything about *why* a node is on the board:

- The simulation operates on node ids and connection (`from`, `to`)
  pairs only — never on `connection.kind`, `connection.strength`, or
  any node type. New connection kinds and node types automatically
  participate without any changes here.
- The forces are pure-repulsion plus a weak centering pull. No
  attraction along edges. This means the layout depends on node count,
  not connection density — exactly what we want when the investigator
  depth selectors crank connection counts up by 4×.
- No hard-coded list of node types in the layout module. (`ConnectionMap`
  already has a card-color map keyed by node type; that stays where it
  is, in the renderer.)

## A note on the design choice

Three approaches were considered: grid-with-jitter, retry-on-collision
random, and force-directed. We chose force-directed and committed to
two specific tweaks:

- **Repulsion-only, no edge attraction.** Edge attraction sounds
  appealing ("clusters reveal investigation structure!") but in
  Recognizer's data shape — most evidence is multiply-connected at low
  strength — it produces a hairball pulled toward the centroid. The
  visible structure isn't clusters, it's a blob. Repulsion-only spreads
  cards to fill space; *the strings* carry the relational information.
  This also means cranking depth selectors doesn't visibly rearrange
  the corkboard, only adds more strings — much less disorienting.
- **Simulate to convergence, then freeze.** No perpetual sim. Once
  positions stabilize, the loop stops. Clicks are gated during
  settling. This sidesteps the "hit-test against moving target" UX
  problem entirely — a moving card is a hostile click target regardless
  of whether the hit-test is technically correct.

Convergence is **iteration-bounded**, not energy-bounded. Run for a
fixed step budget with velocity damping; stop when the budget is
exhausted. Energy thresholds work great until one input case makes the
sim run for 8 seconds and nobody can reproduce it. Iteration-bounded
is predictable, testable, and visibly behaves the same every time.

## Phase 1: Pure layout module

**Where it lives.** New file `src/lib/layout.js`. No React, no canvas,
no DOM. Pure data in, pure data out — same shape as the rest of `lib/`.

**The shape.** Public API is one function:

```js
/**
 * Run the force simulation to convergence and return final positions.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{from: string, to: string}>} connections - currently unused;
 *   reserved for future use (and to make the signature stable now).
 * @param {Object} [options]
 * @param {{[id: string]: {x: number, y: number}}} [options.initial] -
 *   warm-start positions; missing ids get seeded deterministically.
 * @param {number} [options.width=800]
 * @param {number} [options.height=500]
 * @param {number} [options.iterations=120]
 * @returns {{[id: string]: {x: number, y: number}}}
 */
export function computeLayout(nodes, connections, options) { ... }
```

The `connections` parameter is currently unused — we're repulsion-only
— but goes in the signature now so future work (edge-aware features
like routing or labeling) doesn't have to break callers.

**The forces.**

- **Pairwise repulsion** between every node pair. Force magnitude
  proportional to `1 / distance²`, capped at a maximum so nearly-
  overlapping nodes don't fling each other across the canvas.
- **Centering pull** toward `(width/2, height/2)`. Linear in distance
  from center, very weak coefficient. Just enough to keep things on
  the canvas without dominating the spread.
- **Wall reflection** at canvas edges with a small inset (cards are
  120×60; inset by 65,35 so a card centered at the wall doesn't clip).
  Velocity flips on contact, position clamps.

No edge forces. No gravity. No node-mass variation.

**The integrator.** Velocity-Verlet-ish, damped:

```js
// per step:
applyForces(nodes, positions, velocities);
for (const id of ids) {
  velocities[id].x = (velocities[id].x + forces[id].x * dt) * damping;
  velocities[id].y = (velocities[id].y + forces[id].y * dt) * damping;
  positions[id].x += velocities[id].x * dt;
  positions[id].y += velocities[id].y * dt;
  clampToBounds(positions[id]);
}
```

Suggested starting constants (expect to tune in phase 5):

- `dt = 1` (we're not modeling real time; this is just a step scale)
- `damping = 0.85`
- `repulsionK = 6000` (force = repulsionK / distance², capped at 200)
- `centeringK = 0.005`
- `iterations = 120` (~2s @ 60fps when animated)

**Determinism.** No `Math.random()` anywhere in the module. Seed
positions for nodes not in `options.initial` from a hash of the id —
something simple like:

```js
function seedPosition(id, width, height) {
  // Stable pseudo-random from id; no Math.random.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const angle = (h & 0xffff) / 0xffff * Math.PI * 2;
  const r = 80 + ((h >>> 16) & 0xff) / 0xff * 60;
  return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
}
```

Not cryptographic. Just stable. Two people loading the same case file
get the same initial seed, and after the same iteration count the same
final layout.

**Tests.** New file `src/lib/layout.test.js`:

1. Empty nodes returns `{}`. Doesn't throw.
2. Single node converges to roughly the canvas center (within some
   tolerance — the centering pull dominates with no other nodes).
3. Two nodes end up further apart than they started when seeded close
   together (repulsion works).
4. Determinism: calling `computeLayout` twice with the same inputs
   returns identical positions to within float precision.
5. Warm-start: nodes present in `options.initial` start at those
   positions. Verify by passing positions and using a low iteration
   count — they should still be near where they started.
6. Bounds: after convergence, all positions are within the canvas
   inset bounds. No node escapes.
7. Snapshot test: a fixture of 8 nodes with known ids returns a known
   set of final positions (rounded to integer pixels). This locks in
   the layout against accidental tuning regressions.

About 7 tests. The snapshot one (#7) will need updating in phase 5
when we tune; that's expected and fine.

## Phase 2: Wire `ConnectionMap` to consume it

**The current state shape stays the same.** `ConnectionMap` keeps its
`positions` state. The change is *how* `positions` gets populated:

```js
const [positions, setPositions] = useState({});

// On node set change, recompute layout, warm-starting from existing
// positions. Existing nodes stay roughly where they were; new nodes
// get seeded from their id; removed nodes drop out.
useEffect(() => {
  const initial = {};
  for (const node of nodes) {
    if (positions[node.id]) initial[node.id] = positions[node.id];
  }
  const next = computeLayout(nodes, connections, { initial });
  setPositions(next);
}, [nodes.map(n => n.id).join("|")]); // depend on id set, not nodes ref
```

The dependency on the joined id string (rather than `nodes` directly)
matters: we want the effect to fire when nodes are added or removed,
**not** when something inside a node changes. Edits to `node.numbers`
shouldn't reshuffle the corkboard.

The `connections` arg passes through to `computeLayout` unused for now,
but the prop comes from the same parent so wiring it up costs nothing
and locks in the future-compatible signature.

**Existing position handling for added nodes.** When a node is new,
`computeLayout` will seed it via the hash function and then settle.
That's fine for batch-loaded case files (shared URL hydration). For
the live-add case — user adds one node at a time — the seeded position
might be far from the rest of the cluster. Two options:

- **Seed by id, let the sim settle.** Simpler, deterministic. The new
  card flies to its final position over ~2s.
- **Seed at centroid + small offset.** Less determinism (centroid
  depends on what's already there), but the new card always appears
  "near the action."

Recommend seeding by id. Determinism wins, and the settling animation
makes the entry feel intentional rather than jarring.

**Tests.** None at the component level. The pure helpers in `layout.js`
are tested in phase 1; the canvas wiring is verified manually. (Same
rationale as `FINDINGS-NAVIGATION.md`'s phase 3: cost of canvas testing
infrastructure exceeds the value.)

## Phase 3: Animate the settling

The previous phase computes final positions in one shot. This phase
animates the path *to* those positions so the user sees nodes drift
into place. This is most of the "alive corkboard" feel.

**The mechanism.** Instead of `computeLayout` running all 120 iterations
synchronously, expose a stepper:

```js
// In layout.js, alongside computeLayout:
export function createLayoutSimulation(nodes, connections, options) {
  // Returns { step(), getPositions(), isSettled() }
}
```

`computeLayout` becomes a convenience wrapper that creates a simulation
and steps it `iterations` times before returning the final positions.
That way the synchronous version (used by tests) and the animated
version (used by the component) share one engine.

**The component loop.** `ConnectionMap` runs `requestAnimationFrame`,
calling `step()` once per frame and re-rendering until the sim is
settled (iteration budget exhausted). On settle, the loop stops and
positions are frozen. Click handling re-enables.

```js
const [isSettling, setIsSettling] = useState(false);
const simRef = useRef(null);

useEffect(() => {
  const initial = {};
  for (const node of nodes) {
    if (positions[node.id]) initial[node.id] = positions[node.id];
  }
  simRef.current = createLayoutSimulation(nodes, connections, { initial });
  setIsSettling(true);

  let raf;
  const tick = () => {
    simRef.current.step();
    setPositions({ ...simRef.current.getPositions() });
    if (simRef.current.isSettled()) {
      setIsSettling(false);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [nodes.map(n => n.id).join("|")]);
```

**Click gating.** Two ways to handle this:

- Disable clicks entirely during `isSettling` (set `cursor: 'wait'`,
  ignore click events).
- Allow clicks but advance the sim to completion immediately on click.

Recommend the second. If the user is impatient they shouldn't be
forced to wait; clicking should feel like "OK, done settling, where do
you want to look?" The implementation is one line in `handleClick`:

```js
const handleClick = (e) => {
  if (isSettling) {
    // Snap to settled and let this click fall through next frame.
    while (!simRef.current.isSettled()) simRef.current.step();
    setPositions({ ...simRef.current.getPositions() });
    setIsSettling(false);
    return; // Discard this click; positions just changed.
  }
  // ... existing hit-test logic
};
```

Yes, the user's click is discarded in the settle-snap path. That's
deliberate — the user hasn't seen the final positions yet, so a click
based on mid-flight positions is probably not the click they actually
want. Snapping to settled and letting them click again is honest.

**Performance note.** The render path currently calls `Math.random()`
in the edge-curve midpoint computation every frame. With animation
running, that's 60 jittered curves per second per edge — visually
fizzy in a way the original (one render every state change) wasn't.
Phase 4 fixes this by deriving the jitter from edge ids instead.

**Tests.** Pure helpers only, in `layout.test.js`:

8. `createLayoutSimulation(...)` returns an object with the expected
   methods; calling `step()` advances the simulation.
9. `isSettled()` returns false initially, true after the iteration
   budget is exhausted.
10. Stepping a settled simulation is a no-op (positions don't change).

About 3 tests added to phase 1's file.

## Phase 4: Deterministic seeding and edge jitter

`Math.random()` shouldn't appear in the render path at all. Two places
currently use it:

1. The edge curve midpoint offset (`(Math.random() - 0.5) * 8` for both
   x and y).
2. The aged-paper texture (`for (let i = 0; i < 400; i++) ...`).

**The edge curves.** Replace with a deterministic offset derived from
the edge endpoints:

```js
function edgeJitter(fromId, toId) {
  // Stable per-edge offset in roughly [-4, 4] for x and y.
  let h = 0;
  const s = fromId + "|" + toId;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return {
    x: ((h & 0xff) / 0xff - 0.5) * 8,
    y: (((h >>> 8) & 0xff) / 0xff - 0.5) * 8,
  };
}
```

Apply in the render loop where `mx`/`my` are computed. Same visual
effect — slightly curved strings that don't all run perfectly straight
— but the curve for any given (from, to) pair is now stable.

**The aged-paper texture.** This one is more visually subtle. Each
render currently draws 400 random sub-pixel speckles. Same approach:
derive from a fixed seed (the canvas dimensions, or just literally
the constant `400`) using a small PRNG (mulberry32 or similar — about
8 lines of code). The result: the paper texture looks the same on
every render of the same investigation, instead of shimmering.

This matters because with the animated sim running, the previously-
acceptable "every paint is different" texture flickers visibly. Locking
it down also means the corkboard *as an image* is reproducible, which
is nice for shared URLs.

**Tests.** Determinism tests, in `layout.test.js`:

11. `edgeJitter("a", "b")` returns the same value across calls.
12. `edgeJitter("a", "b")` differs from `edgeJitter("b", "a")` (we want
    the jitter to be edge-direction-sensitive — or not, but the test
    pins down whichever choice we make).

About 2 tests. The paper-texture PRNG is verified by inspection — if
the canvas no longer shimmers, it works.

## Phase 5: Tuning + regression guards

Once phases 1–4 are running, the constants from phase 1 are placeholders.
This phase is the iteration pass: load realistic case files, watch the
settle, tweak constants, repeat.

**What to tune, in priority order:**

1. **`repulsionK` and the cap.** Too high and nodes fly apart, hit walls,
   bounce; too low and they don't separate enough. Eyeball: at 30 nodes,
   no cards should overlap after settling.
2. **`centeringK`.** Too high and everything compresses to the middle;
   too low and nodes drift to the walls. Eyeball: at 5 nodes, the layout
   uses ~60% of the canvas, centered.
3. **`iterations`.** The settle should *look* done in 1–2 seconds.
   Iterations too low and motion is still visible at stop; too high and
   the user waits unnecessarily after visual convergence.
4. **`damping`.** Affects "snappiness." Lower (more damping) feels
   sluggish but stable; higher feels lively but can oscillate. The
   current 0.85 is a reasonable starting point.

**Locking in the result.** After tuning, regenerate the snapshot test
from phase 1 (#7) with the final constants. Add two more snapshots:

- A 20-node fixture's settled positions.
- A 50-node fixture's settled positions.

These exist purely as regression guards. If a future change to the
layout module shifts these positions, the test fails and someone has
to consciously decide whether the change was intended. Without these,
small tuning regressions slip in invisibly.

**Tests.**

13. 20-node fixture snapshot.
14. 50-node fixture snapshot.

About 2 tests. Plus updating #7.

## Combined ship sequence

I recommend shipping this as five separate commits within one branch.
Each phase is independently verifiable:

1. **Commit 1: Pure layout module.** `lib/layout.js`, `lib/layout.test.js`,
   7 tests. `npm test` passes. Nothing visual yet — `ConnectionMap` still
   uses the circular layout.
2. **Commit 2: Wire `ConnectionMap` to consume layout.** Single-shot
   `computeLayout` call replaces the circle. Positions persist by id
   across renders. No animation yet. Visually: nodes appear at their
   final positions immediately on add/remove. Build/test/lint pass.
3. **Commit 3: Animate the settling.** `requestAnimationFrame` loop,
   click-to-snap-and-discard, 3 more tests. Visually: cards drift into
   position over ~2s. Build/test/lint pass.
4. **Commit 4: Deterministic seeding and edge jitter.** Remove
   `Math.random` from render and seeding. Aged-paper texture stops
   shimmering. 2 more tests. Build/test/lint pass.
5. **Commit 5: Tuning and snapshot guards.** Final constants. 2 more
   snapshot tests; update the existing one. Build/test/lint pass.

Open one PR with all five commits. Each commit can be sanity-checked
on its own before merging.

## What this doesn't do

- **Edge attraction.** Decided against; see "A note on the design
  choice." Could revisit if the corkboard ever wants to visually cluster
  by something specific (kind, strength tier), but the current intuition
  is that's the wrong axis to encode in position.
- **Barnes–Hut or quadtree optimizations.** Out of scope. Realistic
  case files are 5–50 nodes; O(n²) is fine. Revisit if someone hits
  200+.
- **User-draggable nodes.** Not requested. Would be a real lift —
  needs drag handles, "fixed" position state per node, sim-aware drag
  (do other nodes flow around the dragged one in real time?). Possibly
  worth it as a future feature, definitely not now.
- **Layout persistence across reloads.** The case file has no
  persistence (see DESIGN.md). Layout is recomputed deterministically
  from node ids on every load, which is good enough — the same case
  file produces the same corkboard.
- **Touch gesture support beyond tap.** Pinch-to-zoom and pan would
  be nice on mobile but are a separate feature and live in
  `ConnectionMap`'s container, not in the layout module.
- **Anything to the dossier.** The dossier is text; corkboard layout
  is irrelevant to it.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to replace the corkboard's circular layout with a force-directed
simulation that settles to stable positions and freezes. Five phases.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/FINDINGS-NAVIGATION.md` — the most recent UI feature; the
   corkboard layout interacts with its click-to-highlight.
3. `docs/CORKBOARD-LAYOUT.md` (this doc) for the full design.

The plan is five phases, each shipping as its own commit:

**Phase 1: Pure layout module.** New `src/lib/layout.js` with
`computeLayout(nodes, connections, options)` and `createLayoutSimulation(...)`.
Repulsion-only forces (no edge attraction), centering pull, iteration-bounded
convergence, deterministic seeding from node ids. 7 tests in
`src/lib/layout.test.js`, including a snapshot test for an 8-node fixture.

**Phase 2: Wire `ConnectionMap` to consume it.** Replace the circular
layout effect with a `computeLayout` call. Positions persist by id
across renders so adding a node doesn't reshuffle the rest. No
animation yet — single-shot.

**Phase 3: Animate the settling.** `requestAnimationFrame` loop driving
`createLayoutSimulation.step()` per frame. Clicks during settling
snap to final and discard; user re-clicks. 3 more tests on the
simulation stepper.

**Phase 4: Deterministic seeding and edge jitter.** Remove all
`Math.random()` from the render path: edge curve midpoints derive
from a hash of (fromId, toId), and the aged-paper texture uses a
small seeded PRNG. 2 more tests on the edge jitter helper.

**Phase 5: Tuning and snapshot guards.** Iterate on `repulsionK`,
`centeringK`, `iterations`, `damping` against realistic case files.
Lock in with snapshot tests at 8/20/50 nodes (update phase 1's
snapshot, add two more).

Important constraints:
- The layout module is pure: no React, no canvas, no DOM. Take nodes
  in, return positions out. Same layering rule as the rest of `lib/`.
- Repulsion-only. Don't add edge attraction even if it looks tempting.
  See the design note in the doc — it makes connection-density changes
  visibly rearrange the corkboard, which is bad UX during depth-slider
  changes.
- Iteration-bounded convergence, not energy-bounded. Predictable and
  testable.
- No `Math.random()` anywhere by the end of phase 4. Two people loading
  the same case file via shared URL must see the same corkboard.
- Don't lift positions out of `ConnectionMap`. Keep them in component
  state. Parent only knows about node ids.
- The `connections` parameter to `computeLayout` is currently unused
  but goes in the signature now for stability.
- Run `npm test`, `npm run lint`, `npm run build` after each commit.
  Ship only when all three pass.

Please confirm the plan, flag any concerns, and proceed phase by
phase. Tuning constants in phase 1 are starting points — expect to
adjust them in phase 5 once you can see realistic case files settle.

---
