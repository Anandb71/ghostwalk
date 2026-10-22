# DEV_LOG — Ghostwalk

Decisions, AI assistance, experiments and rejected approaches, in time order (IST).

## 21 Oct, after the 18:00 kickoff — research and choosing a problem
- Read the 12 problem statements and the rules. Ran a multi-agent tournament with Claude Code: 4 scouts (data feasibility, wow factor, technical depth, judge mindset), 8 idea generators with different lenses, adversarial critics and judges. Outputs are in `docs/tournament/`.
- 7 of the 8 idea generators picked **PS 4.2 (Warehouse Digital Twin)**. The data scout ranked it first because the data is public, it deploys as a static site, and it needs no model training or API keys.
- Rejected: PS 4.3 (live VRPTW re-planning). It needs a backend and is harder to demo reliably in 5 minutes.

## 22 Oct 09:00–09:45 — data pipeline and spec
- `data/prepare.py`: UCI Online Retail II, November 2011. Removed cancellations, lines with quantity or price ≤ 0, and non-product codes. Kept the top 100 SKUs by order lines. Train = 1–15 Nov, held-out = 16–30 Nov.
- Critic fixes adopted before building: the headline KPI is the held-out gain **vs Baseline** (not vs a strawman original); the optimiser budget is in iterations (reproducible on any machine); Held–Karp is exact only up to 12 stops and the heuristic share is reported; no DragControls (click-click swap instead).

## 22 Oct ~10:00 — build start
- Work split in GitHub issues #1–#12 (Anand ~70%, Junaid ~30%).
- Scaffold: Vite + React 19 + TypeScript + React Three Fiber + zustand + Tailwind. The shared contracts (`sim/types.ts`, `sim/layout.ts` geometry, `worker/protocol.ts`, `store.ts`) were written first, so the engine, scene and UI can be built in parallel without drifting apart.

## AI assistance
Claude Code (Anthropic) for research, design, and code generation, with multi-agent workflows for parallel module builds and review. Every module is reviewed and explained by the team.
