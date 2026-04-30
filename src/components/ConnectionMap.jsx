import { useState, useRef, useEffect } from "react";

export default function ConnectionMap({ nodes, connections }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState({});

  useEffect(() => {
    const w = 800, h = 500;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(180, 60 + nodes.length * 18);
    const pos = {};
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[node.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    setPositions(pos);
  }, [nodes.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 800 * dpr; canvas.height = 500 * dpr;
    canvas.style.width = "800px"; canvas.style.height = "500px";
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#f5efe1"; ctx.fillRect(0, 0, 800, 500);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(60, 40, 20, ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 800, Math.random() * 500, 1, 1);
    }
    connections.forEach((c) => {
      const a = positions[c.from], b = positions[c.to];
      if (!a || !b) return;
      ctx.strokeStyle = `rgba(170, 30, 30, ${0.3 + c.strength * 0.5})`;
      ctx.lineWidth = 0.8 + c.strength * 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 8;
      const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 8;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    });
    nodes.forEach((node) => {
      const p = positions[node.id];
      if (!p) return;
      ctx.save();
      const tilt = ((node.id.charCodeAt(0) % 7) - 3) * 0.04;
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-58, -28, 120, 60);
      const cardColor = {
        name: "#fff8d6", audio: "#dde8d8", text: "#fdfcf6",
        date: "#e8d8e0", location: "#d8e0e8", today: "#e8d8b8",
        image: "#e0e0d0", url: "#d8d0e0", book: "#e8e0c8",
      }[node.type] || "#fdfcf6";
      ctx.fillStyle = cardColor;
      ctx.fillRect(-60, -30, 120, 60);
      ctx.strokeStyle = "rgba(80,50,30,0.4)"; ctx.lineWidth = 0.5;
      ctx.strokeRect(-60, -30, 120, 60);
      ctx.beginPath();
      ctx.arc(0, -22, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#aa1e1e"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.stroke();
      ctx.fillStyle = "#2a1a0a";
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(node.type.toUpperCase(), 0, -6);
      ctx.font = "9px 'Courier New', monospace";
      const label = node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name;
      ctx.fillText(label, 0, 8);
      const factCount = Object.keys(node.numbers || {}).length + (node.numerology ? 1 : 0);
      ctx.fillText(`${factCount} facts`, 0, 22);
      ctx.restore();
    });
  }, [nodes, connections, positions]);

  return (
    <canvas ref={canvasRef}
      style={{ maxWidth: "100%", border: "1px solid #6b4a2a", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
  );
}
