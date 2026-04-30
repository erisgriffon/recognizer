import { stripDiacritics, tokenize } from "../utils.js";

export const findCapitalizedNames = (text) => {
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

export const findRepeatedPhrases = (text) => {
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

export const wordFrequency = (text) => {
  const tokens = tokenize(text);
  const freq = {};
  tokens.forEach((t) => { freq[t] = (freq[t] || 0) + 1; });
  return freq;
};

// Letter frequency as percentages, 0–100. Used for stylometric overlap.
export const letterFrequency = (text) => {
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
