import skillsData from "@/data/skills.json";

export function normalizeSkill(skill) {
  return {
    id: skill.id,
    name: skill.name || skill.label,
    label: skill.label || skill.name,
    description: skill.description || "",
    needs: skill.needs || [],
    needsLabels: skill.needsLabels || [],
    why: skill.why || "",
    level: skill.level || 3,
    source: skill.source || "unknown",
  };
}

// Build a lookup map: id → skill
const SKILL_MAP = Object.fromEntries(
  skillsData.skills.map((s) => [s.id, s])
);

/**
 * Fuzzy-match a plain text skill name to a skill id in the graph.
 * e.g. "react hooks" → "react_hooks"
 */
export function matchSkillId(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Exact match first
  if (SKILL_MAP[normalized]) return normalized;

  // Partial match — find any skill whose id or label contains the query
  const query = name.toLowerCase();
  const match = skillsData.skills.find(
    (s) =>
      s.label.toLowerCase().includes(query) ||
      query.includes(s.label.toLowerCase()) ||
      s.id.includes(normalized)
  );
  return match?.id || null;
}

/**
 * BFS from a set of target skill ids, collecting all prerequisite skill ids.
 * Returns only the ones NOT in knownIds.
 *
 * @param {string[]} targetIds  - skills the user wants to reach
 * @param {string[]} knownIds   - skills the user already has
 * @returns {{ missing: object[], path: string[] }}
 */
export function getPrereqs(targetIds, knownIds = []) {
  const knownSet = new Set(knownIds);
  const visited = new Set();
  const missing = [];
  const queue = [...targetIds];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const skill = SKILL_MAP[currentId];
    if (!skill) continue;

    // If not known, it's a gap
    if (!knownSet.has(currentId)) {
      missing.push(skill);
    }

    // Add its prerequisites to the queue
    for (const prereqId of skill.needs || []) {
      if (!visited.has(prereqId)) {
        queue.push(prereqId);
      }
    }
  }

  // Sort by level so order=1 is the deepest prerequisite
  missing.sort((a, b) => a.level - b.level);

  return {
    missing,
    // Full traversal path including known (useful for graph rendering)
    fullPath: [...visited].map((id) => SKILL_MAP[id]).filter(Boolean),
  };
}

export function getSkillById(id) {
  return SKILL_MAP[id] || null;
}

export function getAllSkills() {
  return skillsData.skills;
}

// Runtime-only additions (approved by user). 
// For permanent additions, write to skills.json manually.
const runtimeSkills = new Map();

export function addSkillToKG(skill) {
  if (!skill?.id || !skill?.name) return { success: false };

  // dedupe check
  const existingId = findExistingSkillIdByName(skill.name);
  if (existingId) {
    return { success: true, id: existingId, deduped: true };
  }

  const normalized = normalizeSkill(skill);

SKILL_MAP[normalized.id] = {
  id: normalized.id,
  label: normalized.name,
  description: normalized.description,
  needs: normalized.needs,
  domain: normalized.source,
  level: normalized.level,
};

  runtimeSkills.set(skill.id, SKILL_MAP[skill.id]);

  console.log("[APPROVED_SKILL]", JSON.stringify(skill, null, 2)); // persistence hook

  return { success: true, id: skill.id };
}
export function getRuntimeSkills() {
  return [...runtimeSkills.values()];
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findExistingSkillIdByName(name) {
  const norm = normalizeName(name);
  for (const skill of Object.values(SKILL_MAP)) {
    if (normalizeName(skill.label) === norm) {
      return skill.id;
    }
  }
  return null;
}

export function skillExistsByName(name) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  return Object.values(SKILL_MAP).some(s =>
    s.label.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized
  );
}

/**
 * Merges all skills from a learning path into the runtime KG.
 * Skips duplicates. Returns count of newly added skills.
 */
export function mergePathIntoKG(knownSkills = [], missingSkills = []) {
  let added = 0;

  const allSkills = [
    ...knownSkills.map(s => ({ ...s, type: "known" })),
    ...missingSkills.map(s => ({ ...s, type: "missing" })),
  ];

  for (const skill of allSkills) {
    if (!skill?.id || !skill?.name) continue;
    if (SKILL_MAP[skill.id] || skillExistsByName(skill.name)) continue;

    // Try to resolve needs to real KG ids by name-matching
    const resolvedNeeds = (skill.needs || []).map(needId => {
      // Already a valid KG id
      if (SKILL_MAP[needId]) return needId;
      // Try name match
      const matched = matchSkillId(needId.replace(/_/g, " "));
      return matched || needId;
    });

    // Also try to connect to KG by matching skill name to existing nodes
    const existingMatch = matchSkillId(skill.name);
    if (existingMatch) continue; // already exists under different id

    SKILL_MAP[skill.id] = {
      id: skill.id,
      label: skill.name,
      description: skill.why || skill.description || "",
      needs: resolvedNeeds,
      domain: "external",
      level: skill.level || 3,
    };

    runtimeSkills.set(skill.id, SKILL_MAP[skill.id]);
    added++;
  }

  return added;
}