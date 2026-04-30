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
  P569: { key: "date of birth", isDate: true },
  P570: { key: "date of death", isDate: true },
  P571: { key: "inception", isDate: true }, // founding date for orgs/places
  P585: { key: "point in time", isDate: true }, // for events
  P2048: { key: "height (cm)", isQuantity: true },
  P1971: { key: "number of children", isQuantity: true },
  P1082: { key: "population", isQuantity: true },
  P2046: { key: "area (km²)", isQuantity: true },
  P2044: { key: "elevation (m)", isQuantity: true },
  P31: { key: "instance of", isEntity: true }, // for type display only
};

// Common P31 (instance of) values mapped to readable labels. Avoids a second
// Wikidata round-trip to resolve the type's own entity.
export const WIKIDATA_TYPES = {
  Q5: "human", Q515: "city", Q3957: "town", Q486972: "human settlement",
  Q6256: "country", Q35657: "U.S. state", Q1549591: "big city",
  Q35666: "year", Q41710: "ethnic group", Q43229: "organization",
  Q4830453: "business", Q783794: "company", Q11424: "film",
  Q571: "book", Q7725634: "literary work", Q482994: "album",
  Q134556: "single", Q207628: "musical composition",
  Q11446: "ship", Q12280: "bridge", Q41176: "building",
  Q23397: "lake", Q4022: "river", Q8502: "mountain",
  Q33506: "museum", Q22698: "park", Q3947: "house",
  Q177: "the Earth", Q34442: "road",
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
