# Feature: Polish Pass

A handoff doc for four small features that together bring Recognizer to a
genuinely polished rest state. Designed to ship as one Code Claude session
since they're all small and complementary.

Order of work matters: ship Investigator Mode first (it's the substantive
one and may need iteration), then the polish items (favicon/meta tags,
README, preview script verification) in any order at the end.

## Scope

Four features:

1. **Investigator Mode preset selector** — one dropdown that sets all four
   depth categories to coordinated values.
2. **Favicon and meta tags** — so recognizer.observer looks proper in
   social card previews and browser tabs.
3. **GitHub repo README** — replace the Vite default with something that
   explains the project to a curious visitor.
4. **`npm run preview` verification** — confirm it works, document it in
   the README.

All four are small enough that this is a single focused session, probably
2-3 hours of Code Claude time including verification.

## Part 1: Investigator Mode preset selector

### Why this matters

After lex+geo ships, all four soft-toggle categories (numerology,
astrology, lexical, geographic) will have independent four-tier depth
controls. That's *four separate dropdowns* for users to think about — too
much cognitive load for a comedy app where the user mostly wants to set
the vibe and submit evidence.

Investigator Mode is the wrapper that gives users one knob for "how
mystical do I want this experience to be," while preserving the
individual controls for power users who want to mix.

### Design

A single dropdown above the four individual depth controls in the
Investigative Methods panel. Four presets:

```
Investigator Mode: [Standard ▼]
                    ├── Skeptic
                    ├── Standard
                    ├── Believer
                    └── Conspiracy
                    ├── ─────────
                    └── Custom (auto-selected when individual controls don't match a preset)
```

The presets map to depth values:

| Preset     | Numerology | Astrology | Lexical | Geographic |
|------------|------------|-----------|---------|------------|
| Skeptic    | 0          | 0         | 0       | 0          |
| Standard   | 1          | 1         | 1       | 1          |
| Believer   | 2          | 2         | 2       | 2          |
| Conspiracy | 3          | 3         | 3       | 3          |

When a user selects a preset, all four depth values are set at once.

When a user changes an individual depth, the preset selector switches to
"Custom" automatically — indicating that the current configuration doesn't
match any named preset.

Default for new users: **Standard.** Same as the current default behavior.

### Implementation notes

**State.** A computed value, not stored state:

```js
const detectPreset = (settings) => {
  const depths = [
    settings.numerologyDepth,
    settings.astrologyDepth,
    settings.lexicalDepth,
    settings.geographicDepth,
  ];
  if (depths.every(d => d === 0)) return "skeptic";
  if (depths.every(d => d === 1)) return "standard";
  if (depths.every(d => d === 2)) return "believer";
  if (depths.every(d => d === 3)) return "conspiracy";
  return "custom";
};
```

The preset selector reads from this computed value. Changing it writes to
all four depth values at once via `setSettings`. Don't store the preset
as state — derive it from the depths so the two can never disagree.

**The "Custom" option.** Should be selectable but its behavior is "no-op"
— if the user explicitly picks Custom from the dropdown, nothing changes
(they're already there). The Custom option exists primarily to *display*
when individual controls have produced a non-preset configuration. UI
implementation: Custom is an `<option disabled>` or rendered as visually
distinct, so users understand it's auto-selected rather than something
they choose.

Alternative: hide the Custom option entirely when not active, only render
it conditionally. Cleaner but slightly more JSX. Either is fine — Code
Claude's call.

**Preset constants.** Live in a new module:

```js
// src/lib/presets.js
export const INVESTIGATOR_PRESETS = {
  skeptic: {
    label: "Skeptic",
    description: "The investigator considers only the most rigorous numeric coincidences.",
    depths: { numerologyDepth: 0, astrologyDepth: 0, lexicalDepth: 0, geographicDepth: 0 },
  },
  standard: {
    label: "Standard",
    description: "Default investigative methods. Numerology, astrology, lexical analysis, and geographic patterns at moderate depth.",
    depths: { numerologyDepth: 1, astrologyDepth: 1, lexicalDepth: 1, geographicDepth: 1 },
  },
  believer: {
    label: "Believer",
    description: "Adds Chaldean numerology, astrological modality and rulers, phonetic name matching, and antipodal geography.",
    depths: { numerologyDepth: 2, astrologyDepth: 2, lexicalDepth: 2, geographicDepth: 2 },
  },
  conspiracy: {
    label: "Conspiracy",
    description: "Maximum investigative depth. The investigator's hands are trembling.",
    depths: { numerologyDepth: 3, astrologyDepth: 3, lexicalDepth: 3, geographicDepth: 3 },
  },
};

export const detectPreset = (settings) => {
  // ... as above
};
```

The descriptions are user-facing copy — they should appear as small text
under or beside the dropdown when a preset is selected. The Conspiracy
description ("the investigator's hands are trembling") is a deliberate
callback to the existing closer-prose escalation; it should feel like the
voice the user already knows.

**UI placement.** Above the four individual depth controls, with a
visual divider between the preset selector and the individual controls
to communicate the relationship. Something like:

```jsx
<div style={panelStyle}>
  <label style={presetLabelStyle}>
    Investigator Mode:
    <select value={detectPreset(settings)} onChange={handlePresetChange}>
      <option value="skeptic">Skeptic</option>
      <option value="standard">Standard</option>
      <option value="believer">Believer</option>
      <option value="conspiracy">Conspiracy</option>
      {detectPreset(settings) === "custom" && (
        <option value="custom">Custom</option>
      )}
    </select>
  </label>
  <p style={presetDescriptionStyle}>
    {INVESTIGATOR_PRESETS[detectPreset(settings)]?.description ||
     "Custom configuration — individual depths set independently."}
  </p>
  <hr style={{ borderColor: "#6b4a2a", margin: "12px 0", opacity: 0.3 }} />
  {/* Individual depth controls below */}
</div>
```

**Share serialization.** Presets shouldn't appear in the serialized case
file — they're a UI convenience, not state. The four depth values are
already serialized. When a recipient imports a case file, the preset
selector will compute the right value via `detectPreset` automatically.
No changes needed to share/serialize.js.

### Tests

The preset detection logic is pure and worth testing:

- All-zero depths returns "skeptic"
- All-one returns "standard"
- All-two returns "believer"
- All-three returns "conspiracy"
- Mixed depths return "custom"
- Each preset's `depths` object has all four keys with valid values

About 8 tests for `detectPreset` and the preset constants.

The UI integration (changing the dropdown sets all four depths) is
verified manually in the browser.

## Part 2: Favicon and meta tags

### Goal

When someone shares the recognizer.observer URL, the link preview should
look intentional rather than blank. Browser tabs should show a recognizable
icon rather than the generic globe.

### Favicon design

Suggestions, in order of preference:

1. A small red pushpin against a tan/aged-paper background. References the
   corkboard aesthetic directly.
2. A magnifying glass with a small red dot in its lens. References
   "investigation."
3. A small spiral or eye-of-providence in the same red and tan palette.
   More overtly conspiratorial, leans into the bit hardest.

Code Claude can generate any of these as SVG, then convert to the standard
favicon sizes (16×16, 32×32, 192×192 for various contexts, plus a
512×512 for og:image use).

Recommend SVG source kept in `public/favicon.svg` and ICO/PNG variants
generated from it. Vite serves the `public/` directory at root, so the
favicon link in `index.html` becomes:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

If generating multiple sizes is fiddly, just ship the SVG — modern browsers
handle that fine, and the older-browser fallback isn't critical.

### Meta tags

Add to `index.html` head:

```html
<title>Recognizer — Submit evidence. Cross-reference everything.</title>
<meta name="description" content="A pattern-finding tool for the determinedly credulous. Submit names, dates, places, and more — the investigator cross-references everything looking for coincidences. Coincidence? You decide." />

<!-- Open Graph (Facebook, LinkedIn, etc.) -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://recognizer.observer/" />
<meta property="og:title" content="Recognizer — The investigator does not endorse, but acknowledges." />
<meta property="og:description" content="Submit evidence. Cross-reference everything. The investigator finds coincidences. You decide whether they mean anything." />
<meta property="og:image" content="https://recognizer.observer/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Recognizer" />
<meta name="twitter:description" content="A pattern-finding tool for the determinedly credulous." />
<meta name="twitter:image" content="https://recognizer.observer/og-image.png" />
```

The og:image is a 1200×630 PNG that appears in social card previews. It
should look like a small piece of the corkboard aesthetic — could be a
screenshot of a finished investigation with a couple of red strings
between cards, or a styled text card with the title in courier monospace
on the aged-paper background. Code Claude can generate one or punt this
to "later" if image generation isn't reliable.

If the og:image is hard to produce well, **ship without it for now** —
plain link previews still work, just less visually. Easy to add later.

## Part 3: README

### What it should contain

Replace the existing Vite-default README with something that introduces
the project to a curious visitor. Suggested structure:

```markdown
# Recognizer

A pattern-finding tool for the determinedly credulous.

Live at: **[recognizer.observer](https://recognizer.observer)**

[Screenshot of the app, ideally showing a corkboard with a few connections]

## What it does

Submit evidence — names, text, audio files, images, URLs, books, dates,
locations. The investigator cross-references everything, looking for
coincidences. Birth years that line up, names that share numerological
signatures, locations on the same ley line, dates during Mercury
retrograde.

The math is real. The conclusions are absurd. The investigator never
endorses anything; they merely note things "for the record."

## Stack

- React 18 + Vite
- Wikipedia REST + Wikidata for biographical and place data
- Open Library for book lookups
- Nominatim (OpenStreetMap) for geocoding
- exifr for image EXIF, jsmediatags for audio ID3
- Leaflet for the geographic map (Stamen Toner via Stadia Maps)
- Hosted on Cloudflare Pages

Everything runs client-side. No backend, no accounts, no analytics.

## Privacy

Your evidence stays in your browser. Names and place searches are sent
to Wikipedia and OpenStreetMap for lookup; books are queried via Open
Library. Recognizer itself logs and stores nothing. Shared URLs encode
case state in the fragment (after the `#`), which is never transmitted
to servers.

## Development

```bash
npm install
npm run dev      # local dev server with hot reload
npm test         # run tests
npm run lint     # lint the codebase
npm run build    # production build
npm run preview  # serve the production build locally for testing
```

See `docs/` for design decisions and architecture notes.

## License

[Your choice — MIT is fine for a personal toy project, or pick something
else]

## Origin

Recognizer was built collaboratively with Claude (chat for design,
Claude Code for implementation) over the course of about a day in
April 2026. The project's docs/ folder contains a record of the design
decisions, including the bugs we hit along the way.
```

### Notes on tone

The README should match the project's voice — slightly dry, committed to
the bit, but not overdoing it. The "investigator never endorses anything"
line is doing real work; don't dilute it with too many other flourishes.

The "Origin" section is optional but worth including if you (Eris) are
comfortable. It honestly acknowledges the AI-collaboration aspect of the
build, which is true and increasingly common but rarely documented in
project READMEs. **Code Claude: ask Eris before including this section,
since it's a personal call about how to frame the project's history.**

The screenshot is important. A README without an image is much less
inviting. If you don't have one ready, take a few minutes to set up a
small case file in the live app, screenshot the corkboard or table view,
and add it to the repo at `docs/screenshot.png` or similar.

## Part 4: `npm run preview` verification

Vite's default scaffolding includes `npm run preview` which serves the
production build (`dist/`) on a local port. This is useful for testing
the actually-deployed version of the app before pushing to production.

**Verification steps:**

1. Run `npm run build` — confirm clean output.
2. Run `npm run preview` — should start a local server (usually port 4173).
3. Visit the URL, confirm the app loads and works correctly.
4. Compare to `npm run dev` to confirm the production build behaves the
   same as dev mode (it usually does, but occasionally there are
   build-time issues that don't show up in dev).

**Document in the README:** mention `npm run preview` in the Development
section (already included in the README draft above).

If `npm run preview` doesn't already exist in package.json's scripts
section (it should, as a Vite default), add it:

```json
"scripts": {
  "preview": "vite preview"
}
```

## Implementation phases

Suggested commit sequence:

1. **Investigator Mode preset selector.** New `src/lib/presets.js`,
   `detectPreset` helper, UI changes to Investigative Methods panel,
   tests. ~8 tests.
2. **Favicon.** Generate SVG, drop into `public/`, update `index.html`
   link tags.
3. **Meta tags.** Add og: and twitter: meta tags to `index.html`. Skip
   og:image for now if it's hard to produce — note as TODO.
4. **README.** Replace existing README.md with the new version. Add
   screenshot if available.
5. **Preview script verification.** Run through the steps, confirm
   working, no code changes (or a one-line addition to package.json if
   missing).

Run `npm test`, `npm run lint`, `npm run build` after step 1. Steps 2-5
shouldn't affect tests or build, but run them anyway as final verification.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to ship a polish pass on Recognizer covering four small features:

1. Investigator Mode preset selector (the substantive one)
2. Favicon and meta tags
3. GitHub repo README
4. Verify `npm run preview` works

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/POLISH-PASS.md` (this doc) for the design.

Suggested order: ship #1 first, since it's the most likely to need
iteration. Then #2-4 in any order — they're polish items.

A few specific notes:

- **Investigator Mode default is Standard** (all depths = 1). Same as
  current default behavior.
- **Detect preset, don't store it.** The preset is a computed value
  derived from the four depth settings. When individual controls
  produce a non-preset configuration, the dropdown shows "Custom."
- **README "Origin" section** is optional. Ask me before including the
  AI-collaboration framing — it's a personal call about how to frame
  the project history.
- **Favicon design**: I'd like a red pushpin against an aged-paper
  background as the first try. Code Claude's call on the exact SVG
  shape; lean toward simple and recognizable at 16×16.
- **og:image**: skip if hard to produce well. Plain link previews still
  work. Easy to add later.
- **Screenshot for README**: I'll provide one separately if you don't
  have a clean way to generate one. Skip the image embed if needed and
  I'll add it manually.

Run `npm test`, `npm run lint`, `npm run build` after the
Investigator Mode work. Other steps shouldn't affect test/build state
but run as final verification.

Commit with messages like `feat(presets): investigator mode selector`,
`chore: favicon and meta tags`, `docs: rewrite README`, etc.

---
