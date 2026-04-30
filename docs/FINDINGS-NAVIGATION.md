# Feature: Findings Navigation

A handoff doc for making the findings list navigable: sorted by strength,
filterable by strength floor, and selectable via the corkboard. Covers
three phases that ship as one cohesive feature.

## Why this matters

Deep mode for numerology produces a lot of findings — tens to hundreds for
realistic case files. Without sort or filter, finding the *interesting*
findings becomes a needle-in-haystack problem, which undercuts the whole
"investigator dramatically reveals patterns" energy. The dossier is fine
(it's an artifact, not a navigation tool), but the in-app findings list
needs help.

There's also a latent bug: findings aren't currently sorted at all. They
emerge in connection-engine insertion order, which is roughly by category
but not by strength. A TRIVIAL match can sit above a SUSPICIOUS one
purely because of for-loop ordering. Surface mode hid this; Deep mode
exposed it.

## Scope

Three phases shipping together as one feature:

1. **Sort findings by strength descending.** Bug fix, not a feature.
2. **Strength-floor filter.** "Show: All / Notable+ / Striking+ / Suspicious only."
3. **Click-to-highlight on the corkboard.** Click a node, the findings list
   filters to connections involving that node and the corkboard visually
   emphasizes the selection.

A potential phase 4 (group findings by kind in collapsible sections) is
**out of scope** for this batch. We'll see if phases 1-3 alone make Deep
mode comfortable; if not, we revisit grouping.

## Forward-compatibility constraint

We're going to add depth selectors for other categories soon (astrology
first, probably). The findings navigation built here must NOT assume
numerology is special. Specifically:

- The strength filter operates on `connection.strength` only — never on
  `connection.kind` or category. New kinds added in the future automatically
  participate in filtering without any changes here.
- The selected-node logic operates on `connection.from` and `connection.to`
  — it doesn't care what kind of connection. New kinds work for free.
- No hard-coded list of kinds anywhere in this feature. If you find yourself
  writing one, stop and find a different approach.

The strength values live in `connections.config.js` already, so they're
the single source of truth for tier boundaries. Use `TIERS` from that
file for the filter UI labels — don't duplicate the tier names anywhere.

## Phase 1: Sort by strength descending

**The fix.** Sort the connections array by strength descending, with
insertion order as the stable tiebreaker, before rendering. JavaScript's
`Array.prototype.sort` is stable in all current engines, so a simple
sort by strength preserves insertion order within equal-strength groups.

**Where to apply it.** In `Recognizer.jsx`, the `connections` value is
produced by `useMemo(() => findConnections(...))`. Wrap or extend that
memo to sort:

```js
const connections = useMemo(() => {
  const raw = findConnections(effectiveNodes, settings);
  return [...raw].sort((a, b) => b.strength - a.strength);
}, [effectiveNodes, settings]);
```

Note: do NOT sort inside `findConnections` itself. The engine's job is
to find connections; ordering them is a presentation concern. Keeping
that boundary clean means the engine stays a pure-function-of-nodes
without any knowledge of how findings are displayed.

The dossier generator already iterates the connections array in order,
so it'll automatically produce a strength-sorted dossier too. That's
the desired behavior — the dossier should lead with the strongest
findings.

**Tests.** Three new cases in the existing connections test file:

1. Given a fixture of mixed-strength connections in a known shuffled
   order, assert the sorted output is monotonically descending in strength.
2. Given two connections with identical strength, assert their relative
   order is preserved (insertion order tiebreaker).
3. Given an empty connections array, assert the sort doesn't blow up.

Don't test that `findConnections` itself sorts — that's the wrong place.
Test the sort in the component layer or, better, extract the sort into
a named helper in `connections.js`:

```js
export const sortConnectionsByStrength = (connections) =>
  [...connections].sort((a, b) => b.strength - a.strength);
```

Then both the component and the tests use the helper.

## Phase 2: Strength-floor filter

**The UX.** A single `<select>` at the top of the findings section, four
options: "Show all," "Notable and above," "Striking and above," "Suspicious
only." Default is "Show all" — users discover the filter rather than
being surprised by hidden findings on first visit.

**The state.** A new piece of component state in `Recognizer.jsx`:

```js
const [strengthFloor, setStrengthFloor] = useState(0);
```

The value is a number (0, 0.5, 0.7, 0.9) corresponding to "show all,"
"notable+," "striking+," "suspicious only." Use the same threshold values
as the existing tiers — pull them from `TIERS` in `connections.config.js`
to avoid duplication.

**The filter.** Apply after the sort, in another memo:

```js
const visibleConnections = useMemo(
  () => connections.filter(c => c.strength >= strengthFloor),
  [connections, strengthFloor]
);
```

The `connections` array remains complete; `visibleConnections` is the
display-filtered subset. Crucially:

- The dossier always uses `connections`, not `visibleConnections`. The
  filter is a viewing convenience; the dossier is a complete record.
- The corkboard map can use either, but I lean toward `connections` —
  the corkboard's visual density is part of its information value,
  filtering the cork board would be confusing.
- The findings list uses `visibleConnections`.

**The UI.** Add the select element above the findings list. Suggested
placement: same row as the existing findings header, right-aligned:

```jsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
  <h3 style={sectionHeader}>↯ CROSS-REFERENCES DETECTED ({visibleConnections.length}{visibleConnections.length !== connections.length ? ` of ${connections.length}` : ""})</h3>
  <select
    value={strengthFloor}
    onChange={e => setStrengthFloor(parseFloat(e.target.value))}
    style={{
      background: "#0f0a06", border: "1px solid #6b4a2a",
      color: "#e8dcc4", padding: "4px 8px", fontSize: 11,
      fontFamily: "inherit", letterSpacing: "0.1em",
    }}
  >
    <option value={0}>Show all</option>
    <option value={0.5}>Notable and above</option>
    <option value={0.7}>Striking and above</option>
    <option value={0.9}>Suspicious only</option>
  </select>
</div>
```

Note the count display: when filtered, it reads "12 of 47" instead of
just "47", so the user always knows there's more available.

**Edge case.** When `visibleConnections.length === 0` but
`connections.length > 0`, show a small "No findings at this strength
level. Try lowering the floor." message instead of the existing empty
state. The empty state for a genuinely empty case file should still
read as it does now.

**Tests.** Pure-function tests on a `filterByStrengthFloor` helper that
takes (connections, floor) and returns the filtered array:

1. Floor 0 returns all connections.
2. Floor 0.9 returns only strength ≥ 0.9.
3. Connections AT the floor value pass (≥, not >).
4. Empty input returns empty output.
5. The original array isn't mutated.

About 5 tests.

## Phase 3: Click-to-highlight on the corkboard

This is the bigger lift. Roughly 100-150 lines including styling.

### Behavior

- Click an empty area of the corkboard: nothing selected.
- Click a node: that node becomes the selected node.
- Click the same node again: deselect.
- Click a different node: switches selection.

When a node is selected:
- The findings list filters to only connections where `from === selectedId`
  or `to === selectedId`. This filter stacks on top of the strength-floor
  filter — both apply.
- On the corkboard, the selected node is visually emphasized (slightly
  larger, with a glow effect or a brighter outline). Other nodes dim
  slightly. Edges to/from the selected node draw at full opacity; other
  edges draw faded.
- Above the findings list, show a small "viewing connections for: NAME ✕"
  indicator with a click target to clear selection.

When no node is selected, everything renders as it does today.

### State and pure helpers

In `Recognizer.jsx`:

```js
const [selectedNodeId, setSelectedNodeId] = useState(null);

// Filter pipeline: sort -> strength floor -> selected node
const visibleConnections = useMemo(() => {
  let result = connections.filter(c => c.strength >= strengthFloor);
  if (selectedNodeId) {
    result = result.filter(c => c.from === selectedNodeId || c.to === selectedNodeId);
  }
  return result;
}, [connections, strengthFloor, selectedNodeId]);
```

Add a pure helper to `connections.js` for testability:

```js
export const connectionsForNode = (connections, nodeId) =>
  connections.filter(c => c.from === nodeId || c.to === nodeId);
```

Use this helper in the memo. The memo itself isn't testable, but the
helpers it composes are.

### Canvas hit-testing

The existing `ConnectionMap` component renders nodes at positions stored
in its own `positions` state. To support clicks, we need to:

1. Lift the positions out of internal state, OR expose them via a callback,
   OR have the canvas perform hit-testing internally and emit a click event.

Option 3 is cleanest. The canvas knows where it drew the nodes; it can
also know when a click hits one. Add a click handler:

```jsx
const handleClick = (e) => {
  const rect = canvasRef.current.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Check each node's drawn rect (60px wide, 30px tall, centered at position)
  for (const node of nodes) {
    const p = positions[node.id];
    if (!p) continue;
    if (Math.abs(x - p.x) < 60 && Math.abs(y - p.y) < 30) {
      onNodeClick?.(node.id);
      return;
    }
  }
  // Click on empty area
  onNodeClick?.(null);
};
```

The hit boxes are slightly generous (the visual cards are 120×60 but
including tilt and shadow makes the tap target reasonably forgiving).
That's fine; over-generous hit targets are better UX than over-precise
ones, especially on touch devices.

`ConnectionMap` accepts a new `onNodeClick` prop and a `selectedNodeId`
prop (so it knows which node to emphasize). Both are optional — if either
is missing, the component renders as today.

### Visual treatment of selection

Two render passes might make sense here, but for simplicity the existing
single-pass effect can be modified:

```js
// Inside the existing useEffect that draws everything:

const isSelected = (nodeId) => nodeId === selectedNodeId;
const isIncident = (connection) =>
  connection.from === selectedNodeId || connection.to === selectedNodeId;

// When drawing edges:
connections.forEach((c) => {
  // ... existing position lookup
  let alpha = 0.3 + c.strength * 0.5;
  if (selectedNodeId && !isIncident(c)) alpha *= 0.25; // dim non-incident
  ctx.strokeStyle = `rgba(170, 30, 30, ${alpha})`;
  // ... rest of existing edge drawing
});

// When drawing nodes:
nodes.forEach((node) => {
  // ... existing position and tilt
  const selected = isSelected(node.id);
  if (selected) {
    // Draw a glow behind the card before the shadow
    ctx.shadowColor = "#ffb84d";
    ctx.shadowBlur = 20;
  } else if (selectedNodeId) {
    // Dim non-selected nodes when something IS selected
    ctx.globalAlpha = 0.5;
  }
  // ... existing card drawing
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
});
```

The exact visual style can be iterated once it's running. Start with
"selected node has a warm glow, non-selected dim slightly, non-incident
edges fade more aggressively" and adjust if it doesn't read well.

### Selection clear UI

Above the findings list, when `selectedNodeId` is set, show a small
indicator:

```jsx
{selectedNodeId && (() => {
  const node = effectiveNodes.find(n => n.id === selectedNodeId);
  if (!node) return null;
  return (
    <div style={{
      padding: "8px 12px",
      marginBottom: 8,
      background: "rgba(170, 30, 30, 0.15)",
      border: "1px dashed #aa1e1e",
      fontSize: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span>
        ⌖ Viewing connections for: <strong>{node.name}</strong>
      </span>
      <button
        onClick={() => setSelectedNodeId(null)}
        style={{ ...buttonStyle, padding: "2px 8px", fontSize: 10 }}
      >
        ✕ CLEAR
      </button>
    </div>
  );
})()}
```

Defensive null-check on the node lookup: if the user removes a node
while it's selected, the selection should clear gracefully rather than
showing a broken indicator. Add this effect:

```js
useEffect(() => {
  if (selectedNodeId && !effectiveNodes.find(n => n.id === selectedNodeId)) {
    setSelectedNodeId(null);
  }
}, [effectiveNodes, selectedNodeId]);
```

### Tests

The pure helpers are testable; the canvas is not. Test what you can:

1. `connectionsForNode(connections, "node-1")` returns only connections
   with `from === "node-1"` or `to === "node-1"`.
2. `connectionsForNode(connections, "nonexistent")` returns empty array.
3. The combined filter pipeline (strength floor + selected node) produces
   the right output for various input combinations. Maybe 3 cases:
   - Selected with no strength filter
   - Strength filter with no selection
   - Both applied (intersection)

About 5 tests for this phase.

The canvas hit-testing and visual treatment are verified manually by
clicking around in the browser. Don't try to test those — the cost of
DOM/canvas testing infrastructure exceeds the value here.

## Combined ship sequence

I recommend shipping this as three separate commits within one branch,
rather than one big commit. Each phase is independently verifiable:

1. **Commit 1: Sort findings by strength.** Add the helper, use it,
   add three tests. `npm test` and `npm run build` pass.
2. **Commit 2: Strength-floor filter.** Add the state, the helper, the
   memo, the UI, five tests. `npm test`/lint/build pass.
3. **Commit 3: Corkboard click-to-highlight.** Add hit-testing to
   `ConnectionMap`, the helper in `connections.js`, the selection state
   in `Recognizer.jsx`, the visual treatment, the indicator UI, five
   more tests. `npm test`/lint/build pass.

Open one PR with all three commits. The reviewer (you) can sanity-check
each commit independently before merging.

## What this doesn't do

- Group findings by kind. Out of scope; revisit if needed after using
  phases 1-3 for a while.
- Filter by kind. Same — possibly never needed if strength filter is
  sufficient.
- Multi-select on the corkboard. Single-select is enough; multi-select
  is a power-user feature that can come later if requested.
- Pin/unpin findings. Not requested; mentioned in case it comes up in
  Code Claude's review.
- Persistent selection across page reloads. The selection is ephemeral
  by design — it's a viewing tool, not a saved state.
- Anything to the dossier. The dossier is a complete-record artifact;
  the filter and selection are UI conveniences only.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to add findings navigation to Recognizer: sort by strength,
filter by strength floor, and click-to-highlight on the corkboard map.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/FINDINGS-NAVIGATION.md` (this doc) for the full design.

The plan is three phases, each shipping as its own commit:

**Phase 1: Sort by strength descending.** Bug fix — findings are
currently in insertion order. Add `sortConnectionsByStrength` helper to
`connections.js`, use it in the Recognizer.jsx memo. Three new tests.

**Phase 2: Strength-floor filter.** Add a single-select dropdown above
the findings list. Filter applies to the in-app list only, not the
dossier (which remains a complete record). Use TIERS from
connections.config.js for label values — don't duplicate. Five new tests
on a `filterByStrengthFloor` helper.

**Phase 3: Click-to-highlight on the corkboard.** Canvas hit-testing in
`ConnectionMap`, selection state in Recognizer.jsx, visual emphasis
(selected node glows, non-selected dim, non-incident edges fade), small
indicator UI with a clear button. Add `connectionsForNode` helper.
Defensive cleanup when selected node is removed. Five new tests on the
pure helpers.

Important constraints:
- Filters and selection apply to the in-app findings list, NOT the
  dossier. Dossier always uses the unfiltered, complete connections array.
- Nothing in this feature should know about specific connection kinds.
  The filter/selection logic operates on `strength`, `from`, and `to`
  fields only. We're going to add depth selectors for astrology and
  other categories later, and this navigation needs to work with new
  connection kinds without modification.
- Don't sort inside `findConnections` itself. Sorting is a presentation
  concern; the engine stays pure.
- Run `npm test`, `npm run lint`, `npm run build` after each commit.
  Ship only when all three pass.

Please confirm the plan, flag any concerns, and proceed phase by phase.
The visual styling for Phase 3 is suggestive — feel free to iterate on
it if the first attempt doesn't read well, but stay within the existing
aesthetic (red/amber accents, no new colors).

---
