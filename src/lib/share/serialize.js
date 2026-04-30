// Convert a live case file into a minimal "seed" shape suitable for URL
// encoding. The seed strips reproducible derived data (Wikipedia extracts,
// numerology, fact maps) — those get rebuilt on import by re-running the
// same node-creation flows. Single-character keys (t, v, l, n, s, d, v)
// are intentional: every byte counts once this gets compressed and stuffed
// into a URL fragment.
//
// Uploaded media (images, audio) cannot fit in a URL, so we serialize only
// the filename and a placeholder flag. The recipient's app builds a
// degraded placeholder node that explains the file wasn't transmitted.

// Mirror of the live default settings in Recognizer.jsx. Kept here so the
// pruner can drop default-valued keys without importing the component.
// If a new setting is added, mirror its default here too — otherwise it
// will always be serialized as "non-default" and bloat shared URLs.
const DEFAULT_SETTINGS = {
  numerologyDepth: 1,
  enableAnagrams: true,
  enableAstrology: true,
  enableLeyLines: true,
  devMode: false,
};

// Date node names are stored as "${label}: ${iso}". Split on the first
// ": " so labels with colons (rare but possible) survive.
const parseDateNodeName = (name) => {
  const idx = name.indexOf(": ");
  if (idx < 0) return { label: "date", iso: name };
  return { label: name.slice(0, idx), iso: name.slice(idx + 2) };
};

export const serializeNode = (node) => {
  switch (node.type) {
    case "name":
      return { t: "name", v: node.name };
    case "text":
      return { t: "text", v: node.rawText };
    case "date": {
      const { label, iso } = parseDateNodeName(node.name);
      return { t: "date", v: iso, l: label };
    }
    case "location":
      return { t: "location", v: node.name };
    case "url":
      return { t: "url", v: node.url };
    case "book":
      // Open Library substitutes fuzzy matches; queriedAs preserves the
      // original search so the recipient sees the same fuzzy resolution.
      return { t: "book", v: node.queriedAs || node.name };
    case "today":
      return { t: "today" };
    case "image":
    case "audio":
      return { t: node.type, v: { name: node.name, placeholder: true } };
    default:
      return null;
  }
};

export const pruneSettings = (settings) => {
  const pruned = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (DEFAULT_SETTINGS[k] !== v) pruned[k] = v;
  }
  return pruned;
};

export const serializeCaseFile = (nodes, settings) => {
  const seedNodes = (nodes || []).map(serializeNode).filter(Boolean);
  const seedSettings = pruneSettings(settings);
  const out = {
    v: 1,
    d: new Date().toISOString().slice(0, 10),
    n: seedNodes,
  };
  if (Object.keys(seedSettings).length > 0) out.s = seedSettings;
  return out;
};
