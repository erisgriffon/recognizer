// Geographic helpers for the depth-aware geographic category in the
// connection engine. Existing helpers in geo.js (haversineKm, isLeyLine,
// geocode, reverseGeocode, locationFacts) stay where they are — this
// module adds the Standard- and Deep-tier helpers.

import { haversineKm } from "./geo.js";

// Antipode: the point diametrically opposite on a sphere. Latitude flips
// sign; longitude shifts by 180° (taking the short way around so the
// result stays in (-180, 180]).
export const antipodeOf = (lat, lng) => ({
  lat: -lat,
  lng: lng > 0 ? lng - 180 : lng + 180,
});

// Two locations are "antipodal" if one's antipode is within tolKm of the
// other. 500 km default — generous, but the antipode of any point is a
// vast empty stretch of ocean for most populated places, so the false-
// positive rate stays low even at this tolerance.
export const isAntipodal = (a, b, tolKm = 500) => {
  const ant = antipodeOf(a.lat, a.lng);
  return haversineKm(ant.lat, ant.lng, b.lat, b.lng) <= tolKm;
};

// Approximate timezone offset from longitude. Real timezones don't follow
// longitude exactly (politics, daylight saving, half-hour offsets), but
// "broadly the same time of day" is a defensible heuristic for coincidence
// hunting. Returns an integer in [-12, 12].
export const longitudeTimeZone = (lng) => Math.round(lng / 15);

// Hemisphere classification: north/south + east/west. Equator/prime
// meridian go to the positive bucket — arbitrary, but consistent.
export const hemisphereOf = (lat, lng) => ({
  ns: lat >= 0 ? "north" : "south",
  ew: lng >= 0 ? "east" : "west",
});

// Cross-track distance from point P to the great-circle through A and B,
// in km. Returns true iff P lies within tolKm of that arc. Standard
// spherical-trig implementation:
//   d_xt = asin(sin(d_AP / R) * sin(bearing_AP - bearing_AB)) * R
// where d_AP is the great-circle distance from A to P. Within-segment
// check is intentionally NOT applied — a city on the great-circle PATH
// between two others is the finding regardless of whether it's strictly
// between them.
const toRad = (d) => (d * Math.PI) / 180;
const bearing = (lat1, lon1, lat2, lon2) => {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
};
export const isOnGreatCircle = (p, a, b, tolKm = 100) => {
  const R = 6371;
  const dAP = haversineKm(a.lat, a.lng, p.lat, p.lng);
  if (dAP === 0) return true;
  const dAB = haversineKm(a.lat, a.lng, b.lat, b.lng);
  if (dAB === 0) return false; // degenerate — A and B coincide, no arc
  const θAP = bearing(a.lat, a.lng, p.lat, p.lng);
  const θAB = bearing(a.lat, a.lng, b.lat, b.lng);
  const xtrack = Math.asin(Math.sin(dAP / R) * Math.sin(θAP - θAB)) * R;
  return Math.abs(xtrack) <= tolKm;
};

// World Magnetic Model 2025 pole positions per NOAA NCEI. The poles drift
// substantially — north magnetic pole has moved ~2200 km since systematic
// observations began in the 1830s, currently at ~35 km/year. These values
// will drift out of date; a future update can swap in WMM 2030 (released
// late 2029) with a one-line edit. For our coincidence-hunting purposes,
// "near a magnetic pole" is a 1500 km tolerance that absorbs years of drift.
export const MAGNETIC_NORTH_2025 = { lat: 85.762, lng: 139.298 };
export const MAGNETIC_SOUTH_2025 = { lat: -63.851, lng: 135.078 };

export const isNearMagneticPole = (lat, lng, which = "north") => {
  const pole = which === "north" ? MAGNETIC_NORTH_2025 : MAGNETIC_SOUTH_2025;
  return haversineKm(lat, lng, pole.lat, pole.lng) <= 1500;
};

// Elevation banding. Sea-level matches are too common to be interesting —
// most places are within 500m of sea level, so we return null there and
// the engine doesn't fire. Above 500m we bucket coarsely; two locations in
// the same non-default band match.
export const elevationBand = (meters) => {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
  if (meters < 0) return "below sea level";
  if (meters < 500) return null;
  if (meters < 1500) return "moderate altitude";
  if (meters < 3000) return "high altitude";
  return "extreme altitude";
};
