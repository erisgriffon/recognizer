# Feature: Astrology Depth

A handoff doc for adding a user-facing astrology depth setting to
Recognizer, following the same four-tier pattern shipped for numerology.
Replaces the existing `enableAstrology` boolean toggle with an
Off / Surface / Standard / Deep selector.

## Why this matters

The current astrology system fires only when two zodiac-bearing nodes
share an element (fire/earth/air/water). That's a single check producing
one kind of connection. Real astrology — the kind a credulous
investigator would *enthusiastically* engage with — has many more layers,
and engaging with them at depth is exactly the joke the investigator's
voice was built for.

This is also the second category to get the depth treatment, which
validates whether the pattern generalizes. If astrology depth ships
cleanly and feels distinct from numerology depth in actual use, we'll
know the abstraction is real and lexical/geographic become quick
follow-ups using the same recipe.

## Scope

Replace `enableAstrology: boolean` with `astrologyDepth: 0 | 1 | 2 | 3`
following the established four-tier pattern. Add three new connection
kinds at Standard, two more at Deep, plus a Mercury-retrograde table.

**Out of scope:**
- Real natal charts (need birth time and ephemeris data)
- Houses (same)
- Personalized horoscope generation
- The Investigator Mode preset selector tying all depths together —
  that's the next-next step, after lexical and geographic depths also
  exist independently.

## What each tier does

| Tier     | Element | Modality | Ruler | Aspects | Mercury Retro |
|----------|---------|----------|-------|---------|---------------|
| Off      | —       | —        | —     | —       | —             |
| Surface  | ✓       | —        | —     | —       | —             |
| Standard | ✓       | ✓        | ✓     | —       | —             |
| Deep     | ✓       | ✓        | ✓     | ✓       | ✓             |

- **Off:** No astrology. No connections, no zodiac-derived facts in
  rephrasers. Equivalent to current `enableAstrology: false`.
- **Surface (current):** element-only matching. Two signs sharing fire/earth/air/water.
- **Standard:** adds modality (cardinal/fixed/mutable) and ruling-planet matches.
  Same algorithm shape as elements, just different lookup tables.
- **Deep:** adds aspect detection between signs (conjunction, opposition,
  trine, square, sextile) computed from sign midpoints. Plus Mercury
  retrograde firing on any date node whose date falls during a retrograde
  period.

## The astrological data tables

All of this lives in a new module: `src/lib/astrology.js` (separate from
`dates.js` because it's a substantial body of data and logic). The
existing `ZODIAC_ELEMENTS` and `zodiacCompatible` move here.

### Element table (already exists, just relocated)

```js
export const ZODIAC_ELEMENTS = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};
```

### Modality table (new)

```js
export const ZODIAC_MODALITIES = {
  Aries: "cardinal", Cancer: "cardinal", Libra: "cardinal", Capricorn: "cardinal",
  Taurus: "fixed", Leo: "fixed", Scorpio: "fixed", Aquarius: "fixed",
  Gemini: "mutable", Virgo: "mutable", Sagittarius: "mutable", Pisces: "mutable",
};
```

### Ruling planet table (new)

```js
// Traditional rulerships. Modern astrology assigns Pluto to Scorpio,
// Neptune to Pisces, Uranus to Aquarius, but we use the traditional
// scheme because (a) two-signs-per-planet creates more match opportunities
// and (b) the investigator would obviously prefer the older system.
export const ZODIAC_RULERS = {
  Aries: "Mars", Scorpio: "Mars",
  Taurus: "Venus", Libra: "Venus",
  Gemini: "Mercury", Virgo: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Sagittarius: "Jupiter", Pisces: "Jupiter",
  Capricorn: "Saturn", Aquarius: "Saturn",
};
```

### Aspect table (new)

Signs occupy 30° each around a 360° wheel. Aspect detection works on
sign-pair angular distances:

```js
const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const signIndex = (sign) => SIGN_ORDER.indexOf(sign);

// Smallest angular distance between two signs, in degrees (0-180).
export const angularDistance = (sign1, sign2) => {
  const i1 = signIndex(sign1), i2 = signIndex(sign2);
  if (i1 < 0 || i2 < 0) return null;
  const diff = Math.abs(i1 - i2);
  const wrapped = Math.min(diff, 12 - diff);
  return wrapped * 30;
};

export const ASPECTS = {
  conjunction: { degrees: 0,   strength: 0.55, label: "conjunct" },
  sextile:     { degrees: 60,  strength: 0.40, label: "sextile" },
  square:      { degrees: 90,  strength: 0.50, label: "square" },
  trine:       { degrees: 120, strength: 0.55, label: "trine" },
  opposition:  { degrees: 180, strength: 0.60, label: "in opposition" },
};

export const aspectBetween = (sign1, sign2) => {
  const dist = angularDistance(sign1, sign2);
  if (dist === null) return null;
  for (const [name, def] of Object.entries(ASPECTS)) {
    if (def.degrees === dist) return { name, ...def };
  }
  return null; // signs aren't in any traditional aspect
};
```

**Aspect strength values are intentional.** Conjunction is two of the
same sign, which is "interesting but expected" given how few signs
exist. Opposition is the strongest because it's the most specific
(only one sign in a 360° circle is in opposition with another). Sextile
is weakest because a 60° relationship is, frankly, not that wild. These
calibrate with the existing tier system: nothing here exceeds 0.6 (the
NEAR threshold), so aspects are always NOTABLE-tier or below in the
findings list. That's the right vibe — aspects are flavor, not
revelation.

### Mercury retrograde table (new)

A static array of retrograde periods. Astronomically computed dates
1900-2030 are well-documented; we hard-code the ranges:

```js
// Mercury retrograde periods. Approximate ranges (within a day or two
// is fine for our purposes — we're not doing precise astrology, we're
// doing the JOKE of precise astrology).
//
// Source: standard astronomical tables. If a user enters a date outside
// this range, the retrograde check simply doesn't fire — graceful degrade.
export const MERCURY_RETROGRADE = [
  // 2020s
  { start: "2025-03-15", end: "2025-04-07" },
  { start: "2025-07-18", end: "2025-08-11" },
  { start: "2025-11-09", end: "2025-11-29" },
  { start: "2026-02-26", end: "2026-03-20" },
  { start: "2026-06-29", end: "2026-07-23" },
  // ... etc
];

export const isMercuryRetrograde = (date) => {
  const iso = date.toISOString().slice(0, 10);
  return MERCURY_RETROGRADE.find(period =>
    iso >= period.start && iso <= period.end
  ) || null;
};
```

**Important note for Code Claude:** this table is research data, not
algorithmic. Build the array of retrograde periods covering at least
1950-2030 from a reliable source (Astrology.com, AstroSeek, or
similar tabulated lists). 1900-2030 is even better. About 90 entries
total for that range — three or four per year. Don't try to compute
these algorithmically; the orbital mechanics are real and we're not
trying to recreate them. A static table is the right answer.

If the table feels too long for the file, split it into
`src/lib/data/mercury-retrograde.js` and import from there.

## Implementation phases

### Phase 1: Module relocation and table additions

Create `src/lib/astrology.js` and move the existing `ZODIAC_ELEMENTS`
and `zodiacCompatible` from `dates.js` into it. Add the new tables:
modalities, rulers, aspects, retrograde.

Add helpers:
- `modalityCompatible(sign1, sign2)` — true when they share a modality
  AND aren't the same sign.
- `sharedRuler(sign1, sign2)` — returns the planet name when they share
  a ruler, else null.
- `aspectBetween(sign1, sign2)` — defined above.
- `isMercuryRetrograde(date)` — defined above.

Update `dates.js` imports to pull from `astrology.js` for the relocated
items. Run existing tests; everything should pass — this is a pure
relocation.

**Tests for this phase:** about 20 cases.
- `ZODIAC_ELEMENTS`, `ZODIAC_MODALITIES`, `ZODIAC_RULERS` each have
  entries for all 12 signs.
- `modalityCompatible("Aries", "Cancer")` → true (both cardinal,
  different signs).
- `modalityCompatible("Aries", "Aries")` → false (same sign, no
  match-against-self).
- `sharedRuler("Aries", "Scorpio")` → "Mars".
- `aspectBetween("Aries", "Aries")` → conjunction.
- `aspectBetween("Aries", "Libra")` → opposition.
- `aspectBetween("Aries", "Leo")` → trine.
- `aspectBetween("Aries", "Cancer")` → square.
- `aspectBetween("Aries", "Gemini")` → sextile.
- `aspectBetween("Aries", "Taurus")` → null (semisextile, not in
  traditional five aspects).
- `isMercuryRetrograde` returns truthy during a known retrograde
  period and null outside one.

### Phase 2: Connection engine integration

Update settings shape. Same migration pattern as numerology:

```js
// OLD: { enableAstrology: boolean }
// NEW: { astrologyDepth: 0 | 1 | 2 | 3 }
```

Migration: `enableAstrology: true` → `astrologyDepth: 1`,
`enableAstrology: false` → `astrologyDepth: 0`. Default for new users
is `1` (Surface) — same as today.

Replace the existing astrology block in `findConnections` with a
depth-aware version:

```js
import { STRENGTH } from "./connections.config";
import { ZODIAC_ELEMENTS, modalityCompatible, sharedRuler, aspectBetween, isMercuryRetrograde } from "./astrology";

// In the engine:
const astroDepth = settings.astrologyDepth ?? 1;

if (astroDepth >= 1) {
  // Surface: element matches
  const zodiacNodes = nodes.filter(n => n.zodiac);
  for (let i = 0; i < zodiacNodes.length; i++) {
    for (let j = i + 1; j < zodiacNodes.length; j++) {
      const a = zodiacNodes[i], b = zodiacNodes[j];
      if (a.zodiac === b.zodiac) continue; // same sign isn't an "element match"
      if (ZODIAC_ELEMENTS[a.zodiac] === ZODIAC_ELEMENTS[b.zodiac]) {
        connections.push({
          from: a.id, to: b.id,
          strength: STRENGTH.ASTROLOGY,
          kind: "astrology",
          a: { nodeName: a.name, zodiac: a.zodiac },
          b: { nodeName: b.name, zodiac: b.zodiac },
          element: ZODIAC_ELEMENTS[a.zodiac],
        });
      }
    }
  }
}

if (astroDepth >= 2) {
  // Standard: also modality and ruler matches
  // (run on the same zodiacNodes, additive — these are independent connection kinds)
  // ... pairwise iteration:
  //   - if modalityCompatible(a.zodiac, b.zodiac), push astrology-modality
  //   - if sharedRuler(a.zodiac, b.zodiac), push astrology-ruler
}

if (astroDepth >= 3) {
  // Deep: also aspects between signs
  // ... pairwise iteration:
  //   - aspectBetween(a.zodiac, b.zodiac) → push astrology-aspect with the aspect data
  //
  // Mercury retrograde: for each date-bearing node, check if its date
  // falls in a retrograde period. This isn't pairwise — it's per-node,
  // producing a "this date was during retrograde" flag. The connection
  // is between the date node and... what? See note below.
}
```

**On the Mercury retrograde connection target:** this is the only thing
in the astrology system that's not a pairwise relationship. A single
date *was during* a retrograde, full stop. There are two ways to handle
this:

1. **As a node-level annotation, not a connection.** Add `mercuryRetrograde:
   {start, end}` as a property on date-bearing nodes when applicable.
   Show it in the table view as a fact ("during Mercury retrograde:
   yes"). Don't generate a connection.

2. **As a pairwise connection between any two date-bearing nodes that
   were both during retrograde periods.** This produces a real
   `astrology-retrograde` connection kind that fits the existing
   findings list pattern.

I recommend **option 2**. It fits the established pattern (everything in
the findings list is a pairwise connection), it produces visible
findings the user can see, and "two of your evidence dates were both
during Mercury retrograde, the most ill-omened time" is genuinely funny
in the investigator's voice. Two unrelated dates both happening to fall
in retrograde windows is the kind of coincidence the app is built to
dramatize.

Strength for retrograde matches: 0.55 (NOTABLE tier). Mercury retrograde
periods cover roughly 12% of the year, so two random dates both falling
in one is... not that rare actually. Strength 0.55 reflects the
modest-but-not-trivial nature.

Multiple-match collapse pattern: unlike numerology where Pythagorean +
Chaldean both matching gets collapsed into a `numerology-double`
connection, astrology's various kinds (element, modality, ruler, aspect)
are *independent observations* that can all be true simultaneously. Two
signs sharing an element AND a modality AND a ruler are three separate
findings, not one combined finding. That's intentional — the
investigator would absolutely list them separately as a way of
*piling on* the apparent significance.

### Phase 3: Narrative rephrasers

Add these to `src/lib/narrative/connection.js`:

```js
"astrology": (c) => pick([
  // existing rephraser, unchanged
  `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) share the elemental affinity of ${c.element}. The ancients held such pairings to be no accident`,
  `under elemental classification, both ${c.a.nodeName} (a ${c.a.zodiac}) and ${c.b.nodeName} (a ${c.b.zodiac}) belong to the ${c.element} signs`,
], hashOf(c.a.zodiac + c.b.zodiac)),

"astrology-modality": (c) => pick([
  `${c.a.nodeName} (${c.a.zodiac}, ${c.modality}) and ${c.b.nodeName} (${c.b.zodiac}, ${c.modality}) share the ${c.modality} modality — a quality the ancients believed governed temperament and disposition`,
  `the ${c.modality} modality unites ${c.a.zodiac} and ${c.b.zodiac}, and therefore unites ${c.a.nodeName} and ${c.b.nodeName}. The reader will note that ${c.modality} signs are traditionally associated with shared psychological tendencies`,
], hashOf(c.a.zodiac + c.b.zodiac + c.modality)),

"astrology-ruler": (c) => pick([
  `both ${c.a.zodiac} and ${c.b.zodiac} fall under the rulership of ${c.planet}. ${c.a.nodeName} and ${c.b.nodeName} are therefore, in the traditional reckoning, governed by the same celestial body`,
  `${c.planet} rules both ${c.a.zodiac} (in ${c.a.nodeName}) and ${c.b.zodiac} (in ${c.b.nodeName}) — a planetary correspondence the investigator finds striking`,
], hashOf(c.a.zodiac + c.b.zodiac)),

"astrology-aspect": (c) => {
  const angleDescriptions = {
    conjunction: "occupying the same sign, the most intimate of astrological relationships",
    sextile: "separated by sixty degrees, a harmonious sextile",
    square: "in square — ninety degrees apart, a tension the ancients regarded with caution",
    trine: "in trine — one hundred and twenty degrees apart, the most auspicious of aspects",
    opposition: "in direct opposition — one hundred and eighty degrees apart, a polarity the ancients considered the most fated",
  };
  const desc = angleDescriptions[c.aspect.name] || `in ${c.aspect.label}`;
  return `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) stand ${desc}. The investigator does not endorse traditional astrological interpretation, but acknowledges the geometric relationship`;
},

"astrology-retrograde": (c) => pick([
  `${c.a.nodeName} and ${c.b.nodeName} both fall within periods of Mercury retrograde — traditionally regarded as the most inauspicious astronomical condition for communication, contracts, and travel. That two of the user's submitted dates align with such periods is, the investigator notes, statistically unsurprising but rhetorically convenient`,
  `Mercury was in retrograde during both ${c.a.nodeName} (${c.a.retrogradeRange}) and ${c.b.nodeName} (${c.b.retrogradeRange}). Make of this what you will`,
], hashOf(c.a.nodeName + c.b.nodeName)),
```

The rephrasers should *commit* to the astrological framing while
maintaining the investigator's careful refusal to fully endorse it. The
phrase "the investigator does not endorse traditional astrological
interpretation, but acknowledges the geometric relationship" — borrowed
from the ley-lines rephraser — works perfectly here for aspects.

A `hashOf(string)` helper for seeding `pick()` is fine; if one doesn't
exist already, a 5-line djb2 implementation in `utils.js` handles it.

### Phase 4: UI integration

Replace the `enableAstrology` checkbox in the Investigative Methods panel
with a four-option select, matching the numerology depth UI exactly:

```jsx
<label style={{ display: "flex", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
  <span style={{ marginRight: 10, minWidth: 200 }}>Astrology depth:</span>
  <select
    value={settings.astrologyDepth}
    onChange={(e) => setSettings(s => ({ ...s, astrologyDepth: parseInt(e.target.value, 10) }))}
    style={selectStyle /* same style as numerology depth */}
  >
    <option value="0">Off</option>
    <option value="1">Surface (elements only)</option>
    <option value="2">Standard (elements, modality, rulers)</option>
    <option value="3">Deep (also aspects and Mercury retrograde)</option>
  </select>
</label>
```

Update the table view to show modality, ruling planet, and retrograde
status on date-bearing nodes when depth ≥ 2 / depth ≥ 3 respectively.
The signs themselves are already shown.

### Phase 5: Tests

About 12 new connection-engine tests:
- `astrologyDepth: 0` produces zero astrology connections.
- `astrologyDepth: 1` produces only `astrology` (element) kinds — same
  as old `enableAstrology: true` behavior.
- `astrologyDepth: 2` produces element + modality + ruler kinds.
- `astrologyDepth: 3` produces element + modality + ruler + aspect +
  retrograde kinds.
- Two same-sign nodes don't produce element matches (already excluded).
- Two same-sign nodes DO produce conjunction-aspect matches at depth 3.
- Aspect detection: each of the five aspects fires for known sign pairs.
- Modality matches don't fire when signs are the same.
- Ruler matches don't fire when signs are the same.
- Mercury retrograde fires for two dates both in retrograde windows.
- Mercury retrograde doesn't fire if either date is outside any window.
- Multiple kinds firing on the same pair (element + modality, etc.)
  produce multiple connections, not one combined connection.

Plus the 20-ish helper tests from Phase 1.

## Forward-compat note

This implementation should make the next two depth additions (lexical
and geographic) feel obvious, not novel. The recipe is:

1. Replace `enableX: boolean` with `xDepth: 0|1|2|3` in settings.
2. Move category-specific tables and helpers to `src/lib/<category>.js`.
3. Add the depth gates in `findConnections`.
4. Add new connection kinds with self-explanatory names and rephrasers.
5. Update the UI to a four-option select using the same styling.
6. Add tests covering each depth tier.

If anything in this astrology implementation feels like it's establishing
a *one-off* pattern rather than a *generalizable* one, flag it before
shipping. The fact that all four depth categories end up looking similar
in code is a feature.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to add an astrology depth setting to Recognizer, replacing the
current `enableAstrology` boolean with a four-tier system. This follows
the same pattern numerology depth established.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/NUMEROLOGY-DEPTH.md` to refresh on the established pattern.
3. `docs/ASTROLOGY-DEPTH.md` (this doc) for the full design.

The plan is five phases:

**Phase 1: New `src/lib/astrology.js` module** with element/modality/ruler/
aspect tables, `modalityCompatible`, `sharedRuler`, `angularDistance`,
`aspectBetween`, and `isMercuryRetrograde` helpers. Move existing
`ZODIAC_ELEMENTS` and `zodiacCompatible` from `dates.js`. About 20 tests.

**Phase 2: Connection engine integration.** Replace the existing
astrology block in `findConnections` with a depth-aware version. Five
connection kinds total: `astrology`, `astrology-modality`,
`astrology-ruler`, `astrology-aspect`, `astrology-retrograde`. Use
strength values from `connections.config.js` — add new STRENGTH keys
following the existing naming pattern. Note Mercury retrograde fires
pairwise when *two* dates are both in retrograde periods.

**Phase 3: Narrative rephrasers** for the four new kinds. The existing
"astrology" rephraser stays. The retrograde and aspect rephrasers
should commit to the astrological framing while preserving the
investigator's careful "does not endorse but acknowledges" stance.

**Phase 4: UI integration** — replace the boolean checkbox with a
four-option select matching the numerology depth UI exactly. Update the
table view to show modality, ruler, and retrograde status when
applicable.

**Phase 5: Tests** — about 12 new engine tests plus the 20 helper tests
from Phase 1.

For Phase 1's Mercury retrograde table: build a static array covering at
least 1950-2030 from a reliable astronomical tabulation (about 90
entries — three or four retrograde periods per year). This is research
data, not algorithmic. If the table feels too long, split it into
`src/lib/data/mercury-retrograde.js`.

Important constraints:
- Keep the multiple-kinds pattern: element + modality + ruler firing on
  the same pair produces three separate findings, not one combined
  finding. Unlike numerology's double-match collapse — astrology's
  layers stack rather than merge.
- The default `astrologyDepth` is 1 (Surface), matching the previous
  default `enableAstrology: true` behavior.
- Migration: existing `enableAstrology: true` becomes `astrologyDepth: 1`;
  `false` becomes `0`.
- Same code patterns as numerology depth — if something here looks like
  it's establishing a *novel* pattern instead of *generalizing* the
  numerology recipe, flag it before shipping.

Run `npm test`, `npm run lint`, `npm run build` after each phase. Commit
with messages like `feat(astrology): phase N — <description>`.

---
