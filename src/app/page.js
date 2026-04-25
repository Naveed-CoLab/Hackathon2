"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { savePath, loadPaths, deletePath } from "@/lib/pathStore";
import PendingSkillsDialog from "@/components/PendingSkillsDialog";
import { addSkillToKG } from "@/lib/skillGraph";

// Force graph requires window — disable SSR
const Graph = dynamic(() => import("@/components/Graph"), { ssr: false });

// SkillMap components (from skillmap-mvp branch)
import SkillMapInput from "@/components/SkillMapInput";
import SkillGapChain from "@/components/SkillGapChain";
const SkillMapGraph = dynamic(
  () => import("@/components/SkillMapGraph").then(mod => mod.default),
  { ssr: false }
);
import LearningPlan from "@/components/LearningPlan";
import { addSkill } from "@/lib/skillStore";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("graph");

  // SkillMap state
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(null);
  const [savedPaths, setSavedPaths] = useState([]);
  const [pendingSkills, setPendingSkills] = useState([]);

  // Load persisted state only on client after mount to avoid hydration mismatch
  React.useEffect(() => {
    try {
      const savedTab = localStorage.getItem("skillgraph_tab");
      const savedResults = localStorage.getItem("skillmap_results");
      const savedForm = localStorage.getItem("skillmap_form");
      setSavedPaths(loadPaths());

      if (savedTab) setActiveTab(savedTab);
      if (savedResults) setResults(JSON.parse(savedResults));
      if (savedForm) setFormData(JSON.parse(savedForm));
    } catch (e) {
      console.error("Failed to restore saved app state:", e);
    }
  }, []);

  // Persist State
  React.useEffect(() => {
    localStorage.setItem("skillgraph_tab", activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    if (results) localStorage.setItem("skillmap_results", JSON.stringify(results));
    else localStorage.removeItem("skillmap_results");
  }, [results]);

  React.useEffect(() => {
    if (formData) localStorage.setItem("skillmap_form", JSON.stringify(formData));
    else localStorage.removeItem("skillmap_form");
  }, [formData]);

 const handleAnalyze = async ({ goal, knownSkills, timeAvailable }) => {
  setLoading(true);
  setError(null);
  setResults(null);
  setFormData({ goal, knownSkills, timeAvailable });
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, knownSkills, timeAvailable }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate skill map");
    
    // Auto-save the path
    const path = {
      id: `path_${Date.now()}`,
      goal,
      knownSkills: data.knownSkills || [],
      missingSkills: data.missingSkills || [],
      learningPlan: data.learningPlan || [],
      summary: data.summary || "",
      savedAt: new Date().toISOString(),
    };
    savePath(path);
    setSavedPaths(loadPaths());
    setResults(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "var(--bg-base)", color: "var(--text-primary)", position: "relative", zIndex: 1 }}>

      {/* ── NAV BAR ── */}
      <nav style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border-subtle)",
        backgroundColor: "rgba(10, 10, 15, 0.8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        padding: "0 clamp(12px, 3vw, 32px)",
        height: "52px",
        flexShrink: 0,
        zIndex: 100,
        position: "sticky",
        top: 0,
        gap: "8px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: "linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)",
            flexShrink: 0,
          }}>
            🧭
          </div>
          <span style={{
            fontWeight: "800", fontSize: "16px", letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #c084fc, #818cf8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            SkillGraph
          </span>
        </div>
        {pendingSkills.length > 0 && (
  <PendingSkillsDialog
  pendingSkills={pendingSkills}
  onApprove={async (skills) => {
  const newKnown = [];

  for (const s of skills) {
    await fetch("/api/save-skill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });

    // 🔥 update runtime KG
    addSkillToKG({
      id: s.skill.id,
      name: s.skill.name,
      description: s.skill.description,
      needs: s.skill.needs || [],
      level: s.skill.level || 3,
      source: s.source,
    });

    if (!s.isMissing) {
      newKnown.push({
        id: s.skill.id,
        name: s.skill.name,
        needs: s.skill.needs || [],
        source: s.source,
        confidence: s.skill.confidence || 0.5,
      });
    }
  }

  // 🔥 IMPORTANT: update graph state
  setResults(prev => ({
    ...prev,
    knownSkills: [
      ...(prev.knownSkills || []),
      ...newKnown
    ],
  }));

  setPendingSkills([]);
}}
  onClose={() => setPendingSkills([])}
/>
)}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            className={`nav-tab ${activeTab === "graph" ? "active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            <span style={{ fontSize: "14px" }}>📊</span> Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === "skillmap" ? "active" : ""}`}
            onClick={() => setActiveTab("skillmap")}
          >
            <span style={{ fontSize: "14px" }}>⚡</span> Gap Analyzer
          </button>
        </div>
      </nav>

      {/* ── SKILL GRAPH TAB ── */}
      {activeTab === "graph" && (
  <div style={{ flex: 1, position: "relative" }}>
    <Graph savedPaths={savedPaths} onDeletePath={(id) => {
      deletePath(id);
      setSavedPaths(loadPaths());
    }} />
  </div>
)}

      {/* ── SKILL MAP (AI) TAB ── */}
      {activeTab === "skillmap" && (
        <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          <header style={{ textAlign: "center", padding: "80px 24px 60px", maxWidth: "800px", margin: "0 auto", position: "relative" }}>
            <div style={{
              position: "absolute", top: "30px", left: "50%", transform: "translateX(-50%)",
              width: "200px", height: "200px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)",
              filter: "blur(40px)", pointerEvents: "none"
            }} />
            <h1 className="gradient-text" style={{ fontSize: "clamp(36px, 7vw, 64px)", fontWeight: "900", lineHeight: "1.08", marginBottom: "20px", letterSpacing: "-0.04em", position: "relative" }}>
              Skill Gap Analyzer
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "17px", lineHeight: "1.7", maxWidth: "540px", margin: "0 auto" }}>
              Tell us your goal and what you already know — we&apos;ll find the exact skills you&apos;re missing to bridge the gap.
            </p>
          </header>

          <section style={{ maxWidth: "680px", margin: "0 auto", padding: "0 24px 64px" }}>
            <div className="glass-card-strong" style={{ padding: "32px" }}>
              <SkillMapInput onSubmit={handleAnalyze} loading={loading} hasResults={!!results} />
            </div>
          </section>

          {error && (
            <div style={{ maxWidth: "680px", margin: "0 auto 32px", padding: "0 24px" }}>
              <div style={{
                background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "14px", padding: "16px 20px", color: "#fca5a5",
                display: "flex", gap: "12px", alignItems: "center", backdropFilter: "blur(8px)"
              }}>
                <span style={{ fontSize: "18px" }}>⚠️</span>
                <span style={{ fontWeight: "500", fontSize: "14px" }}>{error}</span>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--text-muted)" }}>
              <div style={{
                width: "48px", height: "48px", margin: "0 auto 24px",
                borderRadius: "50%", border: "3px solid rgba(139, 92, 246, 0.15)",
                borderTopColor: "var(--color-primary)",
              }} className="animate-spin" />
              <p style={{ fontSize: "16px", fontWeight: "500", letterSpacing: "0.02em", color: "var(--text-secondary)" }}>Analyzing your path with Gemini AI...</p>
            </div>
          )}

          {results && !loading && (
            <div className="animate-fade-in" style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 120px" }}>
              
              {/* Summary Hero */}
              <div className="glass-card-strong" style={{ padding: "36px", marginBottom: "56px", position: "relative", overflow: "hidden" }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "3px", height: "100%",
                  background: "linear-gradient(180deg, var(--color-primary), var(--color-cyan))",
                  borderRadius: "0 2px 2px 0"
                }} />
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-primary)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "24px" }}>📝</span> The Analysis
                </h2>
                <p style={{ fontSize: "16px", lineHeight: "1.8", color: "var(--text-secondary)", fontWeight: "400" }}>
                  {results.summary}
                </p>
                
                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "28px" }}>
                  <button
  onClick={() => setActiveTab("graph")}
  className="btn-primary"
  style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", boxShadow: "0 4px 24px rgba(16, 185, 129, 0.3)" }}
>
  📊 View in Dashboard
</button>
                </div>
              </div>

              {/* Grid Section */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "56px" }}>
                
                {/* 1. Chain */}
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                    <span style={{ fontSize: "22px" }}>🔗</span>
                    <h2 className="section-title">Dependency Chain</h2>
                  </div>
                  <SkillGapChain
                    missingSkills={results.missingSkills || []}
                    knownSkills={results.knownSkills || []}
                  />
                </section>

                {/* 2. Graph */}
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                    <span style={{ fontSize: "22px" }}>🕸️</span>
                    <h2 className="section-title">Visual Map</h2>
                  </div>
                  <SkillMapGraph
                    missingSkills={results.missingSkills || []}
                    knownSkills={results.knownSkills || []}
                  />
                </section>

                {/* 3. Learning Plan */}
                <section>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "22px" }}>📅</span>
                      <h2 className="section-title" style={{ marginBottom: 0 }}>7-Day Learning Plan</h2>
                    </div>
                    <button
                      onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results.learningPlan, null, 2));
                        const a = document.createElement('a');
                        a.setAttribute("href", dataStr);
                        a.setAttribute("download", "learning_plan.json");
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                      className="btn-primary"
                      style={{
                        padding: "8px 16px", fontSize: "13px",
                        background: "rgba(139, 92, 246, 0.15)",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        color: "var(--color-primary-light)",
                        boxShadow: "none"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(139, 92, 246, 0.25)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)"}
                    >
                      ⬇️ Download JSON
                    </button>
                  </div>
                  <LearningPlan days={results.learningPlan || []} />
                </section>
              </div>

              <div style={{ textAlign: "center", marginTop: "80px", paddingTop: "48px", borderTop: "1px solid var(--border-subtle)" }}>
                <button
                  onClick={() => { setResults(null); setError(null); }}
                  style={{
                    background: "transparent", color: "var(--text-muted)",
                    border: "1px solid var(--border-subtle)", padding: "12px 32px",
                    borderRadius: "99px", cursor: "pointer", fontWeight: "600",
                    transition: "all 0.3s", fontFamily: "inherit", fontSize: "14px"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-accent)"; e.currentTarget.style.color = "var(--color-primary-light)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  🔄 Reset and Try Another Goal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
