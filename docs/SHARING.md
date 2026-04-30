# Feature: Case File Sharing

A handoff doc for replacing the current "copy JSON to clipboard" share button
with a real share mechanism: shareable URLs that encode the case file's seed
state in the URL fragment, decoded on load to reconstruct the investigation.

## Why this matters

The current SHARE button has been broken-by-design since v0.1. It copies a
JSON blob to the clipboard with no documented destination. There's no
import flow. The button's promise ("a friend can fork your descent") has
always been false.

This is the fix.

## Goal

A user clicks SHARE. They get a URL on their clipboard. They paste it
anywhere — chat, email, social media. The recipient clicks the URL, lands
on Recognizer, and the same case file (or a faithful reconstruction of it)
is loaded and ready to extend or generate a dossier from.

No backend. No server-stored state. Everything client-side, including the
URL encoding, including the decoding. The privacy footer's promise stays
intact.

## Scope

Five things ship together:

1. **A serializer** that converts the current case file to a minimal "seed"
   representation suitable for URL encoding.
2. **A deserializer** that reconstructs the case file from a seed,
   re-running API calls to rehydrate Wikipedia/Wikidata/Open Library data.
3. **URL fragment integration** — write to `#case=...` on share, read from
   `#case=...` on load.
4. **Replace the existing SHARE button** with the new URL-share flow. Keep
   a power-user "export full state as JSON" option for backup.
5. **Privacy reminder** in the share UI.

## Out of scope

- Server-stored case files. We're not building a backend.
- Sharing uploaded media (images, audio files). Those don't fit in URLs;
  the share will note their absence at the recipient's end.
- Real-time collaboration. The share is one-way and snapshot-based.
- Diffing or merging shared case files. If your friend extends a case
  file and shares it back, you re-import their version; we don't try to
  merge.
- Encryption. URLs are inherently public to anyone they're shared with;
  we don't pretend otherwise.

## The case file shape

A serialized case file is JSON of this shape:

```js
{
  v: 1,                          // format version, for future migration
  d: "2026-04-29",               // creation date (informational)
  n: [                           // nodes, as seeds
    { t: "name", v: "Nikola Tesla" },
    { t: "text", v: "Call me Ishmael..." },
    { t: "date", v: "1969-07-20", l: "moon landing" },
    { t: "location", v: "Roswell, New Mexico" },
    { t: "url", v: "https://example.com" },
    { t: "book", v: "Foucault's Pendulum" },
    { t: "image", v: { name: "11429.jpg", placeholder: true } },
    { t: "audio", v: { name: "song.mp3", placeholder: true } },
    { t: "today" },              // promoted today nodes
  ],
  s: {                           // settings, only non-default values
    numerologyDepth: 2,          // example
  }
}
```

**Compactness matters.** The single-character keys (`v`, `d`, `n`, `t`, `l`,
`s`) trim bytes, which matters when this gets URL-encoded and base64'd.
With LZ-string compression on top, a typical 10-node case file should fit
under 1KB in the URL.

**Settings are sparse.** Only include settings that differ from defaults.
A user who hasn't changed any settings produces an `s: {}` (or omits the
key entirely). This keeps shared URLs short for the common case.

## Phase 1: Serialization

**New module: `src/lib/share/serialize.js`**

```js
/**
 * Convert a case file to a minimal seed representation.
 * Strips reproducible derived data (Wikipedia extracts, fact maps,
 * numerology values) since those will be regenerated on import.
 *
 * For uploaded media (images, audio), we serialize only the filename
 * and a placeholder flag — the recipient's app will create a degraded
 * placeholder node since we can't reasonably encode the bytes.
 */
export const serializeCaseFile = (nodes, settings) => {
  const seedNodes = nodes.map(serializeNode).filter(Boolean);
  const seedSettings = pruneSettings(settings);
  return {
    v: 1,
    d: new Date().toISOString().slice(0, 10),
    n: seedNodes,
    ...(Object.keys(seedSettings).length > 0 && { s: seedSettings }),
  };
};

const serializeNode = (node) => {
  switch (node.type) {
    case "name":
      return { t: "name", v: node.name };
    case "text":
      return { t: "text", v: node.rawText };
    case "date":
      // node.name is "label: ISO" — split it back apart
      const [label, iso] = parseDateNodeName(node.name);
      return { t: "date", v: iso, l: label };
    case "location":
      return { t: "location", v: node.name };
    case "url":
      return { t: "url", v: node.url };
    case "book":
      // Use the original query if available, since Open Library is fuzzy
      return { t: "book", v: node.queriedAs || node.name };
    case "today":
      return { t: "today" }; // no value needed; rebuilt on import
    case "image":
    case "audio":
      return { t: node.type, v: { name: node.name, placeholder: true } };
    default:
      return null; // unknown node type, skip
  }
};

const DEFAULT_SETTINGS = {
  numerologyDepth: 1,
  enableAnagrams: true,
  enableAstrology: true,
  enableLeyLines: true,
  devMode: false,
};

const pruneSettings = (settings) => {
  const pruned = {};
  for (const [k, v] of Object.entries(settings)) {
    if (DEFAULT_SETTINGS[k] !== v) pruned[k] = v;
  }
  return pruned;
};
```

**Tests for this phase:** about 10 cases.

- Each node type round-trips through `serializeNode` to its expected seed.
- A case with all default settings produces no `s` field.
- A case with one non-default setting produces `s: { setting: value }`.
- Uploaded media nodes produce placeholder seeds with name preserved.
- Unknown node types return null and are filtered out.
- The version number is `1`.

## Phase 2: Deserialization

**New module: `src/lib/share/deserialize.js`**

This is the more complex side. We're reconstructing live nodes from
seeds, which requires re-running the same API calls the original creation
flows used. The right approach is to *reuse the existing node-creation
functions in Recognizer.jsx* rather than re-implementing them in the
deserializer.

That means deserialize is best implemented as a **method on the Recognizer
component** rather than a pure helper. It calls `addNameNode(seed.v)`,
`addTextNode(seed.v)`, etc. — the same functions that handle the input
form submissions. This guarantees that imported nodes are identical to
freshly-created ones.

```js
// Pseudocode for the import flow, lives in Recognizer.jsx:

const importCaseFile = async (caseFile) => {
  setNodes([]); // start clean
  setLoading("Reconstructing case file…");

  // Apply settings first so they affect node creation
  if (caseFile.s) {
    setSettings(s => ({ ...s, ...caseFile.s }));
  }

  for (const seed of caseFile.n) {
    switch (seed.t) {
      case "name":
        await addNameNode(seed.v);
        break;
      case "text":
        addTextNode(seed.v);
        break;
      case "date":
        addDateNode({ iso: seed.v, label: seed.l });
        break;
      case "location":
        await addLocationFromSearch(seed.v);
        break;
      case "url":
        // need to handle this without depending on urlInput state
        await importUrlNode(seed.v);
        break;
      case "book":
        await addBookNode(seed.v);
        break;
      case "today":
        promoteToday();
        break;
      case "image":
      case "audio":
        addPlaceholderMediaNode(seed.t, seed.v);
        break;
    }
  }
  setLoading(null);
};
```

**Two implementation notes:**

The existing `addNameNode`, `addLocationFromSearch`, `addBookNode` already
take a `presetName` parameter, which is exactly what we need. They were
originally added for the demo and randomize features and turn out to be
perfect for import too. Re-use them; don't duplicate them.

The existing `addUrlNode` reads from `urlInput` state instead of taking a
parameter. We need to either refactor it to accept a value parameter (the
clean fix) or write a small `importUrlNode(url)` that does the same work.
I'd recommend the refactor — pass the URL as an optional parameter just
like the other nodes, defaulting to `urlInput` when omitted. Same change
pattern that's already in place for the other extractors.

**The placeholder media node:**

```js
const addPlaceholderMediaNode = (type, info) => {
  const node = {
    id: `${type}-placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    name: info.name,
    placeholder: true,
    summary: `(${type} from sender's local files — not transmitted)`,
    numbers: {
      "filename chars": info.name.length,
    },
    numerology: numerologyOf(info.name),
  };
  setNodes(n => [...n, node]);
};
```

The placeholder retains the filename (which is real, the sender typed it)
and produces a small set of facts based on the filename alone. It does NOT
produce a fake image or audio file. The table view should show the
placeholder with an explanatory note: *"Image not shared — original file
remained on sender's device."*

Update `ConnectionMap` and the table view to handle `placeholder: true`
nodes — they should render visibly differently (maybe a dashed border on
the corkboard card, or a "PLACEHOLDER" tag in the table view) so the
recipient understands the case is degraded.

**Tests for this phase:** harder to test in isolation since it depends on
the component's node-creation methods. Two approaches:

1. Extract the pure parts (the placeholder builder, the seed → arguments
   mapping) into `share/deserialize.js` and test those.
2. Trust the integration via the URL-fragment flow's smoke test (Phase 3).

I'd do both. Test the placeholder builder thoroughly (5 cases or so), and
let the larger integration get verified by manual import testing.

## Phase 3: URL fragment encoding and decoding

**New module: `src/lib/share/url.js`**

Uses LZ-string for compression. Add to `package.json`:

```json
{
  "dependencies": {
    "lz-string": "^1.5.0"
  }
}
```

```js
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

const FRAGMENT_KEY = "case";

export const encodeCaseFileToFragment = (caseFile) => {
  const json = JSON.stringify(caseFile);
  const compressed = compressToEncodedURIComponent(json);
  return `${FRAGMENT_KEY}=${compressed}`;
};

export const decodeCaseFileFromFragment = (fragment) => {
  if (!fragment) return null;
  const cleaned = fragment.replace(/^#/, "");
  const params = new URLSearchParams(cleaned);
  const value = params.get(FRAGMENT_KEY);
  if (!value) return null;
  try {
    const json = decompressFromEncodedURIComponent(value);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed.v !== 1) return null;
    return parsed;
  } catch (e) {
    return null;
  }
};
```

**Why URLSearchParams inside the fragment?** Future-proofing. If we later
want to add other fragment-based parameters (like `#view=table` or
`#tab=settings`), the existing `case=` param won't conflict. It's also
the convention browsers parse most consistently.

**On size:** the practical URL limit is 2,000 characters for cross-platform
compatibility. With LZ-string compression on JSON of the shape above,
that's roughly 30-50 nodes worth of seed data. For typical case files
that's plenty. If a user creates a massive case file that exceeds the
URL limit, the share UI should degrade gracefully — see Phase 4.

**On the URL itself:** generated as `${window.location.origin}${window.location.pathname}#${encoded}`. We use the current path so this works regardless of where the app is hosted (recognizer.observer, a localhost dev server, a Cloudflare Pages preview, whatever).

**Tests for this phase:** about 5 cases.

- Round trip: `decode(encode(caseFile)) === caseFile`.
- Decoding an empty fragment returns null.
- Decoding malformed base64 returns null without throwing.
- Decoding a valid format with wrong version number returns null.
- The encoded form is URL-safe (no characters that need further escaping).

## Phase 4: UI integration

**Replace the existing SHARE button.** It currently calls `shareState`
which does the JSON-clipboard thing. Replace with a flow that:

1. Calls `serializeCaseFile(nodes, settings)`.
2. Encodes via `encodeCaseFileToFragment`.
3. Constructs the full URL.
4. Checks the URL length. If under ~2000 chars, copies to clipboard with
   a confirmation message. If over, shows a polite "your case file is too
   large for URL sharing — try the JSON export instead" message and offers
   the JSON-export fallback.
5. Includes the privacy reminder (see below).

```js
const shareCaseFile = async () => {
  const caseFile = serializeCaseFile(nodes, settings);
  const fragment = encodeCaseFileToFragment(caseFile);
  const url = `${window.location.origin}${window.location.pathname}#${fragment}`;

  if (url.length > 2000) {
    setWarning("Case file too large to share via URL. Use 'Export full state as JSON' for backup, or remove some evidence.");
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    setShareConfirm(`Link copied. Anyone with the URL can view this case file. Don't share investigations of real people you wouldn't want public.`);
  } catch (e) {
    setShareConfirm(`Could not copy automatically. Here's the URL:\n\n${url}`);
  }
};
```

The `setShareConfirm` state drives a modal or toast that displays the
privacy reminder along with the success message. The reminder is part of
the success path — it's not a warning that blocks sharing, but it should
be visually present so the user reads it before deciding to send the URL.

**Add JSON export as a separate button.** Power users may want to back up
their case file locally:

```js
const exportCaseFileAsJSON = () => {
  const caseFile = serializeCaseFile(nodes, settings);
  const blob = new Blob([JSON.stringify(caseFile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recognizer-case-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

UI suggestion: keep the primary `⇗ SHARE` button for URL-share. Add a
small `�️ EXPORT JSON` button alongside it (or hide it inside an "advanced"
disclosure). Don't let the JSON option clutter the primary share flow.

## Phase 5: Loading from URL on app mount

**In Recognizer.jsx, on first mount:**

```js
useEffect(() => {
  const hash = window.location.hash;
  if (!hash) return;
  const caseFile = decodeCaseFileFromFragment(hash);
  if (caseFile) {
    importCaseFile(caseFile);
    // Clear the hash so reloads don't re-import (and the URL stays clean)
    history.replaceState(null, "", window.location.pathname);
  }
}, []);
```

The `history.replaceState` call is important — without it, the URL stays
ugly and a refresh would re-trigger the import. After loading, the user's
URL bar shows just `recognizer.observer/` like normal.

**Edge cases to handle:**

- Hash present but malformed: import returns null, app continues normally
  with empty case file. No error to user — bad URLs just silently fail.
- User has existing nodes from a previous session that got persisted (we
  don't currently persist, but we might later): clear them before import.
- Import fails partway through (one of the API calls 404s): show what
  imported successfully, log the failures, don't roll back. Partial
  imports are better than no imports.

## Privacy reminder copy

Suggested wording for the share-success confirmation:

> ✓ Link copied to clipboard.
>
> Anyone with this URL can view your case file. Don't share investigations
> of real people you wouldn't want public.

That's short, honest, and respects the user's autonomy without being
preachy. It also implicitly clarifies the threat model — the URL is the
secret. If they share it carefully, the case is private; if they paste
it publicly, the case is public.

This text should be styled as a normal paragraph, not as a giant warning
banner. The investigator's voice would reasonably mention this once and
then trust the reader to behave like an adult.

## Testing summary

About 25-30 new tests across the four pure modules:

- `serializeCaseFile` and `serializeNode` — 10 cases
- `encodeCaseFileToFragment` and `decodeCaseFileFromFragment` round trip — 5 cases
- `pruneSettings` — 3 cases
- The placeholder media node builder — 5 cases
- Edge cases (malformed input, version mismatches, empty case files) — 5 cases

The integration (URL on mount, share button click, etc.) is verified by
manual testing. Spinning up Playwright for end-to-end tests would be
nice eventually but not required for this batch.

## Forward-compat notes

The format version (`v: 1`) lets us evolve the schema later. If we ever
change the seed shape — adding new node types, restructuring how settings
are encoded, etc. — we bump the version and the deserializer can handle
old versions specifically:

```js
if (parsed.v === 1) return parsed;
if (parsed.v === 2) return migrateV2ToV1(parsed); // future
return null; // unknown version
```

This is a "future you" gift that costs ~5 lines now.

The `s` (settings) object is a key-value bag and tolerates new keys
naturally. When we add depth selectors for astrology, anagrams, ley lines
etc., they'll just appear in `s` when non-default. No schema migration
needed for additive changes.

## File structure

New files:

```
src/lib/share/
├── serialize.js       # serializeCaseFile, serializeNode, pruneSettings
├── deserialize.js     # placeholder builder, seed → args mapping
└── url.js             # encodeCaseFileToFragment, decodeCaseFileFromFragment
```

The actual import flow (`importCaseFile`) lives in Recognizer.jsx because
it needs access to all the existing node-creation methods. That's fine —
keep it close to the code it depends on.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to replace Recognizer's broken-by-design SHARE button (currently
copies useless JSON to clipboard) with a real share-via-URL feature.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/SHARING.md` (this doc) for the full design.

The plan is five phases shipping as one feature. You may commit each
phase separately within the same branch:

**Phase 1: Serialization.** New `src/lib/share/serialize.js` module.
About 10 tests.

**Phase 2: Deserialization.** New `src/lib/share/deserialize.js` for the
pure parts (placeholder media node builder). The `importCaseFile`
function lives in Recognizer.jsx because it needs the existing
node-creation methods. While in there, refactor `addUrlNode` to accept
an optional URL parameter (matching the pattern of the other
node-creation functions). About 5 tests.

**Phase 3: URL encoding.** New `src/lib/share/url.js` using lz-string
(add to package.json). About 5 tests.

**Phase 4: UI integration.** Replace the existing share button with the
URL-share flow. Add a separate "Export JSON" button for power-user
backup. Include the privacy reminder in the share-success message.

**Phase 5: Load from URL on mount.** useEffect in Recognizer.jsx that
reads the hash, decodes, imports if valid, then clears the hash via
history.replaceState.

Important constraints:
- No backend. Everything stays client-side.
- The URL fragment (`#case=...`) is what gets shared, never query
  parameters. Fragments aren't sent to servers.
- Uploaded media (images, audio) get placeholder nodes on the
  recipient's end — we don't transmit file bytes via URL.
- Format versioning (`v: 1`) is included from day one for future
  migration room.
- The privacy reminder appears in the share-success confirmation, not
  as a blocking modal. Trust the user.
- Re-use existing node-creation methods (`addNameNode`,
  `addLocationFromSearch`, etc.) for import rather than duplicating
  their logic. They already accept preset values for the demo/randomize
  features.

Run `npm test`, `npm run lint`, `npm run build` after each phase.
Commit with messages like `feat(share): phase N — <description>`. Open
one PR with all five commits.

If anything in the design seems wrong once you're in the code (for
example, if my assumptions about `addUrlNode`'s current signature are
off, or if the existing share button is wired up differently than I'm
describing), flag it before working around it silently. The doc
describes my model of the code; the code is the source of truth.

---
