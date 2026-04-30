// Pure helpers for the import side of share. The actual orchestration
// (importCaseFile) lives in Recognizer.jsx because it needs the live
// node-creation methods (addNameNode, addLocationFromSearch, etc.) that
// already know how to call Wikipedia, Wikidata, Open Library, and so on.
// Re-implementing those flows here would duplicate fact-extraction logic
// and drift over time.
//
// What's pure and lives here:
//   * the placeholder media-node builder (recipient can't re-create the
//     original image/audio bytes; we make a clearly-labelled stand-in)
//   * a small validator for incoming case files

import { pythagoreanNumerologyOf, chaldeanNumerologyOf } from "../numerology.js";

// Build a placeholder image/audio node from just a filename. Marked
// `placeholder: true` so the corkboard and table can render it visibly
// degraded — the user should see at a glance that the original bytes
// stayed on the sender's device.
export const buildPlaceholderMediaNode = (type, info) => {
  const name = info?.name || `${type}.unknown`;
  return {
    id: `${type}-placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    name,
    placeholder: true,
    summary: `(${type} from sender's local files — not transmitted)`,
    numbers: {
      "filename chars": name.length,
    },
    numerology: {
      pythagorean: pythagoreanNumerologyOf(name),
      chaldean: chaldeanNumerologyOf(name),
      deepReduced: null,
    },
  };
};

// Returns true only for the v:1 shape we know how to import. Future
// versions can branch here once we add migrations.
export const isValidCaseFile = (caseFile) => {
  if (!caseFile || typeof caseFile !== "object") return false;
  if (caseFile.v !== 1) return false;
  if (!Array.isArray(caseFile.n)) return false;
  return true;
};
