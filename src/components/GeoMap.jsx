import { useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineKm } from "../lib/geo.js";

export default function GeoMap({ locationNodes, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const linesRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, worldCopyJump: true });
    L.tileLayer("https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; Stadia Maps &copy; OpenStreetMap', maxZoom: 18,
    }).addTo(map);
    map.on("click", (e) => onPick(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => map.removeLayer(m));
    linesRef.current.forEach((l) => map.removeLayer(l));
    markersRef.current = []; linesRef.current = [];

    locationNodes.forEach((n) => {
      // SECURITY FIX: build popup as DOM, not HTML string, so n.name from
      // Nominatim cannot inject HTML.
      const popupEl = document.createElement("div");
      const nameEl = document.createElement("strong");
      nameEl.textContent = n.name;
      popupEl.appendChild(nameEl);
      popupEl.appendChild(document.createElement("br"));
      const coordEl = document.createElement("span");
      coordEl.textContent = `${n.lat.toFixed(3)}, ${n.lng.toFixed(3)}`;
      popupEl.appendChild(coordEl);

      const marker = L.circleMarker([n.lat, n.lng], {
        radius: 7, color: "#aa1e1e", weight: 2,
        fillColor: "#aa1e1e", fillOpacity: 0.7,
      }).bindPopup(popupEl).addTo(map);
      markersRef.current.push(marker);
    });

    for (let i = 0; i < locationNodes.length; i++) {
      for (let j = i + 1; j < locationNodes.length; j++) {
        const a = locationNodes[i], b = locationNodes[j];
        const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]],
          { color: "#aa1e1e", weight: 1.5, opacity: 0.6, dashArray: "4 4" })
          .bindTooltip(`${km} km`).addTo(map);
        linesRef.current.push(line);
      }
    }

    if (locationNodes.length > 0) {
      const bounds = L.latLngBounds(locationNodes.map((n) => [n.lat, n.lng]));
      map.fitBounds(bounds.pad(0.5), { maxZoom: 8, animate: true });
    }
  }, [locationNodes]);

  return (
    <div ref={containerRef} style={{
      height: 460, width: "100%", border: "1px solid #6b4a2a",
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)", filter: "sepia(0.15) contrast(1.05)",
    }} />
  );
}
