# Demo script: 5 minutes, live

This follows the beats in [BUILD_SPEC §9](../BUILD_SPEC.md). **A** = Anand drives the laptop, **J** = Junaid speaks, and we swap roles for the Evidence beat so both of us are heard. Spoken lines are written out in full: about 470 words, roughly 3.5 minutes at a calm pace, which leaves time for the actions. Do not read out numbers from this sheet. Read them off the screen, because the screen is the evidence.

Keyboard: `Space` play/pause · `1` `2` `3` camera Overview / Follow / Top · `R` race · `Esc` clear selection.

## Before the demo (T − 10 min)

- [ ] Open the **deployed** URL in Chrome, full screen (F11), zoom 100%, quality **Medium**, policy **Exact**.
- [ ] Hard-refresh once, so the deployed build is current and the commit hash in Evidence matches `main`.
- [ ] Leaderboard: two rehearsal entries saved ("Anand", "Junaid"), so the board is not empty on stage.
- [ ] Hero order loaded in Replay (see "Picks for the demo" below), camera **Follow**.
- [ ] Race tab pre-set to ghost = **Baseline**, so the hook starts with one click.
- [ ] Laptop on mains power, notifications off (Focus assist), Wi-Fi only as a fallback: after first load the app needs no network.
- [ ] Fallback ready: the recorded demo (`demo.mp4`) open in a paused player on a second desktop.

## The run

| Time | Who | On screen (A) | Say (J) |
|---|---|---|---|
| **0:00** | A + J | Press `R`. Ghost race running, camera Overview. | "Same six orders, two layouts. The see-through picker is our old warehouse. The solid one is the new layout. Same invoices, same aisles. Watch the counters." |
| 0:20 | | Let both pickers finish. Point at the two counter groups. | "Every metre you see is measured, not claimed. That is what this problem asks for, and it is what we built around." |
| **0:30** | | Open the Data card. Click the hottest (orange) carton. | "This is real data: one month of UCI Online Retail II, November 2011, a UK gift retailer. We cleaned out cancellations, returns and postage codes and kept the top 100 products. This carton is the most-picked product of the month." |
| **0:50** | | Replay tab, hero order, `2` Follow camera, `Space` at 1×. | "Here is one real invoice. The picker leaves the dock, walks the aisles, never through a rack, stops at each slot, eight seconds a line, and comes back. The route is the exact shortest tour, computed with Held–Karp." |
| 1:20 | | Toggle policy **Exact → S-shape**, replay. | "This is what a human picker usually does: walk every aisle end to end. The metres go up. That difference is routing. The rest of the demo is about slotting." Toggle back to **Exact**. |
| **1:40** | | Slot tab. Press **Baseline**: cartons fly into place. KPI card fills. | "The problem statement gives us a baseline to beat: fast movers nearest the dock. Notice there are two columns, train and held-out. Everything is decided on the first half of November and scored on the second half, which the layout has never seen." |
| 2:05 | | `3` Top camera. Rehearsed swap: Wooden **Tree** next to Wooden **Star** and **Heart**. | "Baseline only looks at how often each product is picked, not at what is picked *together*. These three Scandinavian decorations travel in the same orders, but the tree is ranked low, so Baseline parks it far away. One swap…" (delta goes green) "…and held-out walking drops." |
| **2:30** | | Race: ghost **Baseline** vs **You**. | "Now we race my layout against Baseline on held-out orders. Both are labelled. 'This race' is these six orders; 'Full held-out' is all of them." |
| 3:00 | | Race: ghost **Original** vs **Baseline**. | "And for scale, catalogue order, what a warehouse does when nobody slots, against Baseline. That gap is big, which is exactly why our headline is measured against Baseline, not against this." |
| **3:30** | | Anneal tab, seed 42, **3,000** iterations, Start. Cartons fly, curve draws over the shipped 30k curve. | "Our opponent is simulated annealing. It swaps cartons, keeps what shortens the walk, and occasionally accepts a worse move to escape local optima. It only ever sees the training orders. The budget is iterations, not seconds, so seed 42 gives this exact layout on any machine." |
| 4:00 | | Apply the result. Open the Leaderboard, save as "SA live". | "The result flies in, and it goes on the leaderboard: held-out kilometres, the delta against Baseline, and the seed and commit, so any entry can be re-scored." |
| **4:15** | J drives, A speaks | Evidence tab. Point at: held-out table, exact vs heuristic share, seed, commit hash, limitations. | (A) "Everything on screen comes from one deterministic simulator. The same code runs in the browser and in our evaluation script, and the README's numbers are pasted from it. Orders up to eleven stops are routed exactly; this line shows how many weren't. And the limitations: the orders are real, the warehouse geometry and the time model are our assumptions, and we only slot the top hundred products." |
| **4:45** | | QR code / repo URL slide or Evidence footer. | (J) "Repo, live link and dev log are on screen. It runs in any browser, no backend, no keys. The laptop is yours for questions." |

## Picks for the demo

Chosen from the data. **Confirm them in rehearsal with the real engine before the demo**, because a beat that shows the wrong colour is worse than skipping it.

- **Affinity swap (2:05).** From the train orders, the most co-ordered pairs include the Scandinavian trio:
  - `22579` WOODEN TREE CHRISTMAS SCANDINAVIAN, a low pick rank, ordered with:
  - `22578` WOODEN STAR CHRISTMAS SCANDINAVIAN and `22577` WOODEN HEART CHRISTMAS SCANDINAVIAN, both high pick rank.

  Under Baseline, swap the Tree with whatever sits in the slot next to the Star or Heart. Keep it only if **both** train and held-out improve. Next candidates to try: `22086` / `22910` (paper chain kits), `23300` / `23301` (kneeling pads), `23343` / `23344` (jumbo bags).
- **Hero order (0:50).** A held-out invoice with 8–10 distinct products spread over at least three aisles under the current layout, so the path is interesting but still exact (≤ 11 stops). First held-out candidates: invoices `576650`, `576654`, `576655`, `576657`, `576658` (16 Nov). Pick the one with the best-looking route in Follow camera.

## If something goes wrong

| Problem | Do this |
|---|---|
| WebGL context lost / black canvas | Reload. Everything is client-side and loads in seconds. If it repeats, switch to the recording. |
| Anneal is slow on the venue laptop | Lower the iterations to 1,000. The shipped 30k curve is still drawn behind it. |
| A number looks wrong | Do not improvise. Open Evidence and say "this is the simulator's output; the same numbers are in eval/results.md". |
| Out of time at 4:15 | Skip to Evidence and read the limitations. Never skip the limitations. |

## Recording the ≤ 5-minute demo (submission item)

1. Rehearse the run above once end to end with a timer. It must finish under **5:00**, the hard limit in the rules. Aim for 4:40.
2. Record at 1920 × 1080, 30 fps, with the microphone on. Use OBS (Display Capture + Mic) or the Windows Game Bar (`Win + Alt + R`).
3. Record the deployed site, not localhost, so the URL bar matches what judges will open.
4. Export to MP4 (H.264 + AAC). Check the length, and that audio is present throughout.
5. Save it as `Ghostwalk_demo.mp4` and keep it off git (it is large). Upload it where the submission form asks, and keep a local copy as the on-stage fallback.

## 3-minute overview cut (YouTube bonus, #11)

The same run, shortened: 0:00 hook race → 0:20 data in one sentence → 0:35 replay with the S-shape flip → 1:15 Baseline + affinity swap → 1:50 Baseline-vs-You race → 2:15 a 1,000-iteration anneal → 2:40 Evidence and limitations → 2:55 links. Upload as **Public** or **Unlisted** with the title "Ghostwalk: race your old warehouse (NexAI Hack 2026, PS 4.2)", then link it in the README and in both posts.
