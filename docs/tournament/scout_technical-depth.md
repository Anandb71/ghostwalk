<!-- top_candidates: 4.3, 4.2, 2.3, 3.2, 1.3, 3.3, 1.2, 2.1, 2.2, 3.1, 1.1, 4.1 -->

# Technical-depth scout — NexAI Hack 2026 (all 12 problems)

Inputs read: `_inputs/instructions.txt`, `_inputs/problems.txt`. Every library version below was checked live on PyPI / npm on 21 Oct 2026 unless marked UNVERIFIED. Budget assumed: ~12 agent-hours of core-algorithm work per problem, deploy on free tier, 5-min live demo on an average laptop.

## 0. Cross-cutting facts that constrain every choice

**Python pins (verified):** ortools 9.15.6755 (py>=3.9) · pyvrp 0.14.1 (py>=3.11; manylinux_2_28 x86_64 + win + macOS-arm64 + wasm32 wheels) · alns 7.0.0 (py 3.9–3.x) · vrplib 2.2.0 (reads Solomon format, `instance_format="solomon"`) · ifcopenshell 0.9.0.post1 (py 3.10–3.15, manylinux_2_31 x86_64 wheels uploaded 2026-10-15) · ifctester 0.9.0 (IDS audit, 2026-09-29) · bm25s 0.3.14 · sentence-transformers 6.2.0 (pulls transformers>=5, torch>=2.2) · duckdb 2.0.0 · highspy 1.15.1 · timm 1.0.30 · torch 2.14.1 · onnxruntime 1.31.0 (py>=3.11) · shap 0.54.1 (**py>=3.12**) · xgboost 3.4.1 (**py>=3.12**) · lightgbm 4.7.0 · scikit-learn 1.9.1 (py>=3.11) · scipy 1.18.1 (py>=3.12) · grad-cam 1.5.7 · mapie 1.6.0 · pyod 3.6.7 · ucimlrepo 0.0.7 · acnportal 0.3.3 (2023, unmaintained but imports) · indic-transliteration 2.3.82 · fastapi 0.157.0 · streamlit 1.66.0 (py>=3.11) · groq 1.7.0 · google-genai 2.32.0. **Use Python 3.12 for every backend** (satisfies all of the above; 3.13 is fine except check torch/ifcopenshell wheels first).

**JS pins (verified):** three 0.186.1 · @react-three/fiber 9.8.2 (react 19) · @react-three/drei 10.7.9 · @duckdb/duckdb-wasm 1.29.0 (stable; dist-tag `latest` is 1.33.1-dev57.0) · web-ifc 0.0.78 · @thatopen/components 3.4.9 (peer three>=0.182, web-ifc>=0.0.77) · @huggingface/transformers 4.3.1 · onnxruntime-web 1.30.0 · highs 1.15.4 (HiGHS LP/MIP compiled to WASM, github lovasoa/highs-js) · maplibre-gl 6.15.0 · leaflet 1.9.4 · deck.gl 9.4.0 · pathfinding 0.4.18 · wink-bm25-text-search 3.1.2 · pyodide 314.0.7 (npm).

**Hosting (verified, with caveats):** HF Spaces cpu-basic = 2 vCPU / 16 GB, sleeps after 48 h idle; BUT a community thread claims free CPU-basic Docker/Gradio Spaces were restricted recently — **create a Docker Space in the first 15 minutes to confirm it builds**; if blocked, fall back to Render free (0.1 CPU, 512 MB RAM, spins down after 15 min idle, ~1 min cold start → ping it 5 min before demo; 750 h/month). Vercel Hobby: function bundle 250 MB (Python runtime 500 MB), max duration documented inconsistently (300 s vs 60 s) → keep serverless calls < 30 s. Torch does not fit Render 512 MB comfortably → deploy inference with onnxruntime (~50 MB) or run models in-browser.

**LLM free tiers:** Groq ~30 RPM (daily cap reported anywhere from 1 000 to 14 400 req/day; check console.groq.com/settings/limits); Gemini free tier numbers conflict (10–15 RPM, 20–1 500 RPD) → cache every demo query, pre-warm, and ship a deterministic fallback path. Any LLM key forces a backend (Vercel Node function is enough).

**In-browser-first rule:** when the heavy part is optimisation, simulation, or a small ONNX model, the whole product can be a static site (Vercel/Cloudflare Pages): zero cold start, nothing to break on stage. Backends are unavoidable only for (a) LLM keys, (b) C++ solvers without WASM builds (OR-Tools; PyVRP has wasm32 wheels but only via Pyodide — treat as experimental), (c) IfcOpenShell/ifctester.

---

## 4.3 Last-Mile Route Planner with Live Re-planning (★★★)

**Core technique:** Two-solver architecture. (1) Static: PyVRP 0.14.1 — hybrid genetic search (HGS), 1st in DIMACS-12 VRPTW track — solving Solomon instances read with `pyvrp.read(path, round_func="dimacs")` (×10, truncate) from `https://raw.githubusercontent.com/PyVRP/Instances/main/VRPTW/Solomon/{C101,R101,RC101}.vrp` (112 files, each with a `.sol` best-known solution from CVRPLIB under the DIMACS convention). (2) Dynamic: event-driven re-plan from fleet state with **two competing strategies measured head-to-head**: (A) warm-started HGS re-solve (`Model.solve(stop=MaxRuntime(2.0), initial_solution=projected_plan)`), (B) hand-rolled ALNS repair (Ropke & Pisinger 2006: random / worst / Shaw-related / route removal; greedy + regret-2 insertion; simulated-annealing acceptance; adaptive weights σ=(33,9,13), reaction 0.1; q ∈ [0.1n, 0.4n]; O(1) time-window feasibility via forward time slack) with a 200 ms budget. Fleet state → model: completed stops removed; each active van becomes its own `VehicleType(num_available=1, start_depot=<virtual depot at current position>, end_depot=<real depot>, tw_early=now, capacity=remaining)`; broken van → `num_available=0`, its unserved clients become free; new orders → `add_client(..., required=False, prize=P)` so "orders not served" is a real KPI rather than an infeasibility crash. OR-Tools 9.15.6755 is a third baseline if time permits (`RoutingIndexManager(n, k, starts, ends)`, `routing.ReadAssignmentFromRoutes(routes, True)` → `SolveFromAssignmentWithParameters`, `ApplyLocksToAllVehicles` for executed prefixes).

**Why it impresses:** judges who know OR see HGS (state-of-the-art, not the tutorial OR-Tools copy), a correct rolling-horizon formulation (vehicles starting mid-route, hard TWs vs prize-collecting), and a quantified latency/quality trade-off between full re-solve and local repair — which is literally the stretch goal "compare full re-solve vs quick local repair".

**Implementation sketch:**
1. `instances.py`: fetch .vrp/.sol from PyVRP/Instances; derive 25/50-customer variants by truncating to first N customers (SINTEF convention); keep vehicle count/capacity.
2. `static_solver.py`: `read(...,"dimacs")` → `Model.from_data` → `solve(MaxRuntime(5), seed=42)`; report `num_routes`, `distance/10`, gap to `.sol`.
3. `state.py`: dataclass Fleet{van: pos(x,y), t_now, load, done_stops[], remaining_stops[]}; `project(plan, t)` interpolates each van along its current edge.
4. `replan_hgs.py`: build Model with virtual depots per active van (add_depot at its position), base edges = Euclidean×10 for all pairs (O(n²) add_edge), clients' absolute TWs unchanged, vehicle tw_early = t_now; warm start from projected plan.
5. `replan_alns.py`: ~250 lines, operates only on free clients + affected routes; soft TWs with lateness penalty so "late deliveries" is reportable.
6. `events.py`: clock stepping in 1-min ticks; events `new_orders(t, k=5, sampled from unused Solomon customers or jittered copies)`, `breakdown(t, van)`.
7. `api.py` (FastAPI 0.157.0): POST /solve, /event, GET /state; stream plan as JSON (routes with ETAs).
8. Frontend (React + MapLibre 6.15.0 or deck.gl 9.4.0): Solomon 0–100 grid affinely mapped to a city bbox (say so in UI), timeline slider, animated vans, event buttons, KPI panel before/after per event (distance, late, dropped, re-plan ms) for both strategies.
9. Scenario runner: 10 seeded scenarios × {HGS 2 s, ALNS 0.2 s} → table + CSV in README.
10. Deploy backend as HF Space (Docker, py3.12) with Render fallback; frontend on Vercel.

**Libraries:** pyvrp 0.14.1, vrplib 2.2.0, alns 7.0.0 (optional framework; destroy/repair are yours), ortools 9.15.6755 (optional), numpy, fastapi 0.157.0, uvicorn; JS: maplibre-gl 6.15.0 or deck.gl 9.4.0, react 19. In-browser variant: hand-rolled ALNS in a TS Web Worker needs no backend (recommended as the "repair" path so the demo survives a backend outage); PyVRP wasm32 wheel (cp314 pyemscripten_2026_0) under pyodide 314.0.7 is possible but untested — do not bet the demo on it.

**Evaluation:** Static — vehicles and distance vs BKS on C101/R101/RC101 at 25 and 100 customers; report gap with the rounding convention stated (SINTEF 2-decimal exact vs DIMACS 1-decimal truncation; e.g., C101-100 BKS = 828.94/10 veh on SINTEF ≈ 827.3 in `.sol`). 25-customer BKS (from memory, UNVERIFIED because sintef.no returns 403 to bots — open in a browser): C101 191.3/3, C102 190.3/3, R101 617.1/8, R102 547.1/7, RC101 461.1/4, RC102 351.8/3. Dynamic — per event: re-plan wall time (ms), Δdistance, late deliveries, orders dropped; averaged over 10 seeds for both strategies; plus "disruption cost" = post-event plan cost − pre-event plan cost.

**Where it bites:** integer scaling (×10 everywhere, including service times); PyVRP needs explicit edges for virtual depots; PyVRP time windows are hard (use `required=False`+prize for droppable orders, soft TWs only in your ALNS); projecting van positions mid-edge; HF Space cold start before demo; keep MaxRuntime ≤ 2 s or the UI feels dead; py>=3.11 wheel only.

---

## 4.2 Warehouse Digital Twin: 3D Picking Floor Game (★★)

**Core technique:** Everything in the browser. (1) Pre-processing (pandas, offline): Online Retail II, one month (Nov 2011 = peak), drop invoices starting with "C", keep StockCode matching `^\d{5}[A-Za-z]?$` (drops POST, D, M, DOT, BANK CHARGES, CRUK, AMAZONFEE, S, gift_*), top-100 SKUs by pick lines, orders = invoices restricted to those SKUs (drop orders with <2 lines), split month into **first-half (optimise) / second-half (held-out score)**. (2) Warehouse graph: P parallel aisles × S slots per side, front/back cross-aisles (+ optional middle cross-aisle → multi-block); slot↔slot aisle-constrained distances precomputed by BFS on the grid (pathfinding 0.4.18 or 50 lines of BFS) into a 101×101 matrix. (3) Picker routing per order: exact Held–Karp DP for ≤12 stops (12²·2¹² ≈ 590 k ops), nearest-neighbour + 2-opt/Or-opt above; switchable classical heuristics S-shape / return / largest-gap (Hall 1993) so judges see the taxonomy; optional exact Ratliff–Rosenthal DP for single-block (use the m-stage variant, arXiv 2409.13219). (4) Slotting optimiser as the "AI opponent": baseline = ABC/COI (pick frequency ÷ slot distance to dock), then **simulated annealing over slot assignments** whose objective is the replayed total route distance with incremental delta evaluation (cache each order's route; after swapping SKUs i,j recompute only orders containing i or j) — this captures order affinity (co-picked SKUs near each other) that ABC ignores. (5) Game loop in R3F: drag SKU boxes between slots, replay, animated picker, live metres/seconds, before/after/baseline/SA KPIs. Stretch (cheap once the core exists): order batching (seed + savings into a cart of capacity C), two pickers with aisle-occupancy congestion (time-stepped, wait when aisle occupied), InstancedMesh rack-visit heatmap, leaderboard (localStorage or ArtifactData-style KV).

**Why it impresses:** measured not claimed (held-out second-half orders), a real optimiser the player must beat, exact routing (DP) rather than Manhattan guesses, and a genuinely smooth 3D twin — the strongest visual demo on the sheet.

**Implementation sketch:**
1. `prep.py`: read xlsx (use `pandas.read_excel(engine="calamine")` via python-calamine; openpyxl takes minutes) → `data/orders_2011_11.json` {skus:[{code,desc,picks}], orders:[{id,ts,lines:[code...]}], split:{opt:[...],test:[...]}}.
2. `layout.ts`: config {aisles:8, slotsPerSide:7, aisleWidth:3 m, slotPitch:1.2 m, dock:(0,0), speed:1.2 m/s, pickTime:8 s}; build grid; BFS all-pairs → `Float32Array`.
3. `route.ts`: `heldKarp(stops)`, `twoOpt`, `sShape`, `largestGap`; unit tests on tiny layouts.
4. `replay.ts`: for each order → route → distance/time; returns totals + per-order traces (for animation).
5. `slotting.ts`: `abcBaseline()`, `annealSlots(iters=20000, T0, alpha)` in a Web Worker with progress messages.
6. `scene.tsx` (R3F 9.8.2 + drei 10.7.9): InstancedMesh racks (≤ 1 draw call), labelled SKU boxes, picker capsule following the route with lerp; `<Html>` counters.
7. `game.tsx`: drag-and-drop via drei `<DragControls>` or click-swap; replay button; KPI table (original / ABC / SA / player) on opt and held-out sets.
8. Deploy static on Vercel or Cloudflare Pages; JSON ≤ 2 MB.

**Libraries:** three 0.186.1, @react-three/fiber 9.8.2, @react-three/drei 10.7.9, react 19, vite, pathfinding 0.4.18 (optional), python-calamine/pandas for prep. No backend.

**Evaluation:** total walking distance and avg pick time per order for original (random or alphabetical, state it), ABC baseline, SA layout, player layout — on the optimisation half and separately on the held-out half; report that SA's held-out gain < in-sample gain (honesty). Also routing policy ablation (S-shape vs optimal) on the same layout.

**Where it bites:** order size after restricting to top-100 SKUs shrinks (median 3–6 lines) — say so; keep ≤ 2 000 draw calls (instancing) for the average laptop; Held–Karp cutoff must guard against 20-line orders; SA needs the incremental evaluation or it will take minutes; define pick time explicitly; dragging in 3D is fiddly — provide click-to-swap as fallback.

---

## 2.3 Unknown-Defect Steel Inspector (★★)

**Core technique:** Fine-tune ResNet-18 (timm 1.0.30, ImageNet init, grayscale repeated to 3 ch, 200×200) on 5 NEU-CLS classes; **open-set recognition bake-off** on the held-out class with four post-hoc scores computed from the same network: MSP, energy score (−T·logsumexp logits, Liu et al. 2020), Mahalanobis on penultimate 512-d features with class means + shared Ledoit-Wolf-shrunk covariance (Lee et al. 2018), and kNN cosine distance to training features (Sun et al. 2022); threshold chosen at 95 % TPR on known-class validation; report AUROC + FPR@95. Few-shot class addition without retraining = nearest-class-mean prototype (+ Mahalanobis update with the shared covariance) from 5 operator-labelled images; recognition thereafter via prototype classifier over the frozen embedding. Run **leave-one-class-out over all 6 classes** (6 × ~5 min CPU) so the README shows which unknowns are easy/hard. Deploy inference **in-browser**: export backbone to ONNX → onnxruntime-web 1.30.0; prototypes, covariance inverse and thresholds as JSON; the operator's 5 labels update prototypes instantly client-side (no backend, no cold start). Stretch: HDBSCAN over "unknown" embeddings to propose a new class; NEU-DET boxes via a tiny YOLO export (skip unless everything else is done).

**Why it impresses:** it treats OSR as a method comparison with the right metrics (AUROC/FPR@95), explains why energy beats softmax, and shows class addition as geometry rather than retraining — all demoable live from a laptop camera/upload.

**Implementation sketch:**
1. Data: NEU-CLS from figshare mirror (`figshare.com/articles/dataset/NEU-CLS/28903550`, ~26 MB) or faculty.neu.edu.cn (flaky); pHash dedup; stratified split 240/60 per class, seed 42; set aside 5 "operator" images of the held-out class from its test pool.
2. `train.py`: timm `resnet18`, AdamW 3e-4, 12 epochs, light aug (flip/rotate), class-balanced; save weights + penultimate features.
3. `osr.py`: compute 4 scores on known-val + unknown; AUROC (sklearn), FPR@95; pick best and threshold.
4. `fewshot.py`: prototypes; evaluate on remaining 295 unknown images; re-evaluate known accuracy (should not move).
5. `export.py`: `torch.onnx.export` (opset 17), output logits + features; `onnxruntime` check parity.
6. Web (Vite + React): load ONNX in a worker; preprocess with canvas; compute scores in JS (matrix ops in plain Float32Array); confusion matrix with "unknown" rendered live; operator labelling flow; inspection log (localStorage).
7. README: held-out class stated; 6×LOCO table; limitations (300 imgs/class, single camera condition).

**Libraries:** torch 2.14.1, timm 1.0.30, scikit-learn 1.9.1, numpy, imagehash (pHash), onnx, onnxruntime 1.31.0; web: onnxruntime-web 1.30.0, react 19. Backend unnecessary (optional HF Space with onnxruntime if you want a /predict endpoint too).

**Evaluation:** known-class accuracy (5-class, held-out split), AUROC and FPR@95 known-vs-unknown per scoring method, new-class accuracy after 5-shot (on the 295 untouched images), known-class accuracy before/after, LOCO table over all six classes.

**Where it bites:** NEU-CLS has near-duplicate frames → dedup or AUROC is inflated; Mahalanobis needs shrinkage with 1 200 samples × 512 dims; threshold must be set on known-class val only (never on the unknown class — that is cheating); 5 operator examples excluded from every evaluation; ONNX export of timm models is routine but check opset; CPU training time (~5–10 min per run; LOCO ~1 h — run in parallel agents or Colab).

---

## 3.2 Workplace EV Charging Scheduler (★)

**Core technique:** 15-min replay of one week of ACN-Data (site `caltech`, 54 EVSEs; e.g., Mon 2019-04-08 → Sun) with four policies: uncontrolled, EDF, least-laxity-first (laxity = time-to-departure − remaining energy/rate), and **model-predictive LP** re-solved every step over the horizon to departure: maximise Σ urgency-weighted energy (or minimise TOU cost + shortfall penalty) s.t. site cap, per-EVSE max (6.6 kW or inferred per-session max), remaining need, optional solar supply (clear-sky bell curve scaled to kWp, or pvlib clear-sky) and TOU tariff (cite an Indian ToD tariff, e.g., TANGEDCO/BESCOM, or SCE TOU-EV; state which). Add the **hindsight-optimal LP** (full knowledge of the week) as an upper bound so the gap of each online policy is quantified. Everything runs in-browser with highs 1.15.4 (HiGHS WASM): 50 EVs × 48 steps ≈ 2 400 vars, solves in tens of ms.

**Why it impresses:** scheduling framed as receding-horizon optimisation with a provable bound, not just a priority rule; cap/solar/TOU sliders re-solve instantly on stage.

**Implementation sketch:**
1. Data: register at ev.caltech.edu, get token, `DataClient(token).get_sessions_by_time("caltech", start, end)` → JSON with connectionTime, disconnectTime, doneChargingTime, kWhDelivered, userInputs[{kWhRequested, requestedDeparture}] (do this TONIGHT; the "static GitHub copy" named in the PDF was not findable — fallback is a declared synthetic generator fitted to ACN-Data's published statistics).
2. `prep.py`: sessions → 15-min arrival/departure slots in site-local time; need = kWhRequested if present else kWhDelivered (flag `stand_in=true`); max rate = min(6.6 kW, need/duration·k).
3. `sim.ts`: step loop; policy interface `allocate(stateAtT) → kW per EV`.
4. Policies: `uncontrolled`, `edf`, `llf`, `mpcLP` (highs-js, horizon = max departure in window), `hindsightLP` (offline, once).
5. KPIs: peak kW, energy-delivered share, sessions under-served (<95 % of need), cost under TOU, solar self-consumption.
6. Dashboard (React + Plotly.js or D3): load curves vs cap line, per-driver view ("you will get ~X kWh by 17:30"), sweep of cap 50–300 kW.
7. Deploy static (Vercel).

**Libraries:** acnportal 0.3.3 (data pull only) or raw REST (`https://ev.caltech.edu/api/v1/sessions/caltech?where=...`, token as basic-auth username); highs 1.15.4 (npm); plotly.js or d3; Python alt: highspy 1.15.1 / `scipy.optimize.milp`.

**Evaluation:** peak-kW reduction vs uncontrolled; share of needed energy delivered; # sessions under-served; cost; all vs hindsight LP; sensitivity over caps and over "requested vs delivered" need definition.

**Where it bites:** most sessions lack userInputs (say so, use stand-ins); EV max charging rate unknown (infer or assume; document); UTC→local; Web-interface timestamps before 2019-10-10 were offset (use API/client); highs-js WASM ~2 MB load; laxity ties.

---

## 1.3 Maintenance Copilot: Agentic RAG over Logbooks (★★★)

**Core technique:** Domain-normalised hybrid retrieval + calibrated refusal + grounded agent. Ingestion: lowercase, strip punctuation, expand abbreviations via MaintNet's aviation abbreviation list (Kaggle mirror "Aircraft Historical Maintenance Dataset (2012-2017)" ships `aviation_abbreviation_dataset` with columns abbriviation_code/abbreviated/standard_description; main table 6 169 PROBLEM/ACTION rows), spelling normalisation with SymSpell built from corpus vocabulary, keep original text alongside. Index: BM25 (bm25s 0.3.14) over normalised text + dense (bge-small-en-v1.5, 384-d) over normalised text; fuse by reciprocal-rank fusion (k=60); **cross-encoder rerank** of top-20 (`cross-encoder/ms-marco-MiniLM-L-6-v2`) whose logit gives a calibrated relevance score → refusal rule = (top-1 rerank score < τ) OR (top-1 − top-5 margin < δ), τ/δ set on a dev set written before tuning. Agent: hand-rolled tool loop (no LangGraph needed) with tools `search_records(query, k)`, `get_record(id)`, `expand_shorthand(text)`; LLM (Groq llama-3.3-70b) must emit `[rec:1234]` citations; post-validator rejects any citation not in the retrieved set and forces "insufficient evidence" when retrieval refused. Stretch: recurring-defect detector = agglomerative clustering on embeddings (cosine 0.15) grouped by aircraft ident and month → "reported ≥3× in 90 days" flags; query-rewrite step that expands the technician's shorthand with the same tables.

**Why it impresses:** it fixes the actual failure mode (abbreviations defeat embeddings) and proves it with an ablation; refusal is calibrated on a pre-registered dev set; citations are mechanically verified, not hoped for.

**Implementation sketch:**
1. `normalize.py`: abbreviation dict (MaintNet + team additions), SymSpell (symspellpy) with corpus vocab; keep `raw`, `norm`.
2. `index.py`: bm25s index; sentence-transformers encode (CPU, 6 k records ≈ 1 min); save `emb.npy`.
3. `retrieve.py`: hybrid + RRF + rerank; returns scored records + refusal flag.
4. `agent.py`: tool loop with Groq; JSON tool schema; max 4 steps; citation validator.
5. `eval.py`: 15 Q→record pairs + 5 unanswerable written at 22:00 before any tuning; hit@5, citation precision (LLM-judge + manual), refusal correctness; ablation rows: bm25 / dense / hybrid / +abbrev / +rerank.
6. UI (Next.js): answer left, cited records right, collapsible tool-call trace; disclaimer banner.
7. Deploy: retrieval + agent in a FastAPI HF Space (or move retrieval in-browser with Xenova/bge-small-en-v1.5 + wink-bm25 and keep only the LLM call on a Vercel function).

**Libraries:** bm25s 0.3.14, sentence-transformers 6.2.0, symspellpy, numpy, groq 1.7.0 or google-genai 2.32.0, fastapi 0.157.0; browser alt: @huggingface/transformers 4.3.1 (`Xenova/bge-small-en-v1.5`, 384-d), wink-bm25-text-search 3.1.2.

**Evaluation:** retrieval hit@5 on 15 pairs; citation precision; correct refusals on 5 unanswerable questions; ablation table; latency per query.

**Where it bites:** MaintNet site (people.rit.edu) returned a TLS error to our fetcher — download via Kaggle mirror early; abbreviation list is noisy (multiple expansions per code → keep both); scores bunch because records are short (that is why margin + rerank); LLM rate limits during judging → cache; never put the 15 test questions in prompts.

---

## 3.3 BIM Model Checker (IFC) (★★)

**Core technique:** IfcOpenShell 0.9.0.post1 traversal with unit-aware extraction (`ifcopenshell.util.unit.calculate_unit_scale(model)` → metres), psets via `ifcopenshell.util.element.get_psets(el, psets_only=True)` merged with type psets (`get_type(el)`), storey via `get_container(el)`, placement via `ifcopenshell.util.placement.get_local_placement`; a YAML rule DSL `{id, entity, select: pset.prop | attr | quantity, op, value, units, severity, remedy}` with special checks (door width from `OverallWidth` or Qto_DoorBaseQuantities.Width; window `Pset_WindowCommon.ThermalTransmittance`; wall material via `IfcRelAssociatesMaterial`; storeys with no `IfcSpace` via decomposition; unnamed spaces; wall `IsExternal`/`LoadBearing` missing; slab `Pset_SlabCommon.ThermalTransmittance`). Stretch that is nearly free: IDS import through ifctester 0.9.0 (`ifctester.ids.open(path)`, `ids.validate(model)`, reporter) and embodied carbon from `Qto_WallBaseQuantities.NetVolume`/`Qto_SlabBaseQuantities.NetVolume` × material density × ICE v3 factors (cite Circular Ecology ICE database); 3D highlight with web-ifc 0.0.78 + @thatopen/components 3.4.9 (select by GlobalId). Backend required (IfcOpenShell/ifctester are C++/Python) → HF Space; the viewer is pure browser. Alternative all-browser version with web-ifc (`properties.getPropertySets(modelID, id, recursive=true)`, `getSpatialStructure`) loses IDS.

**Why it impresses:** correct handling of IFC2x3 vs IFC4 pset placement, units, type-vs-occurrence inheritance, "missing pset is a finding", and standards alignment through IDS; carbon ties it to the track theme.

**Implementation sketch:**
1. `models/`: download 2–3 full buildings from buildingSMART/Sample-Test-Files (folders `IFC 2.3.0.1 (IFC 2x3 TC1)`, `IFC 4.0.2.1 (IFC 4 ADD2 TC1)`; files are Git-LFS — fetch single raw files) + Community-Sample-Test-Files backup.
2. `extract.py`: entities → rows {GlobalId, type, name, storey, psets, quantities, materials} with unit scale.
3. `rules.yaml` + `engine.py`: evaluate; emit {rule, element type, GlobalId, storey, value found, expected, remedy}.
4. `mutate.py`: inject 10 known violations into a clean model (shrink a door, delete a U-value prop, blank a space name, strip a material…) → recall/false-alarm report.
5. `carbon.py`: volumes × factors; per-storey totals.
6. `ids.py`: ifctester wrapper (stretch).
7. FastAPI endpoints /check (upload), /csv; React UI with table, filters, CSV; viewer (That Open) highlighting violating GlobalIds.

**Libraries:** ifcopenshell 0.9.0.post1, ifctester 0.9.0, pyyaml, pandas, fastapi 0.157.0; web-ifc 0.0.78, @thatopen/components 3.4.9, three 0.186.1 (peer ≥0.182).

**Evaluation:** mutation test (10 injected violations: found/missed/false alarms) on IFC2x3 and IFC4 models; table of rule coverage per model; carbon totals with factor citations.

**Where it bites:** Git LFS (clone without LFS yields pointer files); folder names with spaces; properties often on types not occurrences; some sample models have no quantities (carbon needs geometry → `ifcopenshell.geom` iterator, slow on big models — cap to walls/slabs); schema IFC4.3 parsing time; large uploads on free tiers (limit 50 MB).

---

## 1.2 Ask-Your-Data Sales Agent (text-to-SQL) (★★)

**Core technique:** DuckDB **in the browser** (@duckdb/duckdb-wasm 1.29.0) over a Parquet export (~10–15 MB) of Online Retail II with a semantic layer of views: `sales_clean` (invoice NOT LIKE 'C%', Quantity>0, Price>0, StockCode ~ '^\d{5}[A-Za-z]?$'), `returns` (Quantity<0 OR invoice LIKE 'C%'), `customers_known` (Customer ID not null); LLM (backend function) sees schema + column stats + "data rules" and returns structured JSON `{mode:"sql"|"clarify", sql, assumptions[], clarify:{question, options[]}}`; execution-based self-consistency (sample 3 SQLs at T=0.7, execute all, majority on result hash); guardrails: AST check via DuckDB's own `json_serialize_sql` (statement type must be SELECT, no ATTACH/COPY/PRAGMA), read-only connection, LIMIT injection, 5 s timeout; retry loop feeding the DuckDB error back (max 3). Chart auto-choice from result shape (date-like column → line; categorical+numeric → bar; single number → KPI). Trap suite of ≥10 questions with hand-written SQL expected answers executed on the same engine → pass/fail with tolerance; multi-turn via conversation-carried previous SQL ("now only for Germany" → LLM edits WHERE).

**Why it impresses:** correctness engineering (semantic views, AST guard, self-consistency, clarify-step) rather than prompt-and-pray; the entire 1 M-row DB runs client-side, so the demo cannot be killed by a sleeping backend.

**Implementation sketch:** 1) `prep.py`: `pd.read_excel(engine="calamine")` both sheets → Parquet (zstd). 2) `schema.md` + rules note. 3) `/api/sql` Vercel Node function → Groq/Gemini with JSON schema. 4) `guard.ts`: `SELECT json_serialize_sql($1)` → inspect; reject non-SELECT. 5) `run.ts`: duckdb-wasm worker, `conn.query`, timing. 6) `traps.json`: question, expected_sql, tags (cancel/return/ambiguous); runner page shows pass/fail. 7) `chart.ts` shape heuristics (Vega-Lite via vega-embed). 8) README data rules (GBP, "today"=2011-12-09, cancellations excluded from revenue, returns netted in `net_sales` view).

**Libraries:** @duckdb/duckdb-wasm 1.29.0, vega-lite/vega-embed, react 19; python-calamine + pandas + pyarrow; groq 1.7.0 / google-genai 2.32.0 (or JS SDKs) on a Vercel function. Backend = one serverless function (key only).

**Evaluation:** execution accuracy on the trap suite (≥5 traps on cancellations/returns/ambiguity); ask-back rate on ambiguous questions; false-clarification rate on 10 clear questions; self-consistency agreement rate.

**Where it bites:** xlsx→Parquet conversion time (calamine); duckdb-wasm memory on 1 M rows (~150 MB, OK on laptops, iPhone Safari not); relative dates; wholesalers dominate (document); LLM key must stay server-side; dist-tag `latest` of duckdb-wasm is a dev build — pin 1.29.0.

---

## 2.1 Maintenance Shift Planner (★)

**Core technique:** Physics-informed features (power = torque × 2π·rpm/60; ΔT = process − air; wear × torque) + LightGBM 4.7.0 binary (failure) and multiclass (TWF/HDF/PWF/OSF; RNF excluded as random, say so) with `scale_pos_weight`; probability calibration (isotonic, CV) because cost-thresholding needs calibrated p; threshold = argmin_τ C_FN·FN(τ)+C_FP·FP(τ) on 5-fold out-of-fold predictions with the cost curve plotted; **shift assignment as a knapsack**, not top-k: maximise Σ p_i·L_i (L by product quality L/M/H) − service cost s.t. Σ service_time_i ≤ slots × shift hours (highspy 1.15.1 MILP or DP), with "why" = p_i, L_i, top-3 SHAP (shap 0.54.1). Conformal uncertainty flag via MAPIE 1.6.0 (prediction sets → "uncertain, inspect"). Drift: PSI per feature + Mahalanobis of batch mean vs training (alarm at p<0.01). LLM ticket draft optional.

**Why it impresses:** decision-theoretic threshold, explicit optimisation for the plan, calibration and drift — the "deliverable is the plan" message is honoured.

**Implementation sketch:** 1) `fetch_ucirepo(id=601)`; drop UID/Product ID; keep Type. 2) features; stratified 5-fold OOF; LightGBM. 3) isotonic calibration; PR-AUC, recall@cost-threshold. 4) `cost.py` curve for C_FN/C_FP slider (default 20×). 5) `plan.py` knapsack (highspy) + greedy fallback. 6) `drift.py`. 7) FastAPI `/predict`, `/plan` (replay batch of N readings as a shift); Streamlit or React UI. 8) Deploy HF Space (py3.12). All-browser alternative: export LightGBM to ONNX (onnxmltools) and run with onnxruntime-web; SHAP then precomputed server-side only.

**Libraries:** ucimlrepo 0.0.7, lightgbm 4.7.0 (or xgboost 3.4.1), scikit-learn 1.9.1, shap 0.54.1, mapie 1.6.0, highspy 1.15.1, fastapi 0.157.0.

**Evaluation:** PR-AUC (OOF, held-out 20 % test), recall at the cost-selected precision, expected cost of plan vs "top-k by p" vs random, drift detector TPR on synthetic shifted batches.

**Where it bites:** only 339 failures → wide CIs (report bootstrap CI); failure-mode columns are targets — never features; synthetic data disclaimer; shap/xgboost need py>=3.12.

---

## 2.2 Leaf Doctor for Real Field Photos (★)

**Core technique:** timm EfficientNet-B0 / MobileNetV3-Large fine-tuned on 3–5 PlantDoc species (e.g., Tomato, Potato, Corn, Apple), pHash de-duplication across train/test (report count removed), class-balanced sampling; **selective classification**: temperature scaling on val, then threshold chosen from the risk–coverage curve (report AURC) — "not sure" below the bar; quality gate = Laplacian variance (blur), luminance histogram (dark/over-exposed), leaf-fill via Excess-Green (ExG = 2G−R−B) mask area + bounding-box ratio ("move closer"), shadow/contrast check → specific retake tip. Deploy **in-browser** (ONNX via onnxruntime-web, direct camera capture, mobile-friendly, offline-capable); Grad-CAM server-side with grad-cam 1.5.7 for the README, and gradient-free **Eigen-CAM** in-browser (PCA of last conv feature map output by the ONNX model) for the live heatmap. Tamil/Hindi UI strings as stretch.

**Why it impresses:** explicit abstention theory (coverage curve), honest dedup, gate with measurable precision, runs on a phone.

**Sketch:** 1) clone PlantDoc (CC BY 4.0; train/test folders); pick species; dedup. 2) train 15 epochs CPU/Colab. 3) calibrate; coverage curve. 4) `quality.py`/`quality.ts` (OpenCV / canvas) with thresholds tuned on 50 hand-labelled good/bad photos. 5) ONNX export (also output last-conv features). 6) PWA with camera, top-3, abstain, retake tips, Eigen-CAM. 7) Deploy static.

**Libraries:** torch 2.14.1, timm 1.0.30, grad-cam 1.5.7, opencv-python-headless, imagehash, onnxruntime-web 1.30.0.

**Evaluation:** top-1/top-3 on PlantDoc test split per class; accuracy on accepted vs rejected share (coverage curve); quality-gate confusion on the 50-photo set.

**Where it bites:** PlantDoc is small/noisy (expect 65–80 % top-1 on a 5-species subset); mobile Safari WASM memory; camera permissions over http (needs https — Vercel fine); don't start from PlantVillage weights.

---

## 3.1 Safe Outdoor Hours Planner (★)

**Core technique:** Data-quality **state labelling per city-hour**: missing, stale (gap since last distinct timestamp > 2 h / forward-fill detection), stuck (run-length of identical value ≥ 6 h with variance 0 — resolution-aware), spike (MAD z>6), insufficient coverage (<3 pollutants incl. PM). Reproduce CPCB sub-indices from hourly data (PM2.5/PM10/NO2/SO2/NH3 24-h rolling means, CO/O3 8-h rolling max; AQI = max sub-index; CPCB 2014 breakpoints: PM2.5 0-30/31-60/61-90/91-120/121-250/250+; PM10 0-50/51-100/101-250/251-350/351-430/430+) and report agreement with the dataset's AQI column (validation of the pipeline). Planner: sliding window of length L over 06:00–18:00; lexicographic objective (lowest worst band, then lowest mean AQI); all hours must be reliable, else "no advice" with the reason; sensitive-group thresholds (shift bands one level stricter). Back-test over all days per city. All in-browser: pre-aggregated JSON per city (52 k rows), D3 strips + monthly typical-day heatmap.

**Why it impresses:** correct CPCB arithmetic reproduced from raw hourly pollutants (not just reading AQI_Bucket) and a defensible reliability taxonomy with reported flag rates.

**Sketch:** 1) Kaggle `rohanrao/air-quality-data-in-india` city_hour.csv (needs Kaggle account; columns City, Datetime, PM2.5…Xylene, AQI, AQI_Bucket); pick Chennai/Delhi/Bengaluru. 2) `quality.py` → flags. 3) `aqi.py` → sub-indices. 4) `planner.py` + backtest. 5) export JSON. 6) React/D3 UI: hour strip, window, advisory paragraph (template, optional LLM polish), two-city compare. 7) static deploy.

**Libraries:** pandas, numpy; d3 7, react 19 (or Streamlit 1.66.0 + Plotly if you prefer Python).

**Evaluation:** back-test match rate (recommended window == oracle lowest-AQI window, and overlap ≥ 50 %); share of city-hours unreliable by city/year; CPCB reproduction agreement %.

**Where it bites:** the dataset's AQI column was computed by the uploader with rolling averages — document; 2015–16 gaps; "stale" in replay mode must be defined relative to the replayed clock; licence on Kaggle page must be checked and cited; this is the least algorithmically deep problem.

---

## 4.1 Markdown Before Waste (★)

**Core technique:** Discrete-event store sim (TS, seedable PRNG) with batch arrivals, FEFO vs FIFO shelf pulling (customer behaviour), and a **logit choice model** between full-price fresh units and discounted near-expiry units — so markdowns cannibalise fresh sales (the trap the judges warn about becomes a modelled effect). Demand = Poisson(λ_p · weekday_factor (from Online Retail II weekday shape, cited) · price elasticity ε_p (constant-elasticity; literature −0.6 to −2.5 for perishables) · freshness decay (WTP falls with days-to-expiry, Tsiros & Heilman 2005)). Policies: fixed; threshold markdown (adjustable); **per-category policy search** (coordinate search over (d1,d2,t1,t2) with common random numbers across policies) producing a waste–margin Pareto front; sensitivity panel (elasticity ×0.5, shelf life ±1 d); 10-seed averages with bootstrap CIs. All in-browser.

**Why it impresses:** variance-reduced policy comparison (CRN), cannibalisation modelling, Pareto view — clear thinking rather than a toy.

**Sketch:** 1) `products.json` (20 SKUs, cited shelf lives/costs). 2) `sim.ts` (day loop, batches, expiry, choice). 3) `policies.ts`. 4) `search.ts` worker. 5) dashboard (React + Plotly/D3) with seed display, per-product markdown timeline, Pareto front, sensitivity. 6) static deploy.

**Libraries:** react 19, plotly.js or d3, seedrandom; no backend.

**Evaluation:** waste reduction % and margin change vs fixed, mean ± CI over ≥10 seeds; sensitivity table.

**Where it bites:** assumption credibility — every constant needs a citation or a stated guess; keep the simulator explainable on one slide; don't over-fit the policy to one seed.

---

## 1.1 Code-Mixed Support Triage Assistant (★)

**Core technique:** Three-signal ensemble with calibrated escalation: (a) char-n-gram (2–5) TF-IDF + logistic regression on cleaned Bitext (placeholders `{{Order Number}}` → generic tokens) — robust to code-mixing; (b) multilingual embedding kNN (multilingual-e5-small, in-browser via `Xenova/multilingual-e5-small`) over Bitext; (c) LLM zero-/few-shot JSON (intent, urgency, confidence, draft reply) with few-shots chosen by similarity from Bitext only (never the test set). Escalation via **split conformal prediction** on a held-out Bitext calibration split (+ small code-mixed calibration set disjoint from the 30-message test set): escalate when the prediction set has size ≠ 1, with the reason naming the competing intents; plus an OOD detector (embedding distance to Bitext manifold) producing "unfamiliar language mix". Romanised Tamil/Hindi normaliser (variant spellings map, indic-transliteration 2.3.82 for script-mixed inputs). Urgency: rule lexicon (refund, damaged, urgent, "now") + LLM. Stretch: reply in the customer's mix, queue dashboard.

**Why it impresses:** calibrated abstention with a guarantee rather than an ad-hoc threshold, and an ablation showing LLM vs classical on code-mixed input.

**Sketch:** 1) load Bitext (26 872 rows, 27 intents, 11 categories; CDLA-Sharing-1.0), clean, 80/10/10 split. 2) TF-IDF+LR; macro-F1. 3) embeddings + kNN. 4) conformal calibration (mapie 1.6.0 or 20 lines of numpy). 5) backend `/triage` (LLM key) on Vercel/HF. 6) inbox UI + test-set page with per-message results. 7) write ≥30 (aim 60) Tanglish/Hinglish messages with two annotators, report agreement.

**Libraries:** datasets, scikit-learn 1.9.1, mapie 1.6.0, sentence-transformers 6.2.0 or @huggingface/transformers 4.3.1, groq 1.7.0 / google-genai 2.32.0, indic-transliteration 2.3.82.

**Evaluation:** macro-F1 on Bitext held-out and separately on the code-mixed set; escalation rate; share of escalated messages that were actually wrong (escalation precision); conformal empirical coverage.

**Where it bites:** Bitext is synthetic and nearly trivially separable (F1≈0.99 means nothing); the code-mixed set is the whole game — write it first; LLM rate limits on stage; leakage of test messages into prompts.

---

## Final ranking by achievable technical depth (12 agent-hours, demoable live)

1. **4.3** — HGS (PyVRP) static + event-driven re-plan from fleet state, warm-started re-solve vs ALNS repair with measured latency/quality; richest algorithmic story; backend needed (HF Space/Render) but ALNS can live in-browser as a fallback.
2. **4.2** — exact DP picker routing on an aisle graph + SA slotting with incremental evaluation + held-out order replay inside a real-time 3D twin; zero backend; the most visually striking.
3. **2.3** — open-set recognition bake-off (MSP/energy/Mahalanobis/kNN) + LOCO + prototype few-shot, all inferenced in-browser from ONNX.
4. **3.2** — receding-horizon LP (HiGHS WASM) with hindsight-optimal bound, solar/TOU; in-browser; depends on getting ACN-Data tonight.
5. **1.3** — hybrid + abbreviation normalisation + cross-encoder refusal calibration + validated citations; needs LLM backend; test set must be pre-registered.
6. **3.3** — unit-aware IFC pset traversal, mutation-tested rules, IDS via ifctester, embodied carbon, 3D highlight; backend required.
7. **1.2** — DuckDB-WASM semantic layer + AST guard + execution self-consistency + clarify step.
8. **2.1** — calibrated cost thresholding + knapsack assignment + conformal + drift.
9. **2.2** — selective classification with coverage curve, quality gate, Eigen-CAM in-browser.
10. **3.1** — reliability state machine + CPCB reproduction + back-test.
11. **1.1** — conformal escalation + OOD + ensemble on a synthetic base dataset.
12. **4.1** — logit cannibalisation simulator + CRN policy search (sound but shallow).

**Verification flags for the team:** (i) confirm HF free Docker Space builds now; (ii) register at ev.caltech.edu if 3.2 is in play; (iii) open sintef.no 25-customer page in a browser to copy BKS (bots get 403); (iv) download MaintNet from the Kaggle mirror if 1.3 is in play (official site TLS error); (v) NEU-CLS via figshare mirror; (vi) pin Python 3.12 and the versions above in requirements/package.json tonight.