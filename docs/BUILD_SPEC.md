# Ghostwalk — race your old warehouse
### BUILD SPEC (NexAI Hack 2026 · Problem 4.2 · Warehouse Digital Twin: 3D Picking Floor Game)

One-liner: a browser-native 3D digital twin of a picking floor, driven by one real month of UCI Online Retail II orders. Every picker route is an exact tour on the aisle graph, the player re-slots cartons and races a translucent **ghost picker on the old layout** against a solid picker on the new one over the *same* orders, a simulated-annealing optimiser is the opponent to beat, and every number on screen is produced by one deterministic headless simulator and reported on a chronological **held-out** half of the month. Zero backend, zero API keys, zero cold start: a static Vite site on Vercel.

Deadline: submission 15:00 IST 22 Oct 2026. Build window for agents: ~2 hours. Must-haves first; every stretch is a separable module.

---

## 1. The three must-haves (verbatim) and how each is met

1. **"A pre-processing step that turns one month of order lines into JSON: the top ~100 products, how often each is picked, and the list of orders."**
   → `data/prepare.py` (DONE, see §4) → `web/public/data/orders.json`: 100 products with pick counts (month / train / holdout), ~2,300 orders with timestamps and lines. Data panel in the app shows the counts and the cleaning rules.
2. **"A 3D scene of a grid warehouse (racks, aisles, a packing dock and at least one animated picker) that replays orders: the picker walks along aisles to each product's slot and back, with live distance and time counters."**
   → `web/src/scene/*`: instanced racks, 5 aisles + 3 cross-aisles, dock, animated picker following the simulator's node path (aisles only, never through racks), self-drawing route line, HUD counters that sum the same per-order metres/seconds the simulator computes.
3. **"A game mode: the player swaps or drags products between slots, replays the same orders, and sees before/after walking distance and pick time. Include an automatic baseline to beat (fast movers nearest the dock)."**
   → Slot mode: click a carton, click another → swap (3D and in the 2D slot map). KPI card re-scores both layouts on train and held-out orders. **Baseline button** = fast movers nearest the dock (ranked by *train* picks). Race button = ghost (starting layout) vs solid (current layout) over the same orders.

Stretch (separable modules, in priority order): (S1) **SA optimiser opponent** with live convergence curve; (S2) **heatmap of rack visits** (floor tiles + carton colour); (S3) **leaderboard** of layouts (localStorage, seeded, exportable JSON); (S4) **batch picking** (cart holds k orders, one trip); (S5) two pickers with aisle congestion. Build S1–S3. S4/S5 only if everything else is green.

## 2. Honesty rules (judges will probe these)
- **Held-out split**: orders 1–15 Nov 2011 = `train` (the player, the heatmap and the optimiser see them); 16–30 Nov = `holdout` (scoring). Headline KPI = **held-out gain vs Baseline**. Gain vs Original is shown second and labelled.
- **Original layout = catalogue order** (SKUs in StockCode order, aisle by aisle, "what a warehouse does when nobody slots"). A **Random (seed 42)** layout is a second reference row so nobody can claim a convenient convention.
- **Determinism**: no `Date.now()`/`Math.random()` in `sim/`. PRNG = mulberry32 with the seed shown in the UI. **SA budget = iterations, not seconds** (cooling schedule indexed by iteration). Same seed + same iterations ⇒ identical layout on any machine. Elapsed ms is displayed as a measurement only.
- **Routing honesty**: exact Held–Karp for orders with ≤ 12 distinct stops (dock + up to 11 bay nodes), nearest-neighbour + 2-opt above that, flagged per order; the Evidence panel prints "N orders exact (X% of metres), M heuristic". The S-shape policy is a switchable ablation (what a human picker does).
- **Same simulator everywhere**: the worker scores, the animation only *plays back* `perOrder[].path` from the same `simulate()`, and `npm run eval` (Node, tsx) imports the same `sim/` to write `eval/results.md`. Nothing numeric in README/deck is typed by hand — it is pasted from `eval/results.md`.
- Assumptions panel (always one click away): geometry, walking speed 1.2 m/s, 8 s per pick line, top-100 coverage %, data is a UK gift retailer, warehouse layout is declared not observed, synthetic time model.

## 3. Repo layout (owner in brackets; owners touch ONLY their directories)

```
project/
  README.md  DEV_LOG.md  LICENSE(MIT)  .env.example  .gitignore  vercel.json      [orchestrator]
  data/prepare.py  data/README.md                                                  [orchestrator, DONE]
  docs/BUILD_SPEC.md  docs/architecture.md  docs/pitch/  docs/posts.md            [orchestrator]
  eval/run.ts                      -> eval/results.md, eval/results.json, web/public/layouts/sa_seed42.json   [A]
  web/                             Vite 8 + React 19 + TS strict + Tailwind 4
    package.json vite.config.ts tsconfig*.json index.html                          [orchestrator]
    public/data/orders.json (DONE)  public/layouts/sa_seed42.json (A via eval)
    src/main.tsx                                                                   [orchestrator]
    src/App.tsx  src/index.css  src/store.ts  src/ui/**  src/hooks/**              [C]
    src/sim/**   (types.ts + layout.ts seeded by orchestrator; A extends, never breaks exports)   [A]
    src/worker/** (protocol.ts seeded by orchestrator; A implements sim.worker.ts + client.ts)  [A]
    src/scene/**                                                                   [B]
    tests/**  vitest.config.ts                                                     [A]
```

Import rules: `scene/` and `ui/` may import from `sim/` (pure functions, constants) and `store.ts`; `sim/` imports nothing from React/DOM/three; `worker/` imports only `sim/`.

## 4. Data contract (DONE — `web/public/data/orders.json`, produced by `data/prepare.py`)
```ts
{ meta: { source, doi, licence:"CC BY 4.0", month:"2011-11", topSkus:100,
          split:{rule, train:number, holdout:number}, cleaning:string[], stats:{...},
          orderCount, lineCount, linesPerOrderHistogram:{[k:string]:number} },
  products: [{ sku, desc, rank, picks, picksTrain, picksHoldout, qty }],   // rank 1 = most picked in month
  orders:   [{ id, ts:"2011-11-03T10:12:00", split:"train"|"holdout", lines:[{sku, qty}] }] }
```
Products are indexed 0..99 in array order (`skuIndex = products.findIndex`). An **assignment** is `Uint8Array(100)`: `assignment[skuIdx] = slotId`.

## 5. Geometry (declared; single source of truth = `web/src/sim/layout.ts`)
- 5 pick aisles × 2 sides × 10 bays = **100 slots**. Slot id = `aisle*20 + side*10 + bay` (aisle 0..4, side 0 = left/-x, side 1 = right/+x, bay 0..9).
- Bays are split into two blocks of 5 by a **middle cross-aisle**; front and back cross-aisles too.
- Dimensions (metres): bay pitch 1.2; rack depth 1.0; walkway width 3.0 ⇒ aisle pitch 5.0; cross-aisle width 4.0; one carton per slot (1.0 × 0.8 × 0.8 box on a rack shelf, rack height 2.4).
- Coordinates (x = across aisles, z = along aisles; y up): aisle `a` centre line at `x = a*5.0`. Front cross-aisle centre line at `z = -2.0`; block-1 bays at `z = 0.6 + b*1.2` (b 0..4, so 0.6 … 5.4); middle cross-aisle centre at `z = 6.0 + 2.0 = 8.0`; block-2 bays at `z = 10.6 + (b-5)*1.2` (b 5..9, so 10.6 … 15.4); back cross-aisle centre at `z = 16.0 + 2.0 = 18.0`. Racks occupy `x = a*5.0 ± (1.5 … 2.5)`, i.e. left rack centre `x = a*5.0 - 2.0`, right rack centre `x = a*5.0 + 2.0`.
- **Dock** (packing station) at `(x = -4.0, z = -2.0)` on the front cross-aisle.
- Graph nodes: `0 = dock`; per aisle `a`: front junction `F(a)` at (a*5, -2), bay nodes `N(a,b)` at (a*5, z_b) for b 0..9 (both rack sides of a bay share the node), middle junction `M(a)` at (a*5, 8), back junction `B(a)` at (a*5, 18). Node ids: `1 + a*13 + k` with k: 0=F, 1..5 = bays 0..4, 6 = M, 7..11 = bays 5..9, 12 = B. Total nodes = 1 + 5*13 = **66**.
- Edges (undirected, weight = Euclidean along the axis-aligned segment): dock–F(0) 4.0; F(a)–F(a+1) 5.0; M(a)–M(a+1) 5.0; B(a)–B(a+1) 5.0; F(a)–N(a,0) 2.6; N(a,b)–N(a,b+1) 1.2 within a block; N(a,4)–M(a) 2.6; M(a)–N(a,5) 2.6; N(a,9)–B(a) 2.6.
- `slotNode(slotId)` = the bay node; `slotPosition(slotId)` = carton world position (rack centre x, y = 1.0, z_b); `nodePosition(nodeId)`; `allPairs()` = Float32Array(66*66) via Dijkstra (or Floyd–Warshall) + predecessor table `pathBetween(u,v): number[]`.

## 6. Engine (A) — `web/src/sim/`
- `types.ts` (seeded) — Assignment, Order, Product, Dataset, Policy = 'exact' | 'sshape', ScoreResult { totalM, totalS, orders:number, exactOrders, heuristicOrders, perOrder: { idx, m, s, path:number[], exact:boolean }[] , visitsPerNode: Uint32Array }, AnnealOptions { seed, iterations, startFrom:Assignment, set:'train', reportEvery }, AnnealProgress { iter, T, current, best, accepted, swap?:[skuA, skuB] }, AnnealResult { best:Assignment, bestM, curve:[iter, current, best][] , elapsedMs }.
- `rng.ts` — mulberry32(seed).
- `layout.ts` (seeded; extend) — constants, nodes, edges, allPairs, pathBetween, slotNode, slotPosition, nodePosition.
- `route.ts` — `routeExact(nodes:number[]) → {cost, order}` Held–Karp with a flat `Float32Array` DP (n ≤ 12 incl. dock), dedupe stops to nodes, `routeHeuristic` NN + 2-opt, `routeSShape` (Hall 1993: enter each aisle containing a pick from the front, traverse to the back cross-aisle if it is not the last aisle, return policy on the last aisle), `tourPath(order) → number[]` expands through `pathBetween` so the drawn path is graph edges only.
- `simulate.ts` — `simulate(assignment, orders, policy, opts?) → ScoreResult`; time = m/1.2 + 8·lines. Pure. Also `perOrderCosts` cache helper for SA.
- `slotting.ts` — `catalogueLayout(products)`, `randomLayout(seed)`, `baselineFastMovers(products, D)` (rank by picksTrain desc → slots by D[dock][slotNode] asc, ties by slot id), `anneal(opts, onProgress)` : swap move; inverted index sku→orders(train); incremental delta re-routes only affected orders (cache per-order cost); T0 = median |Δ| of 200 probe swaps / ln 2; geometric cooling to T0/1000 over `iterations`; Metropolis; best-so-far; `reportEvery` iterations emit progress with the accepted swap so the scene can fly cartons. Provide `verifyIncremental()` used by tests: incremental total == full recompute.
- `race.ts` — `pickRaceOrders(scoreA, scoreB, n=6)`: holdout orders with the largest |mA − mB|, deterministic tie-break by idx.
- `batching.ts` (S4, optional) — group consecutive train orders into carts of k, union of stops, same routing.
- `index.ts` — re-export everything.
- `web/src/worker/sim.worker.ts` — handles `protocol.ts` messages: INIT(dataset) → builds D once; SCORE{assignment, set, policy} → ScoreResult (transferable typed arrays ok); ANNEAL{opts} → PROGRESS stream + DONE; CANCEL. `client.ts` — `createSimClient()` implementing `SimClient` from protocol.ts (promise API + progress callback). Must keep the main thread free.
- `eval/run.ts` — `npm run eval`: loads orders.json, scores Original/Random/Baseline/SA/(S-shape ablation) on train & holdout, runs SA (seed 42, 30 000 iterations, from Baseline) and writes `web/public/layouts/sa_seed42.json` ({seed, iterations, assignment:number[], trainM, holdoutM, curve}), `eval/results.md` (tables + commit hash + ms per full re-score) and `eval/results.json`. Also runs 5 seeds and reports mean ± sd for SA.
- Tests (`web/tests/*.test.ts`, vitest): Held–Karp == brute force for n ≤ 7 (200 random stop sets); every edge of every `tourPath` is a graph edge (no rack crossing); 5 hand-checked distances (e.g. dock→N(0,0) = 4.0+2.6 = 6.6; N(0,0)→N(1,0) = 2.6+5.0+2.6 = 10.2); `simulate` deterministic; baseline puts rank-1 product at the nearest slot; anneal incremental == full; S-shape ≥ exact on every order.
- Performance targets: full month re-score (2,359 orders) < 150 ms in the worker; SA ≥ 300 iterations/s live; print measured numbers in results.md.

## 7. Scene (B) — `web/src/scene/` (React Three Fiber)
- `Scene.tsx` root: `<Canvas dpr={[1, 1.5]} shadows={false}>`, dark floor `#121826`, hemisphere + directional light, fog; `CameraRig.tsx` with drei `CameraControls` and presets: *Overview* (isometric over the floor), *Follow* (behind the picker), *Top* (orthographic top-down, for swapping). Smooth tween between presets.
- `Floor.tsx` + `HeatTiles.tsx`: one plane; instanced tiles per bay coloured by `visitsPerNode` (train) with a viridis-like ramp; toggle.
- `Racks.tsx`: `InstancedMesh` uprights/shelves for 5 aisles × 2 sides (≤ 3 draw calls). Cross-aisle floor markings. Dock = a small table + pallet at the dock node with a label "DOCK".
- `Cartons.tsx`: one `InstancedMesh` of 100 boxes; `instanceColor` by pick heat (train picks, rank-based ramp from cool blue to hot orange); position from `slotPosition(assignment[sku])`; on assignment change, cartons **fly-lerp** (300 ms, ease-out) to their new slot; selected = emissive halo ring; hovered = outline + a `Html` label (sku + desc + picks); labels only for hovered/selected and the top-10 (never 100 troika labels).
- `Picker.tsx` / `GhostPicker.tsx`: procedural rig (capsule body, head, small cart with 2 boxes) — no GLB downloads. Follows `path: number[]` through `nodePosition` at `1.2 m/s × speed multiplier`, pauses `8 s / speed` at each stop (stop = bay node of a line), turns toward motion. Ghost = same rig with `transparent, opacity 0.35`, cyan tint. Emits progress so counters can tick.
- `RouteLine.tsx`: drei `Line` (lineWidth 3) that grows as the picker walks (draw up to the picker's current point), colour orange (current) / cyan (ghost). Completed stops get a small pulse ring.
- `Interactions.tsx`: raycast click on cartons: first click selects (store.selectSlot), second click swaps (store.swapSlots) with the fly-lerp; hover sets store.hoverSlot. **No DragControls.** Large hit targets (box geometry scaled 1.3 for picking).
- `Effects.tsx`: optional Bloom via `@react-three/postprocessing`, enabled only when `store.quality === 'high'`; default `'medium'` = no post-processing.
- `AnnealFx.tsx`: while SA runs, accepted swaps from progress fly the two cartons and emit a brief spark; the floor heat dims slightly.
- Budget: ≤ 60 draw calls, 60 fps on an integrated GPU at 1080p. Use `useFrame` with refs, never React state per frame.
- Dev stub: until the engine lands, B may drive the picker with a hand-written path like `[0,1,2,3,4,5,4,3,2,1,0]` (dock→F(0)→bays) to test motion.

## 8. UI + store (C) — `web/src/store.ts`, `web/src/ui/`, `App.tsx`
- `store.ts` (zustand 5; seeded skeleton — C implements): dataset, layouts {original, random, baseline, sa, player}, `assignment` (current = player), `startedFrom` ('original'|'baseline'|'sa'), scores per layout per set, mode ('replay'|'slot'|'race'|'anneal'|'evidence'), replay cursor {orderIdx, speed, playing}, race state {orderIdxs, ghostAssignment, counters}, anneal state {running, progress[], result}, selection/hover, quality, policy, leaderboard (localStorage), undo stack. Actions call `SimClient` (from `worker/client.ts`) — score both sets after every assignment change (debounced 150 ms).
- Layout: full-bleed Canvas; **top bar** (logo "GHOSTWALK", mode tabs, quality, policy toggle Exact/S-shape); **left panel** (contextual: Order card during replay with invoice id, time, lines list and a "k of n lines in this zone" note; Slot panel in slot mode = 2D SVG grid of 5 aisles × 2 sides × 10 bays mirroring heat colours with click-click swap, Undo, "Start from Baseline", "Start from Original", "Apply SA layout"); **right panel** KPI card: table rows Original / Random(42) / Baseline / SA / You × columns Train km, Held-out km, s/order, Δ vs Baseline (held-out) — headline tile "Held-out gain vs Baseline" big and green/red; **bottom HUD**: replay transport (Play/Pause, speed 1×/4×/20×, order scrubber), distance & time counters (`This replay` vs `Full month (headless)` groups), Race button, Anneal button with iteration count + seed input + convergence curve (SVG polyline, bold = best, faint = current, markLines for Baseline and shipped SA 30k).
- Evidence panel: meta stats (raw rows, dropped cancellations…, coverage %), exact vs heuristic routing counts and share of metres, policy ablation table, in-sample vs held-out shrinkage, ms per re-score, seed, commit hash (from `import.meta.env.VITE_COMMIT`), and the Assumptions/Limitations list. Data licence line.
- Leaderboard (S3): name + held-out km + Δ vs baseline + seed/hash; stored in localStorage; export JSON.
- Keyboard: Space play/pause, 1/2/3 camera presets, R race, Esc clear selection.
- Visual language: dark industrial (bg `#0b0f17`, panels `#121826/90` with backdrop blur, accent orange `#ff7a1a` for "you", cyan `#39d0ff` for ghost, green for gains); Space Grotesk-ish via system font stack (no external fonts); motion for counters (`motion` package) with tabular numerals.
- Must render meaningfully with `scores === null` (skeletons), and must not crash if the worker is slow.

## 9. Five-minute demo (beats; the team rehearses this)
0:00 Hook: the ghost race is already running on screen. "Same 6 orders, two layouts; the ghost is our old warehouse." 0:30 Data card: 2,3xx real orders, Nov 2011, UCI; click the hottest carton. 0:50 Replay one hero order at 1×: path draws itself along aisles, counters tick; flip Exact → S-shape, metres rise. 1:40 Slot mode: Baseline flies into place, KPI fills (train + held-out). One rehearsed swap (affinity pair) → delta goes green. 2:30 Race: Baseline(ghost) vs You, then Original(ghost) vs Baseline — both labelled; "this race" vs "full held-out" counters. 3:30 Anneal: live 3,000-iteration run from Baseline with the shipped 30k curve drawn behind; result flies in; leaderboard. 4:15 Evidence: held-out table, exact/heuristic share, seed, commit hash; limitations read aloud. 4:45 QR to repo + URL; "the laptop is yours for Q&A".

## 10. Cut list (drop in this order if time runs out, never the must-haves)
S5 congestion → S4 batching → Bloom/quality tiers → leaderboard export → top-down ortho camera → convergence markLines → ghost pulse rings.

## 11. Acceptance checks (integrator runs)
`npm run typecheck && npm run test && npm run build && npm run eval` all green; app loads orders.json, replays an order with a path that never crosses a rack, swap re-scores both sets, Baseline button produces the fast-movers layout, race shows two pickers + labelled counters, anneal streams progress and improves on Baseline on train, Evidence panel shows numbers equal to eval/results.md. Lighthouse-level: first load < 3 s on local preview; 60 fps overview on the dev laptop.
