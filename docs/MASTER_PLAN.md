# Ghostwalk — Master Plan (NexAI Hack 2026)

**Problem chosen:** PS 4.2 · Warehouse Digital Twin: 3D Picking Floor Game (Track 4 · Warehousing / Digital Twin · ★★)
**Project name:** Ghostwalk — *race your old warehouse*
**Deadline:** submission 15:00 IST, 22 Oct 2026 · demo 5 min + Q&A 3 min
**Deploy target:** static Vite site on Vercel (zero backend, zero API keys, zero cold start)

---

## 1. The idea in one paragraph

A browser-native 3D digital twin of a picking floor, driven by one real month (November 2011) of UCI Online Retail II orders. An animated picker walks the aisles to each product's slot and back for every real invoice, with live distance and time counters. The player re-slots cartons (click–click swap in 3D or on a 2D slot map) and the twin replays the *same* orders to score the layout. The signature visual is the **ghost race**: a translucent ghost picker walks the old layout while a solid picker walks the new one, on identical orders, with diverging counters. An automatic baseline (fast movers nearest the dock) must be beaten, and a **simulated-annealing optimiser** is the AI opponent that anneals the layout live in 3D. Every number on screen comes from one deterministic headless simulator and is reported on a chronological **held-out** half of the month, so the improvement is measured, not claimed.

## 2. Why this problem and this concept (tournament summary)

A 32-agent tournament ran on 21–22 Oct: 4 research scouts (data feasibility, wow-factor, technical depth, judge mindset), 8 innovators with different lenses, adversarial critics per idea, judges. Full outputs are in `docs/tournament/`.

- **7 of 8 innovators independently chose PS 4.2** (explorable, game-designer, researcher, viz-artist, founder, pragmatist, fusion). Only the contrarian picked 4.3.
- **Data feasibility scout ranked 4.2 #1 of 12**: data verified and downloadable, no sign-ups, pure static deploy, no model training, no LLM keys, no cold starts; the only risks are engineering polish and laptop GPU load (controllable with instancing and a Web Worker).
- **Wow-factor**: a 3D twin with a ghost race and a live annealer is the most cinematic demo in the set, and every frame is driven by real data and the real algorithm.
- **Technical depth**: exact Held–Karp routing on an aisle graph, a bilevel optimisation (annealing whose inner objective is an exact DP) with incremental delta evaluation, classical baselines an OR judge recognises (COI/ABC slotting, S-shape routing), honest in-sample vs held-out reporting.
- **Judge mindset**: judges will probe "is the 3D really driven by the order data?", "show me the held-out split", "what is your gain over the baseline the statement told you to beat?" — the design answers each one on screen.

### Critic fixes adopted (from the adversarial critiques)
1. **Headline KPI = held-out gain vs Baseline**, not vs Original (a random/catalogue "original" makes any gain look huge; judges will call it a strawman).
2. **Original = catalogue order** (StockCode order, aisle by aisle) plus a **Random seed-42** reference row, so no one can allege a convenient convention.
3. **Race labelled layouts**: ghost is always the layout the session started from, labelled on screen; demo races Original→Baseline (big gap) then Baseline→You/SA (the part the statement asked us to beat).
4. **SA budget in iterations, not seconds** → identical results on any machine for the same seed (rules: fabricated / irreproducible results = disqualification review).
5. **Routing honesty**: exact for ≤ 12 stops, NN+2-opt above, counts and share of metres printed in the Evidence panel.
6. **No DragControls** (drei cannot drag InstancedMesh instances); click-select then click-target swap in 3D and in a 2D SVG slot map.
7. **Labels only for hovered/selected + top-10** (100 troika labels would blow the draw-call budget); Bloom only in an opt-in High quality tier.
8. **Nothing numeric typed by hand**: `npm run eval` writes `eval/results.md`; README/deck numbers are pasted from it.
9. Measured expectations (critic re-ran the pipeline with Held–Karp on a 6×2×10 geometry): Random→ABC baseline ≈ −14 %, annealing a further ≈ −3 to −5 % on held-out. Pitch sells "every percent is measured on held-out orders", not a made-up −30 %.

## 3. Data (done)

- Source: Chen, D. (2019). *Online Retail II* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D · CC BY 4.0.
- `data/prepare.py` → `web/public/data/orders.json` (582 KB): **100 products, 2,362 orders, 17,056 order lines**, November 2011, sheet "Year 2010-2011".
- Cleaning rules: drop invoices starting with "C" (cancellations); drop Quantity ≤ 0 and Price ≤ 0; keep only StockCodes matching `^\d{5}[A-Z]{0,2}$` (removes POST, D, M, BANK CHARGES, DOT, S, AMAZONFEE, CRUK, ADJUST, gift codes); one pick per (invoice, product); top-100 SKUs by number of order lines; orders restricted to those SKUs.
- Split: orders dated 1–15 Nov = **train** (player, heatmap, optimiser see them); 16–30 Nov = **holdout** (scoring only). Exact counts are in `orders.json → meta.split`.

## 4. Architecture

```
data/prepare.py (Python, offline)  →  web/public/data/orders.json
web/src/sim/      pure TypeScript engine: layout graph (66 nodes, Dijkstra all-pairs), Held–Karp exact routing,
                  NN+2-opt, S-shape ablation, simulate(), catalogue/random/baseline layouts, simulated annealing
web/src/worker/   Web Worker running the engine (score / anneal / progress) so the main thread stays at 60 fps
web/src/scene/    React Three Fiber: instanced racks + cartons, heat floor, picker + ghost, self-drawing route, camera rig
web/src/ui/       HUD, KPI card, order card, 2D slot map, race, anneal curve, evidence, leaderboard   (zustand store)
eval/run.ts       Node (tsx) runs the SAME engine → eval/results.md + web/public/layouts/sa_seed42.json
```
Full implementation contract: `docs/BUILD_SPEC.md`.

## 5. Must-haves → features
| Must-have (PS 4.2) | Feature |
|---|---|
| Pre-processing to JSON (top ~100 products, pick frequency, orders) | `data/prepare.py` ✅ |
| 3D grid warehouse (racks, aisles, dock, animated picker) replaying orders along aisles with live distance/time counters | `scene/` Replay mode |
| Game mode: swap products, replay the same orders, before/after distance & time, automatic baseline (fast movers nearest dock) | Slot mode + Race + Baseline button + KPI card |

Stretch (in priority order): SA optimiser opponent with live curve · rack-visit heatmap · leaderboard · batch picking · two pickers with congestion.

## 6. Timeline (22 Oct, IST)
- 09:00–09:45 data pipeline, spec, repo ✅
- 09:45–11:45 three parallel engineer agents (engine / scene / UI) + integrator
- 11:45–12:45 QA in the browser, performance, fixes; `npm run eval`
- 12:45–13:45 Vercel deploy, README (architecture diagram, stack, setup, licence, team), DEV_LOG, pitch deck (PowerPoint), demo recording, LinkedIn + X posts (#NEXAI2026)
- 13:45–15:00 rehearsal of the 5-minute script, Q&A cards, buffer

## 7. Submission checklist
- [ ] Public GitHub repo (currently private; flip to public before submission) with hourly commits
- [ ] Live URL on Vercel
- [ ] README: problem + solution, architecture diagram, stack, setup/run, deploy URL, dataset attribution + licence, team, link to DEV_LOG.md, declared AI tools
- [ ] `.env.example` (no secrets needed; documented)
- [ ] DEV_LOG.md (decisions, AI assistance, experiments, rejected approaches)
- [ ] Demo recording ≤ 5 min · pitch deck (.pptx) · optional ≤ 3 min YouTube overview
- [ ] LinkedIn + X posts with screenshot/clip, repo URL, deploy URL, #NEXAI2026, teammates tagged
- [ ] Every team member can explain every module (Q&A cards in `docs/pitch/`)

## 8. Team
- Anand (GitHub: Anandb71)
- Junaid Ahamed (GitHub: junaidahamed-7777)

## 9. Declared tools
Claude (Claude Code, multi-agent workflows) for research, design and code generation; pandas; Vite, React, TypeScript, three.js / React Three Fiber, drei, zustand, Tailwind; Vercel.
