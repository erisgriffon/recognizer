export const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
};

// Are three points collinear within a tolerance? Uses normalized cross-product
// magnitude as the deviation metric. Tolerance is in degrees (lat/lon).
export const isLeyLine = (p1, p2, p3, tolDeg = 0.5) => {
  // Cross product of (p2-p1) × (p3-p1) — magnitude tells us deviation
  const v1 = { x: p2.lat - p1.lat, y: p2.lng - p1.lng };
  const v2 = { x: p3.lat - p1.lat, y: p3.lng - p1.lng };
  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x);
  // Length of v1 normalizes the cross product to perpendicular distance
  const v1mag = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  if (v1mag < 0.01) return false; // points too close
  return (cross / v1mag) < tolDeg;
};

export const geocode = async (query) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const r = data[0];
    return {
      name: r.display_name.split(",").slice(0, 2).join(", "),
      fullName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
    };
  } catch (e) { return null; }
};

export const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: (data.display_name || `${lat.toFixed(3)}, ${lng.toFixed(3)}`).split(",").slice(0, 2).join(", "),
      fullName: data.display_name || "",
      lat, lng,
      type: data.type || "place",
    };
  } catch (e) { return null; }
};

export const locationFacts = (loc) => ({
  "latitude (whole)": Math.round(loc.lat),
  "longitude (whole)": Math.round(loc.lng),
  "abs latitude": Math.round(Math.abs(loc.lat)),
  "abs longitude": Math.round(Math.abs(loc.lng)),
  "lat+lng (whole)": Math.round(loc.lat + loc.lng),
  "deg from equator": Math.round(Math.abs(loc.lat)),
});
