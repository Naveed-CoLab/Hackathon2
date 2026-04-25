"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import SkillNode from "./SkillNode";
import NodeDialog from "./NodeDialog";
import { getAllSkills, getRuntimeSkills } from "@/lib/skillGraph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

function sanitizeColor(color, fallback = "#8b5cf6") {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed);
  const isRgb = /^rgba?\(([^)]+)\)$/.test(trimmed);
  const isHsl = /^hsla?\(([^)]+)\)$/.test(trimmed);
  return isHex || isRgb || isHsl ? trimmed : fallback;
}

// Convert any color to a safe hex string (needed for Three.js / 3D mode)
function toHex(color, fallback = "#8b5cf6") {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed;
  }
  // Try to parse rgba/rgb
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); 
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${Number(r).toString(16).padStart(2,"0")}${Number(g).toString(16).padStart(2,"0")}${Number(b).toString(16).padStart(2,"0")}`;
  }
  return fallback;
}

function hexToRgba(hex, alpha) {
  const safeHex = sanitizeColor(hex);
  if (!safeHex.startsWith("#")) return `rgba(99,102,241,${alpha})`;
  const n = safeHex.length === 4
    ? `#${safeHex[1]}${safeHex[1]}${safeHex[2]}${safeHex[2]}${safeHex[3]}${safeHex[3]}`
    : safeHex;
  const r = parseInt(n.slice(1,3),16);
  const g = parseInt(n.slice(3,5),16);
  const b = parseInt(n.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Build full KG graph from skills.json
function buildGraphData(skills) {
  const nodes = skills.map(skill => ({
    id: skill.id,
    name: skill.label || skill.name, // ← handle both shapes
    description: skill.description || "",
    color: skill.domain === "art" ? "#6366f1" : 
           skill.domain === "external" ? "#f59e0b" : "#0ea5e9",
    domain: skill.domain,
    level: skill.level,
    needs: skill.needs || [],
  }));

  const nodeIds = new Set(nodes.map(n => n.id));
  const links = [];

  nodes.forEach(node => {
    node.needs.forEach(prereqId => {
      if (!nodeIds.has(prereqId)) return;
      links.push({
        source: prereqId,
        target: node.id,
        color: "rgba(148,163,184,0.2)",
        width: 1,
      });
    });
  });

  return { nodes, links };
}

// Compute which node ids belong to a saved path
function getPathNodeIds(path) {
  const ids = new Set();
  (path.knownSkills || []).forEach(s => ids.add(s.id));
  (path.missingSkills || []).forEach(s => ids.add(s.id));
  return ids;
}

export default function Graph({ savedPaths = [], onDeletePath, kgVersion = 0 }) {  const fgRef = useRef();
  const containerRef = useRef();

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [is3D, setIs3D] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dimensions, setDimensions] = useState({ width: 1200, height: 700 });
  const [activePath, setActivePath] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const GraphComponent = is3D ? ForceGraph3D : ForceGraph2D;

  // Detect mobile on mount & resize
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load full KG from skills.json on mount
 useEffect(() => {
  const skills = getAllSkills();
  const runtime = getRuntimeSkills(); // ← also load runtime additions
  setGraphData(buildGraphData([...skills, ...runtime]));
}, [kgVersion]); // ← re-runs when kgVersion increments

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Zoom to fit
  useEffect(() => {
    if (!fgRef.current) return;
    const t = setTimeout(() => fgRef.current.zoomToFit?.(1000, 60), 100);
    return () => clearTimeout(t);
  }, [is3D, graphData.nodes.length]);

  const handleZoomIn = useCallback(() => {
    if (!fgRef.current) return;
    if (is3D) {
      // 3D zoom: move camera closer
      const pos = fgRef.current.cameraPosition();
      fgRef.current.cameraPosition(
        { x: pos.x * 0.7, y: pos.y * 0.7, z: pos.z * 0.7 },
        undefined, 400
      );
    } else {
      const z = fgRef.current.zoom();
      fgRef.current.zoom(z * 1.4, 400);
    }
  }, [is3D]);

  const handleZoomOut = useCallback(() => {
    if (!fgRef.current) return;
    if (is3D) {
      const pos = fgRef.current.cameraPosition();
      fgRef.current.cameraPosition(
        { x: pos.x * 1.4, y: pos.y * 1.4, z: pos.z * 1.4 },
        undefined, 400
      );
    } else {
      const z = fgRef.current.zoom();
      fgRef.current.zoom(z * 0.7, 400);
    }
  }, [is3D]);

  const focusNode = useCallback((node) => {
    if (!node || !fgRef.current) return;
    if (is3D) {
      const d = 120;
      const dr = 1 + d / Math.hypot(node.x||1, node.y||1, node.z||1);
      fgRef.current.cameraPosition(
        { x: node.x*dr, y: node.y*dr, z: node.z*dr }, node, 1000
      );
    } else {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(4, 1000);
    }
  }, [is3D]);

  const handleNodeClick = (node) => {
    focusNode(node);
    setSelectedNode(node);
  };

  const handleFocusBySearch = useCallback(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    const found = graphData.nodes.find(n => n.name.toLowerCase().includes(term));
    if (!found) { alert("No matching node found."); return; }
    focusNode(found);
    setSelectedNode(found);
  }, [focusNode, graphData.nodes, searchTerm]);

  // Determine active path node ids
  const activePathIds = activePath ? getPathNodeIds(activePath) : null;

  const getConnectedCount = useCallback((nodeId) =>
    graphData.links.reduce((count, link) =>
      count + (link.source?.id === nodeId || link.source === nodeId ||
               link.target?.id === nodeId || link.target === nodeId ? 1 : 0), 0),
    [graphData.links]
  );

  // Node painter with dim/highlight logic
  const renderNode2D = useCallback((node, ctx, globalScale) => {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;

    const inPath = activePathIds ? activePathIds.has(node.id) : true;
    const isHovered = node === hoverNode;

    // Determine color based on path membership
    let baseColor;
    if (!activePathIds) {
      baseColor = sanitizeColor(node.color, "#8b5cf6");
    } else if (inPath) {
      const isKnown = (activePath.knownSkills || []).some(s => s.id === node.id);
      baseColor = isKnown ? "#10b981" : "#ef4444";
    } else {
      baseColor = "#334155";
    }

    const alpha = activePathIds && !inPath ? 0.25 : 1;
    const radius = isHovered && inPath ? 6 : 4;
    const fontSize = Math.min(Math.max(3.5, 9 / globalScale), 11);

    // Glow (only for path nodes or hovered)
    if ((inPath || !activePathIds) && (isHovered || globalScale > 1.5)) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI);
      const glow = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + 5);
      glow.addColorStop(0, hexToRgba(baseColor, 0.25 * alpha));
      glow.addColorStop(1, hexToRgba(baseColor, 0));
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    const grad = ctx.createRadialGradient(node.x-1, node.y-1, 0, node.x, node.y, radius);
    grad.addColorStop(0, hexToRgba(baseColor, alpha));
    grad.addColorStop(1, hexToRgba(baseColor, 0.75 * alpha));
    ctx.fillStyle = isHovered ? "#c4b5fd" : grad;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(node.x - 0.8, node.y - 0.8, radius * 0.4, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${0.18 * alpha})`;
    ctx.fill();

    // Label — show on hover, or when zoomed in enough
    const showLabel = isHovered ||
                      (!activePathIds && globalScale > 2.5) ||
                      (activePathIds && inPath && globalScale > 1.5);
    if (showLabel) {
      // Truncate long labels
      let label = node.name || "";
      if (label.length > 22 && !isHovered) label = label.slice(0, 20) + "…";

      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const x = node.x - textWidth / 2 - 4;
      const y = node.y + radius + 3;
      const bh = fontSize + 5;

      ctx.fillStyle = `rgba(10,10,15,${0.88 * alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, textWidth + 8, bh, 4);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.06 * alpha})`;
      ctx.lineWidth = 0.5 / globalScale;
      ctx.stroke();

      ctx.fillStyle = `rgba(226,232,240,${alpha})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, node.x, y + 2.5);
    }
  }, [hoverNode, activePathIds, activePath]);

  // Link color with dim logic — must return hex for 3D compatibility
  const getLinkColor = useCallback((link) => {
    if (is3D) {
      // Three.js only supports hex/named colors, not rgba
      if (!activePathIds) return "#94a3b8";
      const srcId = link.source?.id || link.source;
      const tgtId = link.target?.id || link.target;
      const bothInPath = activePathIds.has(srcId) && activePathIds.has(tgtId);
      return bothInPath ? "#94a3b8" : "#1e293b";
    }
    // 2D mode supports rgba for transparency
    if (!activePathIds) return link.color ? `rgba(148,163,184,0.2)` : "rgba(148,163,184,0.2)";
    const srcId = link.source?.id || link.source;
    const tgtId = link.target?.id || link.target;
    const bothInPath = activePathIds.has(srcId) && activePathIds.has(tgtId);
    return bothInPath ? "rgba(148,163,184,0.6)" : "rgba(148,163,184,0.04)";
  }, [activePathIds, is3D]);

  const filteredMatches = graphData.nodes.filter(n =>
    searchTerm.trim() ? n.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) : false
  );

  const SIDEBAR_WIDTH = isMobile ? 260 : 280;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: sidebarOpen ? `${SIDEBAR_WIDTH}px` : "0px",
        minWidth: sidebarOpen ? `${SIDEBAR_WIDTH}px` : "0px",
        height: "100%",
        background: "rgba(10,10,15,0.96)",
        borderRight: "1px solid var(--border-subtle)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0,
        // On mobile, overlay instead of pushing content
        ...(isMobile && sidebarOpen ? {
          position: "absolute",
          top: 0, left: 0, bottom: 0,
          boxShadow: "4px 0 24px rgba(0,0,0,0.5)",
        } : {}),
      }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <h3 style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "4px" }}>
            Learning Paths
          </h3>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {savedPaths.length} saved · click to highlight
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          {savedPaths.length === 0 ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.6 }}>
              No paths yet. Use the Gap Analyzer to generate your first learning path.
            </div>
          ) : (
            savedPaths.map(path => {
              const isActive = activePath?.id === path.id;
              const date = new Date(path.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div
                  key={path.id}
                  onClick={() => setActivePath(isActive ? null : path)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    marginBottom: "8px",
                    cursor: "pointer",
                    border: `1px solid ${isActive ? "rgba(139,92,246,0.5)" : "var(--border-subtle)"}`,
                    background: isActive ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.02)",
                    transition: "all 0.2s",
                    position: "relative",
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div style={{
                      position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                      width: "3px", height: "60%", background: "var(--color-primary)",
                      borderRadius: "0 2px 2px 0",
                    }} />
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: "13px", fontWeight: 700,
                        color: isActive ? "#c084fc" : "var(--text-primary)",
                        marginBottom: "4px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        🎯 {path.goal}
                      </p>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
                          background: "rgba(16,185,129,0.12)", color: "#34d399",
                          border: "1px solid rgba(16,185,129,0.2)", fontWeight: 600
                        }}>
                          ✓ {path.knownSkills?.length || 0} known
                        </span>
                        <span style={{
                          fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
                          background: "rgba(239,68,68,0.1)", color: "#fca5a5",
                          border: "1px solid rgba(239,68,68,0.2)", fontWeight: 600
                        }}>
                          ✗ {path.missingSkills?.length || 0} missing
                        </span>
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
                        {date}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (isActive) setActivePath(null);
                        onDeletePath?.(path.id);
                      }}
                      style={{
                        background: "transparent", border: "none",
                        color: "var(--text-muted)", cursor: "pointer",
                        fontSize: "14px", padding: "2px 4px", borderRadius: "6px",
                        transition: "all 0.15s", flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                      title="Delete path"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Legend when active */}
                  {isActive && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                        Known
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
                        Missing
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#334155" }} />
                        Other
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── GRAPH AREA ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, height: "100%", position: "relative", overflow: "hidden",
          background: "radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(6,182,212,0.04) 0%, transparent 50%), var(--bg-base)"
        }}
      >
        <GraphComponent
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor={is3D ? "#0a0a0f" : "transparent"}
          nodeLabel="name"
          {...(!is3D ? { nodeCanvasObject: renderNode2D, nodeCanvasObjectMode: () => "replace" } : {
            nodeColor: node => toHex(node.color),
          })}
          linkColor={getLinkColor}
          linkWidth={l => {
            if (!activePathIds) return l.width || 1;
            const s = l.source?.id || l.source;
            const t = l.target?.id || l.target;
            return activePathIds.has(s) && activePathIds.has(t) ? 2 : 0.3;
          }}
          linkOpacity={is3D ? 0.3 : undefined}
          linkCurvature={0.08}
          linkDirectionalParticleWidth={2}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleColor={() => activePath ? "#10b981" : "#8b5cf6"}
          onNodeClick={handleNodeClick}
          onNodeHover={setHoverNode}
          nodeRelSize={3}
          cooldownTime={1200}
        />

        {/* ── Sidebar toggle ── */}
        <button
          onClick={() => setSidebarOpen(p => !p)}
          style={{
            position: "absolute", top: "16px", left: "16px",
            background: "rgba(10,10,15,0.85)", border: "1px solid var(--border-subtle)",
            borderRadius: "10px", padding: "8px 12px", cursor: "pointer",
            color: "var(--text-secondary)", fontSize: "13px", fontWeight: 700,
            backdropFilter: "blur(12px)", zIndex: 25, transition: "all 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-accent)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
        >
          {sidebarOpen ? "◀ Paths" : "▶ Paths"}
        </button>

        {/* ── Top controls ── */}
        <div style={{
          position: "absolute", top: isMobile ? "10px" : "16px",
          left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: isMobile ? "4px" : "8px", alignItems: "center", zIndex: 25,
          maxWidth: isMobile ? "calc(100% - 100px)" : "auto",
        }}>
          <div style={{ position: "relative", flex: isMobile ? 1 : "none" }}>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleFocusBySearch()}
              placeholder="Search skills..."
              className="skillmap-input"
              style={{ padding: isMobile ? "7px 10px" : "9px 14px", fontSize: isMobile ? "12px" : "13px", width: isMobile ? "100%" : "220px" }}
            />
            {searchTerm && filteredMatches.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0,
                background: "rgba(10,10,15,0.95)", border: "1px solid var(--border-subtle)",
                borderRadius: "10px", padding: "6px", zIndex: 30, width: "100%",
                backdropFilter: "blur(12px)", maxHeight: "180px", overflowY: "auto"
              }}>
                {filteredMatches.slice(0, 8).map(n => (
                  <div
                    key={n.id}
                    onClick={() => { focusNode(n); setSelectedNode(n); setSearchTerm(""); }}
                    style={{
                      padding: "8px 10px", borderRadius: "7px", cursor: "pointer",
                      fontSize: "12px", color: "var(--text-secondary)", transition: "all 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    {n.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => fgRef.current?.zoomToFit?.(800, 60)} className="graph-action-btn">
            Fit
          </button>
          <button onClick={() => setIs3D(p => !p)} className="graph-action-btn">
            {is3D ? "⬡ 2D" : "◇ 3D"}
          </button>
        </div>

        {/* ── Zoom +/- controls ── */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={handleZoomIn} title="Zoom in">+</button>
          <div className="zoom-divider" />
          <button className="zoom-btn" onClick={handleZoomOut} title="Zoom out">−</button>
        </div>

        {/* ── Active path banner ── */}
        {activePath && (
          <div className="animate-fade-in" style={{
            position: "absolute", bottom: isMobile ? "70px" : "16px",
            left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,10,15,0.92)", border: "1px solid rgba(139,92,246,0.4)",
            borderRadius: isMobile ? "10px" : "14px",
            padding: isMobile ? "8px 12px" : "12px 20px", zIndex: 25,
            backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", gap: isMobile ? "8px" : "16px",
            maxWidth: "calc(100% - 32px)",
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}>
            <span style={{ fontSize: isMobile ? "11px" : "13px", fontWeight: 700, color: "#c084fc" }}>
              🎯 {activePath.goal}
            </span>
            {!isMobile && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {activePath.knownSkills?.length} known · {activePath.missingSkills?.length} to learn
              </span>
            )}
            <button
              onClick={() => setActivePath(null)}
              style={{
                background: "transparent", border: "1px solid var(--border-subtle)",
                borderRadius: "6px", padding: "3px 10px", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "11px", fontWeight: 600,
                fontFamily: "inherit", transition: "all 0.2s",
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Hover preview ── */}
        {hoverNode && !isMobile && (
          <div className="animate-fade-in" style={{
            position: "absolute", right: "16px", bottom: "16px", zIndex: 20,
            width: "260px", background: "rgba(10,10,15,0.92)",
            border: "1px solid var(--border-accent)", borderRadius: "16px",
            padding: "16px", backdropFilter: "blur(16px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          }}>
            <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "4px", fontSize: "14px" }}>
              {hoverNode.name}
            </p>
            {activePathIds && (
              <p style={{
                fontSize: "11px", fontWeight: 700, marginBottom: "6px",
                color: activePathIds.has(hoverNode.id)
                  ? ((activePath?.knownSkills||[]).some(s=>s.id===hoverNode.id) ? "#34d399" : "#fca5a5")
                  : "var(--text-muted)"
              }}>
                {activePathIds.has(hoverNode.id)
                  ? ((activePath?.knownSkills||[]).some(s=>s.id===hoverNode.id) ? "✓ You know this" : "✗ Gap to fill")
                  : "Not in this path"}
              </p>
            )}
            <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px", lineHeight: 1.5 }}>
              Level {hoverNode.level} · {hoverNode.domain === "art" ? "Art & Design" : "Web Dev"}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Connections: {getConnectedCount(hoverNode.id)}
            </p>
          </div>
        )}

        {selectedNode && (
          <NodeDialog
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onDelete={() => {}}
            onUpdate={() => {}}
          />
        )}
      </div>
    </div>
  );
}