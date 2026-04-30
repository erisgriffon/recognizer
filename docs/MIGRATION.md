# Migration Plan: Single-File → Modular

This document breaks the modularization of `recognizer-v0.13.jsx` into ordered,
verifiable phases. Each phase has a clear stopping point where you should run
`npm run build` and confirm clean output before moving on.

The goal is **zero behavior change**. This is a structural refactor only.
After all phases complete, the running app should look and behave identically
to v0.13. New features come *after* this is done and verified.

## Prerequisites

Before starting:

```bash
# In the repo root
npm create vite@latest . -- --template react
# (Answer prompts; this scaffolds package.json, vite.config.js, etc.)

# Install runtime dependencies
npm install leaflet exifr jsmediatags

# Verify the empty Vite project builds
npm run dev   # should serve a default React page at localhost:5173
```

Place the existing v0.13 source at `src/recognizer-v0.13.jsx` (don't delete it
yet — it's our reference). Then move the auto-generated `src/App.jsx` aside
to `src/App.scaffold.jsx` so we don't conflict with our own App.jsx later.

## File map (target)

```
src/
├── main.jsx
├── App.jsx
├── styles.js
├── data/
│   ├── limits.js
│   └── pools.js
├── lib/
│   ├── types.js
│   ├── utils.js
│   ├── numerology.js
│   ├── dates.js
│   ├── geo.js
│   ├── connections.js
│   ├── extractors/
│   │   ├── text.js
│   │   ├── wikipedia.js
│   │   ├── wikidata.js
│   │   ├── today.js
│   │   ├── audio.js
│   │   ├── image.js
│   │   └── misc.js
│   └── narrative/
│       ├── connection.js
│       ├── dossier.js
│       └── today.js
└── components/
    ├── Recognizer.jsx
    ├── ConnectionMap.jsx
    ├── GeoMap.jsx
    ├── TodayObservation.jsx
    └── PanelGroup.jsx
```

## Phase 1: Static data + pure helpers (no dependencies)

These files have no imports from other project files. Extract them first.

**Files to create:**

1. **`src/data/limits.js`** — exports `LIMITS` constant.
2. **`src/data/pools.js`** — exports `DEMO_SET`, `RANDOM_POOLS`, `randomItem`.
3. **`src/lib/utils.js`** — exports `stripDiacritics`, `tokenize`, `pick`,
   `ordinal`, `written`, `sample`.
4. **`src/lib/types.js`** — JSDoc typedefs for Node, Connection, Settings, etc.
   Pure documentation, no executable code.

**Verification:** No `npm run build` yet (nothing imports these). Just confirm
files exist and have no imports.

## Phase 2: Domain-specific pure helpers

These import only from Phase 1 files.

**Files to create:**

5. **`src/lib/numerology.js`** — exports `pythagoreanValue`, `reduceNumber`,
   `numerologyOf`, `anagramSignature`, `multisetEditDistance`. Imports from
   `utils.js` (stripDiacritics).
6. **`src/lib/dates.js`** — exports `parseDate`, `daysBetween`, `isInRange`
   (from limits.js), `zodiacOf`, `ZODIAC_ELEMENTS`, `zodiacCompatible`,
   `dayOfWeek`, `moonPhase`, `dateFacts`. Imports from `data/limits.js`.
7. **`src/lib/geo.js`** — exports `haversineKm`, `isLeyLine`, `geocode`,
   `reverseGeocode`, `locationFacts`. Self-contained network helpers.

**Verification:** Still nothing imports these from outside, but you can do
`npm run build` now to catch any syntax errors. Should still be clean.

## Phase 3: Extractors (external API and file processors)

These import from Phases 1-2. Each is an independent module.

**Files to create:**

8. **`src/lib/extractors/text.js`** — `findCapitalizedNames`,
   `findRepeatedPhrases`, `wordFrequency`, `letterFrequency`. Imports from
   `utils.js`.
9. **`src/lib/extractors/wikipedia.js`** — `lookupName`,
   `extractFactsFromExtract`, `diagnoseExtract`, `fetchOnThisDay`.
10. **`src/lib/extractors/wikidata.js`** — `WIKIDATA_PROPERTIES`,
    `WIKIDATA_TYPES`, `parseWikidataDate`, `fetchWikidataFacts`.
11. **`src/lib/extractors/today.js`** — `buildTodayNode`. Imports from
    `dates.js` and `numerology.js`.
12. **`src/lib/extractors/audio.js`** — `analyzeAudio`. Imports `jsmediatags`
    via npm (replacing the runtime CDN load). Note: convert
    `ensureJsmediatags()` to a top-of-file `import jsmediatags from 'jsmediatags'`.
13. **`src/lib/extractors/image.js`** — `analyzeImage`, `extractDominantColors`,
    `colorDistance`, `fileToDataURL`. Imports `exifr` via npm. Same conversion
    pattern as audio.
14. **`src/lib/extractors/misc.js`** — `analyzeUrl`, `fetchUrlContent`,
    `lookupBook`. Imports from `utils.js`, `numerology.js`.

**Verification:** Run `npm run build`. All these modules should compile clean
even though nothing imports them from the component layer yet.

## Phase 4: Connection engine

Imports from Phases 1-3.

15. **`src/lib/connections.js`** — `findConnections`, `strengthTier`. Imports
    `geo.js` (haversineKm, isLeyLine), `numerology.js` (anagram functions),
    `image.js` (colorDistance for cross-image color matching).

The connection engine is one big function with several inner blocks. Don't
split it further — the blocks share the `connections` accumulator and the
`numericFacts` array.

**Verification:** `npm run build` clean.

## Phase 5: Narrative generation

Imports from Phases 1-4.

16. **`src/lib/narrative/connection.js`** — `narrateConnection`, the
    `OPENERS`/`CLOSERS_MILD`/`CLOSERS_HEATED` arrays, `closerFor`, the
    `rephrasers` object. Imports from `utils.js` (pick, written).
17. **`src/lib/narrative/dossier.js`** — `generateDossier`. Imports
    `connection.js` (narrateConnection) and `utils.js` (pick, written).
18. **`src/lib/narrative/today.js`** — `buildTodayObservation`,
    `summarizeHint`, today template arrays (`TODAY_OPENERS`, `TODAY_FRAMINGS`,
    `TODAY_HISTORICAL`, `TODAY_NUMEROLOGY`, `TODAY_CLOSERS`). Imports
    from `utils.js`.

**Verification:** `npm run build` clean.

## Phase 6: Components

Now the UI layer. These are the only files that import React.

19. **`src/styles.js`** — exports the inline style constants:
    `panelStyle`, `labelStyle`, `inputStyle`, `buttonStyle`, `tabStyle`,
    `activeTabStyle`, `sectionHeader`, `cardStyle`, `emptyState`,
    `observationStyle`. No React.
20. **`src/components/PanelGroup.jsx`** — the collapsible panel component.
    Imports React.
21. **`src/components/ConnectionMap.jsx`** — the canvas corkboard component.
22. **`src/components/GeoMap.jsx`** — the Leaflet wrapper. Convert
    `ensureLeaflet()` to top-of-file `import L from 'leaflet'` and
    `import 'leaflet/dist/leaflet.css'`. Imports `geo.js` (haversineKm).
23. **`src/components/TodayObservation.jsx`** — the banner component.
    Imports `narrative/today.js`.
24. **`src/components/Recognizer.jsx`** — the main app component. This is the
    big one. It imports basically everything: all extractors, the connection
    engine, narrative generators, and the other components. State and effect
    hooks live here. Around 600 lines after the split (down from ~2700).

**Verification:** Each component file should `npm run build` clean as you
add it. After all six are in place, the build should still be clean even
though nothing renders Recognizer yet.

## Phase 7: Wire up entry point

25. **`src/App.jsx`** — minimal:
    ```jsx
    import Recognizer from "./components/Recognizer";
    export default function App() { return <Recognizer />; }
    ```
26. **`src/main.jsx`** — should already exist from Vite scaffold; verify it
    imports `App` from `./App` and mounts to `#root`.

**Verification:** `npm run dev` should now serve the actual app. Click
through every input panel, generate a dossier, toggle dev mode, run the
demo and randomize buttons. **It should look and behave identically to v0.13.**

## Phase 8: Cleanup

27. Delete `src/recognizer-v0.13.jsx` (or move to `archive/` if you want a
    reference copy in the repo).
28. Delete `src/App.scaffold.jsx`.
29. Run `npm run build` for the production build. Verify no warnings.
30. Commit with a message like "refactor: modularize single-file source".

## Notes on tricky bits

### CDN-to-npm conversions

The original code has three runtime-CDN-loaded libraries: jsmediatags, exifr,
Leaflet. Each had an `ensure*()` helper that injected a `<script>` tag and
awaited its onload. After modularization, these collapse to top-of-file
imports:

- `import jsmediatags from 'jsmediatags'` (in `audio.js`)
- `import exifr from 'exifr'` (in `image.js`)
- `import L from 'leaflet'` and `import 'leaflet/dist/leaflet.css'` (in `GeoMap.jsx`)

The `window.jsmediatags`, `window.exifr`, `window.L` references throughout the
original code should be replaced with the imported names. The `ensure*`
helpers can be deleted.

### Leaflet CSS

Leaflet absolutely requires its CSS file to render correctly. The CSS import
must happen *before* any Leaflet code runs, so put it at the top of
`GeoMap.jsx` ahead of any `L.` usage.

### Avoid circular imports

The biggest risk in this refactor. The dependency direction is:

```
data → utils → (numerology, dates, geo) → extractors → connections → narrative → components
```

If you find yourself wanting to import "upward" — for example, importing a
component from a lib file — stop and rethink. The fix is usually to pass the
needed function as a parameter instead.

### Wikidata import edge case

`extractors/wikidata.js` is independent of `extractors/wikipedia.js` — they
don't import each other. The integration happens in `Recognizer.jsx`, which
calls `lookupName()` first and then `fetchWikidataFacts()` with the Q-number
from the Wikipedia response. Keep this pattern; don't have one extractor
call the other internally. Makes both more testable.

### State and refs in ConnectionMap and GeoMap

These components use `useRef` and `useEffect` heavily for canvas drawing and
Leaflet imperative API. The refactor doesn't change any of this — just lifts
the components into their own files. Their internals stay identical.

## When to stop and ask

If `npm run build` fails after a phase:
- Read the error carefully. Vite errors point at exact import paths.
- Don't proceed to the next phase until the current one is clean.
- Don't "just fix it quickly" if you don't understand the error — that's how
  silent bugs creep in.

If the running app behaves differently from v0.13:
- Check the dev console for runtime errors.
- Diff the file you suspect against the v0.13 source. Look for accidentally
  dropped lines or changed function signatures.
- The single most common refactor bug is forgetting to export something, so
  every consumer falls back to `undefined` and the function throws at runtime.

If something in the original code looks suspect or could be simpler — write
it down but don't fix it during the refactor. The goal is structural change
only. Improvements come after, in their own commits with clear diffs.

## Estimated effort

For Claude Code with the v0.13 source in hand and this plan: maybe 2–4 hours
of focused work, including verification at each phase. Don't try to do it in
one big push; commit after each phase so you have rollback points.

Once this is done, the next features (depth sliders, persistence, sharing
URLs, whatever) all become much smaller changes contained within their
relevant module.
