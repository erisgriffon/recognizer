export const lookupName = async (name) => {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
    );
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    return {
      title: data.title,
      extract: data.extract || "",
      thumbnail: data.thumbnail?.source || null,
      wikidataId: data.wikibase_item || null,
      description: data.description || null,
    };
  } catch (e) { return null; }
};

export const extractFactsFromExtract = (extract) => {
  const facts = {};
  if (!extract) return facts;

  // NOTE: We previously had four regexes attempting to extract birth/death
  // years from biographical openers like "(February 12, 1809 – April 15, 1865)".
  // It turns out Wikipedia's REST summary endpoint strips that opener and
  // returns a content summary instead, so those regexes never matched. Birth
  // and death dates are now pulled from Wikidata via fetchWikidataFacts, which
  // gives us full date precision rather than just years.

  const founded = extract.match(/founded\s+in\s+(\d{3,4})/i) || extract.match(/established\s+in\s+(\d{3,4})/i);
  if (founded) facts["founded year"] = parseInt(founded[1], 10);

  const pop = extract.match(/population\s+of\s+(?:approximately\s+|about\s+|over\s+|around\s+)?([\d,]+)/i);
  if (pop) {
    const n = parseInt(pop[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) facts["population"] = n;
  }

  const elev = extract.match(/elevation\s+of\s+([\d,]+)\s*(m|metres|meters|ft|feet)/i);
  if (elev) {
    const n = parseInt(elev[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) facts["elevation"] = n;
  }

  const area = extract.match(/area\s+of\s+([\d,]+)\s*(km|sq)/i);
  if (area) {
    const n = parseInt(area[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) facts["area"] = n;
  }

  // Bare-year extraction from prose. This is now the primary year-fact source
  // for the extract path (Wikidata adds structured birth/death/founding on top).
  // Cap raised to 15 since Wikipedia summaries are denser with years than
  // I'd assumed and we need every fact we can get.
  const years = extract.match(/\b(1[89]\d{2}|20\d{2})\b/g);
  if (years) {
    const uniqueYears = [...new Set(years.map((y) => parseInt(y, 10)))];
    uniqueYears.slice(0, 15).forEach((y) => {
      if (!Object.values(facts).includes(y)) facts[`year mentioned (${y})`] = y;
    });
  }

  // Other large numbers from prose (populations, distances, counts)
  const bigNumbers = extract.match(/\b(\d{3,6})\b/g);
  if (bigNumbers) {
    const filtered = [...new Set(bigNumbers.map((n) => parseInt(n, 10)))]
      .filter((n) => n >= 100 && n <= 999999)
      .filter((n) => !(n >= 1700 && n <= 2100));
    filtered.slice(0, 4).forEach((n) => {
      if (!Object.values(facts).includes(n)) facts[`number mentioned (${n})`] = n;
    });
  }

  const numWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  Object.entries(numWords).forEach(([word, n]) => {
    const re = new RegExp(`\\b${word}\\s+(children|albums|siblings|brothers|sisters|films|novels|books|districts|boroughs)\\b`, "i");
    const m = extract.match(re);
    if (m) facts[m[1].toLowerCase()] = n;
  });

  // Ordinal extraction: "16th president", "26th president", "3rd Earl of...".
  // Wikipedia uses these heavily for political and noble figures and they
  // give us a high-quality specific number per node.
  const ordinalMatch = extract.match(/\b(\d{1,3})(?:st|nd|rd|th)\s+(president|prime\s+minister|monarch|king|queen|emperor|earl|duke|baron|pope|chancellor|governor|senator)\b/i);
  if (ordinalMatch) {
    const role = ordinalMatch[2].replace(/\s+/g, " ").toLowerCase();
    facts[`${role} number`] = parseInt(ordinalMatch[1], 10);
  }

  return facts;
};

// Diagnostic: run every extraction pattern explicitly and report what each
// matched. Used by dev mode to make broken regexes visible. Mirrors the
// patterns in extractFactsFromExtract but produces a structured report.
export const diagnoseExtract = (extract) => {
  if (!extract) return [];
  const patterns = [
    { label: "founded year", re: /founded\s+in\s+(\d{3,4})/i },
    { label: "established year", re: /established\s+in\s+(\d{3,4})/i },
    { label: "population", re: /population\s+of\s+(?:approximately\s+|about\s+|over\s+|around\s+)?([\d,]+)/i },
    { label: "elevation", re: /elevation\s+of\s+([\d,]+)\s*(m|metres|meters|ft|feet)/i },
    { label: "area", re: /area\s+of\s+([\d,]+)\s*(km|sq)/i },
    { label: "ordinal role", re: /\b(\d{1,3})(?:st|nd|rd|th)\s+(president|prime\s+minister|monarch|king|queen|emperor|earl|duke|baron|pope|chancellor|governor|senator)\b/i },
    { label: "all 4-digit years", re: /\b(1[89]\d{2}|20\d{2})\b/g },
    { label: "all 3-6 digit numbers", re: /\b(\d{3,6})\b/g },
  ];
  return patterns.map((p) => {
    const m = p.re.global ? extract.match(p.re) : extract.match(p.re);
    return {
      label: p.label,
      matched: m ? (Array.isArray(m) && p.re.global ? m.join(", ") : m[0]) : null,
    };
  });
};

export const fetchOnThisDay = async (date) => {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.events || []).map((e) => ({
      year: e.year,
      text: e.text || "",
      names: (e.pages || []).map((p) => p.titles?.normalized || p.title).filter(Boolean).slice(0, 3),
    }));
  } catch (e) { return []; }
};
