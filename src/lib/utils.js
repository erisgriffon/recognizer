export const stripDiacritics = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const tokenize = (text) =>
  stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export const pick = (arr, seed) => arr[Math.floor(Math.abs(seed)) % arr.length];

export const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const written = (n) => {
  const w = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  if (n < w.length) return `${w[n]} (${n})`;
  return `${n}`;
};

export const sample = (arr, n, seed = 0) => {
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
