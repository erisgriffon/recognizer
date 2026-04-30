import exifr from "exifr";
import { pythagoreanNumerologyOf, chaldeanNumerologyOf } from "../numerology.js";

// Quantize image into ~5 dominant colors using a downsampled bucket approach.
// Returns array of { rgb: [r,g,b], hex: '#rrggbb', count }.
export const extractDominantColors = (imageDataUrl, k = 5) =>
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

export const colorDistance = (c1, c2) => {
  // Simple Euclidean RGB distance — fine for our purposes
  const [r1, g1, b1] = c1, [r2, g2, b2] = c2;
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};

export const fileToDataURL = (file) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

export const analyzeImage = async (file) => {
  const dataUrl = await fileToDataURL(file);

  let exif = {};
  try {
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
  const colorHexConcat = colors.length > 0 ? colors.map((c) => c.hex.replace("#", "")).join("") : null;
  const colorNumerology = colorHexConcat
    ? {
        pythagorean: pythagoreanNumerologyOf(colorHexConcat),
        chaldean: chaldeanNumerologyOf(colorHexConcat),
        deepReduced: null,
      }
    : null;

  return {
    dataUrl, exif, colors, numbers,
    parsedDate,
    gps: (exif.latitude !== undefined && exif.longitude !== undefined)
      ? { lat: exif.latitude, lng: exif.longitude } : null,
    camera: [exif.Make, exif.Model].filter(Boolean).join(" ") || null,
    colorNumerology,
  };
};
