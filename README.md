# Demo Video
https://drive.google.com/file/d/1dwPYtgQef52IZDbhhzuk2RodQ2AgytNQ/view?usp=sharing

# 🧭 SkillGraph — AI-Powered Personal Skill Gap Navigator

> *Tell us where you want to go. We'll map out exactly how to get there.*

SkillGraph is a full-stack Next.js application that combines a hand-curated **knowledge graph** of skills, live data from **ESCO** and **Wikidata**, and **Gemini AI** to give you a precise, dependency-aware learning path — from where you are now to where you want to be.

Built for a hackathon. Designed like a product.

---

## ✨ What it does

You tell SkillGraph two things: **your goal** (e.g. *"Character Design"*, *"Machine Learning"*) and **what you already know** (e.g. *"I know basic HTML and some Photoshop"*).

It then:

1. **Resolves your skills** against a curated knowledge graph, ESCO (the EU's official occupational skills taxonomy), and Wikidata via SPARQL.
2. **Identifies the exact gap** — the prerequisite skills you're missing, in topological order.
3. **Calls Gemini 2.0 Flash** via OpenRouter to enrich the analysis with explanations and a calibrated day-by-day learning plan.
4. **Visualises everything** as an interactive force-directed graph you can explore in 2D or 3D.
5. **Lets you approve** newly discovered skills to permanently expand the knowledge graph.

---

## 🖥️ The Two Tabs

### 📊 Dashboard (Knowledge Graph)
A full-screen, physics-simulated graph of every skill in the system. Supports:
- **2D and 3D** rendering (toggle live)
- **Search** with autocomplete to zoom to any node
- **Saved Paths sidebar** — every analysis you've run is saved and can be re-highlighted on the graph, colour-coding known (green) vs. missing (red) skills
- **Hover previews** showing level, domain, and connection count

### ⚡ Gap Analyzer
The AI-powered analysis flow:
1. Fill in your goal, what you know, and your daily time budget
2. Hit **Generate My Skill Map**
3. Get back:
   - A written **summary** of your position
   - A **Dependency Chain** — clickable cards showing the ordered missing skills
   - A **Visual Map** — force graph of your personal skill landscape
   - A **7-Day Learning Plan** — day-grouped cards with tasks, rationale, and specific free resources

---

## 🏗️ Architecture

```
src/
├── app/
│   ├── page.js              # Root page — tab switching, state, persistence
│   ├── layout.js            # Metadata, Inter font, SEO
│   ├── globals.css          # Full design system (tokens, animations, components)
│   └── api/
│       ├── analyze/         # POST: runs KG+ESCO+Wikidata pipeline, calls Gemini
│       └── save-skill/      # POST: persists approved skills to skills.json
│
├── components/
│   ├── Graph.jsx            # Dashboard — 2D/3D force graph, sidebar, search
│   ├── SkillMapInput.jsx    # Gap Analyzer form with example pills
│   ├── SkillGapChain.jsx    # Horizontal dependency chain with detail panel
│   ├── SkillMapGraph.jsx    # Force graph scoped to one analysis result
│   ├── LearningPlan.jsx     # Day-grouped learning plan with expandable cards
│   ├── PendingSkillsDialog.js # Modal to approve/reject newly discovered skills
│   └── NodeDialog.jsx       # Node detail overlay in the dashboard
│
└── lib/
    ├── skillGraph.js        # Core KG: load skills.json, BFS prereq traversal,
    │                        #   fuzzy matching, runtime skill additions
    ├── skillGraphStore.js   # Reactive store that emits on KG mutations
    ├── resolveSkill.js      # Multi-source resolution pipeline (KG → ESCO → Wikidata → LLM)
    ├── escoClient.js        # ESCO REST API client (search + concept detail)
    ├── wikidataClient.js    # Wikidata SPARQL client (P2283 "uses", P527 "has part")
    ├── graphUtils.js        # Extract/diff graph nodes from API results
    ├── skillStore.js        # localStorage CRUD for the user's personal skill list
    └── pathStore.js         # localStorage persistence for saved analysis paths
```

---

## 🔬 How the Skill Resolution Pipeline Works

When you submit a goal, the `POST /api/analyze` route runs a multi-stage pipeline:

```
User input
    │
    ▼
resolveGapAnalysis(goal, knownSkills)
    │
    ├─→ matchSkillId()         ← fuzzy-match against skills.json (KG hit = confidence 1.0)
    │
    ├─→ searchEsco()           ← ESCO REST API: preferredLabel, broaderRelation as prereqs
    │
    ├─→ searchWikidata()       ← SPARQL: wdt:P2283 (uses) + wdt:P527 (has part)
    │
    └─→ mergeSkills()          ← dedupe + combine needs[] from both sources
            │
            ▼
    Gemini 2.0 Flash (via OpenRouter)
            │
            ├─ If KG hit:  enrich with "why" explanations + build learning plan
            └─ If LLM gap: identify missing skills + explain + build learning plan
```

**Confidence levels:**
- KG match → `1.0`
- ESCO + Wikidata merged → `0.95`
- ESCO only → `0.9`
- Wikidata only → `0.7`
- LLM fallback → `0.4` (flagged for user approval)

Newly discovered skills are held in a **pending queue** and surfaced in a modal so the user can selectively approve them into the knowledge graph. Approved skills are written to `skills.json` via `POST /api/save-skill` and also injected into the runtime `SKILL_MAP` immediately.

---

## 🗂️ The Knowledge Graph (`skills.json`)

A hand-curated JSON graph of ~60+ skills across two domains:

| Domain | Includes |
|--------|----------|
| `webdev` | HTML/CSS, JS, React, Node.js, databases, APIs, deployment |
| `art` | Drawing fundamentals, colour theory, digital painting, character design, animation |

Each skill node:
```json
{
  "id": "react",
  "label": "React",
  "needs": ["javascript", "dom_manipulation"],
  "level": 3,
  "domain": "webdev"
}
```

`needs[]` encodes prerequisite relationships. BFS over this graph produces the full dependency chain from any target skill.

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | JavaScript (ES2022) |
| Styling | Tailwind CSS v4 + Vanilla CSS design system |
| Graph rendering | `react-force-graph-2d` + `react-force-graph-3d` (Three.js) |
| AI | Gemini 2.0 Flash via OpenRouter |
| External data | ESCO REST API, Wikidata SPARQL endpoint |
| Persistence | `localStorage` (client), `skills.json` (server) |
| Font | Inter (Google Fonts via `next/font`) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key

### Installation

```bash
git clone <repo-url>
cd Hackathon
npm install
```

### Environment

Create a `.env.local` file:

```env
OPENROUTER_API_KEY=your_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📁 Other Files

| File | Purpose |
|------|---------|
| `researchsources.md` | Research notes on Wikidata, SPARQL, knowledge graphs, and the original pipeline design |
| `SPARQL.md` | Quick SPARQL syntax reference used during development |
| `scratch/` | Exploratory scripts for listing OpenRouter models and testing API connections |

---

## 🤔 Design Decisions

**Why a static `skills.json` KG instead of a database?**  
Speed of iteration. The graph can be extended at runtime (approved skills are written back) and a proper graph DB (Neo4j was prototyped) can slot in later.

**Why OpenRouter instead of direct Gemini API?**  
OpenRouter provides a unified interface and easy model switching. The system prompt is model-agnostic.

**Why ESCO + Wikidata?**  
ESCO is the authoritative EU taxonomy for professional skills with well-defined hierarchies. Wikidata fills gaps for more technical or creative topics that ESCO doesn't cover well. Merging both increases coverage and prerequisite richness.

**Why `localStorage` for persistence?**  
Zero-config, zero-backend for the demo. Paths and skill store survive page reloads without a database.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
