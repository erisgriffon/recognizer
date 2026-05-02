# Feature: Film and TV Lookup

A handoff doc for adding a "media" node type that lets users submit films
or TV shows as evidence. Uses Wikipedia and Wikidata, no third-party API
keys required.

## Why this matters

Books are already a node type. Films and TV are conspicuously absent —
users wanting to add evidence about, say, *Twin Peaks* or *2001: A Space
Odyssey* currently have to use the generic "name" input, which doesn't
extract media-specific facts (release year, runtime, director, etc.).

This was originally punted because we assumed it'd require TMDB
(themoviedb.org), which needs an API key even on the free tier. We have
a project rule against features needing user-supplied keys. But Wikidata
covers films and TV thoroughly, and we already use Wikidata for
biographical/place data. The infrastructure is there; we just need a
new node type.

## Scope

A new `media` node type covering both films and TV. One input form
("FILM OR TV SHOW" with a query field and submit button), one resolution
flow (Wikipedia search → Wikidata fetch), one display pattern. Films and
TV share enough properties that splitting them into separate node types
adds complexity without benefit.

**Out of scope:**
- Video games (different Wikidata structure, save for later)
- Music albums (already handled via the audio node type, sort of)
- Specific episodes of TV shows (granularity not worth the complexity)
- Video file uploads (we don't process video, never have)
- Genre-based recommendations (this isn't Netflix)

## Wikidata properties to add

The existing `WIKIDATA_PROPERTIES` table in `src/lib/extractors/wikidata.js`
gets new entries:

```js
P577: { key: "publication date", isDate: true },          // release date for films
P580: { key: "start date", isDate: true },                // for TV series start
P582: { key: "end date", isDate: true },                  // for TV series end
P2047: { key: "duration", isQuantity: true },             // runtime in minutes
P2437: { key: "number of seasons", isQuantity: true },    // for TV
P1113: { key: "number of episodes", isQuantity: true },   // for TV
P136: { key: "genre", isEntity: true },                   // takes Q-number, like P31
P495: { key: "country of origin", isEntity: true },       // also Q-number
P57:  { key: "director", isEntity: true },                // for films, mostly
P58:  { key: "screenwriter", isEntity: true },
```

For the entity-typed properties (genre, country, director, screenwriter),
extend the `WIKIDATA_TYPES` lookup with common values:

```js
// Common genres
Q11424: "film", Q5398426: "television series",
Q130232: "drama film", Q188473: "action film", Q319221: "thriller film",
Q157394: "fantasy film", Q24925: "horror film", Q24862: "western film",
Q3072039: "documentary film", Q200092: "horror television series",
Q1437153: "drama television series", Q15637293: "comedy television series",
// ...add more as encountered

// Common countries (already partially in the table)
Q30: "United States", Q145: "United Kingdom", Q142: "France",
Q183: "Germany", Q17: "Japan", Q16: "Canada",
// ...
```

The genre/country lookup table is data, not code — Code Claude can add
the most common 20-30 entries during implementation and leave a comment
that the table can grow over time. Unknown Q-numbers fall back to
displaying the raw Q-code, which is fine.

For director/screenwriter properties, we don't try to resolve the
Q-number to a name in this initial implementation. Storing "directed by:
Q11448" as a fact is honest about what we have and saves us from needing
to make recursive Wikidata lookups. (A future improvement could resolve
the top 1-2 director credits per film, but that's optional.)

## The lookup flow

Mirror the existing book lookup pattern in `src/lib/extractors/misc.js`
(or wherever `lookupBook` lives — the existing pattern is the model):

```js
export const lookupMedia = async (query) => {
  // Wikipedia REST search, biased toward film/TV results
  const searchResp = await fetch(
    `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=5`
  );
  const searchData = await searchResp.json();

  // Find the first result whose description suggests film/TV
  // (e.g. "1968 film by Stanley Kubrick" or "American television series")
  const mediaResult = searchData.pages.find(p => {
    const desc = (p.description || "").toLowerCase();
    return desc.includes("film") || desc.includes("television") ||
           desc.includes("tv series") || desc.includes("movie");
  }) || searchData.pages[0]; // fallback to first result

  if (!mediaResult) return null;

  // Fetch the full summary to get extract and Q-number
  const summaryResp = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(mediaResult.key)}`
  );
  if (!summaryResp.ok) return null;
  const summary = await summaryResp.json();

  return {
    title: summary.title,
    extract: summary.extract || "",
    description: summary.description || null,
    thumbnail: summary.thumbnail?.source || null,
    wikidataId: summary.wikibase_item || null,
    queriedAs: query, // for the substitution-disclosure pattern
  };
};
```

The "biased toward film/TV results" filter is important. Searching for
"The Thing" without bias returns the disambiguation page or the wrong
result; biasing toward film/TV pulls the John Carpenter movie. The same
pattern handles ambiguous queries like "It," "The Office," or "Heat" —
each has a famous film/TV interpretation that's almost certainly what
the user meant.

## The node shape

```js
{
  id: "media-...",
  type: "media",
  name: "2001: A Space Odyssey",
  mediaType: "film", // or "television series"
  summary: "...",
  rawExtract: "...",
  description: "1968 film by Stanley Kubrick",
  wikidataId: "Q103474",
  instanceOf: "film",
  numbers: {
    "publication date year": 1968,
    "publication date month": 4,
    "publication date day": 2,
    "duration": 149,
    "number of seasons": null, // omitted for films
    // ... etc
  },
  numerology: {
    pythagorean: numerologyOf("2001 A Space Odyssey"),
    chaldean: chaldeanNumerologyOf("2001 A Space Odyssey"),
    deepReduced: null,
  },
  queriedAs: "2001",
  thumbnail: "...",
}
```

The `mediaType` field lets the table view distinguish films from TV in
display ("FILM • 1968 • 149 min" vs "TV • 1990-1991 • 30 episodes").

## Connection engine implications

The new node type participates in the existing connection engine without
changes. Numbers go into the numeric facts pool; numerology values match
against other nodes' numerology; the name string runs through anagram
detection.

A few specific connection opportunities worth noting:

- **Runtime collisions.** A film's duration in minutes is a number in
  the 60-180 range, which can match all sorts of other facts (page
  counts, day-of-year, etc.). This is the kind of low-strength
  coincidence the engine is built for.
- **Release year matches.** Films and TV have tightly clustered release
  years (lots of stuff released in the same year). Year facts already
  get the reduced-strength treatment, so this is fine.
- **Director/screenwriter as text.** When stored as raw Q-numbers, these
  aren't text-searchable for name-mention matching. If we resolved them
  to names later, two films sharing a director would auto-connect. Not
  in this batch.

## UI integration

A new input panel in the Investigative Methods area, placed after the
Book panel:

```jsx
<PanelGroup title="FILM OR TV SHOW" defaultOpen={false}>
  <input
    type="text"
    placeholder="2001: A Space Odyssey"
    value={mediaInput}
    onChange={(e) => setMediaInput(e.target.value)}
    style={inputStyle}
    onKeyDown={(e) => e.key === "Enter" && addMediaNode()}
  />
  <button onClick={addMediaNode} style={buttonStyle}>▸ LOOK UP</button>
</PanelGroup>
```

The `addMediaNode` function follows the same shape as `addBookNode`:

```js
const addMediaNode = async (presetQuery = null) => {
  const query = (presetQuery || mediaInput).trim();
  if (!query) return;
  setLoading("Cross-referencing media archives…");
  const media = await lookupMedia(query);
  if (!media) {
    setLoading(null);
    setError("No film or TV show found matching that query.");
    return;
  }

  let wikidata = null;
  if (media.wikidataId) {
    setLoading("Cross-referencing Wikidata…");
    wikidata = await fetchWikidataFacts(media.wikidataId);
  }

  const facts = wikidata?.facts || {};
  const node = {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "media",
    mediaType: wikidata?.instanceOf || "media",
    name: media.title,
    summary: media.extract.slice(0, 220),
    rawExtract: media.extract,
    description: media.description,
    wikidataId: media.wikidataId,
    instanceOf: wikidata?.instanceOf || null,
    numbers: facts,
    numerology: {
      pythagorean: pythagoreanNumerologyOf(media.title),
      chaldean: chaldeanNumerologyOf(media.title),
      deepReduced: null,
    },
    queriedAs: query !== media.title.toLowerCase() ? query : null,
    thumbnail: media.thumbnail,
  };

  setNodes(n => [...n, node]);
  if (!presetQuery) setMediaInput("");
  setLoading(null);
};
```

The `presetQuery` parameter follows the same pattern as other node-adders
— supports the demo button, randomize button, and case file import.

Update the table view rendering to handle media nodes specifically, showing
the mediaType badge alongside director/year/runtime when available. The
existing `instanceOf` badge logic should mostly handle this; verify it
displays "film" or "television series" appropriately.

## Share serialization

Add to `src/lib/share/serialize.js` in the `serializeNode` switch:

```js
case "media":
  return { t: "media", v: node.queriedAs || node.name };
```

And in the import flow's switch:

```js
case "media":
  await addMediaNode(seed.v);
  break;
```

The seed format is just the original query string; the recipient's app
re-runs the lookup. This means shared case files automatically benefit
from any future Wikipedia/Wikidata data improvements.

## Demo and randomize

Update `src/data/pools.js` to include media entries in the demo set and
random pools. Suggested defaults:

```js
// In DEMO_SET, add:
{ type: "media", value: "2001: A Space Odyssey" },

// In RANDOM_POOLS.media (new pool):
RANDOM_POOLS.media = [
  "Twin Peaks", "The X-Files", "Vertigo", "The Conversation",
  "All the President's Men", "Three Days of the Condor",
  "JFK", "The Manchurian Candidate", "The Parallax View",
  "Network", "Dr. Strangelove",
  // Lean toward paranoid-thriller titles since they fit the investigator's vibe
];
```

The demo set should produce visible connections — pairing the film with
existing demo entries like Tesla and a date should produce some
year-mention or numerology hits.

## Tests

Pure helper tests:
- `lookupMedia` returns the expected shape (mockable via fetch stub).
- The film/TV bias filter prefers media results over disambiguation pages.
- `serializeNode` handles media type correctly.

Integration tests are harder (they involve real network), so manual
verification:
- Look up "2001: A Space Odyssey" and confirm director, year, runtime
  populate.
- Look up "Twin Peaks" and confirm episode count and seasons populate.
- Look up "It" (ambiguous) and confirm a film/TV result is returned, not
  a disambiguation page.
- Generate a dossier with a media node and a date node, confirm
  connections fire.

About 8 tests total.

## Implementation phases

This is small enough to ship as one PR with focused commits:

1. **Wikidata property additions and type lookups.** Update
   `WIKIDATA_PROPERTIES` and `WIKIDATA_TYPES` with the new entries.
2. **`lookupMedia` extractor.** New function in
   `src/lib/extractors/misc.js` (or a new `media.js` module if cleaner).
3. **Node creation flow.** `addMediaNode` in Recognizer.jsx, following
   the book pattern.
4. **UI integration.** New input panel, table view rendering for media
   nodes.
5. **Share serialization.** Add to serialize/deserialize switches.
6. **Demo and random pools.** Update the data files.

## First prompt for Code Claude

Paste this into a fresh Claude Code session:

---

I'd like to add film and TV lookup to Recognizer using Wikipedia and
Wikidata. This was originally punted because we assumed TMDB was
required, but Wikidata covers films and TV well and we already use it
for biographical data.

Please read these in order before starting:
1. `CLAUDE.md` and `docs/DESIGN.md` for project context.
2. `docs/MEDIA-LOOKUP.md` (this doc) for the design.

The plan is one PR with six focused commits, all following patterns
established by the existing book lookup feature.

A few specific notes:

- **Single combined node type.** Films and TV shows share enough
  properties to use one `media` node type. The `mediaType` field
  ("film" or "television series") differentiates them in display.
- **Bias toward film/TV in search.** Wikipedia disambiguation is
  ambiguous for titles like "It" or "The Thing." The `lookupMedia`
  function should prefer search results whose description mentions
  "film" or "television."
- **Don't resolve director/screenwriter Q-numbers.** Store them as raw
  Q-numbers for now. Resolving to names is a future improvement that
  needs careful design (recursive lookups, rate limits).
- **The genre and country lookup tables are data.** Add the most common
  20-30 entries during implementation. Leave a comment that the tables
  can grow.
- **Random pool theme.** The film/TV pool should lean toward
  paranoid-thriller titles (Twin Peaks, JFK, The Conversation, etc.) —
  fits the investigator's vibe better than rom-coms.

Run `npm test`, `npm run lint`, `npm run build` after each commit.

---
