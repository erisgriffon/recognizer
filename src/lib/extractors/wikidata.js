// Wikipedia's REST summary endpoint includes a `wikibase_item` field with the
// entity's Q-number (e.g. "Q91" for Lincoln). Wikidata then exposes that
// entity's full structured data at /Special:EntityData/Q91.json, which gives
// us properties as Q-codes (P569 = date of birth, P570 = date of death, etc).
//
// We pull a focused list of high-value properties only. The big payoff is
// FULL biographical dates (year + month + day) instead of bare years scraped
// from prose, which means name nodes can finally participate in zodiac/weekday/
// today-mention machinery. Without this, biographical figures are fact-light
// no matter how clever our regexes get — Wikipedia summaries don't contain
// parenthetical opener dates anymore.

export const WIKIDATA_PROPERTIES = {
  P569: { key: "birth", isDate: true },
  P570: { key: "death", isDate: true },
  P571: { key: "inception", isDate: true }, // founding date for orgs/places
  P585: { key: "point in time", isDate: true }, // for events
  P577: { key: "publication date", isDate: true }, // films and other works
  P580: { key: "start date", isDate: true }, // TV series start
  P582: { key: "end date", isDate: true }, // TV series end
  P2048: { key: "height (cm)", isQuantity: true },
  P1971: { key: "number of children", isQuantity: true },
  P1082: { key: "population", isQuantity: true },
  P2046: { key: "area (km²)", isQuantity: true },
  P2044: { key: "elevation (m)", isQuantity: true },
  P2047: { key: "duration", isQuantity: true }, // film/TV runtime in minutes
  P2437: { key: "number of seasons", isQuantity: true },
  P1113: { key: "number of episodes", isQuantity: true },
  P31: { key: "instance of", isEntity: true }, // for type display only
};

// Common P31 (instance of) values mapped to readable labels. Avoids a second
// Wikidata round-trip to resolve the type's own entity. The film/TV entries
// also serve as the genre lookup table (P136 takes the same kind of Q-number);
// any unknown Q-codes fall back to the raw "Q…" string, which is honest about
// what we have. Both this table and the country list below are data — extend
// them as new media gets surfaced through real use.
export const WIKIDATA_TYPES = {
  Q5: "human", Q515: "city", Q3957: "town", Q486972: "human settlement",
  Q6256: "country", Q35657: "U.S. state", Q1549591: "big city",
  Q35666: "year", Q41710: "ethnic group", Q43229: "organization",
  Q4830453: "business", Q783794: "company",
  Q571: "book", Q7725634: "literary work", Q482994: "album",
  Q134556: "single", Q207628: "musical composition",
  Q11446: "ship", Q12280: "bridge", Q41176: "building",
  Q23397: "lake", Q4022: "river", Q8502: "mountain",
  Q33506: "museum", Q22698: "park", Q3947: "house",
  Q177: "the Earth", Q34442: "road",
  // Film / TV — instance-of and genre values share this table.
  Q11424: "film", Q5398426: "television series",
  Q15416: "television program", Q1259759: "miniseries",
  Q24862: "western film", Q188473: "action film",
  Q319221: "thriller film", Q157394: "fantasy film",
  Q24925: "horror film", Q130232: "drama film",
  Q200092: "horror television series", Q1437153: "drama television series",
  Q15637293: "comedy television series", Q3072039: "documentary film",
  Q471839: "science fiction film", Q645928: "comedy film",
  Q1054574: "film series",
  // Common countries of origin. Already partially covered above (Q30, etc.
  // would conflict, but the existing table doesn't list any countries).
  Q30: "United States", Q145: "United Kingdom", Q142: "France",
  Q183: "Germany", Q17: "Japan", Q16: "Canada", Q38: "Italy",
  Q29: "Spain", Q20: "Norway", Q34: "Sweden", Q35: "Denmark",
  Q159: "Russia", Q668: "India", Q865: "Taiwan", Q884: "South Korea",
  Q408: "Australia", Q664: "New Zealand", Q414: "Argentina",
  Q155: "Brazil", Q96: "Mexico",
};

// Parse Wikidata's date format. Looks like "+1809-02-12T00:00:00Z" with a
// `precision` field: 9 = year only, 10 = month, 11 = day, 12 = hour, etc.
export const parseWikidataDate = (dateValue) => {
  if (!dateValue || !dateValue.time) return null;
  const m = /([+-])(\d+)-(\d{2})-(\d{2})/.exec(dateValue.time);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const year = sign * parseInt(m[2], 10);
  const month = parseInt(m[3], 10);
  const day = parseInt(m[4], 10);
  const precision = dateValue.precision || 11;
  return { year, month, day, precision };
};

export const fetchWikidataFacts = async (qid) => {
  if (!qid || !/^Q\d+$/.test(qid)) return null;
  try {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const entity = data?.entities?.[qid];
    if (!entity) return null;
    const claims = entity.claims || {};
    const result = { facts: {}, dates: {}, instanceOf: null };

    for (const [pid, def] of Object.entries(WIKIDATA_PROPERTIES)) {
      const claim = claims[pid];
      if (!claim || claim.length === 0) continue;
      const mainsnak = claim[0]?.mainsnak;
      if (!mainsnak || mainsnak.snaktype !== "value") continue;
      const dv = mainsnak.datavalue;
      if (!dv) continue;

      if (def.isDate) {
        const parsed = parseWikidataDate(dv.value);
        if (parsed && parsed.year > 0 && parsed.year < 3000) {
          if (parsed.precision >= 11) {
            // Day-precision: store as a real Date so date machinery applies
            result.dates[def.key] = new Date(parsed.year, parsed.month - 1, parsed.day);
          }
          // Year is always useful even at lower precision
          result.facts[`${def.key} year`] = parsed.year;
          if (parsed.precision >= 10) result.facts[`${def.key} month`] = parsed.month;
          if (parsed.precision >= 11) result.facts[`${def.key} day`] = parsed.day;
        }
      } else if (def.isQuantity) {
        // Quantity values come as { amount: "+185", unit: "..." }
        const amt = parseFloat(dv.value?.amount);
        if (Number.isFinite(amt) && amt !== 0) {
          result.facts[def.key] = Math.round(amt);
        }
      } else if (def.isEntity && pid === "P31") {
        // Instance-of resolves to a Q-number; map to readable label if we know it
        const targetQid = dv.value?.id;
        if (targetQid && WIKIDATA_TYPES[targetQid]) {
          result.instanceOf = WIKIDATA_TYPES[targetQid];
        } else if (targetQid) {
          result.instanceOf = targetQid; // unknown type, show raw Q-number
        }
      }
    }
    return result;
  } catch (e) {
    return null;
  }
};

// URL variants to try against Wikidata's P856. Wikidata stores official
// websites with inconsistent normalization, so we generate a small set
// of plausible forms and FILTER against all of them in one query.
// Order doesn't matter — the SPARQL FILTER is set-membership.
const urlVariants = (url) => {
  let u;
  try { u = new URL(url); } catch { return []; }
  // Strip query and fragment — official-website properties never carry them.
  const path = u.pathname.replace(/\/$/, ""); // no trailing slash
  const pathSlash = path + "/";              // with trailing slash
  // Build with and without www. on the hostname.
  const host = u.hostname;
  const altHost = host.startsWith("www.") ? host.slice(4) : "www." + host;
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
