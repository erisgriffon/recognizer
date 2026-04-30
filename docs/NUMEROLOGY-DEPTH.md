# Feature: Numerology Depth

A handoff doc for adding a user-facing numerology depth setting to Recognizer.
Replaces the existing `enableNumerology` boolean toggle with a four-tier
selector: Off / Surface / Standard / Deep.

## Scope

This is **scoped tightly to numerology only**. The other three soft-toggles
(anagrams, astrology, ley-lines) keep their boolean shape for now. The
Investigator Mode preset selector that ties all categories together is a
future step; this is the first piece of that future architecture.

## What each tier does

| Tier     | Pythagorean | Chaldean | Deep (every fact reduces) |
|----------|-------------|----------|---------------------------|
| Off      | —           | —        | —                         |
| Surface  | ✓ (current) | —        | —                         |
| Standard | ✓           | ✓        | —                         |
| Deep     | ✓           | ✓        | ✓                         |

- **Off:** No numerology. No facts produced, no connections made, no
  numerology row in the table view, no numerology section in the today
  banner. Equivalent to the old `enableNumerology: false`.
- **Surface:** What we have today. One Pythagorean reduction per node,
  computed from the node's display name (or whatever string each extractor
  decided to numerologize). Connection kind: `numerology`.
- **Standard:** Adds Chaldean reduction as a *separate* fact with its own
  letter-to-digit mapping (different values than Pythagorean, so it produces
  a second independent number). New connection kind: `numerology-chaldean`.
  When two nodes match on *both* Pythagorean and Chaldean, the engine emits
  one combined `numerology-double` connection with higher strength rather
  than two separate findings.
- **Deep:** Adds reduction of every numeric fact on the node (year, day,
  population, height, char count, etc.) into single digits. Each reduced
  number becomes its own numerology-eligible value, and connections fire
  when two nodes' reduced-fact sets share digits. Deliberately produces a
  lot of low-strength noise — that's the unhinged option.

## Chaldean letter values

Chaldean numerology assigns letters to digits 1–8 (not 1–9 like Pythagorean).
The number 9 is considered sacred and is reserved. The mapping is:

```
1: A I J Q Y
2: B K R
3: C G L S
4: D M T
5: E H N X
6: U V W
7: O Z
8: F P
```

Reduction rules are the same as Pythagorean: sum the letter values, reduce
to a single digit, **except** preserve master numbers 11, 22, and 33 (some
Chaldean traditions only preserve 11 and 22; either is defensible — match
Pythagorean's [11, 22] for consistency unless you have a reason otherwise).

The number 9 *can* appear as a final reduced value (e.g. 27 → 9). It's only
the letter-to-digit mapping that excludes 9, not the result space.

## Implementation plan

### Phase 1: Constants extraction (do this first, even before depth)

Pull strength and tier values out of inline literals in
`src/lib/connections.js` into a config module. This is the named-constants
work we discussed separately — it's a prerequisite for adding new connection
kinds cleanly.

**Create `src/lib/connections.config.js`:**

```js
// Single source of truth for connection-engine tuning. Threshold tests
// reference these constants; CLAUDE.md documents the rationale.

export const STRENGTH = {
  EXACT: 1.0,
  NUMEROLOGY: 0.85,
  NUMEROLOGY_CHALDEAN: 0.75,    // slightly weaker than Pythagorean
  NUMEROLOGY_DOUBLE: 0.95,      // both systems agree — quite striking
  NUMEROLOGY_DEEP: 0.35,        // deliberately weak; deep tier is volume
  NEAR: 0.6,
  NEAR_YEAR: 0.45,
  MULTIPLE: 0.4,
  STYLOMETRIC: 0.55,
  WORD_OVERLAP: 0.5,
  WEEKDAY_CLUSTER: 0.7,
  ASTROLOGY: 0.45,
  NAME_MENTION: 0.9,
  NAME_IN_FILENAME: 0.9,
  TODAY_MENTION: 0.95,
  DISTANCE: 0.7,
  DISTANCE_MATCH: 0.95,
  LEY_LINE: 0.8,
  COLOR_MATCH: 0.7,
  ANAGRAM: 0.95,
  NEAR_ANAGRAM: 0.5,
  WORDCOUNT_YEAR: 0.95,
};

export const TIERS = [
  { min: 0.9, name: "SUSPICIOUS", color: "#ffb84d" },
  { min: 0.7, name: "STRIKING",   color: "#d6a85f" },
  { min: 0.5, name: "NOTABLE",    color: "#a89070" },
  { min: 0.0, name: "TRIVIAL",    color: "#888888" },
];

export const NUMERIC_THRESHOLDS = {
  EXACT_MIN: 9,
  NEAR_MIN: 20,
  NEAR_DELTA: 2,
  MULTIPLE_MIN_SMALL: 5,
  MULTIPLE_MAX: 12,
  MULTIPLE_MAX_YEAR: 3,
};
```

Then update `connections.js` to import from this module and replace every
inline literal. The existing test suite should pass unchanged — this is
pure refactor, no behavior change.

Update `strengthTier` in `connections.js` to iterate over `TIERS` instead of
chained ifs:

```js
import { TIERS } from "./connections.config";

export const strengthTier = (s) => {
  for (const t of TIERS) if (s >= t.min) return t.name;
  return TIERS[TIERS.length - 1].name;
};
```

The tier-color lookup in the rendering layer should also use this same
TIERS array — single source of truth.

**Tests for this phase:** the existing 43 tests should continue to pass
without modification. If any reference inline literals, update them to
reference the named constants. Add one new test that asserts the
`STRENGTH` object has all the keys the engine uses (catches typos in
future additions).

### Phase 2: Chaldean numerology

Add Chaldean to `src/lib/numerology.js` as a parallel function to the
existing `numerologyOf`:

```js
const CHALDEAN_VALUES = {
  a:1, i:1, j:1, q:1, y:1,
  b:2, k:2, r:2,
  c:3, g:3, l:3, s:3,
  d:4, m:4, t:4,
  e:5, h:5, n:5, x:5,
  u:6, v:6, w:6,
  o:7, z:7,
  f:8, p:8,
};

const chaldeanValue = (ch) => CHALDEAN_VALUES[ch.toLowerCase()] || 0;

export const chaldeanNumerologyOf = (str) => {
  const cleaned = stripDiacritics(str || "").replace(/[^a-zA-Z]/g, "");
  if (!cleaned) return null;
  const sum = cleaned.split("").reduce((a, c) => a + chaldeanValue(c), 0);
  return { sum, reduced: reduceNumber(sum), source: cleaned, system: "chaldean" };
};
```

Mark the existing `numerologyOf` as Pythagorean explicitly:

```js
export const pythagoreanNumerologyOf = numerologyOf; // alias for clarity
```

Keep `numerologyOf` as the primary export (Surface tier still uses it) but
add the alias so Standard-tier code reads as intentional.

**Tests:** Add Vitest cases for `chaldeanNumerologyOf` covering:
- A known input/output pair (e.g. "TESLA" → specific sum and reduced)
- Master number preservation (11 and 22)
- That 9 can be a final result but never a letter value
- Unicode handling (diacritics stripped consistently with Pythagorean)
- Empty/invalid input returns null

About 5 tests total for this module.

### Phase 3: Node shape — store both numerology values

Currently each node has a single `numerology` field set by its extractor. We
need to support both Pythagorean and Chaldean values per node, *and* the
deep-tier fact-reduction set.

**Update the node shape:**

```js
{
  // ... existing fields
  numerology: {
    pythagorean: { sum, reduced, source } | null,
    chaldean:    { sum, reduced, source } | null,
    deepReduced: { [factLabel]: reducedDigit } | null,
  } | null,
}
```

**Update every extractor that currently sets `numerology`:**
- `wikipedia.js` — name nodes use the display name string
- `extractors/today.js` — today node uses date-derived string
- `audio.js` — title + artist
- `image.js` — color hex string concat
- `extractors/misc.js` (URL, book) — domain or title+author
- `text.js` (within text node creation in Recognizer.jsx) — text snippet
- Location nodes (in Recognizer.jsx) — location name
- Date nodes (in Recognizer.jsx) — label + ISO digits

In each, replace the `numerology: numerologyOf(string)` pattern with:

```js
import { pythagoreanNumerologyOf, chaldeanNumerologyOf } from "../numerology";

// At node creation:
numerology: {
  pythagorean: pythagoreanNumerologyOf(sourceString),
  chaldean: chaldeanNumerologyOf(sourceString),
  deepReduced: null, // populated lazily by connection engine when needed
},
```

The deep-tier reduction is *not* computed at extraction time. It's
expensive (every numeric fact reduced) and depends on `node.numbers`, which
isn't fully populated until extraction completes. Better to compute it in
the connection engine when the depth setting actually requires it, on
nodes that have one. See Phase 4.

### Phase 4: Connection engine — depth-aware numerology

Update the settings shape:

```js
// OLD:
{ enableNumerology: boolean }

// NEW:
{ numerologyDepth: 0 | 1 | 2 | 3 }
// 0 = Off, 1 = Surface, 2 = Standard, 3 = Deep
```

Migration in the Recognizer component: existing `enableNumerology: true`
becomes `numerologyDepth: 1` (Surface), `false` becomes `0` (Off). The
default for new users is `1` (Surface) — same as today's default behavior.

In `findConnections`, replace the existing numerology block with a
depth-aware version:

```js
import { STRENGTH } from "./connections.config";

// In the engine:
const depth = settings.numerologyDepth ?? 1;

if (depth >= 1) {
  // Surface: Pythagorean matches
  const pythFacts = nodes
    .filter(n => n.numerology?.pythagorean)
    .map(n => ({ nodeId: n.id, nodeName: n.name, ...n.numerology.pythagorean }));

  for (let i = 0; i < pythFacts.length; i++) {
    for (let j = i + 1; j < pythFacts.length; j++) {
      const a = pythFacts[i], b = pythFacts[j];
      if (a.reduced === b.reduced) {
        connections.push({
          from: a.nodeId, to: b.nodeId,
          strength: STRENGTH.NUMEROLOGY,
          kind: "numerology",
          system: "Pythagorean",
          a: { ...a, label: "Pythagorean numerology" },
          b: { ...b, label: "Pythagorean numerology" },
          value: a.reduced,
        });
      }
    }
  }
}

if (depth >= 2) {
  // Standard: also Chaldean. Detect double-matches and merge.
  const chaldeanFacts = nodes
    .filter(n => n.numerology?.chaldean)
    .map(n => ({ nodeId: n.id, nodeName: n.name, ...n.numerology.chaldean }));

  for (let i = 0; i < chaldeanFacts.length; i++) {
    for (let j = i + 1; j < chaldeanFacts.length; j++) {
      const a = chaldeanFacts[i], b = chaldeanFacts[j];
      if (a.reduced !== b.reduced) continue;

      // Check if a Pythagorean match already exists between this pair
      const existingPyth = connections.find(c =>
        c.kind === "numerology" &&
        ((c.from === a.nodeId && c.to === b.nodeId) ||
         (c.from === b.nodeId && c.to === a.nodeId))
      );

      if (existingPyth) {
        // Upgrade to double-system match
        existingPyth.kind = "numerology-double";
        existingPyth.strength = STRENGTH.NUMEROLOGY_DOUBLE;
        existingPyth.chaldeanValue = a.reduced;
      } else {
        connections.push({
          from: a.nodeId, to: b.nodeId,
          strength: STRENGTH.NUMEROLOGY_CHALDEAN,
          kind: "numerology-chaldean",
          system: "Chaldean",
          a: { ...a, label: "Chaldean numerology" },
          b: { ...b, label: "Chaldean numerology" },
          value: a.reduced,
        });
      }
    }
  }
}

if (depth >= 3) {
  // Deep: reduce every numeric fact on every node, find shared digits.
  // Compute lazily on nodes that don't already have deepReduced.
  const reduceFact = (n) => {
    while (n > 9) n = String(n).split("").reduce((s, d) => s + parseInt(d, 10), 0);
    return n;
  };
  const deepFacts = []; // { nodeId, nodeName, factLabel, originalValue, reduced }

  for (const node of nodes) {
    for (const [label, value] of Object.entries(node.numbers || {})) {
      if (typeof value !== "number" || value <= 0) continue;
      deepFacts.push({
        nodeId: node.id, nodeName: node.name,
        factLabel: label, originalValue: value,
        reduced: reduceFact(value),
      });
    }
  }

  for (let i = 0; i < deepFacts.length; i++) {
    for (let j = i + 1; j < deepFacts.length; j++) {
      const a = deepFacts[i], b = deepFacts[j];
      if (a.nodeId === b.nodeId) continue;
      if (a.reduced !== b.reduced) continue;

      connections.push({
        from: a.nodeId, to: b.nodeId,
        strength: STRENGTH.NUMEROLOGY_DEEP,
        kind: "numerology-deep",
        a: { nodeName: a.nodeName, factLabel: a.factLabel, originalValue: a.originalValue, reduced: a.reduced },
        b: { nodeName: b.nodeName, factLabel: b.factLabel, originalValue: b.originalValue, reduced: b.reduced },
        value: a.reduced,
      });
    }
  }
}
```

**Note on deep-tier volume:** This will produce a *lot* of low-strength
connections. With N nodes each having ~10 numeric facts, you have ~10N
deep-reduction values, and the chance of two random numbers reducing to the
same digit is roughly 1/9, so expect ~5N² deep-numerology connections. For a
case file with 5 evidence items, that's ~125 deep connections. The
`STRENGTH.NUMEROLOGY_DEEP` of 0.35 puts them in the TRIVIAL tier so they
don't dominate the dossier visually, but they will inflate the connection
count substantially. This is **intentional** — Deep mode is for users who
want the unhinged volume. Don't add filters to suppress them.

### Phase 5: Narrative

Add new rephrasers in `src/lib/narrative/connection.js`:

```js
"numerology": (c) => {
  // existing rephraser, slightly updated to mention "Pythagorean" explicitly
  // since Chaldean is now also possible
  const showSrc = (s) => s ? (s.length > 16 ? s.slice(0,14).toUpperCase() + "…" : s.toUpperCase()) : "?";
  return pick([
    `${c.a.nodeName}, reduced numerologically (Pythagorean: A=1, B=2, …, I=9, J=1 …), yields ${c.value} (${showSrc(c.a.source)} → digital sum ${c.a.sum} → reduced to ${c.value}); ${c.b.nodeName}, reduced by the same Pythagorean method, yields the identical ${c.value}`,
    `the Pythagorean numerological signatures of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value}`,
  ], c.value * 7);
},

"numerology-chaldean": (c) => {
  const showSrc = (s) => s ? (s.length > 16 ? s.slice(0,14).toUpperCase() + "…" : s.toUpperCase()) : "?";
  return pick([
    `under Chaldean reduction (a system the ancient Babylonians considered more accurate than Pythagorean), ${c.a.nodeName} and ${c.b.nodeName} both yield ${c.value} (${showSrc(c.a.source)} → ${c.a.sum} → ${c.value}, and ${showSrc(c.b.source)} → ${c.b.sum} → ${c.value} respectively)`,
    `the Chaldean numerological values of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value}. The reader should note that Chaldean uses different letter values from the more common Pythagorean system, making this a separate finding`,
  ], c.value * 11);
},

"numerology-double": (c) => {
  return `${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value} under BOTH Pythagorean AND Chaldean numerological reduction — two distinct ancient systems agreeing on the same digit. The investigator submits this without further commentary`;
},

"numerology-deep": (c) => {
  return `the ${c.a.factLabel} of ${c.a.nodeName} (${c.a.originalValue}) and the ${c.b.factLabel} of ${c.b.nodeName} (${c.b.originalValue}) both reduce, by repeated digital summation, to ${c.value}. The investigator notes this with appropriate epistemic humility`;
},
```

The double-match rephraser deserves to feel weightier than the others — two
ancient systems agreeing IS the funnier finding because it's *more*
arbitrary that they line up.

### Phase 6: UI

Replace the `enableNumerology` checkbox in the Investigative Methods panel
with a four-option radio or select. Suggest a select for compactness:

```jsx
<label style={{ display: "flex", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
  <span style={{ marginRight: 10, minWidth: 200 }}>Numerology depth:</span>
  <select
    value={settings.numerologyDepth}
    onChange={(e) => setSettings(s => ({ ...s, numerologyDepth: parseInt(e.target.value, 10) }))}
    style={{
      background: "#0f0a06", border: "1px solid #6b4a2a",
      color: "#e8dcc4", padding: "4px 8px", fontSize: 12,
      fontFamily: "inherit",
    }}
  >
    <option value="0">Off</option>
    <option value="1">Surface (Pythagorean only)</option>
    <option value="2">Standard (Pythagorean + Chaldean)</option>
    <option value="3">Deep (also reduces every numeric fact)</option>
  </select>
</label>
```

Update the table view to show both numerology values when present (Standard
or higher), and the deep-reduction set when Deep is active.

Update the today banner to use `settings.numerologyDepth >= 1` instead of
`settings.enableNumerology` (one-character change semantically — depth ≥ 1
is "include numerology in the cold-open observation").

### Phase 7: Tests

Add Vitest cases for:
- `numerologyDepth: 0` produces zero numerology connections regardless of
  node setup.
- `numerologyDepth: 1` (Surface) matches existing `enableNumerology: true`
  behavior — same connections produced as before.
- `numerologyDepth: 2` (Standard) produces Chaldean connections in addition
  to Pythagorean. Two nodes with matching Chaldean but mismatching
  Pythagorean produce a `numerology-chaldean` connection.
- `numerologyDepth: 2` with both systems matching produces ONE
  `numerology-double` connection, not two separate findings.
- `numerologyDepth: 3` (Deep) produces fact-reduction connections.
- `chaldeanNumerologyOf` produces correct values for known inputs.

Roughly 8-10 new tests. The existing 43 should continue to pass without
modification (the behavior change is gated behind a setting that defaults
to Surface, which is the same as before).

## Migration of existing settings state

The current settings object has `enableNumerology: true`. After this
change, that field is gone — replaced by `numerologyDepth: 1`. There's no
persisted state to migrate (the app doesn't save settings between sessions
yet), so this is a code-only migration.

## Don't ship in this batch

- The other depth categories (anagram, astrology, ley-line). They keep
  their boolean shape. We'll generalize them later if the numerology depth
  pattern proves valuable.
- The Investigator Mode preset selector (Skeptic / Standard / Believer /
  Conspiracy). That's the next-next step, after we have at least two
  category-depths to coordinate.
- Persistence of the numerology depth setting across sessions. localStorage
  for settings is a fine future feature but not part of this work.

## First prompt for Code Claude

Paste this into a fresh Claude Code session in the recognizer repo:

---

I'd like to add a numerology depth setting to Recognizer, replacing the
current `enableNumerology` boolean toggle.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context (you've worked in
   this repo before; refresh on the conventions).
2. `docs/NUMEROLOGY-DEPTH.md` (this doc) for the full design and migration
   plan.

The plan is broken into 7 phases. Phase 1 is a constants extraction
prerequisite; phases 2-6 add the depth feature; phase 7 adds tests.

Important constraints:
- Phase 1 (constants extraction) should produce ZERO behavior change. Run
  the existing 43 tests after this phase and confirm all still pass.
- The default `numerologyDepth` is 1 (Surface), which matches today's
  default `enableNumerology: true` behavior. Existing users see no change
  unless they actively pick a different depth.
- Deep tier is intentionally noisy. Don't add suppression logic.
- After each phase, run `npm test`, `npm run lint`, and `npm run build`.
  Commit only when all three are clean. Use commit messages like
  "feat(numerology): phase N — <description>".

Please confirm you understand the plan, flag any concerns, then proceed
phase by phase. Stop and ask if anything in the design seems wrong rather
than working around it silently.

---
