"use client";

import React, { useState } from "react";
import { skillExistsByName } from "@/lib/skillGraph";

const SOURCE_STYLES = {
  esco: {
    color: "#22d3ee",
    bg: "rgba(6,182,212,0.1)",
    border: "rgba(6,182,212,0.25)",
    label: "ESCO",
  },
  wikidata: {
    color: "#fbbf24",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
    label: "Wikidata",
  },
  merged: {
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.25)",
    label: "Merged",
  },
  llm: {
    color: "#a78bfa",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.25)",
    label: "AI Generated",
  },
};

export default function PendingSkillsDialog({
  pendingSkills = [],
  onApprove,
  onClose,
}) {
  const [approved, setApproved] = useState(
    Object.fromEntries(pendingSkills.map((s) => [s.skill.id, true]))
  );

  if (pendingSkills.length === 0) return null;

  const toggle = (id) =>
    setApproved((prev) => ({ ...prev, [id]: !prev[id] }));

  const CONFIDENCE_LABEL = (c = 0.5) => {
    if (c >= 0.85) return "High confidence";
    if (c >= 0.6) return "Medium confidence";
    return "Low confidence";
  };

  const handleConfirm = () => {
    const toAdd = pendingSkills
      .filter((p) => approved[p.skill.id]);

    onApprove(toAdd);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "rgba(12,12,18,0.98)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* HEADER */}
        <div style={{ marginBottom: "24px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            🔍 New Skills Found
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            These skills were discovered from external sources. You can add
            them to your Knowledge Graph.
          </p>
        </div>

        {/* SKILL LIST */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "24px",
            maxHeight: "320px",
            overflowY: "auto",
          }}
        >
          {pendingSkills.map(({ source, skill }) => {
            const style = SOURCE_STYLES[source] || SOURCE_STYLES.llm;
            const isApproved = approved[skill.id];

            // ✅ FIXED: correct scope
            const isMissingFromKG = !skillExistsByName(skill.name);

            return (
              <div
                key={skill.id}
                onClick={() => toggle(skill.id)}
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  border: `1px solid ${
                    isApproved ? style.border : "var(--border-subtle)"
                  }`,
                  background: isApproved
                    ? style.bg
                    : "rgba(255,255,255,0.02)",
                  transition: "all 0.2s",
                  display: "flex",
                  gap: "14px",
                  alignItems: "flex-start",
                }}
              >
                {/* CHECKBOX */}
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "5px",
                    flexShrink: 0,
                    marginTop: "2px",
                    border: `2px solid ${
                      isApproved ? style.color : "var(--border-subtle)"
                    }`,
                    background: isApproved ? style.color : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isApproved && (
                    <span
                      style={{
                        color: "#000",
                        fontSize: "11px",
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>

                {/* CONTENT */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* TITLE ROW */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {skill.name}
                    </span>

                    {/* SOURCE BADGE */}
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "5px",
                        background: style.bg,
                        color: style.color,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {style.label}
                    </span>

                    {/* NEW NODE BADGE */}
                    {isMissingFromKG && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#34d399",
                        }}
                      >
                        New Node
                      </span>
                    )}

                    {/* CONFIDENCE */}
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        marginLeft: "auto",
                      }}
                    >
                      {CONFIDENCE_LABEL(skill.confidence)}
                    </span>
                  </div>

                  {/* DESCRIPTION */}
                  {skill.description && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {skill.description.slice(0, 120)}
                      {skill.description.length > 120 ? "…" : ""}
                    </p>
                  )}

                  {/* PREREQS */}
                  {skill.needsLabels?.length > 0 && (
                    <p
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "4px",
                      }}
                    >
                      Requires:{" "}
                      {skill.needsLabels.map((n) => n.name).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ACTIONS */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "10px 20px",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Skip for now
          </button>

          <button
            onClick={handleConfirm}
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary), #6366f1)",
              border: "none",
              borderRadius: "10px",
              padding: "10px 24px",
              cursor: "pointer",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 700,
              boxShadow: "0 4px 20px rgba(139,92,246,0.35)",
            }}
          >
            Add {Object.values(approved).filter(Boolean).length} Skills
          </button>
        </div>
      </div>
    </div>
  );
}