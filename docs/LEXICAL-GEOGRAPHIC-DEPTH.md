# Feature: Lexical and Geographic Depth

A handoff doc for the final two depth categories. Replaces
`enableAnagrams` and `enableLeyLines` boolean toggles with
`lexicalDepth: 0|1|2|3` and `geographicDepth: 0|1|2|3`, completing the
four-category depth system.

This batches both categories into one handoff because they share so
much pattern with numerology and astrology that splitting them into two
docs would mostly duplicate the structural prose. The implementation
can ship as two distinct PR phases (lexical first, geographic second)
or as one combined PR — Code Claude's call.

After this ships, all four soft-toggle categories use the same
four-tier pattern, and the project is positioned for the Investigator
Mode preset selector that ties them all together.

## Why these two together

The first two depth categories (numerology, astrology) were
*interpretive systems* — multiple traditions of woo applied to the same
data. Lexical and geographic are *measurement systems* — multiple ways
of comparing the same underlying inputs. The depth metaphor still
applies but means something slightly different here: depth controls how
*aggressively* we look for similarity, not which tradition we apply.

That distinction doesn't change the implementation pattern. It does
suggest the rephrasers should lean into the *measurement-precision*
voice rather than the *ancient-tradition* voice — the investigator
becomes more of a forensic analyst at deep tiers, less of a mystic.

## Scope

Replace `enableAnagrams` with `lexicalDepth` and `enableLeyLines` with
`geographicDepth`. Add new connection kinds at Standard and Deep tiers
for each. Migrate the existing toggles cleanly: `enableAnagrams: true`
becomes `lexicalDepth: 1`, `enableLeyLines: true` becomes
`geographicDepth: 1`, both `false` values become `0`.

**Out of scope:**
- Anything requiring a network call beyond what already exists. We
  don't fetch external linguistic or geographic databases.
- Real geocoding precision improvements. The existing Nominatim
  integration is good enough.
- Multi-language phonetic matching beyond what Metaphone handles.
- The Investigator Mode preset selector — next step, after this ships.

## Part 1: Lexical depth

### What each tier does

| Tier     | Word overlap | Letter freq | Anagrams | Phonetic | Stems | Reverse |
|----------|--------------|-------------|----------|----------|-------|---------|
| Off      | —            | —           | —        | —        | —     | —       |
| Surface  | ✓            | ✓           | ✓        | —        | —     | —       |
| Standard | ✓            | ✓           | ✓        | ✓        | —     | —       |
| Deep     | ✓            | ✓           | ✓        | ✓        | ✓     | ✓       |

- **Off:** disables word/letter/anagram/phonetic findings entirely. The
  existing stylometric analysis (text length, sentence count, etc.)
  remains since those are numeric facts in the general pool, not
  lexical-specific.
- **Surface (current):** word/phrase overlap detection between text
  nodes, letter frequency similarity, full anagrams between names.
- **Standard:** adds Metaphone phonetic matching (names/words that
  *sound* alike connect even with different spellings), partial
  anagrams (one name's letters are a subset of another's, useful for
  catching nicknames and shortenings), and trigram similarity for fuzzy
  text-pair matching.
- **Deep:** adds stem-based matching (running/runner/ran), homoglyph
  detection (latin-a vs cyrillic-а), reverse-spelling matches (dog/god),
  and Levenshtein-distance matches for very-similar short strings.

### New module: `src/lib/lexical.js`

Houses the new helpers. Existing anagram functions in
`src/lib/numerology.js` (`anagramSignature`, `multisetEditDistance`)
stay where they are — they're shared infrastructure used by lexical
depth Surface tier. The new module imports them when needed.

```js
import { anagramSignature, multisetEditDistance } from "./numerology";
import { stripDiacritics, tokenize } from "./utils";

/**
 * Metaphone phonetic encoder. Produces a phonetic code for an English
 * word, where words that sound similar produce identical codes.
 *
 * Implementation: standard Metaphone (not Double Metaphone). About 50
 * lines of regex transformations. Many open-source implementations
 * exist; recommend reusing rather than writing from scratch.
 *
 * Suggested approach: vendor the algorithm rather than adding an npm
 * dependency for it. The whole function is ~50 lines and stable.
 */
export const metaphone = (word) => {
  // ... standard Metaphone implementation
};

/**
 * Compute Metaphone codes for a name's tokens, return them as an array.
 * Two names match phonetically if their code arrays share at least one
 * code at the same position (or for short names, any code).
 */
export const phoneticCodes = (name) => {
  return tokenize(name).map(metaphone).filter(Boolean);
};

/**
 * Partial anagram check. Returns true if the smaller of (a, b) is
 * letter-subset of the other — every letter in the smaller string
 * appears at least as many times in the larger string.
 *
 * Useful for "Eliza" being a partial anagram of "Elizabeth", or
 * "Joe" being a partial anagram of "Joseph". Catches nickname/full-name
 * relationships.
 */
export const isPartialAnagram = (a, b) => {
  // ... letter-frequency comparison
};

/**
 * Trigram similarity score between two strings. Returns 0..1 where 1
 * is identical. Two strings sharing many trigrams are textually similar
 * even if not exact matches.
 */
export const trigramSimilarity = (a, b) => {
  // ... standard trigram-Jaccard implementation
};

/**
 * Naive English stem extractor. Strips common suffixes (-ing, -ed,
 * -er, -s, -ly, -tion). Not as accurate as Porter stemmer but small
 * and good enough for our purposes.
 */
export const naiveStem = (word) => {
  // ... regex-based suffix stripping
};

/**
 * Detect if a string contains homoglyphs — characters from non-Latin
 * scripts that look identical to Latin letters. Returns the substituted
 * Latin form for matching purposes.
 *
 * E.g., "Аpple" with Cyrillic А becomes "Apple" for matching.
 */
export const normalizeHomoglyphs = (str) => {
  // ... character-by-character substitution
};

/**
 * Reverse-spelling check. "dog" and "god" match.
 * Trivial implementation but worth its own helper for testability.
 */
export const isReverse = (a, b) => {
  if (!a || !b || a.length < 3) return false;
  return a.toLowerCase() === b.toLowerCase().split("").reverse().join("");
};
```

### Connection engine integration for lexical

Update settings shape:

```js
// OLD: { enableAnagrams: boolean }
// NEW: { lexicalDepth: 0 | 1 | 2 | 3 }
```

Replace the existing anagram-and-text-overlap blocks in
`findConnections` with depth-aware versions. New connection kinds:

- `phonetic-match` (Standard): two names share a Metaphone code.
- `partial-anagram` (Standard): one name's letters are a subset of
  another's.
- `trigram-similarity` (Standard): two text fragments share enough
  trigrams to score above a threshold (suggest 0.4).
- `stem-match` (Deep): two text fragments share a word stem (running
  matches runner).
- `homoglyph-match` (Deep): a name contains non-Latin homoglyphs that,
  when normalized, match another name. Will rarely fire in real use,
  but funny when it does.
- `reverse-spell` (Deep): one name reversed equals another. Will fire
  on a handful of classic cases (dog/god, evil/live, stressed/desserts).

Strength values to add to `connections.config.js`:

```js
LEXICAL_PHONETIC: 0.7,        // sounds-alike is strong signal
LEXICAL_PARTIAL_ANAGRAM: 0.65, // one name contains another's letters
LEXICAL_TRIGRAM: 0.55,        // fuzzy text similarity
LEXICAL_STEM: 0.5,            // shared word root
LEXICAL_HOMOGLYPH: 0.85,      // when this fires it's GENUINELY suspicious
LEXICAL_REVERSE: 0.75,        // reverse-spelling is rare and notable
```

Phonetic matches at 0.7 are STRIKING tier — sounds-alike connections
between submitted names are genuinely interesting and the investigator
should treat them as such. Homoglyph at 0.85 is near-SUSPICIOUS because
homoglyph attacks are *real things* in the security world and the
investigator finding one in submitted evidence is the kind of finding
that should pop visually.

### Lexical rephrasers

Add to `src/lib/narrative/connection.js`:

```js
"phonetic-match": (c) => pick([
  `${c.a.nodeName} and ${c.b.nodeName} produce the identical Metaphone phonetic code (${c.code}). The investigator notes that names converging on identical phonetic signatures are the basis of much classical onomastics`,
  `phonetically encoded, ${c.a.nodeName} and ${c.b.nodeName} are indistinguishable — both reduce to the Metaphone code "${c.code}"`,
], hash(c.a.nodeName, c.b.nodeName)),

"partial-anagram": (c) => pick([
  `the letters of ${c.a.nodeName} form a complete subset of those in ${c.b.nodeName}. Every letter required to spell ${c.a.nodeName} is present, in sufficient quantity, within ${c.b.nodeName}`,
  `${c.a.nodeName} is a letter-subset of ${c.b.nodeName} — what cryptographers might call a partial anagram and what numerologists would call something more interesting`,
], hash(c.a.nodeName, c.b.nodeName)),

"trigram-similarity": (c) => `${c.a.nodeName} and ${c.b.nodeName} share ${Math.round(c.score * 100)}% of their three-letter sequences. The investigator submits this without comment`,

"stem-match": (c) => `${c.a.nodeName} and ${c.b.nodeName} share the linguistic root "${c.stem}". The investigator notes that shared etymological roots are not generally accepted as evidence of conspiracy, but submits the finding for completeness`,

"homoglyph-match": (c) => `the investigator has identified non-Latin characters in ${c.a.nodeName} that, when normalized to their Latin equivalents, produce a string identical to ${c.b.nodeName}. This is the technique used in deceptive URLs and impersonation attacks. The investigator does not draw conclusions but does note this with concern`,

"reverse-spell": (c) => `${c.a.nodeName}, spelled in reverse, yields ${c.b.nodeName}. The investigator considers reverse-spelling correspondences to be among the most rhetorically charged in the literature on coincidence`,
```

The homoglyph rephraser is allowed to break the investigator's usual
"refuses to draw conclusions" stance slightly because homoglyph attacks
*are* real and *are* concerning. The investigator noting concern (rather
than calmly observing) when finding one is in-character.

## Part 2: Geographic depth

### What each tier does

| Tier     | Distance | Lat/Long match | Ley-lines | Antipodes | Time zone | Country | Great-circle | Magnetic | Elevation |
|----------|----------|----------------|-----------|-----------|-----------|---------|--------------|----------|-----------|
| Off      | —        | —              | —         | —         | —         | —       | —            | —        | —         |
| Surface  | ✓        | ✓              | ✓ (3-pair)| —         | —         | —       | —            | —        | —         |
| Standard | ✓        | ✓              | ✓ (1)     | ✓         | ✓         | ✓       | —            | —        | —         |
| Deep     | ✓        | ✓              | ✓ (1)     | ✓         | ✓         | ✓       | ✓            | ✓        | ✓         |

Three things to note about this table:

1. **Ley-line behavior changes between Surface and Standard.** Surface
   produces three pairwise findings per triangle (current behavior, kept
   for backwards compatibility). Standard collapses each triangle to one
   summary finding (the dedup fix you flagged earlier). Deep keeps the
   single-finding behavior but loosens the collinearity tolerance from
   0.5° to 1.5° to surface more triangles.

2. **The Surface tier matches current behavior exactly.** Migrating
   `enableLeyLines: true` to `geographicDepth: 1` produces no observable
   change in findings. Migration is invisible to existing users.

3. **Deep adds genuinely esoteric measurements.** Magnetic-pole
   proximity is a real geographic property (the magnetic poles drift,
   currently the north magnetic pole is in the Arctic Ocean far from
   the geographic pole). Two locations both close to a magnetic pole
   is a real (if rare) coincidence the investigator can dramatize.

### New module: `src/lib/geography.js`

Existing geographic helpers in `src/lib/geo.js` stay where they are
(`haversineKm`, `isLeyLine`, `geocode`, `reverseGeocode`,
`locationFacts`). The new module adds the depth-specific helpers.

```js
import { haversineKm } from "./geo";

/**
 * Compute the antipode of a coordinate — the point exactly opposite
 * on the globe. Latitude flips sign, longitude shifts 180°.
 */
export const antipodeOf = (lat, lng) => ({
  lat: -lat,
  lng: lng > 0 ? lng - 180 : lng + 180,
});

/**
 * Check if two locations are roughly antipodal — one's antipode is
 * within `tolKm` of the other. Default tolerance: 500km.
 */
export const isAntipodal = (a, b, tolKm = 500) => {
  const ant = antipodeOf(a.lat, a.lng);
  return haversineKm(ant.lat, ant.lng, b.lat, b.lng) <= tolKm;
};

/**
 * Approximate time zone offset from longitude. Real time zones don't
 * follow longitude exactly (politics, daylight saving, etc.), but for
 * coincidence-finding purposes "they're in the same broad time zone"
 * is a defensible heuristic.
 */
export const longitudeTimeZone = (lng) => Math.round(lng / 15);

/**
 * Hemisphere classification. Returns { ns: "north"|"south",
 * ew: "east"|"west" }.
 */
export const hemisphereOf = (lat, lng) => ({
  ns: lat >= 0 ? "north" : "south",
  ew: lng >= 0 ? "east" : "west",
});

/**
 * Check if a point lies near the great-circle path between two other
 * points. Tolerance in km. Useful for "the third location is on the
 * route between the first two" findings.
 *
 * Implementation: compute the cross-track distance from the point to
 * the great-circle defined by the other two, return true if within
 * tolerance.
 */
export const isOnGreatCircle = (p, a, b, tolKm = 100) => {
  // ... cross-track distance calculation
};

/**
 * Magnetic pole positions as of 2025 (they drift). For our purposes,
 * "near the magnetic pole" means within 1500km — the magnetic poles
 * are in remote enough places that this is still a meaningful
 * coincidence when two unrelated locations both qualify.
 */
export const MAGNETIC_NORTH_2025 = { lat: 86.5, lng: 168.0 };  // approximate
export const MAGNETIC_SOUTH_2025 = { lat: -64.1, lng: 136.0 }; // approximate

export const isNearMagneticPole = (lat, lng, which = "north") => {
  const pole = which === "north" ? MAGNETIC_NORTH_2025 : MAGNETIC_SOUTH_2025;
  return haversineKm(lat, lng, pole.lat, pole.lng) <= 1500;
};

/**
 * Elevation banding. Categorizes a numeric elevation (in meters) into
 * a band: "below sea level", "low" (0-500m), "moderate" (500-1500m),
 * "high" (1500-3000m), "extreme" (3000m+). Two locations in the same
 * non-default band match.
 */
export const elevationBand = (meters) => {
  if (meters < 0) return "below sea level";
  if (meters < 500) return null; // most places, not interesting
  if (meters < 1500) return "moderate altitude";
  if (meters < 3000) return "high altitude";
  return "extreme altitude";
};
```

### Connection engine integration for geographic

Update settings shape:

```js
// OLD: { enableLeyLines: boolean }
// NEW: { geographicDepth: 0 | 1 | 2 | 3 }
```

Replace the existing geographic blocks in `findConnections` with
depth-aware versions. New connection kinds:

- `antipodal-match` (Standard): two locations are roughly antipodal.
- `time-zone-match` (Standard): two locations share approximate time zone.
- `same-country` (Standard): two locations in the same country (country
  comes from the existing Nominatim address parsing).
- `great-circle-waypoint` (Deep): three locations where one lies on
  the great-circle path between the other two.
- `magnetic-pole` (Deep): two locations both near a magnetic pole.
- `elevation-band` (Deep): two locations in the same elevation band
  above 500m (sea-level matches are too common to be interesting).

Plus the ley-line dedup fix at Standard tier.

Strength values to add to `connections.config.js`:

```js
GEO_ANTIPODAL: 0.85,         // genuinely rare, very specific
GEO_TIMEZONE: 0.4,           // common but worth noting
GEO_SAME_COUNTRY: 0.45,      // common, but says something
GEO_GREAT_CIRCLE: 0.7,       // precise enough to be striking
GEO_MAGNETIC_POLE: 0.8,      // both locations near a magnetic pole is genuinely odd
GEO_ELEVATION_BAND: 0.55,    // high-altitude matches especially
LEY_LINE_TRIANGLE: 0.85,     // single-finding ley-line at Standard+
```

`LEY_LINE_TRIANGLE` replaces the existing `LEY_LINE` strength when ley
lines are emitted as single findings. Keep `LEY_LINE` for the Surface
tier's pairwise emission — both can coexist in the constants.

### Geographic rephrasers

Add to `src/lib/narrative/connection.js`:

```js
"antipodal-match": (c) => `${c.a.nodeName} and ${c.b.nodeName} are diametrically opposite each other on the surface of the Earth — separated by precisely (or nearly so) 180 degrees of arc, the maximum possible distance between two points on a sphere. The investigator regards this as the most extreme form of geographic coincidence`,

"time-zone-match": (c) => `${c.a.nodeName} and ${c.b.nodeName} occupy the same approximate time zone (UTC${c.offset >= 0 ? "+" : ""}${c.offset}). Despite their geographic separation, dawn arrives at both locations within minutes of each other`,

"same-country": (c) => pick([
  `${c.a.nodeName} and ${c.b.nodeName} both lie within the borders of ${c.country}. The investigator notes this for the record`,
  `geopolitically, ${c.a.nodeName} and ${c.b.nodeName} share a common state — ${c.country} — and are therefore subject to the same legal jurisdiction`,
], hash(c.a.nodeName, c.b.nodeName)),

"great-circle-waypoint": (c) => `${c.a.nodeName}, ${c.b.nodeName}, and ${c.c.nodeName} fall along a single great-circle route. ${c.b.nodeName} lies, within tolerance, on the shortest spherical path between ${c.a.nodeName} and ${c.c.nodeName}. Any aircraft flying between the latter two locations would, by default, pass over the first`,

"magnetic-pole": (c) => `${c.a.nodeName} and ${c.b.nodeName} both lie within the magnetic field anomaly surrounding the ${c.pole} magnetic pole — an active geomagnetic feature distinct from the geographic pole. The investigator notes that compass needles in both locations are subject to substantial deviation`,

"elevation-band": (c) => `${c.a.nodeName} and ${c.b.nodeName} both rise to ${c.band}. The thin air at such elevations has been claimed, in some traditions, to be conducive to spiritual revelation — though the investigator declines to evaluate that claim`,

// Replace the existing pairwise ley-line rephraser with this when
// emitted as a single triangle finding (Standard+ tiers):
"ley-line-triangle": (c) => `${c.a.nodeName}, ${c.b.nodeName}, and ${c.c.nodeName} fall along a single near-collinear arc on the Earth's surface. Such alignments — referred to in some literatures as "ley lines" — are the subject of considerable folkloric speculation. The investigator does not endorse the terminology but acknowledges the geometry`,
```

The geographic rephrasers lean into the *measurement-precision* voice
more than the mystical voice. Antipodal points get described with the
phrase "180 degrees of arc, the maximum possible distance between two
points on a sphere" — the investigator showing their work as a
forensic geographer rather than a mystic. That's a tonal shift from
astrology, and it's intentional — these are physical measurements, not
interpretive systems.

## Implementation phases

### Lexical (4 phases)

1. **`src/lib/lexical.js` module.** Helpers for Metaphone, partial
   anagrams, trigram similarity, stems, homoglyphs, reverse spelling.
   About 25 tests for the helpers.
2. **Connection engine integration.** Six new kinds, depth gates, strength
   constants in config. About 10 engine tests.
3. **Rephrasers** for the six new kinds. No tests (rephrasers are
   text-generation, manually verified).
4. **UI integration.** Replace `enableAnagrams` checkbox with
   `lexicalDepth` four-option select.

### Geographic (4 phases)

5. **`src/lib/geography.js` module.** Helpers for antipodes, time zones,
   hemispheres, great-circle waypoints, magnetic poles, elevation bands.
   About 20 tests.
6. **Connection engine integration including ley-line dedup.** Six new
   kinds plus the ley-line behavior change. Country detection requires
   pulling from Nominatim's existing address response. About 12 engine
   tests.
7. **Rephrasers** for the six new kinds plus the new ley-line-triangle
   rephraser.
8. **UI integration.** Replace `enableLeyLines` checkbox with
   `geographicDepth` four-option select.

### Verification

After all 8 phases:
- All four soft-toggle categories (numerology, astrology, lexical,
  geographic) use the same four-tier pattern.
- All four boolean settings are gone, replaced by depth integers.
- Total test count should land around 175-200 (currently ~131).
- All depth=1 (Surface) defaults match the old `enable*: true` behavior.

## Forward-compat: Investigator Mode

Once both depth categories ship, all four are independently controllable
and we have the foundation for the Investigator Mode preset selector.
That feature is **out of scope for this batch** but worth documenting
the design while it's fresh:

- **Skeptic:** all depths = 0. The dossier produces no findings beyond
  the most rigid numeric exact-matches. The investigator is no fun.
- **Standard (default):** all depths = 1. Current behavior across the
  board.
- **Believer:** all depths = 2. Adds Chaldean numerology, astrological
  modality/ruler, phonetic matching, antipodes — meaningful additions
  without overwhelming.
- **Conspiracy:** all depths = 3. Fully unhinged. Deep numerology, full
  astrology including aspects and Mercury retrograde, homoglyph and
  reverse-spelling lexical matches, magnetic pole and great-circle
  geographic findings.

Implementation when ready: a single dropdown above the four
individual-depth controls. Selecting a preset sets all four depth
values at once. Individual controls remain for users who want to mix
(e.g. Skeptic numerology with Conspiracy astrology — a real user
profile, the "I don't believe in numbers but I do believe in stars"
type).

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to add lexical depth and geographic depth settings to
Recognizer, replacing the `enableAnagrams` and `enableLeyLines` boolean
toggles with the four-tier depth pattern established by numerology and
astrology depth.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/NUMEROLOGY-DEPTH.md` and `docs/ASTROLOGY-DEPTH.md` to refresh
   on the established pattern.
3. `docs/LEXICAL-GEOGRAPHIC-DEPTH.md` (this doc) for the design.

The plan is 8 phases — 4 for lexical, 4 for geographic. They can ship as
two separate PRs (lexical first, geographic second) or as one combined
PR with the phases interleaved as logical commits. Your call based on
what's cleaner once you're in the code.

A few specific notes before starting:

- **Metaphone implementation.** Vendor the algorithm rather than adding
  an npm dependency — it's about 50 lines of regex transformations and
  stable. Look at `natural` or `talisman` packages for reference, but
  inline the function.
- **Ley-line behavior change at Standard.** Current Surface behavior
  emits 3 pairwise findings per triangle (kept as-is for backwards
  compat). Standard collapses each triangle to one summary finding —
  this is the dedup fix Eris flagged. Deep keeps the single-finding
  behavior but loosens the tolerance from 0.5° to 1.5°.
- **Country detection** for `same-country` matches. The existing
  Nominatim integration returns address data including country. If
  that's already being captured on location nodes, use it. If not, add
  it during location node creation.
- **Magnetic pole positions** are approximations as of 2025. Hard-code
  them with a comment about drift; they don't need to be exact.
- **Strength values for new kinds** go in `connections.config.js`
  alongside the existing constants. Follow the established naming
  pattern (`LEXICAL_*` and `GEO_*` prefixes).
- **Same-pair multiple-kind stacking** is the default — two locations
  that are antipodal AND in the same time zone produce two separate
  findings. (Antipodal points typically *aren't* in the same time
  zone, but the code shouldn't assume that.)

If anything looks like it's establishing a novel pattern rather than
generalizing the established one, flag it before working around it.
Same as the astrology session — drift from the recipe is worth a
question, not a silent workaround.

Run `npm test`, `npm run lint`, `npm run build` after each phase.
Commit with messages like `feat(lexical): phase N — <description>` or
`feat(geo): phase N — <description>`.

---
