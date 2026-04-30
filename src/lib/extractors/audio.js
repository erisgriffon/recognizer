import jsmediatags from "jsmediatags";

export const analyzeAudio = async (file) => {
  const filename = file.name;
  const sizeKB = Math.round(file.size / 1024);

  const duration = await new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(Math.round(audio.duration));
    audio.onerror = () => resolve(0);
    audio.src = URL.createObjectURL(file);
  });

  let tags = {};
  try {
    tags = await new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: (t) => resolve(t.tags || {}),
        onError: () => resolve({}),
      });
    });
  } catch (e) { tags = {}; }

  const numbers = {
    "duration (sec)": duration,
    "filename chars": filename.length,
    "size (KB)": sizeKB,
  };
  if (tags.year) numbers["track year"] = parseInt(tags.year, 10);
  if (tags.track) {
    const t = parseInt(String(tags.track).split("/")[0], 10);
    if (Number.isFinite(t)) numbers["track number"] = t;
  }

  // Extract album art if present, return as data URL for color sampling
  let albumArt = null;
  if (tags.picture) {
    const { data, format } = tags.picture;
    const b64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    albumArt = `data:${format};base64,${b64}`;
  }

  return {
    filename,
    title: tags.title || filename,
    artist: tags.artist || "Unknown",
    album: tags.album || null,
    year: tags.year || null,
    numbers,
    rawFilename: filename,
    albumArt,
  };
};
