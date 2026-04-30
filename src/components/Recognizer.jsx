import { useState, useEffect, useMemo } from "react";

import { LIMITS } from "../data/limits.js";
import { DEMO_SET, RANDOM_POOLS, randomItem } from "../data/pools.js";

import { tokenize, sample } from "../lib/utils.js";
import { pythagoreanNumerologyOf, chaldeanNumerologyOf } from "../lib/numerology.js";
import { parseDate, isInRange, zodiacOf, dayOfWeek, moonPhase, dateFacts } from "../lib/dates.js";
import { geocode, reverseGeocode, locationFacts } from "../lib/geo.js";

import { findCapitalizedNames, findRepeatedPhrases, wordFrequency, letterFrequency } from "../lib/extractors/text.js";
import { lookupName, extractFactsFromExtract, diagnoseExtract, fetchOnThisDay } from "../lib/extractors/wikipedia.js";
import { fetchWikidataFacts } from "../lib/extractors/wikidata.js";
import { buildTodayNode } from "../lib/extractors/today.js";
import { analyzeAudio } from "../lib/extractors/audio.js";
import { analyzeImage, extractDominantColors } from "../lib/extractors/image.js";
import { analyzeUrl, fetchUrlContent, lookupBook } from "../lib/extractors/misc.js";

import { findConnections, strengthTier, sortConnectionsByStrength, filterByStrengthFloor } from "../lib/connections.js";
import { TIERS } from "../lib/connections.config.js";
import { narrateConnection } from "../lib/narrative/connection.js";
import { generateDossier } from "../lib/narrative/dossier.js";

import PanelGroup from "./PanelGroup.jsx";
import ConnectionMap from "./ConnectionMap.jsx";
import GeoMap from "./GeoMap.jsx";
import TodayObservation from "./TodayObservation.jsx";

import {
  panelStyle, labelStyle, inputStyle, buttonStyle,
  tabStyle, activeTabStyle, sectionHeader, cardStyle, emptyState,
} from "../styles.js";

export default function Recognizer() {
  const [nodes, setNodes] = useState([]);
  const [view, setView] = useState("corkboard");
  const [strengthFloor, setStrengthFloor] = useState(0);

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

  // Settings — soft connection toggles + dev tools.
  // numerologyDepth: 0 = Off, 1 = Surface (Pythagorean), 2 = Standard (+ Chaldean),
  // 3 = Deep (also reduces every numeric fact). Default 1 = today's behavior.
  const [settings, setSettings] = useState({
    numerologyDepth: 1,
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
    () => sortConnectionsByStrength(findConnections(effectiveNodes, settings)),
    [effectiveNodes, settings]
  );

  // visibleConnections is the in-app display subset. The dossier always uses
  // the full `connections` array — the filter is a viewing convenience, the
  // dossier is a complete record.
  const visibleConnections = useMemo(
    () => filterByStrengthFloor(connections, strengthFloor),
    [connections, strengthFloor]
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
        const birth = wikidata.dates["birth"];
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(displayName),
        chaldean: chaldeanNumerologyOf(displayName),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(displayName),
        chaldean: chaldeanNumerologyOf(displayName),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf((data.title || "") + " " + (data.artist || "")),
        chaldean: chaldeanNumerologyOf((data.title || "") + " " + (data.artist || "")),
        deepReduced: null,
      },
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
      numerology: data.colorNumerology || {
        pythagorean: pythagoreanNumerologyOf(file.name),
        chaldean: chaldeanNumerologyOf(file.name),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(label + " " + iso.replace(/-/g, "")),
        chaldean: chaldeanNumerologyOf(label + " " + iso.replace(/-/g, "")),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(loc.name),
        chaldean: chaldeanNumerologyOf(loc.name),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(parsed.url),
        chaldean: chaldeanNumerologyOf(parsed.url),
        deepReduced: null,
      },
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
      numerology: {
        pythagorean: pythagoreanNumerologyOf(book.title + " " + book.author),
        chaldean: chaldeanNumerologyOf(book.title + " " + book.author),
        deepReduced: null,
      },
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
            includeNumerology={settings.numerologyDepth >= 1}
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
            <label style={{ display: "flex", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
              <span style={{ marginRight: 10, minWidth: 200 }}>Numerology depth:</span>
              <select
                value={settings.numerologyDepth}
                onChange={(e) => setSettings((s) => ({ ...s, numerologyDepth: parseInt(e.target.value, 10) }))}
                style={{
                  background: "#0f0a06", border: "1px solid #6b4a2a",
                  color: "#e8dcc4", padding: "4px 8px", fontSize: 12,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <option value={0}>Off</option>
                <option value={1}>Surface (Pythagorean only)</option>
                <option value={2}>Standard (+ Chaldean)</option>
                <option value={3}>Deep (also reduces every numeric fact)</option>
              </select>
            </label>
            {[
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
                    {settings.numerologyDepth >= 1 && node.numerology?.pythagorean && (
                      <tr style={{ borderBottom: "1px dotted rgba(232,220,196,0.2)" }}>
                        <td style={{ padding: "3px 8px 3px 0", opacity: 0.7 }}>numerology (Pythagorean)</td>
                        <td style={{ padding: "3px 0", textAlign: "right", color: "#d6a85f", fontWeight: 700, fontSize: 11 }}>
                          {node.numerology.pythagorean.source
                            ? (node.numerology.pythagorean.source.length > 20
                                ? node.numerology.pythagorean.source.slice(0, 18).toUpperCase() + "…"
                                : node.numerology.pythagorean.source.toUpperCase())
                            : "?"}
                          {" → "}{node.numerology.pythagorean.sum}{" → "}{node.numerology.pythagorean.reduced}
                        </td>
                      </tr>
                    )}
                    {settings.numerologyDepth >= 2 && node.numerology?.chaldean && (
                      <tr style={{ borderBottom: "1px dotted rgba(232,220,196,0.2)" }}>
                        <td style={{ padding: "3px 8px 3px 0", opacity: 0.7 }}>numerology (Chaldean)</td>
                        <td style={{ padding: "3px 0", textAlign: "right", color: "#d6a85f", fontWeight: 700, fontSize: 11 }}>
                          {node.numerology.chaldean.source
                            ? (node.numerology.chaldean.source.length > 20
                                ? node.numerology.chaldean.source.slice(0, 18).toUpperCase() + "…"
                                : node.numerology.chaldean.source.toUpperCase())
                            : "?"}
                          {" → "}{node.numerology.chaldean.sum}{" → "}{node.numerology.chaldean.reduced}
                        </td>
                      </tr>
                    )}
                    {settings.numerologyDepth >= 3 && node.numbers && Object.keys(node.numbers).length > 0 && (
                      <tr style={{ borderBottom: "1px dotted rgba(232,220,196,0.2)" }}>
                        <td style={{ padding: "3px 8px 3px 0", opacity: 0.7 }}>deep-reduced facts</td>
                        <td style={{ padding: "3px 0", textAlign: "right", color: "#d6a85f", fontWeight: 700, fontSize: 11 }}>
                          {Object.entries(node.numbers)
                            .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
                            .map(([k, v]) => {
                              let r = Math.floor(v);
                              while (r > 9) r = String(r).split("").reduce((s, d) => s + parseInt(d, 10), 0);
                              return `${k}→${r}`;
                            })
                            .join(", ") || "(none)"}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <h3 style={{ ...sectionHeader, marginBottom: 0 }}>
                ↯ CROSS-REFERENCES DETECTED (
                {visibleConnections.length !== connections.length
                  ? `${visibleConnections.length} of ${connections.length}`
                  : connections.length}
                )
              </h3>
              <select
                value={strengthFloor}
                onChange={(e) => setStrengthFloor(parseFloat(e.target.value))}
                style={{
                  background: "#0f0a06", border: "1px solid #6b4a2a",
                  color: "#e8dcc4", padding: "4px 8px", fontSize: 11,
                  fontFamily: "inherit", letterSpacing: "0.1em", cursor: "pointer",
                }}
              >
                {TIERS.slice().reverse().map((tier, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const isBottom = tier.min === 0;
                  const label = isBottom
                    ? "Show all"
                    : isTop
                      ? `${tier.name[0] + tier.name.slice(1).toLowerCase()} only`
                      : `${tier.name[0] + tier.name.slice(1).toLowerCase()} and above`;
                  return <option key={tier.name} value={tier.min}>{label}</option>;
                })}
              </select>
            </div>
            {visibleConnections.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>
                No findings at this strength level. Try lowering the floor.
              </div>
            ) : (
              visibleConnections.map((c, i) => {
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
                      {narrateConnection(c, visibleConnections.length, i + c.strength * 10)}
                    </div>
                  </div>
                );
              })
            )}
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
