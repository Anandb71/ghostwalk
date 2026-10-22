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

## 22 Oct 10:05–10:20 — leaderboard (Junaid, #8)
- `ui/Leaderboard.tsx` + `ui/leaderboardModel.ts`. The model is pure (no React, no store) and has 22 Vitest cases. They cover validation of stored rows, ranking, the 50-entry cap, missing, blocked or full `localStorage`, and the export format.
- Decision: the leaderboard keeps its entries in its own module and **does not add a slice to `store.ts`**. The store is being rewritten in parallel for #5, and a separate module cannot conflict with it. The panel only reads the store.
- Decision: **Save is disabled unless the player's held-out score is fresh.** That means it arrived after the latest swap, it is for the current routing policy, and no scoring request is in flight. Otherwise a fast click after a swap could record the previous layout's km under the new layout.
- Decision: entries record their routing policy and a dataset fingerprint (month, order, line and split counts). Entries scored under S-shape, or on another `orders.json`, are hidden and counted rather than ranked against Exact scores.
- Decision: entry ids are a hash of layout + policy, recomputed on load, so saving the same layout again updates one row and a hand-edited id cannot create duplicates. Every stored assignment must be a permutation of 0–99, or the row is dropped.
- Decision: Export JSON carries the SKU list, the slot-id scheme, the commit hash and each full assignment, so a judge can re-score any exported layout with the same engine.
- Rejected: re-scoring the layout on the main thread when Save is clicked. It would make the saved number independent of the store, but it means a full held-out re-score on the UI thread during the demo. The worker already produces these scores.
- Bug found while testing in the browser: the helper module was first named `ui/leaderboard.ts`, next to `ui/Leaderboard.tsx`. On case-insensitive filesystems (Windows, macOS), `import Leaderboard from './Leaderboard'` resolved to the helper file, and Vite failed with "does not provide an export named 'default'". Linux (Vercel) would not have caught it. Renamed to `leaderboardModel.ts`.
- Tested by driving the real store with fake scores in a local, uncommitted harness page: save, stale swap (Save disables), policy switch (entries hidden and counted), Apply SA (the SA row is marked "on floor"), reload (entries and name persist), full storage (falls back to tab-only with a note), remove, export.

## 22 Oct 10:20–10:30 — README, architecture, generated docs (Junaid, #9)
- Rule: no number in the README is typed by hand. `scripts/sync-readme.ts` regenerates four marked blocks: **Results** (from `eval/results.md`), **Layout** (from `sim/layout.ts`), **Data** (from the `orders.json` meta) and **dependencies** (from `web/package.json`). `--check` exits 1 when the README is stale. Until `npm run eval` has run, the Results block says it is pending instead of showing placeholder numbers.
- The floor plan image (`docs/img/floorplan.svg`) is drawn by `scripts/floorplan.ts` from the engine's own geometry: slot cells with ids, the 66-node graph, the dock, and the dimensions. The declared layout in the README therefore cannot disagree with what the simulator walks.
- Both scripts are TypeScript run with `tsx` from `web/`, so they import `sim/layout.ts` directly rather than re-declaring constants.
- The architecture diagram started as a left-to-right Mermaid flowchart. Rendered at GitHub's width, its edges crossed and the subgraph titles were clipped. Switched to top-to-bottom: data, then eval, then browser. Both Mermaid diagrams in `docs/architecture.md` were render-checked with Mermaid 11 before committing.

## AI assistance
Claude Code (Anthropic) for research, design, and code generation, with multi-agent workflows for parallel module builds and review. Every module is reviewed and explained by the team.
- #8–#11 (Junaid): the leaderboard model, panel and tests, `scripts/sync-readme.ts`, `scripts/floorplan.ts`, the README, `docs/architecture.md` and the pitch material were drafted with Claude Code, then checked in the browser and against the spec before committing.
