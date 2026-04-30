# CLAUDE.md

Standing instructions for AI assistants working in this repo. Read this first.

## What this project is

Recognizer is a single-page React app that finds (mostly spurious) connections
between user-submitted "evidence" — names, text, audio files, images, URLs,
books, dates, and locations. The tone is "credulous conspiracy investigator
showing their work." Findings are expressed as prose with a strength tier,
not as percentages or claims of meaning.

The joke works because the math is real but the conclusions are absurd. Don't
break the math, and don't undercut the absurdity. The investigator never
explicitly admits things are coincidence; they merely "note" things "for the
record."

## Stack

- **React 18** + **Vite** (no TypeScript, no Tailwind, no test framework yet)
- **Leaflet** for the geo map (Stamen Toner tiles via Stadia Maps)
- **Wikipedia REST API** for entity summaries
- **Wikidata** for structured facts (birth/death dates, populations, heights)
- **Open Library** for book lookups
- **Nominatim** (OpenStreetMap) for geocoding
- **exifr** for image EXIF extraction
- **jsmediatags** for audio ID3 tag extraction

All processing is client-side. No backend. Third-party APIs are called
directly from the browser, which means CORS limits some things (like fetching
arbitrary URLs).

## Project conventions

- **Plain `.js` and `.jsx`**, no TypeScript. Use JSDoc typedefs in
  `src/lib/types.js` for documenting node shapes.
- **Named exports** for utility functions; **default export** for the
  top-level React component of each `.jsx` file.
- **No test framework** yet. If you add one, prefer Vitest (matches Vite).
- **Dependencies via npm**, not CDN. The original single-file artifact
  loaded Leaflet/exifr/jsmediatags from CDN at runtime; the modular version
  imports them properly.
- **Inline styles** via the constants in `src/styles.js`. Don't introduce a
  CSS-in-JS library or a separate stylesheet system. The aesthetic is
  intentional — aged paper, blood-red accents, courier-monospace.
- **No emoji in code or prose** unless the user asks. The few emoji in the UI
  (▸ ⌥ ↯ ░ ⇗ 📄 🎲 ✕ ⚠ ↻) are intentional and stable.

## The node shape (single source of truth)

Every piece of evidence is a "node" with this shape (see `src/lib/types.js`
for the formal JSDoc):

```js
{
  id: string,                    // unique, prefixed by type ("name-...", "loc-...")
  type: "name" | "text" | "audio" | "image" | "url" | "book" | "date" | "location" | "today",
  name: string,                  // display name
  numbers: { [label: string]: number },  // numeric facts, the connection-engine fuel
  numerology: { sum, reduced, source } | null,
  // ... type-specific fields like lat/lng, dataUrl, events, colors, rawText, etc.
}
```

Every fact label is human-readable. Self-describing labels are preferred:
`year mentioned (1865)` is better than `year mentioned 3`. The user reads
these in connection sentences.

## The connection engine (src/lib/connections.js)

Takes an array of nodes and a settings object, returns an array of connections.
Each connection has `from`, `to`, `kind`, `strength` (0–1), and kind-specific
fields used by the narrative templates.

Strength tiers (see `strengthTier`):
- `>= 0.9` → `SUSPICIOUS` (gold)
- `>= 0.7` → `STRIKING` (amber)
- `>= 0.5` → `NOTABLE` (muted)
- below   → `TRIVIAL` (gray)

These are NOT confidence percentages. We never claim certainty about meaning.
Strength describes how rare/specific the match is — that's all.

## Threshold tuning (the hard-won numbers)

These thresholds in the connection engine were tuned over several versions to
suppress noise without killing signal. Changes here should be deliberate:

- **Exact numeric match:** value > 9. Lower floors flooded the dossier with
  small-integer collisions (months, day-of-month, character counts).
- **Near-match (within 2):** both values > 20 normally; year facts get this
  too but at strength 0.45 instead of 0.6 (adjacent years are common, not
  surprising).
- **Integer multiples:** small value ≥ 5, multiplier ≤ 12. Year facts get a
  stricter multiplier limit (only 2× or 3×, not arbitrary multiples).
- **Year fact detection:** label matches `/year|founded|birth|death|published/i`.

Don't broaden these limits without understanding why they're tight. The "color
3 G of image equals days since birthday" failure mode lives downhill from
relaxed thresholds.

## What does NOT participate in numeric matching

These were intentionally pulled from the numeric fact pool because they
generated noise:

- **Image RGB channel values.** Colors still cross-match via the dedicated
  color-distance system in `findConnections`, but individual R/G/B values
  don't enter the generic numeric pool.
- **Today's hour/minute.** They're ephemeral (whatever-time-the-user-loaded)
  and the bit doesn't work when half the coincidence is "you opened the app
  at this minute." Today contributes year/month/day/lunar-day/julian-mod.

## Today's gating

The "today" node is **not** auto-included in connections. The user must
click ENTER TODAY INTO EVIDENCE in the banner to promote it. Until then, a
hint mechanism (see `todayHints` memo in Recognizer.jsx) computes what
*would* connect if today were promoted, and shows a small nudge in the
banner. This preserves the "magic moment" of relevant historical
coincidences without auto-injecting facts the user didn't add.

## Date parsing — the timezone footgun

Use `parseDate` from `src/lib/dates.js`, NOT `new Date(string)` directly.
`new Date("1987-08-08")` parses as UTC midnight, then `.getDate()` reads in
local time and returns the previous day in any timezone west of UTC. This
silently corrupted every date fact for several versions until v0.6.

`parseDate` constructs Date objects via component args (year, month-1, day)
which always produces a local-time Date.

## API call patterns

- **Wikipedia summary** is fetched first for any name/location. The response
  includes `wikibase_item` (the Wikidata Q-number) which we save on the node.
- **Wikidata** is fetched as a follow-up using that Q-number. Pulls structured
  birth/death dates, height, population, etc. Failure here falls back
  gracefully to whatever Wikipedia summary alone produced.
- **Nominatim** for geocoding. Their usage policy asks for max 1 req/sec/user;
  we don't currently rate-limit but should add debouncing if traffic grows.
- **All API calls have try/catch and return `null` on failure.** Never throw
  out of an extractor — degrade gracefully. The user should still get a
  partial node rather than an error.

## Privacy notice

Footer reads: *"Your evidence stays in your browser. Names and place
searches are sent to Wikipedia and OpenStreetMap for lookup; books are
queried via Open Library. Map tiles served by Stadia Maps. Recognizer
itself logs and stores nothing."*

This is accurate and should remain so. Don't add analytics, telemetry,
fingerprinting, or any persistent storage that ships data off-device. If
features ever need persistence, use IndexedDB or localStorage with a
clearly disclosed scope.

## Security

- **All user content** is rendered through React's JSX text interpolation,
  which auto-escapes. No `dangerouslySetInnerHTML` anywhere — keep it that way.
- **Leaflet popups** are built as DOM elements (not HTML strings) so geocoder
  responses can't inject HTML. See `GeoMap.jsx`. Don't regress this.
- **CDN scripts** in the original used `crossOrigin="anonymous"` to allow
  SRI integrity attributes. The npm-imported version doesn't need this; npm
  packages are pinned by version+lockfile.
- **No external storage of evidence.** This is a foundational promise.

## Tone notes for the prose

The narrative templates in `src/lib/narrative/` use:

- Passive voice where natural ("it cannot be coincidence that…")
- Numerals written out for small numbers, with the digit in parens: "two (2)"
- Source strings shown in CAPS (numerology derivations, anagram bodies)
- Closers escalate with connection count: ≥8 connections shifts to "heated"
  closers like "the investigator's hands are trembling"
- The investigator never breaks character. They never call something a
  coincidence. They merely note, log, observe, and refuse to speculate.

If a rephraser feels like it's claiming meaning, soften it. If it feels too
hedged, sharpen it. The voice is "credulous but careful," not "skeptical."

## File organization

See `docs/DESIGN.md` for the why, `docs/MIGRATION.md` for the structural
plan, and the actual file tree under `src/`.

The general layering, top to bottom of the dependency graph:

1. `data/` — static data (limits, demo/random pools)
2. `lib/utils.js`, `lib/numerology.js`, `lib/dates.js`, `lib/geo.js` — pure helpers
3. `lib/extractors/*.js` — fact extraction from external APIs and files
4. `lib/connections.js` — the engine
5. `lib/narrative/*.js` — prose generation from connections
6. `components/*.jsx` — React UI
7. `App.jsx` → `main.jsx` — entry

Imports always flow downward in this list. If you find yourself wanting to
import a component from a lib file, you're probably refactoring something
that should stay in the component.

## When in doubt

- Read `docs/DESIGN.md` — it captures the *why* of nearly every decision.
- Don't add features without asking. The product has a tone; not every cool
  technical thing fits it.
- Run `npm run build` after structural changes. Vite errors on missing imports.
- The user (Eris) is a Director of Platform Engineering, not a frontend
  developer. Explain frontend choices when you make them.

## Tooling notes

### `npm install` peer-dependency history

A plain `npm install` resolves cleanly today — no `--legacy-peer-deps`
needed. This was briefly not the case: when adding lint and tests, an
initial install pulled in `eslint-plugin-react@7.x` (which declares peer
`eslint@^8`) alongside `eslint@10.x`, and npm refused to resolve. The fix
was to remove `eslint-plugin-react` from `devDependencies` entirely — the
flat config only uses `react-hooks` and `react-refresh`, so the plugin
was unused dead weight.

If a future `npm install` ever fails with `ERESOLVE`, the right move is
**not** `--legacy-peer-deps`. The right move is to identify which package
is pulling in a stale peer and decide whether you actually need it.
Reaching for `--legacy-peer-deps` lets a broken dep tree into the lockfile
and turns into project lore nobody can explain six months later.
