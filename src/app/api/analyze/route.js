import { NextResponse } from "next/server";
import { resolveGapAnalysis } from "@/lib/resolveSkill";

const SYSTEM_PROMPT = `You are SkillMap, an expert learning coach.
You are given a goal and skill gap analysis already performed by a knowledge graph.
Your ONLY jobs are:
1. For each missing skill, write a 1-sentence "why" explaining its importance.
2. Generate a personalized day-by-day learning plan.
3. If the goal was NOT found in the knowledge graph, also identify 4-6 missing prerequisite skills.
Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(goal, knownLabels, missingLabels, timeAvailable, needsLLMGapDetection) {
  return `
Goal: "${goal}"
Known Skills: ${knownLabels.join(", ") || "none provided"}
${missingLabels.length > 0
    ? `Missing Skills (from knowledge graph, in learning order): ${missingLabels.join(", ")}`
    : `NOTE: Goal was not found in the knowledge graph. You must identify 4-6 missing prerequisite skills yourself.`
}
Time Available Per Day: "${timeAvailable}"

${needsLLMGapDetection ? `
Task 1: Identify 4-6 missing prerequisite skills ordered by dependency (order=1 is deepest).
` : ""}
Task ${needsLLMGapDetection ? 2 : 1}: For each missing skill, write a 1-sentence "why".
Task ${needsLLMGapDetection ? 3 : 2}: Generate a 7-day learning plan:
- Days 1-2: Review known skills as foundation.
- Days 3-7: Cover missing skills in order.
- Calibrate ALL tasks to "${timeAvailable}" per day.
- SHORT (≤30min): one micro-task. MEDIUM (1-2hr): 2-3 steps. LONG (3+hr): build something.
- Each task states its duration. Resources must be specific and free.

IMPORTANT: Multiple entries per day are allowed if time permits, but each entry must have a unique day+task combo.

Return ONLY:
{
  "missingSkills": [{ "id": "...", "name": "...", "why": "...", "order": 1 }],
  "knownSkills": [{ "id": "...", "name": "..." }],
  "learningPlan": [{ "day": 1, "skill": "...", "task": "...", "why": "...", "resource": "..." }],
  "summary": "..."
}`;
}

export async function POST(request) {
  try {
    const { goal, knownSkills, timeAvailable } = await request.json();

    if (!goal || !knownSkills || !timeAvailable) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const knownSkillNames = knownSkills.split(",").map(s => s.trim()).filter(Boolean);

    // ── Run the KG → ESCO → Wikidata pipeline ────────────────────
    const { missingFromKG, knownResolved, pendingSkills, needsLLM } =
      await resolveGapAnalysis(goal, knownSkillNames);

    const knownLabels = knownResolved.map(s => s.name);
    const missingLabels = missingFromKG.map(s => s.name);

    // ── Call LLM ─────────────────────────────────────────────────
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OpenRouter API Key not configured" }, { status: 500 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "SkillGraph",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(goal, knownLabels, missingLabels, timeAvailable, needsLLM) },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `OpenRouter Error ${response.status}`);

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from AI");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim());
    }

    // ── Merge KG structure with LLM enrichment ───────────────────
    if (missingFromKG.length > 0) {
      const aiWhyMap = Object.fromEntries(
        (parsed.missingSkills || []).map(s => [s.name?.toLowerCase(), s.why])
      );
      parsed.missingSkills = missingFromKG.map(s => ({
        ...s,
        why: aiWhyMap[s.name.toLowerCase()] || `Required prerequisite for ${goal}.`,
      }));
    }

    if (knownResolved.length > 0) {
      parsed.knownSkills = knownResolved;
    }

    // ── Attach source provenance + pending approvals ──────────────
    parsed.provenance = {
      missingSource: missingFromKG.length > 0 ? "kg" : "llm",
      knownSource: knownResolved.map(s => ({ id: s.id, source: s.source })),
    };
    parsed.pendingSkills = pendingSkills || []; // skills awaiting user approval

    // Add LLM-generated missing skills to pending approvals
    if (parsed.provenance.missingSource === "llm") {
      const llmPending = (parsed.missingSkills || []).map(s => {
        if (!s.id) {
          s.id = `llm_${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        }
        return {
          source: "llm",
          isMissing: true,
          skill: {
            id: s.id,
            name: s.name,
            description: s.why || "Suggested by AI learning path.",
            confidence: 0.5,
            level: 2,
          }
        };
      });
      parsed.pendingSkills = [...parsed.pendingSkills, ...llmPending];
    }

    if (!parsed.missingSkills || !parsed.learningPlan) {
      throw new Error("Invalid AI response structure");
    }
    console.log("📦 FINAL RESPONSE:", parsed);
console.log("📌 PENDING SKILLS SENT TO UI:", parsed.pendingSkills);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[/api/analyze] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}