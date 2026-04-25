import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const filePath = path.join(process.cwd(), "data", "skills.json");

export async function POST(req) {
  try {
    const payload = await req.json();
    const skill = payload.skill || payload; // Support both nested {skill, source} and flat payloads

    if (!skill?.id || !skill?.name) {
      return NextResponse.json({ error: "Invalid skill payload" }, { status: 400 });
    }

    // Read existing file
    const file = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(file);

    // 🔴 Robust Deduplication
    const normalize = (str) => (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const exists = data.skills.find(
      s => normalize(s.label) === normalize(skill.name)
    );

    if (exists) {
      return NextResponse.json({ success: true, deduped: true });
    }

    // Convert to schema
    const newSkill = {
      id: skill.id,
      label: skill.name,
      description: skill.description || "",
      needs: skill.needs || [],
      level: skill.level || 3,
      domain: payload.source || skill.domain || "external",
    };

    data.skills.push(newSkill);

    // Write back
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[save-skill]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}