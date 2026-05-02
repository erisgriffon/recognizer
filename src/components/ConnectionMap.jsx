import { useState, useRef, useEffect } from "react";
import { createLayoutSimulation } from "../lib/layout.js";

export default function ConnectionMap({ nodes, connections, selectedNodeId = null, onNodeClick }) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const positionsRef = useRef({});
  const [positions, setPositions] = useState({});
  const [isSettling, setIsSettling] = useState(false);

  // Restart the sim whenever the id set changes. Existing positions warm-start
  // so unchanged nodes stay near where they were; new nodes seed from their id
  // hash and drift in over the rAF loop below.
  const idKey = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    const initial = {};
    for (const node of nodes) {
      if (positionsRef.current[node.id]) initial[node.id] = positionsRef.current[node.id];
    }
    simRef.current = createLayoutSimulation(nodes, connections, { initial });
    setIsSettling(true);

    let raf;
    const tick = () => {
      simRef.current.step();
      const next = { ...simRef.current.getPositions() };
      positionsRef.current = next;
      setPositions(next);
      if (simRef.current.isSettled()) {
        setIsSettling(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

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
    const isIncident = (c) =>
      selectedNodeId && (c.from === selectedNodeId || c.to === selectedNodeId);
    connections.forEach((c) => {
      const a = positions[c.from], b = positions[c.to];
      if (!a || !b) return;
      // Selection dims non-incident edges so the chosen node's connections pop.
      let alpha = 0.3 + c.strength * 0.5;
      if (selectedNodeId && !isIncident(c)) alpha *= 0.2;
      ctx.strokeStyle = `rgba(170, 30, 30, ${alpha})`;
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
      const selected = selectedNodeId === node.id;
      if (selected) {
        ctx.shadowColor = "#ffb84d";
        ctx.shadowBlur = 24;
      } else if (selectedNodeId) {
        ctx.globalAlpha = 0.4;
      }
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-58, -28, 120, 60);
      const cardColor = {
        name: "#fff8d6", audio: "#dde8d8", text: "#fdfcf6",
        date: "#e8d8e0", location: "#d8e0e8", today: "#e8d8b8",
        image: "#e0e0d0", url: "#d8d0e0", book: "#e8e0c8",
      }[node.type] || "#fdfcf6";
      ctx.fillStyle = cardColor;
      ctx.fillRect(-60, -30, 120, 60);
      // Selected node gets a brighter, thicker border on top of the glow.
      ctx.strokeStyle = selected ? "#aa1e1e" : "rgba(80,50,30,0.4)";
      ctx.lineWidth = selected ? 2 : 0.5;
      ctx.strokeRect(-60, -30, 120, 60);
      ctx.shadowBlur = 0;
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
  }, [nodes, connections, positions, selectedNodeId]);

  // Hit-test against the drawn 120×60 cards. Slightly generous on purpose —
  // the cards have tilt and shadow, and over-precise hit targets read worse
  // than over-generous ones.
  const handleClick = (e) => {
    if (!onNodeClick) return;
    // Click during settle: snap to final and discard this click. The user
    // hasn't seen the final layout yet, so a click on mid-flight positions
    // is probably not the click they wanted — re-clicking is honest.
    if (isSettling && simRef.current) {
      while (!simRef.current.isSettled()) simRef.current.step();
      const next = { ...simRef.current.getPositions() };
      positionsRef.current = next;
      setPositions(next);
      setIsSettling(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 500 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    for (const node of nodes) {
      const p = positions[node.id];
      if (!p) continue;
      if (Math.abs(x - p.x) < 60 && Math.abs(y - p.y) < 30) {
        onNodeClick(node.id);
        return;
      }
    }
    onNodeClick(null);
  };

  return (
    <canvas ref={canvasRef}
      onClick={handleClick}
      style={{
        maxWidth: "100%",
        border: "1px solid #6b4a2a",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        cursor: onNodeClick ? "pointer" : "default",
      }} />
  );
}
