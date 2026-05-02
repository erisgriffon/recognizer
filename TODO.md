# TODO

Things noted but not fixed during the v0.13 → modular refactor. Each entry
should land in its own commit so the diff is reviewable.

## Lint warnings to resolve (or document why we keep them)

These are the two warnings `npm run lint` currently emits. Both come from
patterns inherited verbatim from v0.13. The refactor's "zero behavior changes"
rule meant leaving them in place; they should be revisited as real engineering
decisions, not silently silenced.

### `ConnectionMap.jsx:17` — `useEffect` deps `[nodes.length]` instead of `[nodes]`

The position-recompute effect runs only when the *count* of nodes changes,
not when individual nodes are added, removed, or replaced in-place. In
practice the corkboard layout is purely a function of count (positions are
distributed around a circle by index), so the dep is technically correct —
but it sidesteps React's "list every read" rule, and any future change that
makes layout depend on node identity will silently break.

Options:
1. Switch to `[nodes]` and accept extra recomputes (cheap — it's pure math).
2. Keep `[nodes.length]` and add an `// eslint-disable-next-line` with a
   one-line rationale referring to this entry.
3. Compute positions inline as a derived value (`useMemo`) and remove the
   effect/state pair entirely.

Lean: option 3 is the cleanest. Option 1 is the smallest diff.

### `GeoMap.jsx:20` — mount-once effect missing `onPick` from deps

The Leaflet map is created once when the component mounts, and `onPick` is
captured in the closure. If the parent ever passes a different `onPick`
identity (e.g. without `useCallback`), the map will keep calling the *old*
handler. Right now `Recognizer.jsx` defines `addLocationFromMapClick` inline
on every render, so the closure goes stale silently every render — but
because the map handler keeps firing the stale closure that still calls
`setNodes`, you don't notice.

Options:
1. Wrap `addLocationFromMapClick` in `useCallback` in `Recognizer.jsx` and
   add `onPick` to the GeoMap effect deps. Correct but adds dependency-array
   bookkeeping.
2. Hold `onPick` in a ref and read `onPickRef.current` from the click handler.
   Idiomatic Leaflet-with-React pattern; keeps the map mount-once.
3. Move the click handler registration into a separate effect that re-binds
   when `onPick` changes.

Lean: option 2 — the ref-for-stable-callback pattern is the textbook fix
for "imperative library + React closures."

## Other deferred items

- better sample investigation (tesla doesn't link to any of the other things)
- Persistence of settings via localStorage. So the user's preferred numerology depth and corkboard preferences survive a refresh.
- When getting above 10 or so entries the corkboard nodes start overlapping