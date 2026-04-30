# Handoff: First Prompt for Claude Code

This is the literal opening message to paste into a fresh Claude Code session
when you're ready to start the modularization. Copy everything between the
`---` markers.

The prompt assumes:
- You've cloned the repo locally
- You've placed the v0.13 single-file source at `src/recognizer-v0.13.jsx`
- You've copied `CLAUDE.md`, `docs/DESIGN.md`, and `docs/MIGRATION.md` into
  the repo
- You're running `claude` from the repo root

---

I'd like you to refactor this project from a single ~2700-line file into a
modular structure.

Before doing anything, please:

1. Read `CLAUDE.md` in the repo root. This contains standing instructions
   for working in this codebase, including conventions, the data model, and
   important hard-won design decisions (threshold tuning, security
   constraints, the today-gating behavior, etc.).

2. Read `docs/DESIGN.md`. This captures the *why* behind the major decisions
   in the codebase. It's especially important for understanding why some
   things look the way they do — the regex saga, the timezone footgun, the
   strength-tier rename, etc.

3. Read `docs/MIGRATION.md`. This is the step-by-step modularization plan I
   want you to execute, broken into 8 phases with verification points.

4. Read `src/recognizer-v0.13.jsx`. This is the current single-file source.
   It's working code — the goal is purely structural reorganization, not
   feature changes.

Then please confirm that:
- You understand the project's tone and constraints
- You agree the plan in MIGRATION.md is sound (or flag any concerns before
  starting)
- You're set up to run `npm run build` between phases

Once confirmed, please execute the migration phase by phase. After each
phase:
- Run `npm run build` and confirm clean output
- Commit with a message like "refactor: phase N — <phase description>"
- Pause briefly and summarize what you completed before moving on

Important constraints:
- **Zero behavior changes.** The running app after the refactor should look
  and behave identically to v0.13. Bugs you spot but didn't write — note
  them but don't fix them in this refactor. They get their own commits later.
- **No new features.** Even small "while I'm here" improvements wait until
  the refactor is done and verified.
- **Stop and ask** if you hit anything that doesn't fit the plan or that
  the documentation doesn't address.

If anything in `CLAUDE.md` or `docs/DESIGN.md` seems outdated or wrong as
you read the actual code, flag it before proceeding. Those docs were
written from memory of the conversation that produced v0.13; they should
match reality but might have minor drift.

When the migration is complete, please:
- Delete `src/recognizer-v0.13.jsx` (or move it to `archive/` if you want
  a reference copy)
- Verify `npm run build` produces a clean production bundle
- Run `npm run dev` and click through the app to confirm full behavioral
  parity with v0.13

Thanks. Looking forward to working with this in a real terminal instead of
through screenshots.

---

## Notes on running this

If Claude Code disagrees with any part of `MIGRATION.md` — for example,
suggesting a different file split or noting that a particular conversion
won't work — listen to it. It can see the actual code and the actual build
output, which I (the chat-Claude that wrote these docs) can't.

If Claude Code hits a real problem and stops to ask, the right answer is
usually to read its question carefully and answer it, not to push it to
keep going. The migration is a measured pace, not a sprint.

If something in the docs turns out to be wrong (for example, my Wikidata
property descriptions might have minor inaccuracies, or my regex behavior
notes might miss an edge case), the source code in `recognizer-v0.13.jsx`
is the source of truth. The docs describe my model of the code; the code
describes what actually runs.

After the migration completes successfully, you can return to chat-Claude
(me) for design conversations about new features, and bring the actual
implementation work back to Claude Code. That's the workflow that should
serve us both well going forward.
