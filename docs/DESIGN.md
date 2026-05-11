# Design Decisions

A running record of *why* Recognizer is shaped the way it is. Where
`CLAUDE.md` is "what to do," this is "why we did it." Read this when you're
about to undo something and want to know what scars are on the floor.

## What problem we're solving

Recognizer takes disparate "evidence" submitted by a user — a name, a song,
an image, a date, a URL — and finds (mostly meaningless) coincidences
between them. Then it dramatizes those coincidences in the voice of a
credulous investigator who never quite admits things are random.

The goal is *funny*, not *useful*. Every design decision should be evaluated
against whether it makes the bit land. Math that's too rigorous kills the
absurdity; math that's too loose kills the specificity that makes the
absurdity work. We're walking a line.

## Core architectural choices

### Single-page React app, client-side only

No backend. No accounts. No persistence (yet). The entire experience runs in
the browser. This was a foundational choice: the app's privacy notice can
be honest precisely because there's nothing to log.

It also limits us. We can't fetch arbitrary URLs (CORS), we can't run
expensive computation on a server, we can't share state between users.
We've learned to live within these constraints rather than fight them.

### "Nodes" as the universal evidence model

Every type of evidence — names, text, audio, images, dates, URLs, books,
locations — produces a node with the same shape: an id, a type tag, a
display name, a `numbers` map of numeric facts, and an optional numerology
struct. Type-specific fields hang off the same object (lat/lng for
locations, dataUrl for images, events for today, etc.).

This uniformity is what makes the connection engine simple. It iterates
over all numeric facts on all nodes regardless of their origin, and the
fact about an audio file's duration can collide with the fact about a
person's birth year because both are just numbers.

The cost is a slightly weird-looking node object with lots of optional
fields. We accept this. The win — a single connection algorithm working
across heterogeneous evidence — is worth it.

### Pure functions in `lib/`, React only in `components/`

`src/lib/` contains no React. No JSX, no hooks, no imports from React.
Everything in there is pure data transformation: take inputs, return
outputs, no side effects beyond the network calls in extractors. This
keeps the engine and narrative testable in isolation and makes the React
component layer a thin orchestrator on top.

## Lessons learned (the hard way)

### The regex saga

For ten versions, we extracted "birth year" and "death year" from
Wikipedia article openers using regexes assuming the format
`(Month Day, YYYY – Month Day, YYYY)`. The regexes worked perfectly. They
also never matched anything, because Wikipedia's REST summary endpoint
returns a *content summary*, not the article opener — Lincoln's actual
extract is "Abraham Lincoln was the 16th president…" with bare years
sprinkled in prose, no parenthetical date format anywhere.

We only found this when we shipped a dev mode that displayed the raw
extract and per-regex match results inline on each node. Within minutes
the user pasted a screenshot showing "no match" against four different
patterns we'd been relying on.

**Lessons:**
- **Don't assume API response formats.** Verify with real data before
  building extraction logic on assumptions.
- **Build diagnostic visibility into the app early.** Dev mode is now a
  permanent fixture; the moment we had it, debugging time collapsed from
  versions to seconds.
- **When parsing structured data is needed, prefer structured sources.**
  This is what drove the Wikidata integration in v0.13. Wikidata gives us
  reliable structured birth/death dates, populations, heights — the prose
  approach was always fragile.

### The timezone footgun

`new Date("1987-08-08")` parses as UTC midnight. Then `.getDate()` reads in
local time, returning August 7 in any timezone west of UTC. This silently
corrupted every date fact for users in the Americas — moon phase, zodiac,
day-of-week, day-of-year were all off by one — for five versions before it
was caught.

The user reported a connection that read "the value 7 appears in two
unrelated places: as Bday day of Bday: 1987-08-08." We thought it was a
labeling bug. It was a parsing bug. The label was correctly reporting the
value, and the value was wrong.

**Lessons:**
- **JavaScript Date is a minefield.** Always be explicit about timezone
  semantics. We now construct dates from component args (year, month-1,
  day) for any user-supplied date string, never from the string directly.
- **When a user reports a confusing finding, suspect data corruption
  before suspecting display logic.** The label was right; the data was
  wrong; we'd been reading the wrong layer.

### The connection threshold tuning

Early versions of the engine produced way too many connections, most of
them noise: "the value 4 appears in two unrelated places," "color 3 G of
image equals days since birthday." These were technically correct numeric
matches and the dossier was unreadable as a result.

Multiple rounds of threshold tuning followed. Final settings:

- Exact match requires value > 9 (was > 1).
- Near match (within 2) requires both > 20 (was > 5).
- Integer-multiple match requires small ≥ 5 and multiplier ≤ 12.
- Year facts get reduced strength (0.45) on near matches and only allow 2×/3×
  multipliers, since adjacent years and clean year-multiples are too common
  to read as coincidence.
- Image RGB channels were removed from the numeric pool entirely; they
  collide via dedicated color-distance matching instead.

**Lessons:**
- **More findings is not better.** The product is funny when it produces
  20 surprising findings, not when it produces 200 boring ones.
- **Generic mathematical relations (any number is a multiple of any other
  with a big enough multiplier) are not coincidences in any human sense.**
  The bit only works when the math feels specific.
- **Tune incrementally with real test cases.** Every threshold change was
  in response to a specific bad finding the user reported.

### The strength label

The first several versions labeled connections with "CONFIDENCE 100%". The
user pushed back: "calling any numeric coincidence 100% confidence is a bit
of a stretch." They were right. "Confidence" implies certainty about
*meaning*, which we explicitly never claim — the whole bit is that we
don't claim anything, we just "note" things.

Renamed to "MATCH STRENGTH" with named tiers: SUSPICIOUS / STRIKING /
NOTABLE / TRIVIAL. The numeric value still drives strength internally, but
the user-facing label describes the match itself, not our certainty about
its significance.

**Lesson:** the words used in user-facing copy carry implicit claims.
"Confidence %" implicitly claimed certainty. Tier names sidestep that
without losing information.

### Today as strict gate vs auto-include

For several versions, the "today" node silently participated in connection-
finding from page load, before the user clicked anything. This was
deliberate — to surface immediate coincidences the moment a user added
their first evidence. But it contradicted the UI, which had a clear
"ENTER TODAY INTO EVIDENCE" button implying that today wasn't yet in the
case file.

The fix was to make today strictly opt-in (it doesn't participate in
connections until promoted), but compute potential today-connections
*hypothetically* and surface them as a passive nudge in the banner. The
banner now says things like "Were today entered into evidence, the
investigator would observe: Tesla appears in today's historical record."

This preserves the "magic moment" of relevant timing without lying about
what's in the case file.

**Lesson:** if the UI says X happens when you click, that's what should
happen. Don't pre-cheat to surface findings; surface the *option* of those
findings instead, and let the user opt in.

### Numerology shows its work

The numerology rephraser used to read: "Tesla, reduced numerologically,
yields 8." The user asked: "reduced numerologically *how*?" Fair point.
The pseudo-rigor of numerology lands harder when you actually show the
math. Now: "Tesla, reduced numerologically (Pythagorean: A=1, B=2, …, I=9,
J=1 …), yields 8 (TESLA → digital sum 12 → reduced to 3)."

**Lesson:** for the comedic register we're in, *more* mechanical detail
makes the absurdity funnier, not weaker. Real numerologists do exactly
this. So does our investigator.

### Open Library substitution disclosure

User typed "Mistborn", got back "The Final Empire" (the first book of the
Mistborn trilogy). Open Library's search is fuzzy. The node was labeled
The Final Empire with no indication the user had asked for something
different.

Fix: when the resolved title differs significantly from the query, show
the original query inline as italicized small text: *Mistborn (queried
as: "mistborn")*.

**Lesson:** when external services do something the user didn't ask for,
*tell them*. Silent substitutions undermine trust in a way that affects
the whole experience.

### Dev mode

Added in v0.12. A toggle in the settings panel that, when enabled, shows
the raw API responses and per-regex match results on every node. This is
when debugging time collapsed.

It's permanent now. Future debugging features should follow the same
pattern: if the app is making decisions based on data, give the user (or
developer) the option to see that data inline on the affected node.

### Corkboard trivial edge filter

Originally we kept the corkboard showing all connections, reasoning that "visual density is part of its information value." At 30 nodes this proved wrong — past a certain edge count the visual signal is gone, every node connects to every other node, and the corkboard looks like a yarn explosion. We added a hard floor at strength 0.5 for non-incident edges (incident edges to the selected node still draw, so selection acts as the "show everything" escape). Visible count goes in a small corner indicator.

**Lesson:** "information density" stops being information when the density exceeds visual parseability. The strength tiers exist for a reason; the corkboard should respect them.

## Things we considered but didn't ship

### Audio BPM and frequency analysis

Was on the v0.5 wishlist. Removed before shipping because BPM detection is
genuinely hard (commercial software gets it wrong on songs with non-4/4
time or sparse percussion), and a wrong BPM in the dossier reads as a bug,
not as the investigator finding spurious patterns. Could revisit with a
cleaner approach — maybe surfacing the BPM as "approximate" and only
matching against other approximate values.

### Movie lookups (TMDB)

Wanted parity with book lookups. TMDB requires an API key even for free
tier. We won't ship features that require user-supplied API keys for
basic functionality.

### Auto-fetching arbitrary URLs

We try, but most sites are CORS-locked. We don't ship a CORS proxy because
it'd require running our own server, which contradicts the client-side-only
foundation. Could potentially add a user-supplied proxy URL field as an
opt-in setting, with a clear privacy note about what gets sent through it.

### Dynamic categorization-driven extraction

User suggested: "if Wikipedia returns type=person, fetch person-specific
facts; if type=city, fetch city facts." Considered and rejected as overkill.
The Wikidata integration approach (pull the same focused property set for
every entity, just take what's there) gives us most of the benefit with a
fraction of the complexity. We don't need branching extraction logic if
the data source already returns sparse but consistent shapes.

### Going harder on numerology depth

User suggested adding numerology of birth/death dates, image hex codes,
etc. — multiple numerology values per node. Considered and discussed as a
potential "investigator depth" feature with presets (Skeptic / Standard /
Believer / Conspiracy). Not yet shipped; explicitly deferred until we have
the modular code structure to add it cleanly without bloating the engine.

## Open questions / future work

- **The depth-slider system.** Sketched in conversation. Would replace the
  current four boolean toggles (numerology / anagram / astrology / ley-line)
  with depth integers (0–3) per category, plus a master "investigator mode"
  preset selector. Awaiting a clean module structure before implementing.
- **Real testing.** We have none. After the modular split, Vitest is the
  natural choice. The connection engine in particular is pure-data and
  highly testable — fixed input nodes, expected output connections.
- **Better sharing.** The current SHARE button copies investigation state
  as JSON to clipboard. A real shareable URL (state encoded in the hash)
  would let people send case files to friends.
- **Persistence.** No case files survive a page reload. localStorage with
  user opt-in could fix this, but needs careful UX around "are you sure
  you want to save evidence about a real person to your browser."
- **A favicon and proper page metadata.** The current app has none.

## A note on tone

This is a comedy app. It is also a *commitment* to a comedic register.
Every piece of copy, every threshold, every UI choice should reinforce the
investigator's voice: credulous, methodical, slightly unwell, never
breaking character. If a feature can't be made to fit that voice, it
probably doesn't belong here.

The math being *real* is what makes the absurdity *funny*. Don't
shortcut the math. Don't fake the findings. Let the real coincidences do
the heavy lifting; the investigator's job is to dramatize them.
