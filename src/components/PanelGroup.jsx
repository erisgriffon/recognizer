import { useState } from "react";

export default function PanelGroup({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14, border: "1px solid #6b4a2a", background: "rgba(20,14,10,0.4)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "10px 14px",
          background: "rgba(40,28,18,0.8)", color: "#d6a85f",
          border: "none", borderBottom: open ? "1px solid #6b4a2a" : "none",
          fontFamily: "inherit", fontSize: 11, letterSpacing: "0.25em",
          cursor: "pointer", display: "flex", justifyContent: "space-between",
        }}
      >
        <span>▸ {title}</span>
        <span style={{ opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
