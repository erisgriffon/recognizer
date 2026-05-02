import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lookupMedia } from "./misc.js";

// We stub global.fetch and feed it canned Wikipedia responses. The first
// call goes to /rest.php/v1/search/title (the title-search endpoint), the
// second to /api/rest_v1/page/summary (the page-summary endpoint).
const stubFetchSequence = (responses) => {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: r.ok ?? true,
      json: async () => r.body,
    };
  });
};

describe("lookupMedia", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { delete global.fetch; });

  it("returns the canonical Wikipedia summary fields when search hits a film", async () => {
    stubFetchSequence([
      { body: { pages: [{
        key: "2001:_A_Space_Odyssey_(film)",
        title: "2001: A Space Odyssey",
        description: "1968 film by Stanley Kubrick",
      }] } },
      { body: {
        title: "2001: A Space Odyssey",
        extract: "2001: A Space Odyssey is a 1968 epic science fiction film…",
        description: "1968 film by Stanley Kubrick",
        thumbnail: { source: "https://example/poster.jpg" },
        wikibase_item: "Q103474",
      } },
    ]);

    const result = await lookupMedia("2001");
    expect(result.title).toBe("2001: A Space Odyssey");
    expect(result.wikidataId).toBe("Q103474");
    expect(result.thumbnail).toBe("https://example/poster.jpg");
    expect(result.queriedAs).toBe("2001"); // preserved verbatim for substitution disclosure
  });

  it("prefers a film/TV result over an earlier non-media hit", async () => {
    // Mimics what Wikipedia returns for an ambiguous query like "It": the
    // pronoun page comes first, the Stephen King novel page next, the film
    // third. We want the film.
    stubFetchSequence([
      { body: { pages: [
        { key: "It", title: "It", description: "English-language pronoun" },
        { key: "It_(novel)", title: "It (novel)", description: "1986 novel by Stephen King" },
        { key: "It_(2017_film)", title: "It (2017 film)", description: "2017 American supernatural horror film" },
      ] } },
      { body: {
        title: "It (2017 film)",
        extract: "It is a 2017 American supernatural horror film…",
        description: "2017 American supernatural horror film",
        wikibase_item: "Q21062357",
      } },
    ]);

    const result = await lookupMedia("It");
    expect(result.title).toBe("It (2017 film)");
    // Critically, the second fetch must have used the film page's key, not the pronoun.
    expect(global.fetch.mock.calls[1][0]).toContain("It_(2017_film)");
  });

  it("recognises television descriptions, not just film", async () => {
    stubFetchSequence([
      { body: { pages: [
        { key: "Twin_Peaks_disambig", title: "Twin Peaks", description: "geographical feature" },
        { key: "Twin_Peaks", title: "Twin Peaks", description: "American mystery television series" },
      ] } },
      { body: {
        title: "Twin Peaks",
        extract: "Twin Peaks is an American mystery serial drama television series…",
        description: "American mystery television series",
        wikibase_item: "Q156255",
      } },
    ]);

    const result = await lookupMedia("Twin Peaks");
    expect(result.title).toBe("Twin Peaks");
    expect(global.fetch.mock.calls[1][0]).toContain("Twin_Peaks");
    expect(global.fetch.mock.calls[1][0]).not.toContain("disambig");
  });

  it("falls back to the first result when nothing looks like media", async () => {
    stubFetchSequence([
      { body: { pages: [
        { key: "Obscurity", title: "Obscurity", description: "philosophical concept" },
      ] } },
      { body: {
        title: "Obscurity",
        extract: "Obscurity is the state of being…",
        wikibase_item: null,
      } },
    ]);

    const result = await lookupMedia("Obscurity");
    expect(result.title).toBe("Obscurity"); // we still return something
  });

  it("returns null when search yields zero pages", async () => {
    stubFetchSequence([{ body: { pages: [] } }]);
    const result = await lookupMedia("zxqwx-no-such-thing");
    expect(result).toBeNull();
  });

  it("returns null when the summary fetch fails after a search hit", async () => {
    stubFetchSequence([
      { body: { pages: [{ key: "X", title: "X", description: "1986 film" }] } },
      { ok: false, body: {} },
    ]);
    const result = await lookupMedia("X");
    expect(result).toBeNull();
  });

  it("returns null and never throws when the network errors", async () => {
    global.fetch = vi.fn(async () => { throw new Error("offline"); });
    const result = await lookupMedia("anything");
    expect(result).toBeNull();
  });
});
