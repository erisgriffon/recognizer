import { describe, it, expect } from "vitest";
import { serializeNode, serializeCaseFile, pruneSettings } from "./serialize.js";

describe("serializeNode — per-type round trips", () => {
  it("serializes a name node to { t: 'name', v }", () => {
    expect(serializeNode({ type: "name", name: "Nikola Tesla" }))
      .toEqual({ t: "name", v: "Nikola Tesla" });
  });

  it("serializes a text node from rawText, not the truncated display name", () => {
    expect(serializeNode({ type: "text", name: "Call me", rawText: "Call me Ishmael." }))
      .toEqual({ t: "text", v: "Call me Ishmael." });
  });

  it("splits a date node's 'label: iso' name back into label and iso", () => {
    expect(serializeNode({ type: "date", name: "moon landing: 1969-07-20" }))
      .toEqual({ t: "date", v: "1969-07-20", l: "moon landing" });
  });

  it("serializes a location node by display name (the geocoder query)", () => {
    expect(serializeNode({ type: "location", name: "Roswell, New Mexico" }))
      .toEqual({ t: "location", v: "Roswell, New Mexico" });
  });

  it("serializes a url node from node.url, not node.name (which is the domain)", () => {
    expect(serializeNode({ type: "url", name: "example.com", url: "https://example.com/article" }))
      .toEqual({ t: "url", v: "https://example.com/article" });
  });

  it("serializes a book node using queriedAs when Open Library substituted a fuzzy match", () => {
    expect(serializeNode({ type: "book", name: "The Final Empire", queriedAs: "Mistborn" }))
      .toEqual({ t: "book", v: "Mistborn" });
  });

  it("serializes a book node by name when no substitution happened", () => {
    expect(serializeNode({ type: "book", name: "Foucault's Pendulum", queriedAs: null }))
      .toEqual({ t: "book", v: "Foucault's Pendulum" });
  });

  it("serializes a media node using queriedAs when Wikipedia substituted a different match", () => {
    expect(serializeNode({ type: "media", name: "It (2017 film)", queriedAs: "It" }))
      .toEqual({ t: "media", v: "It" });
  });

  it("serializes a media node by name when no substitution happened", () => {
    expect(serializeNode({ type: "media", name: "2001: A Space Odyssey", queriedAs: null }))
      .toEqual({ t: "media", v: "2001: A Space Odyssey" });
  });

  it("serializes today as a bare marker — recipient rebuilds from their own date", () => {
    expect(serializeNode({ type: "today", name: "today" }))
      .toEqual({ t: "today" });
  });

  it("serializes media nodes as placeholders with filename preserved", () => {
    expect(serializeNode({ type: "image", name: "11429.jpg" }))
      .toEqual({ t: "image", v: { name: "11429.jpg", placeholder: true } });
    expect(serializeNode({ type: "audio", name: "song.mp3" }))
      .toEqual({ t: "audio", v: { name: "song.mp3", placeholder: true } });
  });

  it("returns null for unknown node types so they get filtered out", () => {
    expect(serializeNode({ type: "fictional", name: "x" })).toBe(null);
  });
});

describe("pruneSettings", () => {
  it("returns an empty object when every setting is at its default", () => {
    expect(pruneSettings({
      numerologyDepth: 1,
      lexicalDepth: 1,
      astrologyDepth: 1,
      geographicDepth: 1,
      devMode: false,
    })).toEqual({});
  });

  it("includes only keys that differ from the default", () => {
    expect(pruneSettings({
      numerologyDepth: 3,
      lexicalDepth: 1,
      astrologyDepth: 0,
      geographicDepth: 1,
      devMode: false,
    })).toEqual({ numerologyDepth: 3, astrologyDepth: 0 });
  });

  it("tolerates missing or undefined input", () => {
    expect(pruneSettings(undefined)).toEqual({});
    expect(pruneSettings({})).toEqual({});
  });
});

describe("serializeCaseFile", () => {
  it("emits version 1 and an ISO creation date", () => {
    const out = serializeCaseFile([], {});
    expect(out.v).toBe(1);
    expect(out.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("omits the s key entirely when settings are all defaults", () => {
    const out = serializeCaseFile([{ type: "name", name: "Tesla" }], {
      numerologyDepth: 1,
      lexicalDepth: 1,
      astrologyDepth: 1,
      geographicDepth: 1,
      devMode: false,
    });
    expect(out).not.toHaveProperty("s");
  });

  it("includes only changed settings under s", () => {
    const out = serializeCaseFile([], { numerologyDepth: 2, lexicalDepth: 1 });
    expect(out.s).toEqual({ numerologyDepth: 2 });
  });

  it("filters out unknown node types from the n array", () => {
    const out = serializeCaseFile([
      { type: "name", name: "Tesla" },
      { type: "made-up", name: "x" },
      { type: "today", name: "today" },
    ], {});
    expect(out.n).toEqual([
      { t: "name", v: "Tesla" },
      { t: "today" },
    ]);
  });
});
