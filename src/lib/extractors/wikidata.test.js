import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lookupWikidataByUrl } from "./wikidata.js";

const stubFetchResponse = (body, ok = true) => {
  global.fetch = vi.fn(async () => ({
    ok,
    json: async () => body,
  }));
};

describe("lookupWikidataByUrl", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { delete global.fetch; });

  it("returns null without calling fetch when url is null", async () => {
    stubFetchResponse({});
    const result = await lookupWikidataByUrl(null);
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when URL constructor throws (not-a-url)", async () => {
    stubFetchResponse({});
    const result = await lookupWikidataByUrl("not-a-url");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns the Q-number string on a happy path", async () => {
    stubFetchResponse({
      results: {
        bindings: [
          { item: { value: "http://www.wikidata.org/entity/Q478214" } }
        ]
      }
    });
    const result = await lookupWikidataByUrl("https://example.com");
    expect(result).toBe("Q478214");
  });

  it("returns null on a no-results path", async () => {
    stubFetchResponse({ results: { bindings: [] } });
    const result = await lookupWikidataByUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when the network response is not OK", async () => {
    stubFetchResponse({}, false);
    const result = await lookupWikidataByUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null and never throws when fetch throws", async () => {
    global.fetch = vi.fn(async () => { throw new Error("offline"); });
    const result = await lookupWikidataByUrl("https://example.com");
    expect(result).toBeNull();
  });

  it("sends a SPARQL query structure containing the P856 property and URL variants", async () => {
    stubFetchResponse({ results: { bindings: [] } });
    await lookupWikidataByUrl("https://tesla.com");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestUrl = global.fetch.mock.calls[0][0];
    
    // The query should contain the property wdt:P856
    expect(requestUrl).toContain(encodeURIComponent("wdt:P856"));
    
    // The query should contain at least one of the variants in the FILTER clause
    expect(requestUrl).toContain(encodeURIComponent("<https://tesla.com>"));
  });
});
