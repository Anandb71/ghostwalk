# Ghostwalk: race your old warehouse

**NexAI Hack 2026 · Problem 4.2 · Warehouse Digital Twin: 3D Picking Floor Game**

Ghostwalk is a 3D digital twin of a picking floor that runs in the browser. It replays one real month of orders from UCI Online Retail II (November 2011). You re-slot the cartons, then race a translucent **ghost picker on your old layout** against a solid picker on the new one, over exactly the same orders. To win, you must beat the fast-movers baseline, then a simulated-annealing optimiser. Every number on screen comes from one deterministic simulator and is measured on a **held-out** second half of the month.

| | |
|---|---|
| **Live app** | _pending the Vercel deploy (tracked in #7)_ |
| **Video overview** | _pending (≤ 3 min, tracked in #11)_ |
| **Dev log** | [DEV_LOG.md](DEV_LOG.md): decisions, AI assistance, experiments, rejected approaches |
| **Build spec** | [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md) · [docs/architecture.md](docs/architecture.md) · [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) |

No backend, no API keys, no cold start: the app is a static Vite site. All scoring runs in a Web Worker on your machine.

---

## The problem

Pickers can spend more time walking between shelves than picking. Where each product sits (its *slot*) decides how far they walk. PS 4.2 asks for a browser 3D twin of a picking floor, driven by real orders, that turns slotting into a game. The player re-arranges products, and the twin replays the same orders to show how much walking the new layout saves. In the problem statement's words, the improvement must be *measured, not claimed*.

## What Ghostwalk does

| Mode | What you see |
|---|---|
| **Replay** | An order from the month plays back in 3D. The picker leaves the dock, walks the aisles (never through racks) to each slot, pauses for each pick, and returns. Distance and time counters tick as it goes. You can flip the routing between **Exact** (optimal tour) and **S-shape** (what a human picker typically walks). |
| **Slot** | Click a carton, then another, to swap them, in 3D or on the 2D slot map. The KPI card re-scores your layout on the train *and* held-out orders. **Baseline** puts the fast movers nearest the dock. Undo, and start from Original, Baseline or the SA layout. |
| **Race** | The ghost (the layout you started from) and the solid picker (your current layout) walk the same held-out orders side by side. Both are labelled on screen, each with its own counters. |
| **Anneal** | The simulated-annealing opponent runs live in the worker from Baseline: cartons fly as swaps are accepted, and the convergence curve draws itself over the shipped 30,000-iteration run. |
| **Evidence** | Data cleaning counts, the held-out table, exact vs heuristic routing share, the policy ablation, ms per re-score, seed and commit hash, assumptions and limitations. |
| **Heatmap / Leaderboard** | Floor tiles show rack visits. The leaderboard saves your layouts with held-out km, Δ vs Baseline, provenance and commit, and exports them to JSON. |

### PS 4.2 requirements

| Requirement | Where |
|---|---|
| Must 1: turn one month of order lines into JSON (top ~100 products, pick counts, orders) | [`data/prepare.py`](data/prepare.py) → `web/public/data/orders.json` |
| Must 2: 3D grid warehouse (racks, aisles, dock, animated picker) replaying orders along aisles, with live distance and time counters | `web/src/scene/` + replay HUD in `web/src/ui/` |
| Must 3: swap products, replay the same orders, before/after distance and pick time, automatic fast-movers baseline | Slot mode, KPI card, Race, Baseline button |
| Stretch: heatmap of rack visits | `web/src/scene/HeatTiles.tsx` |
| Stretch: leaderboard of player layouts | [`web/src/ui/Leaderboard.tsx`](web/src/ui/Leaderboard.tsx) |
| Extra: optimiser opponent (simulated annealing) | `web/src/sim/slotting.ts` |
| Stretch, not built: batch picking, several pickers with congestion | cut, see [BUILD_SPEC §10](docs/BUILD_SPEC.md) |

## How scoring stays honest

- **Held-out split.** Orders from 1–15 Nov 2011 are **train**: the player, the heatmap and the optimiser see them. Orders from 16–30 Nov are **held-out** and are used only for scoring. The headline KPI is the **held-out gain vs Baseline**. The gain vs Original is shown second and labelled as such.
- **References that are hard to game.** *Original* is catalogue order (SKUs in StockCode order, aisle by aisle: what a warehouse does when nobody slots). *Random (seed 42)* is a second reference row, so no gain depends on a convenient convention. *Baseline* (fast movers nearest the dock, ranked by **train** picks) is the layout to beat.
- **Exact routing, with its limits stated.** Every tour runs on the aisle graph. Orders with ≤ 11 distinct bay stops (12 nodes including the dock) are routed exactly with Held–Karp dynamic programming. Larger orders use nearest-neighbour + 2-opt and are flagged. The Evidence panel prints how many orders, and what share of the metres, were routed exactly.
- **Deterministic.** The simulator never calls `Math.random` or `Date.now`. The PRNG is mulberry32 with the seed shown in the UI. The annealing budget is counted in **iterations, not seconds**, so the same seed gives the same layout on any machine.
- **One simulator everywhere.** The worker, the 3D playback and `npm run eval` all import the same `web/src/sim/`. The animation only plays back paths the simulator produced. The README and the deck quote `eval/results.md` and never retype a number.

## Results

<!-- sync:results -->
> **Pending:** `eval/results.md` does not exist yet. Run `npm run eval` in `web/`, then
> `npx tsx ../scripts/sync-readme.ts`. No result number in this README is typed by hand.
<!-- /sync:results -->

## Architecture

```mermaid
flowchart TB
  XLSX[("UCI Online Retail II<br/>online_retail_II.xlsx")] -->|"offline · Python + pandas"| PREP["data/prepare.py<br/>clean · top 100 SKUs · train / held-out split"]
  PREP --> JSON[("web/public/data/orders.json")]

  subgraph browser["Browser · static site"]
    direction TB
    STORE["store.ts · zustand"]
    subgraph worker["Web Worker"]
      SW["worker/sim.worker.ts"] --> ENG["sim/ engine<br/>aisle graph · Held–Karp · NN + 2-opt · S-shape<br/>simulate · layouts · simulated annealing"]
    end
    STORE <-->|"SCORE · ANNEAL · PROGRESS<br/>worker/protocol.ts"| SW
    STORE --> SCENE["scene/ · React Three Fiber<br/>racks · cartons · picker + ghost · route · heat"]
    STORE --> UI["ui/<br/>KPI · slot map · race · anneal curve<br/>evidence · leaderboard"]
  end

  subgraph node["Node · npm run eval"]
    direction TB
    EVAL["eval/run.ts"] --> ENG2["same sim/ engine"]
    ENG2 --> RES[("eval/results.md<br/>results.json")]
    ENG2 --> SAJ[("web/public/layouts/<br/>sa_seed42.json")]
  end

  JSON --> STORE
  JSON --> EVAL
  SAJ -->|"shipped SA layout"| STORE
  RES -->|"scripts/sync-readme.ts"| DOCS["README · pitch deck"]
```

- **`data/prepare.py`** (offline, Python + pandas): cleans the workbook and writes `orders.json`.
- **`web/src/sim/`** (pure TypeScript, no DOM or React): the warehouse graph, routing, `simulate()`, the layouts and the annealer.
- **`web/src/worker/`**: runs the engine off the main thread so the 3D scene stays at 60 fps.
- **`web/src/scene/`**: React Three Fiber. Instanced racks and cartons (≤ 60 draw calls), the picker and ghost rigs, and the self-drawing route.
- **`web/src/ui/` + `store.ts`**: the panels, HUD and app state.
- **`eval/run.ts`**: the same engine headless in Node. It writes `eval/results.md` and the shipped SA layout.

More detail, including the worker protocol and the data contract, is in [docs/architecture.md](docs/architecture.md).

## Warehouse layout (declared)

The problem statement leaves the warehouse layout to the team. Ours is declared here, and its single source of truth is [`web/src/sim/layout.ts`](web/src/sim/layout.ts). Both the diagram ([`scripts/floorplan.ts`](scripts/floorplan.ts)) and the table ([`scripts/sync-readme.ts`](scripts/sync-readme.ts)) are generated from that file, so they always match what the simulator walks.

![Floor plan: 5 aisles, 100 slots, three cross-aisles, dock at the front-left](docs/img/floorplan.svg)

<!-- sync:layout -->
| | |
|---|---|
| Pick zone | 5 aisles × 2 rack sides × 10 bays = **100 slots**, one SKU per slot |
| Cross-aisles | 3 (front, middle, back), 4.0 m wide; the middle one splits each aisle into two blocks of 5 bays |
| Dimensions | aisle pitch 5.0 m · walkway 3.0 m · rack depth 1.0 m · bay pitch 1.2 m · rack height 2.4 m |
| Dock (packing station) | on the front cross-aisle, 4.0 m before aisle 0; every tour starts and ends here |
| Walking | 1.2 m/s, only along the 66-node, 73-edge aisle graph (never through racks); both rack sides of a bay share one node |
| Picking | 8 s per order line |
| Time model | seconds = metres / 1.2 + 8 × lines (synthetic, not observed) |
| Slot id | `aisle × 20 + side × 10 + bay` (side 0 = left / −x, side 1 = right / +x) |
<!-- /sync:layout -->

## Data

**Chen, D. (2019). *Online Retail II* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** The data is real transactions of a UK-based online gift retailer. The month is November 2011 (sheet "Year 2010-2011"). Cleaning rules and the download link are in [data/README.md](data/README.md).

<!-- sync:data -->
| | |
|---|---|
| Source | UCI Online Retail II (Chen, 2019), sheet 'Year 2010-2011' · https://doi.org/10.24432/C5CG6D · CC BY 4.0 |
| Raw rows in the sheet (Dec 2010 – Dec 2011) | 541,910 |
| Dropped: cancelled invoices (`C…`) | 9,288 |
| Dropped: quantity ≤ 0 | 1,336 |
| Dropped: price ≤ 0 | 1,181 |
| Dropped: non-product codes | 2,380 |
| Order lines in 2011-11, all SKUs | 80,378 lines · 2,751 orders · 2,889 SKUs |
| SKUs slotted in the pick zone (top by order lines) | 100 |
| Share of the month’s lines those SKUs cover | 21.2 % |
| Orders replayed (≥ 1 line in the pick zone) | 2,362 |
| Order lines replayed | 17,056 |
| Lines per order (mean · median · max) | 7.22 · 5 · 77 |
| Train orders (player, heatmap and optimiser see these) | 1,130 |
| Held-out orders (scoring only) | 1,232 |
| Split rule | orders dated before 2011-11-16 are train; on/after are holdout |
<!-- /sync:data -->

## Tech stack and declared tools

- **Front end:** React 19, TypeScript (strict), Vite 8, three.js via React Three Fiber and drei, zustand, Tailwind CSS 4, motion. All scoring runs in a Web Worker.
- **Engine and evaluation:** plain TypeScript (`web/src/sim/`), run in the browser worker and in Node through `tsx`. Tests use Vitest.
- **Data:** Python 3 with pandas and openpyxl (to read the Excel workbook).
- **Hosting:** Vercel, static output (`vercel.json`). No server, no database, no secrets. [`.env.example`](.env.example) documents the single optional build variable.
- **AI tools (declared per rule §3):** [Claude Code](https://claude.com/claude-code) by Anthropic. We used it to research and choose the problem (a multi-agent tournament, outputs in [`docs/tournament/`](docs/tournament/)), to write the build spec, to generate and review code, and to draft documentation. Every module was reviewed by the team, and both of us can explain all of it. [DEV_LOG.md](DEV_LOG.md) records where AI was used.

Web dependencies, read from `web/package.json`:

<!-- sync:stack -->
| Package | Version | Used for |
|---|---|---|
| `@react-three/drei` | ^10.7.9 | camera controls, lines, labels |
| `@react-three/fiber` | ^9.8.2 | React renderer for three.js |
| `@react-three/postprocessing` | ^3.2.2 | optional bloom (High quality only) |
| `motion` | ^14.5.0 | counter / panel animation |
| `react` | ^19.3.1 | UI |
| `react-dom` | ^19.3.1 | UI |
| `three` | ^0.186.1 | 3D engine |
| `zustand` | ^5.0.15 | app state |
| **dev** | | |
| `@tailwindcss/vite` | ^4.3.3 | Tailwind Vite plugin |
| `@types/node` | ^26.6.5 | types |
| `@types/react` | ^19.3.0 | types |
| `@types/react-dom` | ^19.3.0 | types |
| `@types/three` | ^0.186.0 | types |
| `@vitejs/plugin-react` | ^6.1.2 | React fast refresh |
| `tailwindcss` | ^4.3.3 | styling |
| `tsx` | ^4.23.15 | runs eval/run.ts and these scripts in Node with the same engine |
| `typescript` | ~5.9.3 | strict types |
| `vite` | ^8.3.5 | dev server and bundler |
| `vitest` | ^5.0.5 | unit tests |
<!-- /sync:stack -->

## Setup and run

Requirements: Node.js 20.19+ or 22.12+ (Vite 8) and npm. Python 3.10+ is needed only to rebuild the data.

```bash
cd web
npm ci            # install exact dependency versions
npm run dev       # http://localhost:5173
```

Checks and evaluation, all from `web/`:

```bash
npm run typecheck # tsc, strict
npm run test      # vitest: routing exactness, graph-only paths, determinism, baseline, leaderboard
npm run build     # production build into web/dist
npm run eval      # same engine in Node -> eval/results.md, eval/results.json, web/public/layouts/sa_seed42.json
```

After `npm run eval`, copy the fresh numbers into this README and redraw the floor plan (also from `web/`):

```bash
npx tsx ../scripts/sync-readme.ts          # rewrites the Results, Layout, Data and dependency blocks
npx tsx ../scripts/sync-readme.ts --check  # exits 1 if the README is stale
npx tsx ../scripts/floorplan.ts            # regenerates docs/img/floorplan.svg from sim/layout.ts
```

To rebuild `orders.json` from the raw workbook (44 MB download, link in [data/README.md](data/README.md)):

```bash
pip install pandas openpyxl
python data/prepare.py path/to/online_retail_II.xlsx web/public/data/orders.json --month 2011-11 --top 100
```

## Deployment

The repo root has a `vercel.json`: Vercel installs with `cd web && npm ci`, builds with `npm run build` and serves `web/dist`. The build stamps the commit hash (from `VERCEL_GIT_COMMIT_SHA`) into the Evidence panel. Live URL: _pending the deploy (#7)_.

## Limitations

- **The warehouse is declared, not observed.** The geometry, walking speed and pick time above are our assumptions. The orders are real; the building is not.
- **The time model is synthetic:** metres / 1.2 m/s + 8 s per line. It has no acceleration, search time, queueing or congestion.
- **Only the top 100 SKUs are slotted.** They cover part of the month's order lines (share in the Data table). Lines for other SKUs are left out of every order.
- **One picker, one order per trip.** Batch picking and congestion between pickers are stretch goals we did not build.
- **Exact routing is capped at 11 bay stops.** Larger orders use a heuristic, flagged, and their share is reported.
- **One retailer, one month.** The data is a UK gift retailer in November, the pre-Christmas peak. Gains may differ in other seasons or sectors.

## Repository layout

```
data/            prepare.py (UCI workbook -> orders.json) and data rules
docs/            BUILD_SPEC, architecture, master plan, pitch material, tournament research, img/
eval/            run.ts -> results.md / results.json (same engine, Node)
scripts/         sync-readme.ts (README numbers), floorplan.ts (layout diagram)
web/             Vite + React app
  public/        data/orders.json, layouts/sa_seed42.json
  src/sim/       engine: layout graph, routing, simulate, slotting, annealing
  src/worker/    Web Worker + typed protocol
  src/scene/     React Three Fiber scene
  src/ui/        panels, HUD, leaderboard
  tests/         vitest
```

## Team

| | GitHub | Role |
|---|---|---|
| Anand B | [@Anandb71](https://github.com/Anandb71) | engine, worker, 3D scene, core UI, integration and deploy |
| Junaid Ahamed | [@JunaidAhamed-7777](https://github.com/JunaidAhamed-7777) | leaderboard, README and docs, pitch deck, demo, posts |

## Licence

Code: [MIT](LICENSE). Data: UCI Online Retail II, CC BY 4.0 (attribution above). `web/public/data/orders.json` is a derived subset under the same licence.
