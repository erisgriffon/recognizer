import { LIMITS } from "../../data/limits.js";

// Wikipedia disambiguation is hostile to media titles: "It," "The Thing,"
// "Heat," "The Office" all have famous film/TV interpretations the user
// almost certainly meant, but the bare summary endpoint will frequently
// hand back the disambiguation page or a non-media meaning. The fix is to
// hit the search endpoint first and pick a result whose description
// indicates film or television. We fall back to the first hit only if
// nothing in the page descriptions mentions film/TV — better a wrong
// summary than a hard "not found" for the user.
const looksLikeMedia = (description) => {
  const d = (description || "").toLowerCase();
  return (
    d.includes("film") ||
    d.includes("television") ||
    d.includes("tv series") ||
    d.includes("tv show") ||
    d.includes("movie") ||
    d.includes("miniseries")
  );
};

export const lookupMedia = async (query) => {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=5`
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const pages = searchData?.pages || [];
    if (pages.length === 0) return null;

    const mediaResult = pages.find((p) => looksLikeMedia(p.description)) || pages[0];

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(mediaResult.key)}`
    );
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();

    return {
      title: summary.title,
      extract: summary.extract || "",
      description: summary.description || null,
      thumbnail: summary.thumbnail?.source || null,
      wikidataId: summary.wikibase_item || null,
      queriedAs: query,
    };
  } catch (e) {
    return null;
  }
};

export const lookupBook = async (query) => {
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

export const analyzeUrl = (urlString) => {
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
  // Cleaned form for numerology: drop scheme and leading www. so URL
  // numerology reflects the user-chosen part of the URL, not protocol
  // boilerplate that's identical across every URL submitted.
  const numerologySource = domain.replace(/^www\./, "") + path;

  return {
    url: urlString,
    domain,
    path,
    tld: domain.split(".").pop(),
    numerologySource,
    numbers,
  };
};

// Best-effort fetch — succeeds on CORS-friendly sites, fails silently otherwise.
export const fetchUrlContent = async (url) => {
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
