import { useState, useRef, useEffect } from "react";
import { createLayoutSimulation, edgeJitter, mulberry32, seedFromIds } from "../lib/layout.js";

export default function ConnectionMap({ nodes, connections, selectedNodeId = null, onNodeClick }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const positionsRef = useRef({});
  const [positions, setPositions] = useState({});
  const [isSettling, setIsSettling] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          setIsMobile(width < 600);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Restart the sim whenever the id set or dimensions change.
  const idKey = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    const initial = {};
    for (const node of nodes) {
      if (positionsRef.current[node.id]) initial[node.id] = positionsRef.current[node.id];
    }
    
    const cardW = isMobile ? 90 : 120;
    const cardH = isMobile ? 45 : 60;
    const repulsionK = isMobile ? 3000 : 6000;
    const insetX = cardW / 2 + 5;
    const insetY = cardH / 2 + 5;

    simRef.current = createLayoutSimulation(nodes, connections, { 
      initial,
      width: dimensions.width,
      height: dimensions.height,
      repulsionK,
      insetX,
      insetY
    });
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
  }, [idKey, dimensions.width, dimensions.height, isMobile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr; 
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`; 
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = "#f5efe1"; 
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    
    // Aged-paper speckle, deterministic per case file.
    const rng = mulberry32(seedFromIds(nodes.map((n) => n.id)));
    const areaScale = (dimensions.width * dimensions.height) / (800 * 500);
    const speckleCount = Math.floor(400 * areaScale);
    for (let i = 0; i < speckleCount; i++) {
      ctx.fillStyle = `rgba(60, 40, 20, ${rng() * 0.05})`;
      ctx.fillRect(rng() * dimensions.width, rng() * dimensions.height, 1, 1);
    }
    
    const isIncident = (c) =>
      selectedNodeId && (c.from === selectedNodeId || c.to === selectedNodeId);
      
    let culledCount = 0;
    connections.forEach((c) => {
      const a = positions[c.from], b = positions[c.to];
      if (!a || !b) return;
      
      // Filter out trivial edges unless they are incident to the selected node
      if (c.strength < 0.5 && !isIncident(c)) {
        culledCount++;
        return;
      }

      // Selection dims non-incident edges so the chosen node's connections pop.
      let alpha = 0.3 + c.strength * 0.5;
      if (selectedNodeId && !isIncident(c)) alpha *= 0.2;
      
      ctx.strokeStyle = `rgba(170, 30, 30, ${alpha})`;
      ctx.lineWidth = 0.8 + c.strength * 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const j = edgeJitter(c.from, c.to);
      const mx = (a.x + b.x) / 2 + j.x;
      const my = (a.y + b.y) / 2 + j.y;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    });
    
    const cardW = isMobile ? 90 : 120;
    const cardH = isMobile ? 45 : 60;
    const halfW = cardW / 2;
    const halfH = cardH / 2;
    
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
      ctx.fillRect(-halfW + 2, -halfH + 2, cardW, cardH);
      const cardColor = {
        name: "#fff8d6", audio: "#dde8d8", text: "#fdfcf6",
        date: "#e8d8e0", location: "#d8e0e8", today: "#e8d8b8",
        image: "#e0e0d0", url: "#d8d0e0", book: "#e8e0c8",
      }[node.type] || "#fdfcf6";
      ctx.fillStyle = cardColor;
      ctx.fillRect(-halfW, -halfH, cardW, cardH);
      // Selected node gets a brighter, thicker border on top of the glow.
      ctx.strokeStyle = selected ? "#aa1e1e" : "rgba(80,50,30,0.4)";
      ctx.lineWidth = selected ? 2 : 0.5;
      ctx.strokeRect(-halfW, -halfH, cardW, cardH);
      ctx.shadowBlur = 0;
      
      // Pin
      ctx.beginPath();
      ctx.arc(0, -halfH + 8, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#aa1e1e"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.stroke();
      
      // Text
      ctx.fillStyle = "#2a1a0a";
      ctx.textAlign = "center";
      
      if (isMobile) {
        ctx.font = "bold 9px 'Courier New', monospace";
        ctx.fillText(node.type.toUpperCase(), 0, -halfH + 19);
        ctx.font = "8px 'Courier New', monospace";
        const label = node.name.length > 14 ? node.name.slice(0, 12) + "…" : node.name;
        ctx.fillText(label, 0, 4);
        const factCount = Object.keys(node.numbers || {}).length + (node.numerology ? 1 : 0);
        ctx.fillText(`${factCount} facts`, 0, 15);
      } else {
        ctx.font = "bold 10px 'Courier New', monospace";
        ctx.fillText(node.type.toUpperCase(), 0, -halfH + 24);
        ctx.font = "9px 'Courier New', monospace";
        const label = node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name;
        ctx.fillText(label, 0, 8);
        const factCount = Object.keys(node.numbers || {}).length + (node.numerology ? 1 : 0);
        ctx.fillText(`${factCount} facts`, 0, 22);
      }
      ctx.restore();
    });
    
    // Draw culled indicator if needed
    if (culledCount > 0 && !selectedNodeId) {
      ctx.fillStyle = "rgba(42, 26, 10, 0.4)";
      ctx.font = "10px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`(${culledCount} TRIVIAL EDGES HIDDEN)`, dimensions.width - 10, dimensions.height - 10);
    }
  }, [nodes, connections, positions, selectedNodeId, dimensions, isMobile]);

  const handleClick = (e) => {
    if (!onNodeClick) return;
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
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const cardW = isMobile ? 90 : 120;
    const cardH = isMobile ? 45 : 60;
    const halfW = cardW / 2;
    const halfH = cardH / 2;
    
    for (const node of nodes) {
      const p = positions[node.id];
      if (!p) continue;
      if (Math.abs(x - p.x) < halfW && Math.abs(y - p.y) < halfH) {
        onNodeClick(node.id);
        return;
      }
    }
    onNodeClick(null);
  };

  return (
    <div ref={containerRef} style={{ 
      width: "100%", 
      aspectRatio: isMobile ? "4/7" : "8/5", 
      position: "relative",
      border: "1px solid #6b4a2a",
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)"
    }}>
      <canvas ref={canvasRef}
        onClick={handleClick}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor: onNodeClick ? "pointer" : "default",
        }} />
    </div>
  );
}
