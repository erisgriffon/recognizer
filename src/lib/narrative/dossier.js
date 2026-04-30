import { pick, written } from "../utils.js";
import { narrateConnection } from "./connection.js";

export const generateDossier = (nodes, connections) => {
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
