// =============================================================================
// RECOGNIZER v0.13
// =============================================================================
// A pattern-finding tool for the determinedly credulous.
//
// Architecture is one file by design (single-artifact constraint), but logically
// organized into sections. If lifting into a real codebase, the section markers
// below correspond to natural module boundaries.
//
// SECURITY NOTES:
//   * All user content is rendered through React's JSX text interpolation, which
//     escapes HTML automatically. No dangerouslySetInnerHTML anywhere.
//   * Leaflet popups historically take HTML strings; we now pass DOM elements
//     instead so geocoder responses can't introduce HTML.
//   * CDN scripts (jsmediatags, leaflet, exifr) load without SRI hashes —
//     adding them would require fetching the files at build time. To add in
//     production: `openssl dgst -sha384 -binary <file> | openssl base64 -A`
// =============================================================================

import React, { useState, useRef, useEffect, useMemo } from "react";

// =============================================================================
// SECTION 1: CONSTRAINTS — limits enforced throughout the app
// =============================================================================

const LIMITS = {
  TEXT_MAX_CHARS: 50000,
  AUDIO_MAX_BYTES: 25 * 1024 * 1024,
  IMAGE_MAX_BYTES: 15 * 1024 * 1024,
  URL_MAX_CHARS: 2000,
  NODES_SOFT_CAP: 30,
  DATE_MIN_YEAR: 1700,
  DATE_MAX_YEAR: 2100,
};

// =============================================================================
// SECTION 2: PRIMITIVE HELPERS
// =============================================================================

const stripDiacritics = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const tokenize = (text) =>
  stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const pick = (arr, seed) => arr[Math.floor(Math.abs(seed)) % arr.length];

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const written = (n) => {
  const w = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  if (n < w.length) return `${w[n]} (${n})`;
  return `${n}`;
};

const sample = (arr, n, seed = 0) => {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const used = new Set();
  let s = Math.floor(seed) || 1;
  while (out.length < n && used.size < arr.length) {
    s = (s * 9301 + 49297) % 233280;
    const idx = s % arr.length;
    if (!used.has(idx)) {
      used.add(idx);
      out.push(arr[idx]);
    }
  }
  return out;
};

// =============================================================================
// SECTION 3: TEXT ANALYSIS
// =============================================================================

const findCapitalizedNames = (text) => {
  const matches = text.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g) || [];
  const stop = new Set([
    "The", "This", "That", "These", "Those", "There", "Then", "When",
    "Where", "What", "Which", "While", "And", "But", "Or", "For", "With",
    "Into", "From", "After", "Before", "About", "Over", "Under", "January",
    "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday",
  ]);
  const counts = {};
  matches.forEach((m) => {
    if (stop.has(m.split(" ")[0])) return;
    counts[m] = (counts[m] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
};

const findRepeatedPhrases = (text) => {
  const tokens = tokenize(text);
  const phrases = {};
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      phrases[phrase] = (phrases[phrase] || 0) + 1;
    }
  }
  return Object.entries(phrases).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
};

const wordFrequency = (text) => {
  const tokens = tokenize(text);
  const freq = {};
  tokens.forEach((t) => { freq[t] = (freq[t] || 0) + 1; });
  return freq;
};

// Letter frequency as percentages, 0–100. Used for stylometric overlap.
const letterFrequency = (text) => {
  const cleaned = stripDiacritics(text).toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) return null;
  const counts = {};
  for (const ch of cleaned) counts[ch] = (counts[ch] || 0) + 1;
  const total = cleaned.length;
  const freq = {};
  for (const ch of "abcdefghijklmnopqrstuvwxyz") {
    freq[ch] = ((counts[ch] || 0) / total) * 100;
  }
  return freq;
};

// =============================================================================
// SECTION 4: NUMEROLOGY & GEMATRIA
// =============================================================================

const pythagoreanValue = (ch) => {
  const c = ch.toLowerCase().charCodeAt(0) - 96;
  if (c < 1 || c > 26) return 0;
  return ((c - 1) % 9) + 1;
};

const reduceNumber = (n) => {
  while (n > 9 && n !== 11 && n !== 22) {
    n = String(n).split("").reduce((a, d) => a + parseInt(d, 10), 0);
  }
  return n;
};

const numerologyOf = (str) => {
  const cleaned = stripDiacritics(str || "").replace(/[^a-zA-Z]/g, "");
  if (!cleaned) return null;
  const sum = cleaned.split("").reduce((a, c) => a + pythagoreanValue(c), 0);
  return { sum, reduced: reduceNumber(sum), source: cleaned };
};

// =============================================================================
// SECTION 5: ANAGRAM DETECTION
// =============================================================================

// Canonical letter-only signature. Two strings with identical signatures are
// exact anagrams. Edit distance on signatures gives near-anagrams.
const anagramSignature = (str) =>
  stripDiacritics(str || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .split("")
    .sort()
    .join("");

// Multiset edit distance — how many single-letter swaps to make A into B?
const multisetEditDistance = (a, b) => {
  const counts = {};
  for (const c of a) counts[c] = (counts[c] || 0) + 1;
  for (const c of b) counts[c] = (counts[c] || 0) - 1;
  let diff = 0;
  for (const c in counts) diff += Math.abs(counts[c]);
  return Math.max(diff, Math.abs(a.length - b.length));
};

// =============================================================================
// SECTION 6: DATE MATH
// =============================================================================

// Parse a date string into a *local* Date. `new Date("1987-08-08")` parses as
// UTC midnight, which then renders as the previous day in any timezone west of
// UTC — silently corrupting every date fact (getDate, getMonth, getDay).
// Constructing via component args avoids the trap.
const parseDate = (s) => {
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    const d = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const daysBetween = (a, b) =>
  Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));

const isInRange = (date) => {
  const y = date.getFullYear();
  return y >= LIMITS.DATE_MIN_YEAR && y <= LIMITS.DATE_MAX_YEAR;
};

const ZODIAC = [
  ["Capricorn", [12, 22], [1, 19]], ["Aquarius", [1, 20], [2, 18]],
  ["Pisces", [2, 19], [3, 20]], ["Aries", [3, 21], [4, 19]],
  ["Taurus", [4, 20], [5, 20]], ["Gemini", [5, 21], [6, 20]],
  ["Cancer", [6, 21], [7, 22]], ["Leo", [7, 23], [8, 22]],
  ["Virgo", [8, 23], [9, 22]], ["Libra", [9, 23], [10, 22]],
  ["Scorpio", [10, 23], [11, 21]], ["Sagittarius", [11, 22], [12, 21]],
];

const zodiacOf = (date) => {
  const m = date.getMonth() + 1, d = date.getDate();
  for (const [sign, [m1, d1], [m2, d2]] of ZODIAC) {
    if ((m === m1 && d >= d1) || (m === m2 && d <= d2)) return sign;
  }
  return "Capricorn";
};

// Traditional fire/earth/air/water elements
const ZODIAC_ELEMENTS = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};

// Compatible signs by element (within element = compatible).
const zodiacCompatible = (a, b) =>
  a !== b && ZODIAC_ELEMENTS[a] && ZODIAC_ELEMENTS[a] === ZODIAC_ELEMENTS[b];

const dayOfWeek = (date) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];

const moonPhase = (date) => {
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodic = 29.530588853;
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const phase = ((days % synodic) + synodic) % synodic;
  if (phase < 1.84) return "New Moon";
  if (phase < 5.53) return "Waxing Crescent";
  if (phase < 9.22) return "First Quarter";
  if (phase < 12.91) return "Waxing Gibbous";
  if (phase < 16.61) return "Full Moon";
  if (phase < 20.30) return "Waning Gibbous";
  if (phase < 23.99) return "Last Quarter";
  return "Waning Crescent";
};

const dateFacts = (date, label = "date") => {
  const today = new Date();
  return {
    [`${label} year`]: date.getFullYear(),
    [`${label} month`]: date.getMonth() + 1,
    [`${label} day`]: date.getDate(),
    [`days since ${label}`]: daysBetween(date, today),
    [`${label} day-of-year`]: Math.ceil((date - new Date(date.getFullYear(), 0, 0)) / 86400000),
  };
};

// =============================================================================
// SECTION 7: ON-THIS-DAY (Wikipedia)
// =============================================================================

const fetchOnThisDay = async (date) => {
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

const buildTodayNode = (events = []) => {
  const now = new Date();
  // Today-specific labels: avoid stutters like "today year of today" and skip
  // tautological facts like "days since today" (always zero).
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekOfYear = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const dayOfYear = Math.ceil((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  // Lunar day: position in the synodic cycle, integer 1–30. Stable for the day.
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodic = 29.530588853;
  const daysSinceNewMoon = (now.getTime() - knownNewMoon) / 86400000;
  const lunarDay = Math.floor(((daysSinceNewMoon % synodic) + synodic) % synodic) + 1;

  // Julian Day Number (astronomical), modulo 1000 to keep it in collision range.
  // Pure integer math from the Gregorian calendar.
  const jdYear = now.getFullYear();
  const jdMonth = now.getMonth() + 1;
  const jdDay = now.getDate();
  const jy = jdMonth <= 2 ? jdYear - 1 : jdYear;
  const jm = jdMonth <= 2 ? jdMonth + 12 : jdMonth;
  const jdn = Math.floor(365.25 * (jy + 4716)) + Math.floor(30.6001 * (jm + 1)) + jdDay - 1524;
  const julianMod = jdn % 1000;

  const numbers = {
    "current year": now.getFullYear(),
    "current month": now.getMonth() + 1,
    "current day": now.getDate(),
    "current day-of-year": dayOfYear,
    "week of year": weekOfYear,
    "days until year end": daysBetween(now, endOfYear),
    "lunar day": lunarDay,
    "julian day mod 1000": julianMod,
  };
  events.forEach((e) => {
    if (e.year && e.year > 0) numbers[`event year (${e.year})`] = e.year;
  });

  return {
    id: "today",
    type: "today",
    name: `today: ${now.toISOString().slice(0, 10)}`,
    isoDate: now.toISOString().slice(0, 10),
    zodiac: zodiacOf(now),
    dayOfWeek: dayOfWeek(now),
    moonPhase: moonPhase(now),
    events,
    numbers,
    numerology: numerologyOf("today " + now.toISOString().slice(0, 10).replace(/-/g, "")),
  };
};

// =============================================================================
// SECTION 8: GEO HELPERS
// =============================================================================

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
};

// Are three points collinear within a tolerance? Uses normalized cross-product
// magnitude as the deviation metric. Tolerance is in degrees (lat/lon).
const isLeyLine = (p1, p2, p3, tolDeg = 0.5) => {
  // Cross product of (p2-p1) × (p3-p1) — magnitude tells us deviation
  const v1 = { x: p2.lat - p1.lat, y: p2.lng - p1.lng };
  const v2 = { x: p3.lat - p1.lat, y: p3.lng - p1.lng };
  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x);
  // Length of v1 normalizes the cross product to perpendicular distance
  const v1mag = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  if (v1mag < 0.01) return false; // points too close
  return (cross / v1mag) < tolDeg;
};

const geocode = async (query) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const r = data[0];
    return {
      name: r.display_name.split(",").slice(0, 2).join(", "),
      fullName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
    };
  } catch (e) { return null; }
};

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: (data.display_name || `${lat.toFixed(3)}, ${lng.toFixed(3)}`).split(",").slice(0, 2).join(", "),
      fullName: data.display_name || "",
      lat, lng,
      type: data.type || "place",
    };
  } catch (e) { return null; }
};

const locationFacts = (loc) => ({
  "latitude (whole)": Math.round(loc.lat),
  "longitude (whole)": Math.round(loc.lng),
  "abs latitude": Math.round(Math.abs(loc.lat)),
  "abs longitude": Math.round(Math.abs(loc.lng)),
  "lat+lng (whole)": Math.round(loc.lat + loc.lng),
  "deg from equator": Math.round(Math.abs(loc.lat)),
});

// =============================================================================
// SECTION 9: WIKIPEDIA LOOKUP
// =============================================================================

const lookupName = async (name) => {
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

const extractFactsFromExtract = (extract) => {
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
const diagnoseExtract = (extract) => {
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

// =============================================================================
// SECTION 9b: WIKIDATA — structured facts that prose can't reliably give us
// =============================================================================
//
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

const WIKIDATA_PROPERTIES = {
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
const WIKIDATA_TYPES = {
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
const parseWikidataDate = (dateValue) => {
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

const fetchWikidataFacts = async (qid) => {
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

// =============================================================================
// SECTION 10: BOOK LOOKUP (Open Library)
// =============================================================================

const lookupBook = async (query) => {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.docs || data.docs.length === 0) return null;
    const b = data.docs[0];
    return {
      title: b.title,
      author: (b.author_name || ["Unknown"])[0],
      firstPublished: b.first_publish_year || null,
      pageCount: b.number_of_pages_median || null,
      editionCount: b.edition_count || null,
      coverId: b.cover_i || null,
    };
  } catch (e) { return null; }
};

// =============================================================================
// SECTION 11: AUDIO ANALYSIS (no BPM/freq — just metadata)
// =============================================================================

const ensureJsmediatags = () =>
  new Promise((resolve, reject) => {
    if (window.jsmediatags) return resolve(window.jsmediatags);
    const s = document.createElement("script");
    // Production: add SRI integrity attribute. Generate with:
    //   openssl dgst -sha384 -binary jsmediatags.min.js | openssl base64 -A
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.jsmediatags);
    s.onerror = reject;
    document.head.appendChild(s);
  });

const analyzeAudio = async (file) => {
  const filename = file.name;
  const sizeKB = Math.round(file.size / 1024);

  const duration = await new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(Math.round(audio.duration));
    audio.onerror = () => resolve(0);
    audio.src = URL.createObjectURL(file);
  });

  let tags = {};
  try {
    await ensureJsmediatags();
    tags = await new Promise((resolve) => {
      window.jsmediatags.read(file, {
        onSuccess: (t) => resolve(t.tags || {}),
        onError: () => resolve({}),
      });
    });
  } catch (e) { tags = {}; }

  const numbers = {
    "duration (sec)": duration,
    "filename chars": filename.length,
    "size (KB)": sizeKB,
  };
  if (tags.year) numbers["track year"] = parseInt(tags.year, 10);
  if (tags.track) {
    const t = parseInt(String(tags.track).split("/")[0], 10);
    if (Number.isFinite(t)) numbers["track number"] = t;
  }

  // Extract album art if present, return as data URL for color sampling
  let albumArt = null;
  if (tags.picture) {
    const { data, format } = tags.picture;
    const b64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    albumArt = `data:${format};base64,${b64}`;
  }

  return {
    filename,
    title: tags.title || filename,
    artist: tags.artist || "Unknown",
    album: tags.album || null,
    year: tags.year || null,
    numbers,
    rawFilename: filename,
    albumArt,
  };
};

// =============================================================================
// SECTION 12: IMAGE ANALYSIS (EXIF + dominant colors)
// =============================================================================

const ensureExifr = () =>
  new Promise((resolve, reject) => {
    if (window.exifr) return resolve(window.exifr);
    const s = document.createElement("script");
    // Production: SRI as noted above.
    s.src = "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.exifr);
    s.onerror = reject;
    document.head.appendChild(s);
  });

// Quantize image into ~5 dominant colors using a downsampled bucket approach.
// Returns array of { rgb: [r,g,b], hex: '#rrggbb', count }.
const extractDominantColors = (imageDataUrl, k = 5) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 80;
      const scale = Math.min(max / img.width, max / img.height, 1);
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));
      const ctx = canvas.getContext("2d");
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Bucket by 5-bit-per-channel (32 levels)
        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
          const key = (r << 10) | (g << 5) | b;
          buckets[key] = (buckets[key] || 0) + 1;
        }
        const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, k);
        const colors = sorted.map(([key, count]) => {
          const k = parseInt(key, 10);
          const r = ((k >> 10) & 31) << 3;
          const g = ((k >> 5) & 31) << 3;
          const b = (k & 31) << 3;
          const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
          return { rgb: [r, g, b], hex, count };
        });
        resolve(colors);
      } catch (e) {
        // Likely a CORS issue on cross-origin image; resolve empty
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageDataUrl;
  });

const colorDistance = (c1, c2) => {
  // Simple Euclidean RGB distance — fine for our purposes
  const [r1, g1, b1] = c1, [r2, g2, b2] = c2;
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};

const fileToDataURL = (file) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

const analyzeImage = async (file) => {
  const dataUrl = await fileToDataURL(file);

  let exif = {};
  try {
    const exifr = await ensureExifr();
    exif = (await exifr.parse(file, { gps: true })) || {};
  } catch (e) { exif = {}; }

  const colors = await extractDominantColors(dataUrl, 5);

  const numbers = {
    "image size (KB)": Math.round(file.size / 1024),
    "filename chars": file.name.length,
  };
  if (exif.ExifImageWidth || exif.ImageWidth) numbers["width (px)"] = exif.ExifImageWidth || exif.ImageWidth;
  if (exif.ExifImageHeight || exif.ImageHeight) numbers["height (px)"] = exif.ExifImageHeight || exif.ImageHeight;
  if (exif.ISO) numbers["ISO"] = exif.ISO;
  if (exif.FocalLength) numbers["focal length (mm)"] = Math.round(exif.FocalLength);
  if (exif.FNumber) numbers["f-stop ×10"] = Math.round(exif.FNumber * 10);

  // EXIF date as a date subfact
  const exifDate = exif.DateTimeOriginal || exif.CreateDate;
  let parsedDate = null;
  if (exifDate) {
    parsedDate = new Date(exifDate);
    if (!isNaN(parsedDate.getTime())) {
      numbers["photo year"] = parsedDate.getFullYear();
      numbers["photo month"] = parsedDate.getMonth() + 1;
    } else {
      parsedDate = null;
    }
  }

  // Color hex strings still feed the numerology pool (one combined signature),
  // and the colors array still drives color-distance matching between images.
  // But individual RGB channel values are NOT added to the numeric fact pool —
  // 0-255 channel integers collide too readily with everything else and the
  // resulting "color 3 G of image equals days since birthday" findings are
  // pure noise. Colors should match colors, not character counts.
  const colorNumerology = colors.length > 0 ? numerologyOf(colors.map((c) => c.hex.replace("#", "")).join("")) : null;

  return {
    dataUrl, exif, colors, numbers,
    parsedDate,
    gps: (exif.latitude !== undefined && exif.longitude !== undefined)
      ? { lat: exif.latitude, lng: exif.longitude } : null,
    camera: [exif.Make, exif.Model].filter(Boolean).join(" ") || null,
    colorNumerology,
  };
};

// =============================================================================
// SECTION 13: URL ANALYSIS
// =============================================================================

const analyzeUrl = (urlString) => {
  let parsed;
  try { parsed = new URL(urlString); } catch (e) { return null; }
  // Mine the URL itself for additional numeric facts: counts of letters,
  // digits, vowels in domain. These give us things to collide with even when
  // the page itself is CORS-blocked.
  const domain = parsed.hostname;
  const path = parsed.pathname;
  const fullForCounts = domain + path;
  const digits = (fullForCounts.match(/\d/g) || []).join("");
  const letters = (domain.match(/[a-zA-Z]/g) || []).length;
  const vowels = (domain.match(/[aeiouAEIOU]/g) || []).length;
  const numbers = {
    "url chars": urlString.length,
    "domain chars": domain.length,
    "path chars": path.length,
    "subdomain count": Math.max(0, domain.split(".").length - 2),
    "domain letter count": letters,
    "domain vowel count": vowels,
  };
  // If the URL contains numbers (e.g. example.com/article/12345), extract
  // them as facts. This is especially useful for sites with numeric IDs.
  if (digits.length > 0) {
    const n = parseInt(digits.slice(0, 7), 10);
    if (Number.isFinite(n) && n > 0) numbers["digits in URL"] = n;
  }
  return {
    url: urlString,
    domain,
    path,
    tld: domain.split(".").pop(),
    numbers,
  };
};

// Best-effort fetch — succeeds on CORS-friendly sites, fails silently otherwise.
const fetchUrlContent = async (url) => {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text") && !ct.includes("html")) return null;
    const html = await res.text();
    // Strip HTML tags crudely; we just want text for analysis
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                     .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                     .replace(/<[^>]+>/g, " ")
                     .replace(/\s+/g, " ")
                     .trim();
    return text.slice(0, LIMITS.TEXT_MAX_CHARS);
  } catch (e) { return null; }
};

// =============================================================================
// SECTION 14: CONNECTION ENGINE
// =============================================================================
//
// Settings object lets us toggle "soft" categories without re-running expensive
// computation — categories are filtered after detection.

const findConnections = (nodes, settings = {}) => {
  const {
    enableNumerology = true,
    enableAnagrams = true,
    enableAstrology = true,
    enableLeyLines = true,
  } = settings;

  const connections = [];
  const numericFacts = [];

  nodes.forEach((node) => {
    Object.entries(node.numbers || {}).forEach(([label, value]) => {
      numericFacts.push({ nodeId: node.id, nodeName: node.name, label, value });
    });
  });

  // ---- Numeric matches across nodes ----
  // Floors are tuned to suppress small-integer noise. Single-digit and very
  // small numbers collide constantly across unrelated facts (months, days,
  // counts of children, etc.) and produce uninteresting "matches". Real
  // patterns live at higher numbers — years, distances, character counts.
  // Year facts get reduced-strength near matching and only tight 2×/3× multiples
  // (since adjacent years are common but historical adjacencies are still
  // worth noting at lower confidence).
  const isYearFact = (f) => /year|founded|birth|death|published/i.test(f.label);
  for (let i = 0; i < numericFacts.length; i++) {
    for (let j = i + 1; j < numericFacts.length; j++) {
      const a = numericFacts[i], b = numericFacts[j];
      if (a.nodeId === b.nodeId) continue;
      const yearLike = isYearFact(a) || isYearFact(b);
      if (a.value === b.value && a.value > 9) {
        connections.push({ from: a.nodeId, to: b.nodeId, strength: 1.0, kind: "exact", a, b });
      } else if (a.value > 20 && b.value > 20 && Math.abs(a.value - b.value) <= 2) {
        // Years still match, but at reduced strength — historical adjacency
        // is interesting but less surprising than coincidence between unrelated facts.
        const strength = yearLike ? 0.45 : 0.6;
        connections.push({ from: a.nodeId, to: b.nodeId, strength, kind: "near", a, b });
      } else if (
        a.value > 10 && b.value > 10 && a.value !== b.value &&
        (a.value % b.value === 0 || b.value % a.value === 0)
      ) {
        const big = Math.max(a.value, b.value), small = Math.min(a.value, b.value);
        const multiplier = big / small;
        // For year-related multiples, only allow the cleanest cases: exactly
        // 2× or 3×. For other facts, any multiplier up to 12× passes.
        const maxMult = yearLike ? 3 : 12;
        if (multiplier > maxMult || small < 5) continue;
        if (yearLike && multiplier !== 2 && multiplier !== 3) continue;
        connections.push({
          from: a.nodeId, to: b.nodeId, strength: 0.4, kind: "multiple",
          a, b, multiplier,
        });
      }
    }
  }

  // ---- Numerology ----
  if (enableNumerology) {
    const numerologyFacts = nodes.filter((n) => n.numerology).map((n) => ({
      nodeId: n.id, nodeName: n.name, ...n.numerology,
    }));
    for (let i = 0; i < numerologyFacts.length; i++) {
      for (let j = i + 1; j < numerologyFacts.length; j++) {
        const a = numerologyFacts[i], b = numerologyFacts[j];
        if (a.reduced === b.reduced) {
          connections.push({
            from: a.nodeId, to: b.nodeId, strength: 0.85, kind: "numerology",
            a: { ...a, label: "numerological value" },
            b: { ...b, label: "numerological value" },
            value: a.reduced,
          });
        }
      }
    }
  }

  // ---- Anagrams ----
  if (enableAnagrams) {
    const anagramables = nodes.filter((n) => ["name", "location"].includes(n.type) && n.name);
    for (let i = 0; i < anagramables.length; i++) {
      for (let j = i + 1; j < anagramables.length; j++) {
        const a = anagramables[i], b = anagramables[j];
        const sigA = anagramSignature(a.name), sigB = anagramSignature(b.name);
        if (sigA.length < 4 || sigB.length < 4) continue;
        if (sigA === sigB) {
          connections.push({
            from: a.id, to: b.id, strength: 0.95, kind: "anagram",
            a: { nodeName: a.name }, b: { nodeName: b.name },
          });
        } else if (Math.abs(sigA.length - sigB.length) <= 2) {
          const dist = multisetEditDistance(sigA, sigB);
          if (dist <= 2 && Math.min(sigA.length, sigB.length) >= 5) {
            connections.push({
              from: a.id, to: b.id, strength: 0.5, kind: "near-anagram",
              a: { nodeName: a.name }, b: { nodeName: b.name },
              distance: dist,
            });
          }
        }
      }
    }
  }

  // ---- Word overlap ----
  const textNodes = nodes.filter((n) => n.type === "text" && n.tokens);
  for (let i = 0; i < textNodes.length; i++) {
    for (let j = i + 1; j < textNodes.length; j++) {
      const a = textNodes[i], b = textNodes[j];
      const overlap = a.tokens.filter((t) => b.tokens.includes(t) && t.length > 4);
      if (overlap.length > 0) {
        connections.push({
          from: a.id, to: b.id, strength: 0.5, kind: "word-overlap",
          a: { nodeName: a.name }, b: { nodeName: b.name },
          words: overlap.slice(0, 3),
        });
      }
    }
  }

  // ---- Letter-frequency overlap (stylometric) ----
  const lfNodes = nodes.filter((n) => n.letterFreq);
  for (let i = 0; i < lfNodes.length; i++) {
    for (let j = i + 1; j < lfNodes.length; j++) {
      const a = lfNodes[i], b = lfNodes[j];
      // Cosine similarity on the 26-d vectors
      let dot = 0, magA = 0, magB = 0;
      for (const ch of "abcdefghijklmnopqrstuvwxyz") {
        const x = a.letterFreq[ch], y = b.letterFreq[ch];
        dot += x * y; magA += x * x; magB += y * y;
      }
      const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
      if (sim > 0.985) { // threshold: very similar letter distributions
        connections.push({
          from: a.id, to: b.id, strength: 0.55, kind: "stylometric",
          a: { nodeName: a.name }, b: { nodeName: b.name },
          similarity: sim,
        });
      }
    }
  }

  // ---- Word count = some date year ----
  textNodes.forEach((textNode) => {
    const wc = textNode.numbers?.["word count"];
    if (!wc || wc < 1500 || wc > 2100) return;
    nodes.forEach((other) => {
      if (other.id === textNode.id) return;
      Object.entries(other.numbers || {}).forEach(([label, value]) => {
        if (value === wc && /year|founded|birth|death/i.test(label)) {
          connections.push({
            from: textNode.id, to: other.id, strength: 0.95, kind: "wordcount-year",
            a: { nodeName: textNode.name, value: wc },
            b: { nodeName: other.name, label, value },
          });
        }
      });
    });
  });

  // ---- Day-of-week alignment (3+ dates same weekday) ----
  const dateLikeNodes = nodes.filter((n) => n.dayOfWeek);
  const byDow = {};
  dateLikeNodes.forEach((n) => {
    byDow[n.dayOfWeek] = byDow[n.dayOfWeek] || [];
    byDow[n.dayOfWeek].push(n);
  });
  Object.entries(byDow).forEach(([dow, group]) => {
    if (group.length >= 3) {
      // Connect them all pairwise as a "weekday cluster"
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          connections.push({
            from: group[i].id, to: group[j].id, strength: 0.7, kind: "weekday-cluster",
            a: { nodeName: group[i].name }, b: { nodeName: group[j].name },
            dayOfWeek: dow, count: group.length,
          });
        }
      }
    }
  });

  // ---- Astrology compatibility ----
  if (enableAstrology) {
    const zodiacNodes = nodes.filter((n) => n.zodiac);
    for (let i = 0; i < zodiacNodes.length; i++) {
      for (let j = i + 1; j < zodiacNodes.length; j++) {
        const a = zodiacNodes[i], b = zodiacNodes[j];
        if (zodiacCompatible(a.zodiac, b.zodiac)) {
          connections.push({
            from: a.id, to: b.id, strength: 0.45, kind: "astrology",
            a: { nodeName: a.name, zodiac: a.zodiac },
            b: { nodeName: b.name, zodiac: b.zodiac },
            element: ZODIAC_ELEMENTS[a.zodiac],
          });
        }
      }
    }
  }

  // ---- Name mentions ----
  nodes.forEach((nameNode) => {
    if (nameNode.type !== "name") return;
    const firstName = nameNode.name.split(" ")[0].toLowerCase();
    nodes.forEach((other) => {
      if (other.id === nameNode.id) return;
      if (other.type === "text" && other.rawText) {
        if (other.rawText.toLowerCase().includes(firstName)) {
          connections.push({
            from: nameNode.id, to: other.id, strength: 0.9, kind: "name-mention",
            a: { nodeName: nameNode.name }, b: { nodeName: other.name },
            mention: firstName,
          });
        }
      }
      if (other.type === "audio" && (other.rawFilename || "").toLowerCase().includes(firstName)) {
        connections.push({
          from: nameNode.id, to: other.id, strength: 0.9, kind: "name-in-filename",
          a: { nodeName: nameNode.name }, b: { nodeName: other.name },
          mention: firstName,
        });
      }
      if (other.type === "today" && other.events) {
        for (const ev of other.events) {
          const inText = ev.text.toLowerCase().includes(nameNode.name.toLowerCase());
          const inPages = ev.names.some((p) => p.toLowerCase() === nameNode.name.toLowerCase());
          if (inText || inPages) {
            connections.push({
              from: nameNode.id, to: other.id, strength: 0.95, kind: "today-mention",
              a: { nodeName: nameNode.name }, b: { nodeName: other.name },
              event: ev,
            });
            break;
          }
        }
      }
    });
  });

  // ---- Color matching across image / audio nodes ----
  const colorNodes = nodes.filter((n) => n.colors && n.colors.length > 0);
  for (let i = 0; i < colorNodes.length; i++) {
    for (let j = i + 1; j < colorNodes.length; j++) {
      const a = colorNodes[i], b = colorNodes[j];
      // Find closest color pair
      let bestPair = null, bestDist = Infinity;
      for (const ca of a.colors) for (const cb of b.colors) {
        const d = colorDistance(ca.rgb, cb.rgb);
        if (d < bestDist) { bestDist = d; bestPair = { ca, cb }; }
      }
      if (bestDist < 30) { // very close colors
        connections.push({
          from: a.id, to: b.id, strength: 0.7, kind: "color-match",
          a: { nodeName: a.name, hex: bestPair.ca.hex },
          b: { nodeName: b.name, hex: bestPair.cb.hex },
          distance: Math.round(bestDist),
        });
      }
    }
  }

  // ---- Location distance + ley lines ----
  const locationNodes = nodes.filter((n) => n.type === "location" && n.lat !== undefined);
  for (let i = 0; i < locationNodes.length; i++) {
    for (let j = i + 1; j < locationNodes.length; j++) {
      const a = locationNodes[i], b = locationNodes[j];
      const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
      // Distance collisions with other numeric facts
      numericFacts.forEach((f) => {
        if (f.nodeId === a.id || f.nodeId === b.id) return;
        if (f.value === km && km > 1) {
          connections.push({
            from: a.id, to: f.nodeId, strength: 0.95, kind: "distance-match",
            a: { nodeName: a.name, label: `distance to ${b.name} (km)`, value: km },
            b: f, otherLocation: b.name,
          });
        }
      });
      connections.push({
        from: a.id, to: b.id, strength: 0.7, kind: "distance",
        a: { nodeName: a.name }, b: { nodeName: b.name },
        km,
      });
    }
  }

  // Ley lines (3+ collinear locations)
  if (enableLeyLines && locationNodes.length >= 3) {
    for (let i = 0; i < locationNodes.length; i++) {
      for (let j = i + 1; j < locationNodes.length; j++) {
        for (let k = j + 1; k < locationNodes.length; k++) {
          const p1 = locationNodes[i], p2 = locationNodes[j], p3 = locationNodes[k];
          if (isLeyLine(p1, p2, p3, 0.5)) {
            // Add as a triangle of connections
            [[p1, p2], [p2, p3], [p1, p3]].forEach(([x, y]) => {
              connections.push({
                from: x.id, to: y.id, strength: 0.8, kind: "ley-line",
                a: { nodeName: x.name }, b: { nodeName: y.name },
                triangle: [p1.name, p2.name, p3.name],
              });
            });
          }
        }
      }
    }
  }

  // Dedupe
  const seen = new Set();
  return connections.filter((c) => {
    const key = [c.from, c.to].sort().join("→") + "|" + c.kind + "|" + (c.a?.label || "") + (c.b?.label || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// =============================================================================
// SECTION 15: NARRATIVE GENERATOR
// =============================================================================

const OPENERS = [
  "Note that", "Of particular interest:", "It cannot be coincidence that",
  "The pattern emerges:", "Records indicate that", "The investigator has determined that",
  "It bears mentioning that", "One observes that", "Curiously,",
];

const CLOSERS_MILD = [
  "This warrants further inquiry.", "Make of this what you will.",
  "We let the reader draw their own conclusions.", "The implications are left as an exercise.",
  "This is logged for the record.", "We note this without comment.",
];

const CLOSERS_HEATED = [
  "The implications are obvious.", "At what point does this cease to be coincidence?",
  "Surely this cannot be dismissed.", "The pattern is, by now, undeniable.",
  "[REDACTED] would not approve of this finding being made public.",
  "The investigator's hands are, at this point, trembling.",
  "We refuse to be the ones to say it aloud.",
];

const closerFor = (totalConnections, seed) => {
  const pool = totalConnections >= 8
    ? [...CLOSERS_MILD, ...CLOSERS_HEATED, ...CLOSERS_HEATED]
    : CLOSERS_MILD;
  return pick(pool, seed);
};

// Named strength tiers, replacing the misleading "CONFIDENCE %" label.
// Strength describes the match itself (how rare / specific), NOT our certainty
// that the match means something — which we explicitly never claim.
const strengthTier = (s) => {
  if (s >= 0.9) return "SUSPICIOUS";
  if (s >= 0.7) return "STRIKING";
  if (s >= 0.5) return "NOTABLE";
  return "TRIVIAL";
};

const rephrasers = {
  exact: (c) => pick([
    `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) is identical to the ${c.b.label} of ${c.b.nodeName}`,
    `${c.a.nodeName} and ${c.b.nodeName} share an exact numeric match — both register ${c.a.value}, the former as ${c.a.label}, the latter as ${c.b.label}`,
    `the value ${c.a.value} appears in two unrelated places: as ${c.a.label} of ${c.a.nodeName}, and as ${c.b.label} of ${c.b.nodeName}`,
  ], c.a.value + c.b.value),
  near: (c) => {
    const diff = Math.abs(c.a.value - c.b.value);
    return pick([
      `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) and the ${c.b.label} of ${c.b.nodeName} (${c.b.value}) differ by only ${diff}`,
      `${c.a.nodeName}'s ${c.a.label} stands at ${c.a.value}; ${c.b.nodeName}'s ${c.b.label} stands at ${c.b.value} — a discrepancy of just ${written(diff)}`,
    ], c.a.value + c.b.value);
  },
  multiple: (c) => `the ${c.a.label} of ${c.a.nodeName} (${c.a.value}) and the ${c.b.label} of ${c.b.nodeName} (${c.b.value}) are related by a clean integer multiple of ${c.multiplier}× — an arithmetic relationship which the casual observer would surely overlook`,
  numerology: (c) => {
    // Show our work: input string -> digit sum -> reduced single digit.
    // Truncate the visible source for readability; the method is what matters.
    const showSrc = (s) => {
      if (!s) return "?";
      const up = s.toUpperCase();
      return up.length > 16 ? up.slice(0, 14) + "…" : up;
    };
    const aDeriv = `${showSrc(c.a.source)} → digital sum ${c.a.sum} → reduced to ${c.value}`;
    const bDeriv = `${showSrc(c.b.source)} → digital sum ${c.b.sum} → reduced to ${c.value}`;
    return pick([
      `${c.a.nodeName}, reduced numerologically (Pythagorean: A=1, B=2, …, I=9, J=1 …), yields ${c.value} (${aDeriv}); ${c.b.nodeName}, reduced by the same method, yields the identical ${c.value} (${bDeriv})`,
      `the numerological signatures of ${c.a.nodeName} and ${c.b.nodeName} converge on ${c.value} — derived as ${aDeriv}, and ${bDeriv}, respectively. A result the ancients would not have considered accidental`,
    ], c.value * 7);
  },
  "word-overlap": (c) => `${c.a.nodeName} and ${c.b.nodeName} share unusual vocabulary, including ${c.words.map((w) => `"${w}"`).join(", ")} — words which, statistically, ought not to co-occur in unrelated documents`,
  stylometric: (c) => `the letter-frequency distributions of ${c.a.nodeName} and ${c.b.nodeName} exhibit a cosine similarity of ${(c.similarity * 100).toFixed(1)}%, a value used in stylometric authorship analysis. Identical authorship cannot be ruled out`,
  "wordcount-year": (c) => `the word count of ${c.a.nodeName} (${c.a.value}) is precisely equal to the ${c.b.label} of ${c.b.nodeName}. The investigator notes that documents of arbitrary length do not, as a rule, terminate on dates of historical significance`,
  "weekday-cluster": (c) => `${c.count} dates of record fall on a ${c.dayOfWeek}. The recurrence of ${c.dayOfWeek} across unrelated entries is, statistically, improbable`,
  astrology: (c) => `${c.a.nodeName} (${c.a.zodiac}) and ${c.b.nodeName} (${c.b.zodiac}) share the elemental affinity of ${c.element}. The ancients held such pairings to be no accident`,
  "name-mention": (c) => `the text fragment ${c.b.nodeName} contains explicit reference to "${c.mention}" — the same name attached to subject ${c.a.nodeName}`,
  "name-in-filename": (c) => `the audio exhibit's filename contains the string "${c.mention}", a name otherwise associated with subject ${c.a.nodeName}`,
  "today-mention": (c) => {
    const ev = c.event;
    return `${c.a.nodeName} appears in the historical record for this very date. In ${ev.year}: ${ev.text} The investigator notes the user's choice of timing — the entry of this name into evidence on the anniversary of its appearance in the historical record cannot reasonably be dismissed`;
  },
  distance: (c) => `the great-circle distance between ${c.a.nodeName} and ${c.b.nodeName} is precisely ${c.km} kilometres — a figure which, for the moment, the investigator merely records`,
  "distance-match": (c) => `the great-circle distance from ${c.a.nodeName} to ${c.otherLocation} measures ${c.a.value} kilometres — exactly equal to the ${c.b.label} of ${c.b.nodeName}. The reader will note that distance, by nature, knows nothing of audio file durations or page counts`,
  "ley-line": (c) => `${c.triangle.join(", ")} fall on a near-perfect great-circle alignment. Such collinearity, in the literature on the subject, is referred to as a ley line. The investigator does not endorse this terminology, but acknowledges the geometry`,
  "color-match": (c) => `a dominant colour of ${c.a.nodeName} (${c.a.hex}) is visually indistinguishable from a dominant colour of ${c.b.nodeName} (${c.b.hex}). Two unrelated images converging on the same chromatic signature is a rare event`,
  anagram: (c) => `the letters of ${c.a.nodeName.toUpperCase()}, rearranged, spell ${c.b.nodeName.toUpperCase()}. The investigator declines to speculate further`,
  "near-anagram": (c) => `${c.a.nodeName.toUpperCase()} and ${c.b.nodeName.toUpperCase()} differ by only ${written(c.distance)} letter${c.distance === 1 ? "" : "s"} when reduced to their constituent characters. A near-anagram of this proximity, in the absence of common etymology, is suspect`,
};

const narrateConnection = (c, totalConnections = 1, indexSeed = 0) => {
  const opener = pick(OPENERS, indexSeed);
  const body = rephrasers[c.kind] ? rephrasers[c.kind](c) : `${c.a?.nodeName || "?"} and ${c.b?.nodeName || "?"} are linked`;
  const closer = closerFor(totalConnections, indexSeed * 3 + 1);
  return `${opener} ${body}. ${closer}`;
};

const generateDossier = (nodes, connections) => {
  if (nodes.length === 0) return "";
  const date = new Date().toISOString().slice(0, 10);
  const caseNo = String(Math.floor(Math.random() * 9000) + 1000);
  const counts = {};
  nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  const subjects = nodes.filter((n) => n.type === "name").map((n) => n.name.toUpperCase());
  const subjectLine = subjects.length > 0
    ? `the subject${subjects.length > 1 ? "s" : ""} ${subjects.join(", ")}`
    : "the items of evidence enumerated below";

  const exhibits = [
    counts.audio && `${written(counts.audio)} audio exhibit${counts.audio === 1 ? "" : "s"}`,
    counts.image && `${written(counts.image)} image exhibit${counts.image === 1 ? "" : "s"}`,
    counts.text && `${written(counts.text)} text fragment${counts.text === 1 ? "" : "s"}`,
    counts.url && `${written(counts.url)} URL${counts.url === 1 ? "" : "s"} of record`,
    counts.book && `${written(counts.book)} bibliographic entr${counts.book === 1 ? "y" : "ies"}`,
    counts.date && `${written(counts.date)} date${counts.date === 1 ? "" : "s"} of record`,
    counts.location && `${written(counts.location)} geographic site${counts.location === 1 ? "" : "s"}`,
    counts.today && `the present moment itself`,
  ].filter(Boolean).join(", ") || "no further evidence";

  const intro =
    `CASE FILE №${caseNo} — ${date}\n\n` +
    `This dossier concerns ${subjectLine}, in conjunction with ${exhibits}. ` +
    `Following standard cross-referential analysis, ${written(connections.length)} ` +
    `connection${connections.length === 1 ? "" : "s"} of varying confidence ` +
    `${connections.length === 1 ? "was" : "were"} identified.`;

  const findings = connections.length === 0
    ? "\n\nFINDINGS\n\nNo cross-references of statistical interest were identified. The investigator notes, however, that the absence of evidence is not, in itself, evidence of absence."
    : "\n\nFINDINGS\n\n" + connections.map((c, i) =>
        `§${i + 1}. ` + narrateConnection(c, connections.length, i + c.strength * 10)
      ).join("\n\n");

  const closingPool = connections.length >= 5
    ? [
        `In total, ${written(connections.length)} cross-references were identified across ${written(nodes.length)} evidence items. The probability of this occurring by chance is left as an exercise for the reader.`,
        `The investigator submits these findings without commentary. ${written(connections.length)} connections, across ${written(nodes.length)} unrelated items, in a single sitting.`,
      ]
    : [
        `${written(connections.length)} connection${connections.length === 1 ? "" : "s"} ${connections.length === 1 ? "was" : "were"} logged. Investigation continues.`,
        `The case remains open. ${written(connections.length)} finding${connections.length === 1 ? "" : "s"} of record at this time.`,
      ];

  return intro + findings + "\n\nCONCLUSION\n\n" + pick(closingPool, connections.length * 11) + "\n\n— END OF FILE —";
};

// =============================================================================
// SECTION 16: TODAY OBSERVATION (cold open banner)
// =============================================================================

const TODAY_OPENERS = [
  "Curious that you opened this tool",
  "It is no accident that you arrived here",
  "Note your timing:",
  "The investigator observes that you have come",
  "We log your entry into this file",
  "Of immediate interest:",
];

const TODAY_FRAMINGS = [
  ({ dayOfWeek, moonPhase, zodiac }) => `on a ${dayOfWeek}, beneath a ${moonPhase}, while the sun sits in ${zodiac}`,
  ({ dayOfWeek, zodiac }) => `on a ${dayOfWeek} during the season of ${zodiac}`,
  ({ moonPhase, dayOfYear }) => `on the ${ordinal(dayOfYear)} day of the year, with the moon ${moonPhase.toLowerCase().includes("waxing") ? "still climbing" : moonPhase.toLowerCase().includes("waning") ? "in retreat" : "in transition"}`,
  ({ dayOfWeek, isoDate }) => `on this particular ${dayOfWeek}, ${isoDate}, of all possible days`,
];

const TODAY_HISTORICAL = [
  (ev) => `On this date in ${ev.year}, ${ev.text}`,
  (ev) => `History records that on this very day, in ${ev.year}: ${ev.text}`,
  (ev) => `Consider, also, that ${ev.year} produced the following on this date: ${ev.text}`,
];

const TODAY_NUMEROLOGY = [
  (sum, reduced) => `Today's date, reduced numerologically, yields ${reduced} (from a digital sum of ${sum}). The reader will draw their own conclusions.`,
  (sum, reduced) => `Note that today reduces to ${reduced} under Pythagorean addition — a value the ancients did not assign lightly.`,
];

const TODAY_CLOSERS = [
  "The investigator merely notes your timing.",
  "What you do next is, of course, your own business.",
  "We have made the relevant observations.",
  "Proceed accordingly.",
  "The file awaits your evidence.",
];

const buildTodayObservation = (todayNode, seed, includeNumerology) => {
  if (!todayNode) return null;
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.ceil((now - startOfYear) / 86400000);
  const ctx = {
    dayOfWeek: todayNode.dayOfWeek, moonPhase: todayNode.moonPhase,
    zodiac: todayNode.zodiac, dayOfYear, isoDate: todayNode.isoDate,
  };
  const opener = pick(TODAY_OPENERS, seed);
  const framing = pick(TODAY_FRAMINGS, seed * 3)(ctx);
  let historical = "";
  if (todayNode.events && todayNode.events.length > 0) {
    const chosen = todayNode.events[Math.floor(Math.abs(seed * 7)) % todayNode.events.length];
    historical = " " + pick(TODAY_HISTORICAL, seed * 11)(chosen);
  }
  let numerology = "";
  if (includeNumerology && todayNode.numerology) {
    numerology = " " + pick(TODAY_NUMEROLOGY, seed * 13)(todayNode.numerology.sum, todayNode.numerology.reduced);
  }
  const closer = " " + pick(TODAY_CLOSERS, seed * 17);
  return `${opener} ${framing}.${historical}${numerology}${closer}`;
};

// Summarize a today-related hint connection into a single short nudge line.
// This is intentionally less florid than the full narrative — the banner is
// observational, not declarative.
const summarizeHint = (c) => {
  const otherName = c.from === "today" ? c.b?.nodeName || "your evidence" : c.a?.nodeName || "your evidence";
  switch (c.kind) {
    case "today-mention":
      return `${otherName} appears in today's historical record.`;
    case "exact":
      return `a value linked to ${otherName} is identical to one of today's facts.`;
    case "near":
      return `${otherName} produces a number very close to one of today's.`;
    case "numerology":
      return `${otherName} reduces numerologically to today's same digit.`;
    case "anagram":
    case "near-anagram":
      return `${otherName} shares its letters with today's date string.`;
    case "weekday-cluster":
      return `${otherName} falls on the same weekday as today.`;
    case "astrology":
      return `${otherName}'s zodiac is elementally compatible with today's.`;
    default:
      return `${otherName} would connect to today.`;
  }
};

const TodayObservation = ({ todayNode, onPromote, onReroll, rerollKey, includeNumerology, hints = [] }) => {
  const observation = useMemo(
    () => buildTodayObservation(todayNode, rerollKey || 1, includeNumerology),
    [todayNode, rerollKey, includeNumerology]
  );
  if (!todayNode) {
    return (
      <div style={observationStyle}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.7, marginBottom: 8 }}>
          ░ FROM THE INVESTIGATOR'S DESK ░
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, fontStyle: "italic" }}>Consulting the date…</div>
      </div>
    );
  }
  // Show at most 3 hints, prioritizing strongest matches.
  const topHints = hints
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  return (
    <div style={observationStyle}>
      <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.7, marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <span>░ FROM THE INVESTIGATOR'S DESK ░</span>
        <span style={{ opacity: 0.5 }}>{todayNode.isoDate} · {todayNode.dayOfWeek} · {todayNode.moonPhase}</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, fontStyle: "italic", color: "#e8dcc4" }}>{observation}</p>

      {topHints.length > 0 && (
        <div style={{
          marginTop: 14, padding: "10px 12px",
          background: "rgba(170,30,30,0.12)",
          border: "1px dashed #aa1e1e",
          fontSize: 12, lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.8, marginBottom: 6, color: "#ffb84d" }}>
            ⚠ AND YET — A NOTE
          </div>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            Were today entered into evidence, the investigator would observe:
          </p>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {topHints.map((h, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{summarizeHint(h)}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onPromote} style={buttonStyle}>▸ ENTER TODAY INTO EVIDENCE</button>
        <button onClick={onReroll} style={tabStyle}>↻ RECONSULT</button>
      </div>
    </div>
  );
};

// =============================================================================
// SECTION 17: DEMO + RANDOMIZER POOLS
// =============================================================================

const DEMO_SET = {
  names: ["Nikola Tesla"],
  texts: [`Call me Ishmael. Some years ago — never mind how long precisely — having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off — then, I account it high time to get to sea as soon as I can.`],
  dates: [{ label: "moon landing", iso: "1969-07-20" }],
  locations: ["Smiljan, Croatia", "Wardenclyffe, New York"],
};

const RANDOM_POOLS = {
  names: [
    "Nikola Tesla", "Marie Curie", "Ada Lovelace", "Hedy Lamarr",
    "Alan Turing", "Carl Sagan", "Mary Shelley", "Jorge Luis Borges",
    "Akira Kurosawa", "Frida Kahlo", "Hypatia", "Leonardo da Vinci",
    "Gertrude Stein", "Buckminster Fuller", "Octavia Butler",
    "Ramanujan", "Hokusai", "Sun Tzu",
  ],
  texts: [
    "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of light, it was the season of darkness.",
    "All happy families are alike; each unhappy family is unhappy in its own way.",
    "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.",
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    "The past is a foreign country; they do things differently there.",
    "Many years later, as he faced the firing squad, Colonel Aureliano Buendía was to remember that distant afternoon when his father took him to discover ice.",
  ],
  dates: [
    { label: "moon landing", iso: "1969-07-20" },
    { label: "fall of the Berlin Wall", iso: "1989-11-09" },
    { label: "Tunguska event", iso: "1908-06-30" },
    { label: "Roswell incident", iso: "1947-07-08" },
    { label: "Challenger disaster", iso: "1986-01-28" },
    { label: "first ARPANET message", iso: "1969-10-29" },
    { label: "Krakatoa eruption", iso: "1883-08-27" },
  ],
  locations: [
    "Roswell, New Mexico", "Stonehenge, UK", "Easter Island",
    "Bermuda Triangle", "Area 51", "Smiljan, Croatia",
    "Tunguska, Russia", "Nazca, Peru", "Giza, Egypt",
    "Bran Castle, Romania", "Dealey Plaza, Dallas",
    "Wardenclyffe, New York", "Marfa, Texas",
  ],
  books: [
    "Foucault's Pendulum", "Gravity's Rainbow", "House of Leaves",
    "The Crying of Lot 49", "1984", "The Master and Margarita",
    "Cosmos", "The Illuminatus! Trilogy",
  ],
};

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// =============================================================================
// SECTION 18: MAP COMPONENTS
// =============================================================================

const ConnectionMap = ({ nodes, connections }) => {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState({});

  useEffect(() => {
    const w = 800, h = 500;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(180, 60 + nodes.length * 18);
    const pos = {};
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[node.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    setPositions(pos);
  }, [nodes.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 800 * dpr; canvas.height = 500 * dpr;
    canvas.style.width = "800px"; canvas.style.height = "500px";
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#f5efe1"; ctx.fillRect(0, 0, 800, 500);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(60, 40, 20, ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 800, Math.random() * 500, 1, 1);
    }
    connections.forEach((c) => {
      const a = positions[c.from], b = positions[c.to];
      if (!a || !b) return;
      ctx.strokeStyle = `rgba(170, 30, 30, ${0.3 + c.strength * 0.5})`;
      ctx.lineWidth = 0.8 + c.strength * 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 8;
      const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 8;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    });
    nodes.forEach((node) => {
      const p = positions[node.id];
      if (!p) return;
      ctx.save();
      const tilt = ((node.id.charCodeAt(0) % 7) - 3) * 0.04;
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-58, -28, 120, 60);
      const cardColor = {
        name: "#fff8d6", audio: "#dde8d8", text: "#fdfcf6",
        date: "#e8d8e0", location: "#d8e0e8", today: "#e8d8b8",
        image: "#e0e0d0", url: "#d8d0e0", book: "#e8e0c8",
      }[node.type] || "#fdfcf6";
      ctx.fillStyle = cardColor;
      ctx.fillRect(-60, -30, 120, 60);
      ctx.strokeStyle = "rgba(80,50,30,0.4)"; ctx.lineWidth = 0.5;
      ctx.strokeRect(-60, -30, 120, 60);
      ctx.beginPath();
      ctx.arc(0, -22, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#aa1e1e"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.stroke();
      ctx.fillStyle = "#2a1a0a";
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(node.type.toUpperCase(), 0, -6);
      ctx.font = "9px 'Courier New', monospace";
      const label = node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name;
      ctx.fillText(label, 0, 8);
      const factCount = Object.keys(node.numbers || {}).length + (node.numerology ? 1 : 0);
      ctx.fillText(`${factCount} facts`, 0, 22);
      ctx.restore();
    });
  }, [nodes, connections, positions]);

  return (
    <canvas ref={canvasRef}
      style={{ maxWidth: "100%", border: "1px solid #6b4a2a", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
  );
};

const ensureLeaflet = () =>
  new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.crossOrigin = "anonymous";
    document.head.appendChild(css);
    const s = document.createElement("script");
    // Production: add SRI integrity attribute
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });

const GeoMap = ({ locationNodes, onPick }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const linesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, worldCopyJump: true });
      L.tileLayer("https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; Stadia Maps &copy; OpenStreetMap', maxZoom: 18,
      }).addTo(map);
      map.on("click", (e) => onPick(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;
    markersRef.current.forEach((m) => map.removeLayer(m));
    linesRef.current.forEach((l) => map.removeLayer(l));
    markersRef.current = []; linesRef.current = [];

    locationNodes.forEach((n) => {
      // SECURITY FIX: build popup as DOM, not HTML string, so n.name from
      // Nominatim cannot inject HTML.
      const popupEl = document.createElement("div");
      const nameEl = document.createElement("strong");
      nameEl.textContent = n.name;
      popupEl.appendChild(nameEl);
      popupEl.appendChild(document.createElement("br"));
      const coordEl = document.createElement("span");
      coordEl.textContent = `${n.lat.toFixed(3)}, ${n.lng.toFixed(3)}`;
      popupEl.appendChild(coordEl);

      const marker = L.circleMarker([n.lat, n.lng], {
        radius: 7, color: "#aa1e1e", weight: 2,
        fillColor: "#aa1e1e", fillOpacity: 0.7,
      }).bindPopup(popupEl).addTo(map);
      markersRef.current.push(marker);
    });

    for (let i = 0; i < locationNodes.length; i++) {
      for (let j = i + 1; j < locationNodes.length; j++) {
        const a = locationNodes[i], b = locationNodes[j];
        const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]],
          { color: "#aa1e1e", weight: 1.5, opacity: 0.6, dashArray: "4 4" })
          .bindTooltip(`${km} km`).addTo(map);
        linesRef.current.push(line);
      }
    }

    if (locationNodes.length > 0) {
      const bounds = L.latLngBounds(locationNodes.map((n) => [n.lat, n.lng]));
      map.fitBounds(bounds.pad(0.5), { maxZoom: 8, animate: true });
    }
  }, [locationNodes]);

  return (
    <div ref={containerRef} style={{
      height: 460, width: "100%", border: "1px solid #6b4a2a",
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)", filter: "sepia(0.15) contrast(1.05)",
    }} />
  );
};

// =============================================================================
// SECTION 19: COLLAPSIBLE PANEL GROUP
// =============================================================================

const PanelGroup = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14, border: "1px solid #6b4a2a", background: "rgba(20,14,10,0.4)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "10px 14px",
          background: "rgba(40,28,18,0.8)", color: "#d6a85f",
          border: "none", borderBottom: open ? "1px solid #6b4a2a" : "none",
          fontFamily: "inherit", fontSize: 11, letterSpacing: "0.25em",
          cursor: "pointer", display: "flex", justifyContent: "space-between",
        }}
      >
        <span>▸ {title}</span>
        <span style={{ opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SECTION 20: MAIN APP
// =============================================================================

export default function Recognizer() {
  const [nodes, setNodes] = useState([]);
  const [view, setView] = useState("corkboard");

  // Inputs
  const [nameInput, setNameInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [bookInput, setBookInput] = useState("");

  // Status
  const [loading, setLoading] = useState(null);
  const [showDossier, setShowDossier] = useState(false);
  const [warning, setWarning] = useState(null);

  // Settings — soft connection toggles + dev tools
  const [settings, setSettings] = useState({
    enableNumerology: true,
    enableAnagrams: true,
    enableAstrology: true,
    enableLeyLines: true,
    devMode: false,
  });

  // Today
  const [todayNode, setTodayNode] = useState(null);
  const [todaySeed, setTodaySeed] = useState(1);
  const todayPromoted = useMemo(() => nodes.some((n) => n.type === "today"), [nodes]);

  useEffect(() => {
    let cancelled = false;
    fetchOnThisDay(new Date()).then((events) => {
      if (cancelled) return;
      const selected = sample(events, 6, Date.now() % 999);
      setTodayNode(buildTodayNode(selected));
    });
    return () => { cancelled = true; };
  }, []);

  // Strict gate: today does NOT participate in connections until the user
  // promotes it. The banner offers the option, and a separate "hint" mechanism
  // (below) tells the user when promoting today would actually surface a
  // coincidence — so the magic moment is preserved without the deception.
  const effectiveNodes = nodes;

  const connections = useMemo(
    () => findConnections(effectiveNodes, settings),
    [effectiveNodes, settings]
  );

  // Hint computation: would promoting today reveal anything? Run the engine on
  // a hypothetical promoted-today set and surface any connections that touch it.
  const todayHints = useMemo(() => {
    if (todayPromoted || !todayNode || nodes.length === 0) return [];
    const hypothetical = [...nodes, todayNode];
    const all = findConnections(hypothetical, settings);
    return all.filter((c) => c.from === "today" || c.to === "today");
  }, [nodes, todayNode, todayPromoted, settings]);

  const dossierText = useMemo(
    () => generateDossier(effectiveNodes, connections),
    [effectiveNodes, connections]
  );
  const locationNodes = useMemo(
    () => effectiveNodes.filter((n) => n.type === "location"),
    [effectiveNodes]
  );

  // ---- Soft cap warning ----
  useEffect(() => {
    if (nodes.length === LIMITS.NODES_SOFT_CAP) {
      setWarning(`The investigator is becoming overwhelmed. ${LIMITS.NODES_SOFT_CAP} items is a great deal of evidence for one sitting.`);
    } else if (nodes.length > LIMITS.NODES_SOFT_CAP) {
      setWarning(`Beyond all reason: ${nodes.length} items in the case file. The investigator's coffee has gone cold.`);
    } else {
      setWarning(null);
    }
  }, [nodes.length]);

  // ---- Adders ----

  const promoteToday = () => {
    if (!todayNode || todayPromoted) return;
    setNodes((n) => [...n, { ...todayNode }]);
  };
  const rerollToday = () => setTodaySeed((s) => s + 1);

  const addNameNode = async (presetName = null) => {
    const name = (presetName || nameInput).trim();
    if (!name) return;
    setLoading("Consulting Wikipedia archives…");
    const wiki = await lookupName(name);
    const facts = wiki ? extractFactsFromExtract(wiki.extract) : {};
    const displayName = wiki?.title || name;

    // Wikidata fetch — gets us full birth/death dates and other structured
    // facts that the prose summary doesn't carry.
    let wikidata = null;
    let dateDerived = {};
    if (wiki?.wikidataId) {
      setLoading("Cross-referencing Wikidata…");
      wikidata = await fetchWikidataFacts(wiki.wikidataId);
      if (wikidata) {
        // Merge structured Wikidata facts into the numbers pool
        Object.assign(facts, wikidata.facts);
        // For day-precision birth date, derive zodiac/weekday/lunar so the
        // node participates in date-cluster machinery (today-mention, etc).
        const birth = wikidata.dates["date of birth"];
        if (birth && isInRange(birth)) {
          dateDerived.zodiac = zodiacOf(birth);
          dateDerived.dayOfWeek = dayOfWeek(birth);
          dateDerived.moonPhase = moonPhase(birth);
          dateDerived.birthDate = birth.toISOString().slice(0, 10);
          // Also expose a generic day-of-year so it can collide with other dates
          facts["birth day-of-year"] = Math.ceil(
            (birth - new Date(birth.getFullYear(), 0, 0)) / 86400000
          );
        }
      }
    }

    const node = {
      id: "name-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "name", name: displayName,
      summary: wiki?.extract?.slice(0, 220) || "(no Wikipedia entry found — suspicious)",
      rawExtract: wiki?.extract || null,
      description: wiki?.description || null,
      wikidataId: wiki?.wikidataId || null,
      instanceOf: wikidata?.instanceOf || null,
      ...dateDerived,
      numbers: facts,
      numerology: numerologyOf(displayName),
      thumbnail: wiki?.thumbnail || null,
    };
    setNodes((n) => [...n, node]);
    if (!presetName) setNameInput("");
    setLoading(null);
  };

  const addTextNode = (presetText = null) => {
    let text = (presetText || textInput).trim();
    if (!text) return;
    if (text.length > LIMITS.TEXT_MAX_CHARS) {
      text = text.slice(0, LIMITS.TEXT_MAX_CHARS);
      setWarning(`Text truncated at ${LIMITS.TEXT_MAX_CHARS} characters. The investigator can only read so much.`);
    }
    const tokens = tokenize(text);
    const freq = wordFrequency(text);
    const repeated = findRepeatedPhrases(text);
    const names = findCapitalizedNames(text);
    const lf = letterFrequency(text);

    const numbers = {
      "char count": text.length,
      "word count": tokens.length,
      "unique words": Object.keys(freq).length,
      "longest word": Math.max(0, ...tokens.map((t) => t.length)),
    };
    const topWord = Object.entries(freq).filter(([w]) => w.length >= 2).sort((a, b) => b[1] - a[1])[0];
    if (topWord) numbers[`count of "${topWord[0]}"`] = topWord[1];

    const displayName = text.split(/\s+/).slice(0, 3).join(" ").slice(0, 24) || "text fragment";
    const node = {
      id: "text-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "text", name: displayName, rawText: text,
      tokens: [...new Set(tokens.filter((t) => t.length > 4))].slice(0, 50),
      repeated, names, numbers,
      letterFreq: lf,
      numerology: numerologyOf(displayName),
    };
    setNodes((n) => [...n, node]);
    if (!presetText) setTextInput("");
  };

  const addAudioNode = async (file) => {
    if (!file.type.startsWith("audio/")) {
      setWarning("That doesn't appear to be an audio file. The investigator requires audio.");
      return;
    }
    if (file.size > LIMITS.AUDIO_MAX_BYTES) {
      setWarning(`Audio file is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${LIMITS.AUDIO_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setLoading("Decoding audio metadata…");
    const data = await analyzeAudio(file);
    let colors = [];
    if (data.albumArt) {
      try { colors = await extractDominantColors(data.albumArt, 5); } catch (e) { colors = []; }
    }
    const node = {
      id: "audio-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "audio",
      name: data.title, artist: data.artist, album: data.album,
      rawFilename: data.rawFilename,
      numbers: data.numbers,
      colors,
      albumArt: data.albumArt,
      numerology: numerologyOf((data.title || "") + " " + (data.artist || "")),
    };
    setNodes((n) => [...n, node]);
    setLoading(null);
  };

  const addImageNode = async (file) => {
    if (!file.type.startsWith("image/")) {
      setWarning("That doesn't appear to be an image file.");
      return;
    }
    if (file.size > LIMITS.IMAGE_MAX_BYTES) {
      setWarning(`Image is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${LIMITS.IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setLoading("Extracting EXIF and dominant colors…");
    const data = await analyzeImage(file);

    const node = {
      id: "image-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "image",
      name: file.name,
      dataUrl: data.dataUrl,
      camera: data.camera,
      colors: data.colors,
      gps: data.gps,
      photoDate: data.parsedDate,
      numbers: data.numbers,
      numerology: data.colorNumerology || numerologyOf(file.name),
    };
    setNodes((n) => [...n, node]);

    // If GPS present, also add a hidden location facet via reverse geocode
    if (data.gps) {
      const loc = await reverseGeocode(data.gps.lat, data.gps.lng);
      if (loc) {
        const subNode = await buildLocationNode({ ...loc, name: `📷 ${loc.name}` });
        setNodes((n) => [...n, subNode]);
      }
    }
    setLoading(null);
  };

  const addDateNode = (preset = null) => {
    const iso = preset ? preset.iso : dateInput;
    const labelRaw = preset ? preset.label : dateLabel.trim();
    const d = parseDate(iso);
    if (!d) return;
    const label = labelRaw || "date";
    const numbers = dateFacts(d, label);

    const inRange = isInRange(d);
    const node = {
      id: "date-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "date", name: `${label}: ${iso}`,
      zodiac: inRange ? zodiacOf(d) : null,
      dayOfWeek: inRange ? dayOfWeek(d) : null,
      moonPhase: inRange ? moonPhase(d) : null,
      numbers,
      numerology: numerologyOf(label + " " + iso.replace(/-/g, "")),
    };
    if (!inRange) {
      setWarning(`Date outside ${LIMITS.DATE_MIN_YEAR}–${LIMITS.DATE_MAX_YEAR}. The historical record is incomplete for this period.`);
    }
    setNodes((n) => [...n, node]);
    if (!preset) { setDateInput(""); setDateLabel(""); }
  };

  const buildLocationNode = async (loc) => {
    const wiki = await lookupName(loc.name.split(",")[0]);
    const wikiFacts = wiki ? extractFactsFromExtract(wiki.extract) : {};
    const facts = { ...locationFacts(loc), ...wikiFacts };

    // Wikidata gives us reliable structured population/area/elevation/founding
    // date for places where prose extraction often misses or mis-parses.
    let wikidata = null;
    if (wiki?.wikidataId) {
      wikidata = await fetchWikidataFacts(wiki.wikidataId);
      if (wikidata) Object.assign(facts, wikidata.facts);
    }

    return {
      id: "loc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      type: "location",
      name: loc.name, fullName: loc.fullName,
      lat: loc.lat, lng: loc.lng, placeType: loc.type,
      summary: wiki?.extract?.slice(0, 220) || null,
      rawExtract: wiki?.extract || null,
      description: wiki?.description || null,
      wikidataId: wiki?.wikidataId || null,
      instanceOf: wikidata?.instanceOf || null,
      numbers: facts,
      numerology: numerologyOf(loc.name),
    };
  };

  const addLocationFromSearch = async (presetName = null) => {
    const q = (presetName || locationInput).trim();
    if (!q) return;
    setLoading("Geocoding location…");
    const loc = await geocode(q);
    if (!loc) { setLoading(null); setWarning("Location not found."); return; }
    setLoading("Cross-referencing with archives…");
    const node = await buildLocationNode(loc);
    setNodes((n) => [...n, node]);
    if (!presetName) setLocationInput("");
    setLoading(null);
  };

  const addLocationFromMapClick = async (lat, lng) => {
    setLoading("Reverse geocoding pin…");
    const loc = await reverseGeocode(lat, lng);
    if (!loc) { setLoading(null); return; }
    const node = await buildLocationNode(loc);
    setNodes((n) => [...n, node]);
    setLoading(null);
  };

  const addUrlNode = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (url.length > LIMITS.URL_MAX_CHARS) {
      setWarning("URL too long.");
      return;
    }
    const parsed = analyzeUrl(url);
    if (!parsed) { setWarning("That URL is not valid."); return; }

    setLoading("Attempting to fetch URL contents…");
    const text = await fetchUrlContent(url);
    setLoading(null);

    const baseNode = {
      id: "url-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "url", name: parsed.domain,
      url: parsed.url, domain: parsed.domain, path: parsed.path,
      numbers: parsed.numbers,
      // Full URL drives numerology — captures path letters too, not just domain.
      numerology: numerologyOf(parsed.url),
    };
    if (text) {
      const tokens = tokenize(text);
      baseNode.rawText = text;
      baseNode.tokens = [...new Set(tokens.filter((t) => t.length > 4))].slice(0, 50);
      baseNode.letterFreq = letterFrequency(text);
      baseNode.numbers["page char count"] = text.length;
      baseNode.numbers["page word count"] = tokens.length;
      baseNode.fetched = true;
    } else {
      baseNode.fetched = false;
    }

    setNodes((n) => [...n, baseNode]);
    setUrlInput("");
  };

  const addBookNode = async (presetTitle = null) => {
    const q = (presetTitle || bookInput).trim();
    if (!q) return;
    setLoading("Querying Open Library…");
    const book = await lookupBook(q);
    setLoading(null);
    if (!book) { setWarning("Book not found in Open Library."); return; }

    const numbers = {};
    if (book.firstPublished) numbers["first published"] = book.firstPublished;
    if (book.pageCount) numbers["page count"] = book.pageCount;
    if (book.editionCount) numbers["edition count"] = book.editionCount;

    // Open Library's search is fuzzy and may resolve "Mistborn" to "The Final
    // Empire" (the first book of the series). Track the original query so the
    // user can see when their search was substituted.
    const wasSubstituted =
      q.toLowerCase().trim() !== book.title.toLowerCase().trim();

    const node = {
      id: "book-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      type: "book", name: book.title, author: book.author,
      coverUrl: book.coverId ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg` : null,
      queriedAs: wasSubstituted ? q : null,
      numbers,
      numerology: numerologyOf(book.title + " " + book.author),
    };
    setNodes((n) => [...n, node]);
    if (!presetTitle) setBookInput("");
  };

  const removeNode = (id) => setNodes((n) => n.filter((x) => x.id !== id));

  const clearAll = () => {
    if (nodes.length === 0) return;
    if (window.confirm("Clear all evidence from the case file?")) {
      setNodes([]);
      setWarning(null);
    }
  };

  // ---- Demo and randomize ----

  const runDemo = async () => {
    setNodes([]);
    setLoading("Loading sample investigation…");
    for (const name of DEMO_SET.names) await addNameNode(name);
    for (const text of DEMO_SET.texts) addTextNode(text);
    for (const date of DEMO_SET.dates) addDateNode(date);
    for (const loc of DEMO_SET.locations) await addLocationFromSearch(loc);
    setLoading(null);
  };

  const runRandomize = async () => {
    setNodes([]);
    setLoading("The investigator selects items at random…");
    await addNameNode(randomItem(RANDOM_POOLS.names));
    addTextNode(randomItem(RANDOM_POOLS.texts));
    addDateNode(randomItem(RANDOM_POOLS.dates));
    await addLocationFromSearch(randomItem(RANDOM_POOLS.locations));
    await addLocationFromSearch(randomItem(RANDOM_POOLS.locations));
    await addBookNode(randomItem(RANDOM_POOLS.books));
    setLoading(null);
  };

  const shareState = async () => {
    const slim = effectiveNodes.map((n) => ({ type: n.type, name: n.name, numbers: n.numbers }));
    const json = JSON.stringify(slim);
    try {
      await navigator.clipboard.writeText(json);
      alert("Investigation state copied to clipboard.");
    } catch (e) {
      alert("Could not copy. Here it is:\n\n" + json);
    }
  };

  const downloadDossier = () => {
    const blob = new Blob([dossierText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recognizer-case-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // === RENDER ==============================================================

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1410",
      backgroundImage: "radial-gradient(ellipse at top, #2a1f17 0%, #1a1410 70%)",
      color: "#e8dcc4",
      fontFamily: "'Courier New', Courier, monospace",
      padding: "32px 20px",
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ marginBottom: 24, borderBottom: "2px double #aa8855", paddingBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 44, margin: 0, letterSpacing: "0.15em", fontWeight: 700, color: "#f4e4c1", textShadow: "2px 2px 0 #aa1e1e" }}>
              RECOGNIZER
            </h1>
            <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.2em" }}>
              CASE FILE · {new Date().toISOString().slice(0, 10)}
            </span>
          </div>
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8, fontStyle: "italic", maxWidth: 700 }}>
            Submit evidence. Cross-reference everything. Coincidence? <span style={{ color: "#d6a85f" }}>We'll let you decide.</span>
          </p>
        </header>

        {/* Today banner */}
        {!todayPromoted && (
          <TodayObservation
            todayNode={todayNode}
            onPromote={promoteToday}
            onReroll={rerollToday}
            rerollKey={todaySeed}
            includeNumerology={settings.enableNumerology}
            hints={todayHints}
          />
        )}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18, marginBottom: 18 }}>
          <button onClick={runDemo} style={buttonStyle}>▣ RUN SAMPLE INVESTIGATION</button>
          <button onClick={runRandomize} style={buttonStyle}>🎲 RANDOMIZE EVIDENCE</button>
          {nodes.length > 0 && <button onClick={clearAll} style={tabStyle}>✕ CLEAR ALL</button>}
        </div>

        {/* Inputs grouped */}
        <PanelGroup title="SUBJECTS & TEXT" defaultOpen={true}>
          <div style={panelStyle}>
            <label style={labelStyle}>SUBJECT NAME</label>
            <input type="text" value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Nikola Tesla"
              onKeyDown={(e) => e.key === "Enter" && addNameNode()}
              style={inputStyle} />
            <button onClick={() => addNameNode()} style={buttonStyle}>▸ INVESTIGATE</button>
          </div>
          <div style={panelStyle}>
            <label style={labelStyle}>TEXT EVIDENCE</label>
            <textarea value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={`paste any text (max ${LIMITS.TEXT_MAX_CHARS.toLocaleString()} chars)…`}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>
              {textInput.length.toLocaleString()} / {LIMITS.TEXT_MAX_CHARS.toLocaleString()}
            </div>
            <button onClick={() => addTextNode()} style={buttonStyle}>▸ FILE EVIDENCE</button>
          </div>
          <div style={panelStyle}>
            <label style={labelStyle}>BOOK (Open Library)</label>
            <input type="text" value={bookInput}
              onChange={(e) => setBookInput(e.target.value)}
              placeholder="e.g. Foucault's Pendulum"
              onKeyDown={(e) => e.key === "Enter" && addBookNode()}
              style={inputStyle} />
            <button onClick={() => addBookNode()} style={buttonStyle}>▸ CATALOG BOOK</button>
          </div>
          <div style={panelStyle}>
            <label style={labelStyle}>URL OF INTEREST</label>
            <input type="text" value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              onKeyDown={(e) => e.key === "Enter" && addUrlNode()}
              style={inputStyle} />
            <button onClick={addUrlNode} style={buttonStyle}>▸ TRACE URL</button>
            <p style={{ fontSize: 10, opacity: 0.5, margin: "6px 0 0" }}>
              Page contents fetched if CORS allows; URL itself analyzed regardless.
            </p>
          </div>
        </PanelGroup>

        <PanelGroup title="MEDIA EXHIBITS" defaultOpen={true}>
          <div style={panelStyle}>
            <label style={labelStyle}>AUDIO EXHIBIT</label>
            <input type="file" accept="audio/*"
              onChange={(e) => e.target.files[0] && addAudioNode(e.target.files[0])}
              style={{ ...inputStyle, padding: 6, fontSize: 11 }} />
            <p style={{ fontSize: 10, opacity: 0.5, margin: "6px 0 0" }}>
              ID3 tags · duration · album art colors · max {LIMITS.AUDIO_MAX_BYTES / 1024 / 1024} MB
            </p>
          </div>
          <div style={panelStyle}>
            <label style={labelStyle}>IMAGE EXHIBIT</label>
            <input type="file" accept="image/*"
              onChange={(e) => e.target.files[0] && addImageNode(e.target.files[0])}
              style={{ ...inputStyle, padding: 6, fontSize: 11 }} />
            <p style={{ fontSize: 10, opacity: 0.5, margin: "6px 0 0" }}>
              EXIF · GPS · dominant colors · max {LIMITS.IMAGE_MAX_BYTES / 1024 / 1024} MB
            </p>
          </div>
        </PanelGroup>

        <PanelGroup title="DATES & PLACES" defaultOpen={false}>
          <div style={panelStyle}>
            <label style={labelStyle}>DATE OF RECORD</label>
            <input type="text" value={dateLabel}
              onChange={(e) => setDateLabel(e.target.value)}
              placeholder="label (e.g. birthday)"
              style={{ ...inputStyle, marginBottom: 6 }} />
            <input type="date" value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              style={inputStyle} />
            <button onClick={() => addDateNode()} style={buttonStyle}>▸ LOG DATE</button>
          </div>
          <div style={panelStyle}>
            <label style={labelStyle}>GEOGRAPHIC SITE</label>
            <input type="text" value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="e.g. Roswell, New Mexico"
              onKeyDown={(e) => e.key === "Enter" && addLocationFromSearch()}
              style={inputStyle} />
            <button onClick={() => addLocationFromSearch()} style={buttonStyle}>▸ PINPOINT</button>
            <p style={{ fontSize: 10, opacity: 0.5, margin: "6px 0 0" }}>
              or click anywhere on the geo map below
            </p>
          </div>
        </PanelGroup>

        <PanelGroup title="INVESTIGATIVE METHODS (TOGGLE)" defaultOpen={false}>
          <div style={{ ...panelStyle, gridColumn: "1 / -1" }}>
            <p style={{ fontSize: 11, opacity: 0.7, margin: "0 0 10px" }}>
              Disable categories the investigator considers unscientific. (Or, alternatively, lean into them.)
            </p>
            {[
              ["enableNumerology", "Numerology (Pythagorean digit reduction)"],
              ["enableAnagrams", "Anagram and near-anagram detection"],
              ["enableAstrology", "Astrological elemental compatibility"],
              ["enableLeyLines", "Ley-line geographic alignments"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", marginBottom: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={settings[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                  style={{ marginRight: 10, accentColor: "#aa1e1e" }} />
                {label}
              </label>
            ))}
            <div style={{ borderTop: "1px dotted #6b4a2a", marginTop: 12, paddingTop: 12 }}>
              <p style={{ fontSize: 11, opacity: 0.7, margin: "0 0 8px" }}>
                Diagnostics — for debugging extraction issues:
              </p>
              <label style={{ display: "flex", alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={settings.devMode}
                  onChange={(e) => setSettings((s) => ({ ...s, devMode: e.target.checked }))}
                  style={{ marginRight: 10, accentColor: "#aa1e1e" }} />
                Show raw API responses and regex match details on each node
              </label>
            </div>
          </div>
        </PanelGroup>

        {warning && (
          <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(170, 30, 30, 0.15)", border: "1px solid #aa1e1e", color: "#ffb84d", fontSize: 12, fontStyle: "italic" }}>
            ⚠ {warning}
          </div>
        )}
        {loading && (
          <div style={{ textAlign: "center", marginBottom: 16, color: "#d6a85f", fontSize: 12, letterSpacing: "0.15em" }}>
            ░▒▓ {loading} ▓▒░
          </div>
        )}

        {/* View toggle + actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setView("corkboard")} style={view === "corkboard" ? activeTabStyle : tabStyle}>⌥ CORKBOARD</button>
            <button onClick={() => setView("geo")} style={view === "geo" ? activeTabStyle : tabStyle}>⌥ GEO MAP</button>
            <button onClick={() => setView("table")} style={view === "table" ? activeTabStyle : tabStyle}>⌥ FACTS TABLE</button>
          </div>
          {effectiveNodes.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setShowDossier(true)} style={buttonStyle}>📄 DOSSIER</button>
              <button onClick={shareState} style={buttonStyle}>⇗ SHARE</button>
            </div>
          )}
        </div>

        {view === "corkboard" && (
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            {effectiveNodes.length > 0
              ? <ConnectionMap nodes={effectiveNodes} connections={connections} />
              : <div style={emptyState}>▣ NO EVIDENCE SUBMITTED ▣<br />
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Try the sample investigation, or randomize, or submit your own.</span>
                </div>
            }
          </div>
        )}

        {view === "geo" && (
          <div style={{ marginBottom: 24 }}>
            <GeoMap locationNodes={locationNodes} onPick={addLocationFromMapClick} />
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
              Click any point on the map to drop a pin. The investigator will determine what is there.
            </p>
          </div>
        )}

        {view === "table" && effectiveNodes.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={sectionHeader}>EVIDENCE INVENTORY</h3>
            {effectiveNodes.map((node) => (
              <div key={node.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ background: "#aa1e1e", color: "#fff", padding: "2px 8px", fontSize: 10, letterSpacing: "0.15em", marginRight: 10 }}>
                      {node.type.toUpperCase()}
                    </span>
                    <strong style={{ fontSize: 16 }}>{node.name}</strong>
                    {node.artist && <span style={{ opacity: 0.7, fontSize: 12 }}> — {node.artist}</span>}
                    {node.author && <span style={{ opacity: 0.7, fontSize: 12 }}> — {node.author}</span>}
                    {node.queriedAs && (
                      <span style={{ opacity: 0.6, fontSize: 11, fontStyle: "italic", marginLeft: 6 }}>
                        (queried as: "{node.queriedAs}")
                      </span>
                    )}
                    {node.instanceOf && (
                      <span style={{ opacity: 0.7, fontSize: 11, marginLeft: 6, padding: "1px 6px", border: "1px solid #6b4a2a", borderRadius: 2 }}>
                        {node.instanceOf}
                      </span>
                    )}
                    {node.birthDate && <span style={{ opacity: 0.7, fontSize: 12 }}> — born {node.birthDate}</span>}
                    {node.zodiac && <span style={{ opacity: 0.7, fontSize: 12 }}> — {node.zodiac}, {node.dayOfWeek}, {node.moonPhase}</span>}
                    {node.lat !== undefined && (
                      <span style={{ opacity: 0.7, fontSize: 12 }}> — {node.lat.toFixed(3)}, {node.lng.toFixed(3)}</span>
                    )}
                    {node.url && <span style={{ opacity: 0.7, fontSize: 12 }}> — {node.fetched ? "fetched" : "not fetched"}</span>}
                  </div>
                  {node.id !== "today" && (
                    <button onClick={() => removeNode(node.id)} style={{ ...buttonStyle, padding: "2px 8px", fontSize: 10 }}>✕</button>
                  )}
                </div>
                {node.summary && <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>{node.summary}</p>}
                {settings.devMode && node.rawExtract && (
                  <div style={{
                    marginTop: 10, padding: "10px 12px",
                    background: "rgba(0,0,0,0.35)",
                    border: "1px dashed #6b4a2a",
                    fontSize: 11, fontFamily: "monospace",
                  }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#d6a85f", marginBottom: 6 }}>
                      ░ DEV: RAW WIKIPEDIA EXTRACT ░
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", opacity: 0.85, marginBottom: 10, lineHeight: 1.5 }}>
                      {node.rawExtract}
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#d6a85f", marginBottom: 6 }}>
                      ░ DEV: REGEX MATCH REPORT ░
                    </div>
                    <table style={{ width: "100%", fontSize: 10 }}>
                      <tbody>
                        {diagnoseExtract(node.rawExtract).map((row, i) => (
                          <tr key={i}>
                            <td style={{ padding: "2px 8px 2px 0", opacity: 0.7, verticalAlign: "top" }}>{row.label}</td>
                            <td style={{
                              padding: "2px 0",
                              color: row.matched ? "#7fcf7f" : "#cf7f7f",
                              wordBreak: "break-word",
                            }}>
                              {row.matched || "(no match)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {node.dataUrl && (
                  <img src={node.dataUrl} alt="" style={{ maxWidth: 120, maxHeight: 80, marginTop: 8, border: "1px solid #6b4a2a" }} />
                )}
                {node.coverUrl && (
                  <img src={node.coverUrl} alt="" style={{ maxWidth: 80, marginTop: 8, border: "1px solid #6b4a2a" }} />
                )}
                {node.albumArt && (
                  <img src={node.albumArt} alt="" style={{ maxWidth: 80, marginTop: 8, border: "1px solid #6b4a2a" }} />
                )}
                {node.colors && node.colors.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                    {node.colors.map((c, i) => (
                      <div key={i} title={c.hex} style={{ width: 24, height: 24, background: c.hex, border: "1px solid #6b4a2a" }} />
                    ))}
                  </div>
                )}
                {node.events && node.events.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
                    <em style={{ opacity: 0.7 }}>On this day in history:</em>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {node.events.slice(0, 4).map((ev, i) => (
                        <li key={i} style={{ marginBottom: 3 }}><strong>{ev.year}:</strong> {ev.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <table style={{ width: "100%", marginTop: 10, fontSize: 12 }}>
                  <tbody>
                    {Object.entries(node.numbers || {}).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px dotted rgba(232,220,196,0.2)" }}>
                        <td style={{ padding: "3px 8px 3px 0", opacity: 0.7 }}>{k}</td>
                        <td style={{ padding: "3px 0", textAlign: "right", color: "#d6a85f", fontWeight: 700 }}>{v}</td>
                      </tr>
                    ))}
                    {settings.enableNumerology && node.numerology && (
                      <tr style={{ borderBottom: "1px dotted rgba(232,220,196,0.2)" }}>
                        <td style={{ padding: "3px 8px 3px 0", opacity: 0.7 }}>numerology (Pythagorean)</td>
                        <td style={{ padding: "3px 0", textAlign: "right", color: "#d6a85f", fontWeight: 700, fontSize: 11 }}>
                          {node.numerology.source
                            ? (node.numerology.source.length > 20
                                ? node.numerology.source.slice(0, 18).toUpperCase() + "…"
                                : node.numerology.source.toUpperCase())
                            : "?"}
                          {" → "}{node.numerology.sum}{" → "}{node.numerology.reduced}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {connections.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={sectionHeader}>↯ CROSS-REFERENCES DETECTED ({connections.length})</h3>
            {connections.map((c, i) => {
              const tone = c.strength >= 0.9 ? "#ffb84d" : c.strength >= 0.6 ? "#d6a85f" : "#a89070";
              return (
                <div key={i} style={{
                  padding: "12px 14px", marginBottom: 6,
                  background: "rgba(40, 28, 18, 0.5)",
                  borderLeft: `3px solid ${tone}`, fontSize: 13, lineHeight: 1.5,
                }}>
                  <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: "0.1em", marginBottom: 4 }}>
                    §{i + 1} · {c.kind.toUpperCase()} · MATCH STRENGTH: {strengthTier(c.strength)}
                  </div>
                  <div style={{ color: tone }}>
                    {narrateConnection(c, connections.length, i + c.strength * 10)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {connections.length === 0 && effectiveNodes.length >= 2 && (
          <div style={{ textAlign: "center", padding: 20, opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>
            No connections found yet. Add more evidence — patterns emerge with volume.
          </div>
        )}

        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px dotted #6b4a2a", fontSize: 10, opacity: 0.55, textAlign: "center", letterSpacing: "0.1em", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 6px" }}>
            RECOGNIZER v0.13 · ALL CONNECTIONS ARE PURELY COINCIDENTAL · OR ARE THEY
          </p>
          <p style={{ margin: 0, fontStyle: "italic", opacity: 0.85 }}>
            Your evidence stays in your browser. Names and place searches are sent to{" "}
            <a href="https://www.wikipedia.org" target="_blank" rel="noopener noreferrer" style={{ color: "#d6a85f" }}>Wikipedia</a> and{" "}
            <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" style={{ color: "#d6a85f" }}>OpenStreetMap</a> for lookup;
            books are queried via{" "}
            <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" style={{ color: "#d6a85f" }}>Open Library</a>.
            Map tiles served by{" "}
            <a href="https://stadiamaps.com" target="_blank" rel="noopener noreferrer" style={{ color: "#d6a85f" }}>Stadia Maps</a>.
            Recognizer itself logs and stores nothing.
          </p>
        </footer>
      </div>

      {showDossier && (
        <div onClick={() => setShowDossier(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, zIndex: 100, cursor: "pointer",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#f5efe1", color: "#2a1a0a",
            padding: "40px 50px", maxWidth: 720, width: "100%",
            maxHeight: "85vh", overflow: "auto",
            fontFamily: "'Courier New', monospace",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            border: "2px double #6b4a2a", cursor: "auto",
            backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 22px, rgba(170,30,30,0.04) 22px, rgba(170,30,30,0.04) 23px)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, gap: 10 }}>
              <strong style={{ fontSize: 11, letterSpacing: "0.2em" }}>CONFIDENTIAL — INTERNAL USE</strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={downloadDossier} style={{ ...buttonStyle, background: "#2a1a0a" }}>↓ DOWNLOAD</button>
                <button onClick={() => setShowDossier(false)} style={{ ...buttonStyle, background: "#2a1a0a" }}>✕ CLOSE</button>
              </div>
            </div>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.7, fontFamily: "inherit", margin: 0 }}>
              {dossierText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SECTION 21: STYLES
// =============================================================================

const panelStyle = { background: "rgba(40, 28, 18, 0.55)", border: "1px solid #6b4a2a", padding: 14 };
const labelStyle = { display: "block", fontSize: 10, letterSpacing: "0.2em", opacity: 0.7, marginBottom: 6 };
const inputStyle = {
  width: "100%", background: "#0f0a06", border: "1px solid #6b4a2a",
  color: "#e8dcc4", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  marginBottom: 8, boxSizing: "border-box",
};
const buttonStyle = {
  background: "#aa1e1e", color: "#f4e4c1", border: "1px solid #6b4a2a",
  padding: "6px 14px", fontSize: 11, letterSpacing: "0.15em", cursor: "pointer",
  fontFamily: "inherit", fontWeight: 700,
};
const tabStyle = {
  background: "transparent", color: "#a89070", border: "1px solid #6b4a2a",
  padding: "6px 14px", fontSize: 11, letterSpacing: "0.15em", cursor: "pointer",
  fontFamily: "inherit",
};
const activeTabStyle = { ...tabStyle, background: "#6b4a2a", color: "#f4e4c1" };
const sectionHeader = {
  fontSize: 12, letterSpacing: "0.25em", opacity: 0.85,
  borderBottom: "1px dotted #6b4a2a", paddingBottom: 6, marginBottom: 12,
};
const cardStyle = {
  background: "rgba(40, 28, 18, 0.5)", border: "1px solid #6b4a2a",
  padding: 14, marginBottom: 10,
};
const emptyState = { padding: "60px 20px", opacity: 0.5, fontSize: 13, letterSpacing: "0.1em" };
const observationStyle = {
  background: "linear-gradient(135deg, rgba(40,28,18,0.7), rgba(60,40,24,0.5))",
  border: "1px solid #aa8855", borderLeft: "4px solid #aa1e1e",
  padding: "18px 20px", marginBottom: 8, position: "relative",
  boxShadow: "inset 0 0 40px rgba(170,30,30,0.08)",
};
