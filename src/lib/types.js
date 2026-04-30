// JSDoc typedefs documenting the data model. No runtime exports — this file
// exists so the rest of the codebase can `@type` against a single source of
// truth for the node and connection shapes.

/**
 * @typedef {("name"|"text"|"audio"|"image"|"url"|"book"|"date"|"location"|"today")} NodeType
 */

/**
 * @typedef {Object} Numerology
 * @property {number} sum     - digital sum before reduction.
 * @property {number} reduced - reduced single-digit (or master) value.
 * @property {string} source  - human-readable derivation string, shown in CAPS in prose.
 */

/**
 * @typedef {Object} Node
 * @property {string} id                                - unique, type-prefixed (e.g. "name-...", "loc-...").
 * @property {NodeType} type
 * @property {string} name                              - display name.
 * @property {Object<string, number>} numbers           - human-labeled numeric facts (the connection-engine fuel).
 * @property {Numerology|null} [numerology]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string} [dataUrl]                         - for images.
 * @property {string} [rawText]                         - for text nodes.
 * @property {Array<{title: string, year: number, text: string}>} [events] - for the "today" node.
 * @property {Array<{r: number, g: number, b: number}>} [colors]           - for image nodes.
 * @property {string} [wikidataId]                      - Q-number cached from a Wikipedia summary lookup.
 * @property {Object} [extras]                          - extractor-specific raw response, kept for dev mode display.
 */

/**
 * @typedef {Object} Connection
 * @property {string} from        - id of the source node.
 * @property {string} to          - id of the target node.
 * @property {string} kind        - kind discriminator used by the narrative templates ("number-exact", "anagram", "ley", etc.).
 * @property {number} strength    - 0..1, drives the SUSPICIOUS / STRIKING / NOTABLE / TRIVIAL tier mapping.
 * @property {Object} [details]   - kind-specific payload consumed by the rephrasers.
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} numerology
 * @property {boolean} anagram
 * @property {boolean} astrology
 * @property {boolean} leyLine
 * @property {boolean} dev        - dev-mode toggle: when true, nodes render their raw API responses inline.
 * @property {boolean} todayHints - whether the today banner shows hypothetical-connection nudges before promotion.
 */

export {};
