# Q&A cards

Three minutes of Q&A follow the 5-minute demo. Each card has a **20-second answer**, **what to show** on screen, and an **if pushed** follow-up. Both of us must be able to give every card. Numbers are not typed here: point at the Evidence panel or at `eval/results.md`, which come from the same simulator.

The first five cards are the ones issue #10 asked for. The rest are the follow-ups we expect.

---

## 1. Why Held–Karp? Why not just a heuristic?

**Answer.** We want the walking distance of a layout, not of a routing mistake. If routing is heuristic, a layout can look better just because the heuristic happened to route it better. Held–Karp gives the exact shortest tour for each order, so the difference between two layouts is caused by the layout alone. It is exact up to 11 bay stops (12 nodes with the dock). Above that we use nearest-neighbour + 2-opt and flag those orders.

**Show.** Evidence panel: "N orders exact (X % of metres), M heuristic".

**If pushed.** The DP is `dp[mask][j]`: the shortest walk from the dock through exactly the stops in `mask`, ending at `j`. That is O(2ⁿ · n²) time, about 250k steps at n = 11, under a millisecond per order. Each extra stop doubles the cost, so we cap it there and report the share of metres the cap affects. Exactness is a unit test: Held–Karp equals brute force on 200 random stop sets.

## 2. Why a held-out split?

**Answer.** If you slot and score on the same orders, you are fitting to those orders. Any optimiser looks great in-sample. The player, the heatmap and the optimiser see only 1–15 November. Every headline number is measured on 16–30 November, orders none of them saw. That is the difference between "this layout fits last fortnight" and "this layout would have saved walking next fortnight".

**Show.** KPI card: Train km vs Held-out km columns. Evidence panel: the in-sample vs held-out shrinkage.

**If pushed.** The split is chronological, not random, because a real warehouse re-slots on the past and lives with the future. A random split would leak same-week demand into training. Counts per half are in the Data table of the README (from `orders.json`).

## 3. Why is the headline "vs Baseline" and not "vs Original"?

**Answer.** The problem statement says to beat the baseline: fast movers nearest the dock. Beating an arbitrary original layout is easy and proves little, because almost any sensible rule beats catalogue order. So the big number on screen is held-out gain **vs Baseline**. The gain vs Original is shown second and labelled.

**Show.** KPI card headline tile; the Original, Random (42) and Baseline rows.

**If pushed.** Original is catalogue order (StockCode order, aisle by aisle), the "nobody slotted" layout. We added Random (seed 42) as a second reference so nobody can say we chose a convenient original. Baseline ranks by **train** picks only, so it does not peek at the held-out half either.

## 4. Is the optimiser reproducible?

**Answer.** Yes. Same seed + same iteration count = the same layout on any machine. The budget is iterations, not seconds, so a faster laptop does not change the result. The simulator never calls `Math.random` or `Date.now`. The PRNG is mulberry32, and the seed is shown in the UI. The shipped layout is seed 42 × 30,000 iterations, and `npm run eval` re-creates it.

**Show.** Anneal panel seed input; Evidence panel seed + commit hash; `web/public/layouts/sa_seed42.json`.

**If pushed.** `eval/results.md` reports SA as mean ± sd over 5 seeds, so you can see the spread rather than one lucky run. Elapsed milliseconds are displayed but never used as an input.

## 5. What is declared and what is observed?

**Answer.** **Observed:** the orders, which are real UCI Online Retail II invoices from November 2011: which products, which quantities, when. **Declared:** the warehouse. The problem statement leaves the layout to us: 5 aisles × 2 sides × 10 bays, three cross-aisles, 1.2 m/s walking, 8 s per pick line. The time model is synthetic. The order data is real, and the building is our assumption, stated in the README.

**Show.** Assumptions panel (one click from anywhere); README "Warehouse layout (declared)" with the floor plan generated from `sim/layout.ts`.

**If pushed.** Metres are the primary KPI because they depend only on geometry and the orders. Seconds add the declared constants on top (metres / 1.2 + 8 × lines). Changing those constants rescales time but not which layout walks less.

---

## 6. Is the 3D really driven by the data, or is it an animation?

**Answer.** The picker plays back the node path that `simulate()` returned for that exact invoice on the current layout. Swap two cartons and the next replay walks a different path. The counters sum the same per-order metres the KPI card uses.

**Show.** Replay an order, swap one of its cartons, replay: the route changes. The order card shows the real invoice id and timestamp.

## 7. How do you know the picker never walks through a rack?

**Answer.** Walking happens only on a 66-node aisle graph, and every leg is expanded into graph edges. A unit test checks that every consecutive pair in every tour path is a graph edge.

**Show.** Top camera: the route line stays on aisle centre lines and cross-aisles.

## 8. Why only the top 100 SKUs?

**Answer.** The problem statement asks for the top ~100 products, and 100 slots keep the scene smooth on a laptop. We report how much of the month's order lines those SKUs cover (Data table). Lines for other SKUs are dropped from each order, which is a stated limitation.

## 9. Why simulated annealing and not an exact or other method?

**Answer.** Slotting with exact routing inside is a hard combinatorial problem: every swap changes the tours of many orders. Annealing is simple, anytime and visual, and it is cheap per step because we re-route only the orders that contain the two swapped SKUs. That lets it run live in the browser.

**If pushed.** The incremental total is tested against a full recompute. The objective is train metres only. An ILP or genetic algorithm is possible future work; annealing was the best fit for a live, reproducible, in-browser opponent.

## 10. Is the improvement significant, or noise?

**Answer.** Three things guard against noise. Every number is on held-out orders. The simulator is deterministic, so the same layout always scores the same. SA is reported as mean ± sd over 5 seeds. Read the gap between Baseline and SA against that spread in `eval/results.md`.

## 11. Why the S-shape toggle?

**Answer.** S-shape is the routing many human pickers follow: walk every aisle with a pick end to end. Toggling it separates how much is saved by **slotting** from how much by **routing**. S-shape can never be shorter than the exact tour, and a test checks that on every order.

## 12. Does it run smoothly on a normal laptop?

**Answer.** Scoring runs in a Web Worker, so the 3D thread never blocks. Racks and cartons are instanced, labels appear only for hovered, selected and top-10 cartons, and bloom is off by default. Measured ms per full re-score is in `eval/results.md` and the Evidence panel.

## 13. How much of this did AI write? Can you explain it?

**Answer.** We used Claude Code throughout, declared in the README and DEV_LOG. It helped choose the problem, write the spec, generate code and draft docs. Every module was reviewed, and both of us can walk through any file. Ask us about any function.

**Be ready to explain without notes.** Held–Karp DP, the annealing loop (move, delta, Metropolis, cooling), the worker protocol, how the picker follows `path`, the Baseline rule, the leaderboard's "fresh score" rule.

## 14. What would you build next?

**Answer.** In order: batch picking (one trip serves several orders), two pickers with aisle congestion, rack levels and carton sizes, and real warehouse geometry imported from a CAD or WMS export instead of declared.

## 15. How does the leaderboard stop people gaming it?

**Answer.** It ranks on held-out km only. Save is disabled until the score for the exact layout on the floor has arrived. Entries scored under another routing policy or dataset are hidden, not mixed in. Export JSON includes the full assignment and commit hash, so anyone can re-score a claimed layout with the same engine.

## 16. What exactly was cleaned out of the data?

**Answer.** Cancelled invoices (numbers starting with C), lines with quantity or price ≤ 0 (returns, adjustments), and non-product codes such as POST, M and BANK CHARGES. Quantities of the same product within one invoice are summed into one pick. The count removed at each step is in the README Data table and in the Evidence panel.
