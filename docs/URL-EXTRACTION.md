# Feature: URL Extraction

A handoff doc for making URL nodes useful when the page fetch fails (which
is most of the time, because CORS), and for pulling structured facts from
Wikidata when the URL is the official site of a known entity. Two phases
shipping as a single cohesive feature.

## Why this matters

URL nodes are the weakest evidence type in Recognizer right now. When
`fetchUrlContent` succeeds, the node gets `rawText`, `tokens`, `letterFreq`,
`page char count`, `page word count` — enough to participate in
word-overlap, stylometric, and wordcount-year connections. When it fails
— and it fails on most URLs the user submits, because CORS — the node is
left with six counting facts (url chars, domain chars, etc.) and one
numerology entry. That's a thin node. The user submitted real evidence and
got back something that barely participates.

Two things conspire here. First, CORS isn't fixable client-side: most
sites don't send `Access-Control-Allow-Origin` headers, the browser
blocks the read, and there's nothing the page can do about it. Second,
the numerology source for URL nodes currently includes the `https://`
scheme and `www.` subdomain — boilerplate the user didn't choose, which
adds a fixed ~150 to every Pythagorean sum across all URLs. Two
unrelated URLs share that baseline. They collide with each other more
than they should, purely because of protocol cruft.

This feature does two things:

1. **Strip scheme and `www.` from the numerology source.** Tiny change,
   immediate quality improvement, no new APIs.
2. **Query Wikidata for the URL's owning entity.** If the URL is the
   official site of an entity Wikidata knows about — most companies,
   universities, museums, government sites — pull structured facts
   (founding year, employee count, location, instanceOf) the same way
   name and location nodes already do. When this hits, the URL node
   becomes one of the fact-richer evidence types, not the thinnest.

A third path (a user-supplied CORS proxy for actually fetching arbitrary
pages) is **out of scope** here. It's a real product question with
privacy implications — DESIGN.md already mentions it under "Things we
considered but didn't ship" and it deserves its own conversation, not
a quiet bundle into this branch.

## Scope

Two phases shipping together as one feature:

1. **Numerology cleanup.** Add a cleaned `numerologySource` to
   `analyzeUrl`'s return shape. Have `addUrlNode` use it instead of the
   raw URL string for numerology. Tests in `misc.test.js`.
2. **Wikidata-on-URL lookup.** New `lookupWikidataByUrl(url)` in
   `wikidata.js` that does a SPARQL query against the Wikidata Query
   Service. Wire into `addUrlNode` so that on a hit, we call the
   existing `fetchWikidataFacts(qid)` and merge structured facts into
   the node. Footer update for the new external lookup. Tests in
   `wikidata.test.js` (new file).

## Forward-compatibility constraint

We're going to add more extractors over time. The URL pipeline built
here must NOT special-case URL as a type at the engine layer:

- All new facts go through `node.numbers` in the existing
  `{label: value}` shape. The connection engine reads them generically;
  it doesn't need to know they came from Wikidata-via-URL versus
  Wikidata-via-name.
- The `instanceOf` and `wikidataId` fields URL nodes will start carrying
  match the shape name and location nodes already use, so the existing
  Table view rendering picks them up for free. No new render branches.
- Numerology source cleanup lives in `analyzeUrl` (the extractor), not
  in `pythagoreanNumerologyOf` (the primitive). The primitive stays
  general-purpose; only the URL extractor knows that URLs have
  boilerplate prefixes to strip.

## Phase 1: Numerology cleanup

**What changes.** In `src/lib/extractors/misc.js`, `analyzeUrl` returns
an additional field `numerologySource` containing the URL with scheme
and leading `www.` removed. In `src/components/Recognizer.jsx`,
`addUrlNode` passes that field (not `parsed.url`) to
`pythagoreanNumerologyOf` and `chaldeanNumerologyOf`.

**The edit to `analyzeUrl`.** Currently:

```js
return {
  url: urlString,
  domain,
  path,
  tld: domain.split(".").pop(),
  numbers,
};
```

Add one line before the return:

```js
// Cleaned form for numerology: drop scheme and leading www. so URL
// numerology reflects the user-chosen part of the URL, not protocol
// boilerplate that's identical across every URL submitted.
const numerologySource = domain.replace(/^www\./, "") + path;

return {
  url: urlString,
  domain,
  path,
  tld: domain.split(".").pop(),
  numerologySource,
  numbers,
};
```

**The edit to `addUrlNode`.** Currently:

```js
numerology: {
  pythagorean: pythagoreanNumerologyOf(parsed.url),
  chaldean: chaldeanNumerologyOf(parsed.url),
  deepReduced: null,
},
```

Change to:

```js
numerology: {
  pythagorean: pythagoreanNumerologyOf(parsed.numerologySource),
  chaldean: chaldeanNumerologyOf(parsed.numerologySource),
  deepReduced: null,
},
```

That's the whole code change for Phase 1. Two lines in two files.

**A note on query strings and fragments.** `URL.pathname` excludes the
query string and fragment, which is intentional and correct. Query
strings are usually session/tracking junk (`?utm_source=...`,
`?ref=...`) and would generate spurious URL-to-URL matches between
unrelated visits to the same site. We want path content because the user
chose the path; we don't want query strings because the tracker chose
those. Leave this behavior as-is.

**Tests.** Add to `src/lib/extractors/misc.test.js` — there's already a
`describe("lookupMedia")` block; add a new sibling `describe("analyzeUrl")`
block. Three tests, all calling the function directly (no mocks needed —
it's pure):

1. `analyzeUrl("https://example.com/foo")` returns `numerologySource`
   equal to `"example.com/foo"` (no scheme).
2. `analyzeUrl("https://www.example.com/foo")` returns `numerologySource`
   equal to `"example.com/foo"` (no scheme, no `www.`).
3. `analyzeUrl("https://api.example.com/foo")` returns `numerologySource`
   equal to `"api.example.com/foo"` — only `www.` is stripped, not any
   other subdomain. We're stripping noise, not normalizing.

About 3 tests. The existing url-handling assertions, if any, keep
passing unchanged — we added a field, we didn't change one.

## Phase 2: Wikidata-on-URL lookup

This is the bigger lift. It adds a SPARQL query against the Wikidata
Query Service, normalizes URL variants to handle inconsistent Wikidata
storage, and merges any returned structured facts into the URL node.

### Privacy disclosure first

Before code: this phase sends every submitted URL to
`query.wikidata.org`. The current privacy footer reads:

> Your evidence stays in your browser. Names and place searches are
> sent to Wikipedia and OpenStreetMap for lookup; books are queried
> via Open Library. Map tiles served by Stadia Maps. Recognizer itself
> logs and stores nothing.

After Phase 2, that's no longer accurate — URLs are now sent to
Wikidata for lookup. Update the footer text in `Recognizer.jsx` to add
Wikidata to the list of external services that get user-submitted
queries. Suggested wording:

> Your evidence stays in your browser. Names, place searches, and
> submitted URLs are sent to Wikipedia, Wikidata, and OpenStreetMap
> for lookup; books are queried via Open Library. Map tiles served by
> Stadia Maps. Recognizer itself logs and stores nothing.

This footer update is part of Phase 2 and must ship in the same commit
as the lookup code. Shipping the lookup without the disclosure
update means the privacy notice is silently inaccurate for however
long it takes to notice. That's the kind of thing DESIGN.md gets a
sad lessons-learned entry about.

### The lookup function

New export in `src/lib/extractors/wikidata.js` (same file as
`fetchWikidataFacts`):

```js
/**
 * Try to identify the Wikidata entity that owns a given URL via the
 * "official website" property (P856). Returns a Q-number string, or
 * null. Tries a handful of URL normalization variants because
 * Wikidata stores official-website URLs inconsistently across entities
 * (some with trailing slash, some without; some with www., some
 * without).
 *
 * Best-effort: any network or parse error returns null. Never throws.
 */
export const lookupWikidataByUrl = async (url) => {
  if (!url) return null;
  const variants = urlVariants(url);
  if (variants.length === 0) return null;
  const filter = variants.map((v) => `<${v}>`).join(", ");
  const sparql = `
    SELECT ?item WHERE {
      ?item wdt:P856 ?url .
      FILTER (?url IN (${filter}))
    }
    LIMIT 1
  `.trim();
  try {
    const endpoint = "https://query.wikidata.org/sparql";
    const res = await fetch(
      `${endpoint}?format=json&query=${encodeURIComponent(sparql)}`,
      { headers: { Accept: "application/sparql-results+json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const binding = data?.results?.bindings?.[0];
    const uri = binding?.item?.value;
    if (!uri) return null;
    const m = /Q\d+$/.exec(uri);
    return m ? m[0] : null;
  } catch (e) {
    return null;
  }
};
```

Plus a small helper, also in `wikidata.js`:

```js
// URL variants to try against Wikidata's P856. Wikidata stores official
// websites with inconsistent normalization, so we generate a small set
// of plausible forms and FILTER against all of them in one query.
// Order doesn't matter — the SPARQL FILTER is set-membership.
const urlVariants = (url) => {
  let u;
  try { u = new URL(url); } catch { return []; }
  // Strip query and fragment — official-website properties never carry them.
  const origin = u.origin;
  const path = u.pathname.replace(/\/$/, ""); // no trailing slash
  const pathSlash = path + "/";              // with trailing slash
  // Build with and without www. on the hostname.
  const host = u.hostname;
  const altHost = host.startsWith("www.") ? host.slice(4) : "www." + host;
  const altOrigin = `${u.protocol}//${altHost}`;
  // And both http and https.
  const protocols = new Set([u.protocol, "https:", "http:"]);
  const hosts = new Set([host, altHost]);
  const paths = new Set([path, pathSlash, ""]); // also try bare origin
  const out = new Set();
  for (const proto of protocols) {
    for (const h of hosts) {
      for (const p of paths) {
        out.add(`${proto}//${h}${p}`);
      }
    }
  }
  return Array.from(out);
};
```

That's deliberately broad — up to 18 variants per URL. The cost is one
SPARQL FILTER clause, which is cheap. The benefit is that fuzzy storage
in Wikidata doesn't silently fail the lookup. Don't try to optimize this
down — every variant that's missing is a class of legitimate match
silently lost.

### Wiring into `addUrlNode`

Currently `addUrlNode` in `Recognizer.jsx` does:

```js
const parsed = analyzeUrl(url);
if (!parsed) { setWarning("That URL is not valid."); return; }

setLoading("Attempting to fetch URL contents…");
const text = await fetchUrlContent(url);
setLoading(null);

const baseNode = { ... };
if (text) { ... }
setNodes((n) => [...n, baseNode]);
```

Insert the Wikidata lookup between the URL parse and the node assembly.
On a hit, fetch full Wikidata facts and merge them:

```js
const parsed = analyzeUrl(url);
if (!parsed) { setWarning("That URL is not valid."); return; }

setLoading("Attempting to fetch URL contents…");
const text = await fetchUrlContent(url);

// Wikidata lookup runs regardless of whether the page fetch succeeded.
// On a hit, structured facts get merged into the node alongside any
// page-derived facts. On a miss, the node is no worse off.
setLoading("Cross-referencing Wikidata…");
const wikidataId = await lookupWikidataByUrl(url);
let wikidata = null;
if (wikidataId) {
  wikidata = await fetchWikidataFacts(wikidataId);
}
setLoading(null);

const baseNode = {
  id: "url-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
  type: "url",
  name: parsed.domain,
  url: parsed.url,
  domain: parsed.domain,
  path: parsed.path,
  numbers: { ...parsed.numbers, ...(wikidata?.facts || {}) },
  wikidataId: wikidataId || null,
  instanceOf: wikidata?.instanceOf || null,
  numerology: {
    pythagorean: pythagoreanNumerologyOf(parsed.numerologySource),
    chaldean: chaldeanNumerologyOf(parsed.numerologySource),
    deepReduced: null,
  },
};
if (text) { /* unchanged */ }
setNodes((n) => [...n, baseNode]);
```

Two things to notice about the merge order:

- `{ ...parsed.numbers, ...(wikidata?.facts || {}) }` puts Wikidata
  facts second, so on the unlikely chance of a key collision (a URL
  with a path that happens to match a Wikidata fact label), Wikidata
  wins. Wikidata facts are more interesting; the URL-derived ones are
  baseline. This ordering bias is intentional.
- The `if (text)` block still runs and adds `rawText`, `tokens`,
  `letterFreq`, `page char count`, `page word count`. Those layer on
  top of both. A successful fetch + Wikidata hit produces the
  richest URL node possible. A failed fetch + Wikidata hit is still
  far better than today's failed-fetch case.

Add the new import at the top of `Recognizer.jsx`:

```js
import { fetchWikidataFacts, lookupWikidataByUrl } from "../lib/extractors/wikidata.js";
```

(Replacing the existing `fetchWikidataFacts` import.)

### Why two loading messages

The loading flow goes: "Attempting to fetch URL contents…" → (await
the fetch, which can take 5–10 seconds before timing out on CORS) →
"Cross-referencing Wikidata…" → (await the Wikidata lookup) → null.

This is deliberate. The page-fetch attempt is the slow part of the
flow, and currently the user sees no indication that the app is still
working after the fetch times out. Updating the loading message before
the Wikidata call tells them work is still happening. It's also honest
about what's being sent where — the user sees Wikidata named at the
moment we contact it.

### Tests

New file `src/lib/extractors/wikidata.test.js`. The pattern matches
`misc.test.js`: stub `global.fetch` with a sequence, call the function,
assert on the result. Tests:

1. `lookupWikidataByUrl(null)` returns null without calling fetch.
2. `lookupWikidataByUrl("not-a-url")` returns null (URL constructor
   throws → caught → empty variants → empty FILTER → would query but
   we should short-circuit on the empty variants case). Verify no
   fetch was made.
3. Happy path: stub returns a binding with `?item` pointing to a
   Wikidata entity URI like `http://www.wikidata.org/entity/Q478214`.
   Assert the function returns the Q-number string `"Q478214"`.
4. No-results path: stub returns
   `{ results: { bindings: [] } }`. Assert null.
5. Non-OK response: stub returns `{ ok: false }`. Assert null.
6. Network throw: stub throws. Assert null, not a thrown error.
7. SPARQL query structure: assert the URL passed to fetch contains
   the encoded substring for `wdt:P856` and for at least one URL
   variant (e.g. `https://tesla.com`). This pins down that we're
   actually querying official-website, not something else.

About 7 tests.

Note: do NOT add a test for the live Wikidata endpoint. Tests stub
fetch. Hitting query.wikidata.org from CI is slow, flaky, and
disrespectful to the operators of a free service.

## Combined ship sequence

A feature branch with two commits, then a pull request against `main`.
Each commit must build, lint, and test cleanly on its own before the
next commit starts — bisecting a broken commit later is much harder
than not making one.

**Branch setup.** From `main`, create and check out
`feat/url-extraction`. All work happens on this branch.

**Commit 1: Numerology cleanup.**

- Edit `src/lib/extractors/misc.js`: add `numerologySource` to the
  `analyzeUrl` return.
- Edit `src/components/Recognizer.jsx`: change `addUrlNode` to pass
  `parsed.numerologySource` to the numerology functions.
- Add 3 tests to `src/lib/extractors/misc.test.js` under a new
  `describe("analyzeUrl")` block.
- Run `npm test`. All tests pass.
- Run `npm run lint`. No new lint errors.
- Run `npm run build`. Build succeeds.
- Commit with message: `feat: clean URL numerology source (strip scheme and www.)`.

**Commit 2: Wikidata-on-URL.**

- Edit `src/lib/extractors/wikidata.js`: add `urlVariants` (private
  helper) and `lookupWikidataByUrl` (exported).
- Edit `src/components/Recognizer.jsx`: import
  `lookupWikidataByUrl`, wire into `addUrlNode`, update the footer
  privacy text.
- Add `src/lib/extractors/wikidata.test.js` with the 7 tests
  described above.
- Run `npm test`. All tests pass.
- Run `npm run lint`. No new lint errors.
- Run `npm run build`. Build succeeds.
- Commit with message: `feat: look up URL nodes via Wikidata official-website (P856)`.

**Pull request.** Push `feat/url-extraction` and open a PR against
`main`. Title: `URL extraction: numerology cleanup + Wikidata lookup`.
The PR body should briefly describe both phases and call out the
privacy footer update so the reviewer (Eris) sees it without having
to diff `Recognizer.jsx` hunting for it. Do not merge — leave the PR
open for review.

## What this doesn't do

- **CORS proxy for arbitrary page fetches.** Out of scope; deferred
  pending a separate product/privacy conversation. See DESIGN.md's
  "Things we considered but didn't ship."
- **Site-specific extractors** for Reddit, GitHub, YouTube oEmbed,
  etc. Each of those is a legitimate followup feature; none belong
  in this branch.
- **Recognition of Wikipedia URLs.** Pasting
  `https://en.wikipedia.org/wiki/Nikola_Tesla` as a URL node won't
  resolve to the Tesla Wikidata entity via P856 (Wikipedia article
  URLs aren't the official-website of their subject). That's a
  separate lookup — match on Wikipedia URL pattern, extract the
  article slug, fetch the summary, get the wikibase_item. Worth
  doing eventually; out of scope here.
- **Changes to the connection engine.** Wikidata-merged facts go
  through `node.numbers` in the existing shape, and the engine
  processes them generically. No engine code changes.
- **Display changes beyond what falls out of `instanceOf`.** The
  Table view already renders `instanceOf` as a small badge for name
  and location nodes; URL nodes will start showing it too because
  they'll now have the field. No new render code.

## First prompt for Code Claude (or Antigravity, or whoever)

Paste this into a fresh agent session:

---

I'd like to make URL nodes in Recognizer more useful by (1) cleaning
the numerology source string and (2) looking up the URL's owning
entity in Wikidata.

Please read these in order before starting:

1. `CLAUDE.md` for project conventions.
2. `docs/DESIGN.md` for project context.
3. `docs/URL-EXTRACTION.md` (this doc) for the full design.

The plan is two phases on a feature branch, then a pull request.

**First**, from `main`, create and check out `feat/url-extraction`. All
work happens on this branch. Do NOT commit directly to `main`.

Each phase ships as its own commit on the feature branch. Before each
commit, run all three of these and confirm they pass:

- `npm test` — all tests must pass.
- `npm run lint` — no new lint errors.
- `npm run build` — build must succeed.

If any of those fail, fix the failure before committing. Do not commit
broken code "to fix later." Do not skip these checks because the
change "looks small."

### Phase 1: Numerology cleanup

The numerology source for URL nodes currently includes `https://` and
`www.`, which adds a fixed baseline to every URL's Pythagorean sum.

- In `src/lib/extractors/misc.js`, add a `numerologySource` field to
  the object `analyzeUrl` returns. It should equal the domain (with
  leading `www.` stripped) plus the path. Do NOT strip other
  subdomains — `api.example.com` keeps the `api.` prefix.
- In `src/components/Recognizer.jsx`, change `addUrlNode` to pass
  `parsed.numerologySource` to `pythagoreanNumerologyOf` and
  `chaldeanNumerologyOf` instead of `parsed.url`.
- Add 3 tests to `src/lib/extractors/misc.test.js` in a new
  `describe("analyzeUrl")` block. Cover: scheme stripped, `www.`
  stripped, other subdomains preserved.

Run `npm test`, `npm run lint`, `npm run build`. All pass. Commit
to `feat/url-extraction` with message
`feat: clean URL numerology source (strip scheme and www.)`.

### Phase 2: Wikidata-on-URL lookup

Add a Wikidata SPARQL query that, given a URL, returns the Q-number
of the entity whose official-website property (P856) matches.

- In `src/lib/extractors/wikidata.js`, add a private `urlVariants`
  helper that generates a small set of URL forms (with/without `www.`,
  with/without trailing slash, http and https, plus the bare origin)
  to handle inconsistent storage in Wikidata.
- In the same file, add and export `lookupWikidataByUrl(url)` — runs
  a SPARQL query against `https://query.wikidata.org/sparql` and
  returns the Q-number string or null. Never throws; any error path
  returns null.
- In `Recognizer.jsx`, wire into `addUrlNode`. After the
  `fetchUrlContent` call, before assembling the node, call
  `lookupWikidataByUrl(url)`. If it returns a Q-number, call the
  existing `fetchWikidataFacts(qid)` and merge `wikidata.facts` into
  the node's `numbers` (Wikidata facts win on collision — spread them
  second). Set `wikidataId` and `instanceOf` on the node like name
  and location nodes do.
- Update the loading messages: `"Attempting to fetch URL contents…"`
  before the page fetch, then `"Cross-referencing Wikidata…"` before
  the Wikidata calls.
- Update the privacy footer text in `Recognizer.jsx` to mention
  Wikidata as a service URLs are sent to. The current footer lists
  Wikipedia and OpenStreetMap for names and places; add Wikidata and
  URLs to that list. **This footer update must be in the same commit
  as the lookup code.** Shipping the lookup without the disclosure
  is a privacy regression.
- Add `src/lib/extractors/wikidata.test.js` with 7 tests as described
  in `docs/URL-EXTRACTION.md` Phase 2. Stub `global.fetch`; do NOT
  hit the live Wikidata endpoint.

Run `npm test`, `npm run lint`, `npm run build`. All pass. Commit
to `feat/url-extraction` with message
`feat: look up URL nodes via Wikidata official-website (P856)`.

### Open the pull request

After both commits land on `feat/url-extraction`:

- Push the branch to the remote.
- Open a pull request against `main`. Title:
  `URL extraction: numerology cleanup + Wikidata lookup`.
- In the PR body, briefly describe what each commit does and
  **explicitly call out the privacy footer update** so the reviewer
  sees it without having to hunt through the diff.
- Do NOT merge the PR. Leave it open for Eris to review.

### Important constraints

- Work happens on a `feat/url-extraction` branch off `main`. Do NOT
  commit directly to `main`. Two commits on the feature branch, then
  open a PR. Do NOT merge the PR — leave it open for review.
- `npm test`, `npm run lint`, `npm run build` must ALL pass before
  EACH commit. Run them. Read the output. If anything fails, fix it.
- Do not add new dependencies. Both phases use only the standard
  fetch API and existing project code.
- Do not change the connection engine. Wikidata facts go through
  the existing `node.numbers` shape.
- Do not skip the footer update in Phase 2. It must ship with the
  code that makes it necessary, and it must be called out in the PR
  body.
- Do not test against the live Wikidata endpoint. Stub fetch.

Please confirm the plan, then proceed phase by phase. After each
phase, briefly say what you did and confirm the three checks passed
before moving on.

---
