import { useMemo } from "react";
import { buildTodayObservation, summarizeHint } from "../lib/narrative/today.js";
import { observationStyle, buttonStyle, tabStyle } from "../styles.js";

export default function TodayObservation({ todayNode, onPromote, onReroll, rerollKey, includeNumerology, hints = [] }) {
  const observation = useMemo(
    () => buildTodayObservation(todayNode, rerollKey || 1, includeNumerology),
    [todayNode, rerollKey, includeNumerology]
  );
  if (!todayNode) {
    return (
      <div style={observationStyle}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.7, marginBottom: 8 }}>
          ░ FROM THE INVESTIGATOR'S DESK ░
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, fontStyle: "italic" }}>Consulting the date…</div>
      </div>
    );
  }
  // Show at most 3 hints, prioritizing strongest matches.
  const topHints = hints
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  return (
    <div style={observationStyle}>
      <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.7, marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <span>░ FROM THE INVESTIGATOR'S DESK ░</span>
        <span style={{ opacity: 0.5 }}>{todayNode.isoDate} · {todayNode.dayOfWeek} · {todayNode.moonPhase}</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, fontStyle: "italic", color: "#e8dcc4" }}>{observation}</p>

      {topHints.length > 0 && (
        <div style={{
          marginTop: 14, padding: "10px 12px",
          background: "rgba(170,30,30,0.12)",
          border: "1px dashed #aa1e1e",
          fontSize: 12, lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.8, marginBottom: 6, color: "#ffb84d" }}>
            ⚠ AND YET — A NOTE
          </div>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            Were today entered into evidence, the investigator would observe:
          </p>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {topHints.map((h, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{summarizeHint(h)}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onPromote} style={buttonStyle}>▸ ENTER TODAY INTO EVIDENCE</button>
        <button onClick={onReroll} style={tabStyle}>↻ RECONSULT</button>
      </div>
    </div>
  );
}
