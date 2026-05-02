# Recognizer

A pattern-finding tool for the determinedly credulous.

Live at: **[recognizer.observer](https://recognizer.observer)**

<!-- TODO: drop a corkboard screenshot here once one's been captured. -->

## What it does

Submit evidence — names, text, audio files, images, URLs, books, dates,
locations. The investigator cross-references everything, looking for
coincidences. Birth years that line up, names that share numerological
signatures, locations on the same ley line, dates during Mercury retrograde.

The math is real. The conclusions are absurd. The investigator never
endorses anything; they merely note things "for the record."

Four investigative depth categories — numerology, astrology, lexical,
geographic — each with four tiers from Off through Deep. Set them
individually, or pick an Investigator Mode (Skeptic / Standard / Believer
/ Conspiracy) that ties them all together.

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
Library; map tiles are served by Stadia Maps. Recognizer itself logs
and stores nothing. Shared URLs encode case state in the fragment
(after the `#`), which is never transmitted to servers.

## Development

```bash
npm install
npm run dev      # local dev server with hot reload
npm test         # run the Vitest suite
npm run lint     # lint the codebase
npm run build    # production build into dist/
npm run preview  # serve the production build locally for testing
```

See [`docs/`](docs/) for design decisions and architecture notes —
particularly [`CLAUDE.md`](CLAUDE.md) for the project's conventions and
[`docs/DESIGN.md`](docs/DESIGN.md) for the *why* behind nearly every
decision.

## License

MIT — see [LICENSE](LICENSE).

## Origin

Recognizer was built collaboratively with Claude (chat for design,
Claude Code for implementation) over the course of several sessions in
2026. The `docs/` folder contains the handoff documents that scoped each
major feature, plus a running record of the decisions, scars, and
hard-won threshold values that shaped the result.
