// URL fragment encoding/decoding for shared case files. The fragment is
// the right place for this — fragments are never sent to servers, which
// preserves the privacy promise even when the recipient's browser
// dereferences the URL through history, prefetch, or referrer headers.
//
// LZ-string's compressToEncodedURIComponent emits a string containing
// only URL-safe characters (A-Z a-z 0-9 + - _ $) so the result can be
// dropped into a fragment without further escaping.
//
// Format inside the fragment is `case=<compressed>` so we can later add
// other fragment params (e.g. `view=table`) without colliding.

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

const FRAGMENT_KEY = "case";

export const encodeCaseFileToFragment = (caseFile) => {
  const json = JSON.stringify(caseFile);
  const compressed = compressToEncodedURIComponent(json);
  return `${FRAGMENT_KEY}=${compressed}`;
};

export const decodeCaseFileFromFragment = (fragment) => {
  if (!fragment || typeof fragment !== "string") return null;
  const cleaned = fragment.replace(/^#/, "");
  if (!cleaned) return null;
  const params = new URLSearchParams(cleaned);
  const value = params.get(FRAGMENT_KEY);
  if (!value) return null;
  try {
    const json = decompressFromEncodedURIComponent(value);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
};

// Practical cross-platform URL ceiling. Some chat apps/browsers truncate
// past ~2000 chars; the share UI should warn and offer JSON export
// instead when a case file blows past this.
export const URL_LENGTH_BUDGET = 2000;
