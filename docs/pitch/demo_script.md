# Demo script: 5 minutes, live

This follows the beats in [BUILD_SPEC §9](../BUILD_SPEC.md), led by the comparison that matters: the brief's Baseline against our optimiser. **A** = Anand, **J** = Junaid. Whoever is not speaking drives the laptop, so both of us explain a technical beat. About 460 spoken words, roughly 3.5 minutes at a calm pace, which leaves time for clicks and camera moves.

Numbers in [square brackets] are what we expect to see on screen. **Read them off the screen, not off this sheet**: the screen is the evidence. If the final `npm run eval` changes them, update the brackets (see the checklist in [README.md](README.md)).

Keys: `Space` play/pause · `1` `2` `3` camera Overview / Follow / Top · `R` race · `Esc` clear selection. Modes are the tabs in the top bar: Replay, Slot, Race, Anneal, Evidence.

## Before the demo (T − 10 min)

- [ ] Open the **deployed** URL in Chrome, full screen (F11), zoom 100%. Top bar: routing **Exact**, quality **MQ**.
- [ ] Hard-refresh once. Evidence → Reproducibility shows the commit hash of the build we submit.
- [ ] Set up the hook: **Slot** tab → **Apply SA layout**. Then **Race** tab → Ghost: **Baseline**. Do not press Start yet.
  Use the **Start race** button, not `R`: with the SA layout on the floor, `R` picks Original as the ghost.
- [ ] Leaderboard (if mounted): two rehearsal entries saved, so the board is not empty.
- [ ] Laptop on mains power, notifications off. After the first load the app needs no network.
- [ ] Fallbacks ready: the recording (`Ghostwalk_demo.mp4`) paused in a player, and `npm run preview` in `web/`.

## The run

| Time | Speaks | On screen (the other person drives) | Say |
|---|---|---|---|
| **0:00** | J | Race tab: **Start race**. Camera `1` Overview. | "Pickers spend a big part of a shift walking, and where products sit decides how far. This see-through ghost walks the layout the problem statement told us to beat: fast movers nearest the dock. The solid picker walks the layout our optimiser found. Same real orders, same aisles, two layouts." |
| 0:25 | J | Point at the two counter groups, then at **This race** and **Full held-out**. | "These six orders are the ones where the two layouts differ most, so the gap here is large. The number that counts is underneath: all held-out orders, [about 11 %] less walking. Every metre is measured by replaying orders, not claimed." |
| **0:50** | A | **Evidence** tab, Data section. Then hover the hottest carton (rank #1, 23084 RABBIT NIGHT LIGHT). | "The orders are real: UCI Online Retail II, a UK gift retailer, November 2011. We removed cancellations, returns and non-product codes, and kept the 100 busiest products. This is the busiest one: [238] picks in the first half of November alone." |
| **1:15** | A | **Replay** tab (the hero order, a train order), `2` Follow camera, `Space`. Then top bar routing **Exact → S-shape**, `Space` again. | "One real invoice. The picker leaves the dock, walks the aisles, never through a rack, stops eight seconds per line and comes back. The route is the exact shortest tour, solved with Held–Karp. Now the S-shape route a human picker usually walks: more metres. That gap is routing. The rest of the demo is slotting." Switch back to **Exact**. |
| **2:00** | J | **Slot** tab → **Start from Baseline**. Cartons fly. `3` Top camera. | "This is the brief's Baseline. The KPI card has two columns: train, the first half of November, and held-out, the second half. Layouts are built on train and scored on held-out, which no layout has seen." |
| 2:20 | J | The rehearsed swap: click **23301 KEEP CALM kneeling pad** (A2 · left · bay 2), then the carton at **A3 · left · bay 3**, next to the other kneeling pad (23300). KPI headline turns green. | "Baseline ranks products one at a time. It never asks what is bought together. These two kneeling pads sit in the same orders, but Baseline puts them far apart. One swap, and held-out walking drops [about 0.2 %]." |
| **2:45** | J | Point at the KPI table: Original and Baseline rows. | "That is also why Baseline barely beats plain catalogue order, [3.8 %]. Catalogue order sorts by product code, so families like these sit together by accident." |
| **3:05** | A | **Slot** → **Start from Baseline**. **Anneal** tab: seed 42, **3k**, **Run**. Cartons fly; the curve draws towards the dashed **shipped SA 30k** line. When it stops: **Apply result to my layout**. | "Our opponent is simulated annealing. It swaps two products, re-routes only the orders that change, keeps improvements, and early on sometimes accepts a worse move to escape a dead end. It only sees training orders, and it learns which products travel together. The budget is iterations, not seconds, so seed 42 gives this exact layout on any machine. The dashed line is the full 30,000-iteration run from our evaluation script." |
| 3:50 | A | Leaderboard (if mounted): type a name, **Save my layout**. | "It goes on the leaderboard with its held-out kilometres, the change against Baseline, the seed and the commit, so anyone can re-score it." |
| **4:05** | J | **Evidence** tab: routing honesty, in-sample vs held-out, reproducibility, then **Assumptions & limitations**. | "One simulator makes every number: the same code runs in this browser and in `npm run eval`, and the README copies its output by script. Orders up to eleven stops are routed exactly; this line shows how many were not. Limitations: the orders are real, but the warehouse geometry and the time model are our assumptions, and we slot the top 100 products only." |
| **4:40** | A | Closing slide with the QR code and links. | "Static site, no server, no keys. The repo, live link and dev log are here. Questions welcome." |

Target finish: 4:50. Hard limit: 5:00.

## Picks for the demo

Computed with the real engine (`web/src/sim/` at engine commit `7aba833`, unchanged since in `3d80437`) from the Baseline layout. Re-check at rehearsal, because any engine change can move them.

- **Rehearsed swap (2:20).** `23301` GARDENERS KNEELING PAD KEEP CALM (train rank #13, slot 21 = A2 · left · bay 2) ↔ the carton in slot 42 (A3 · left · bay 3, `84946` ANTIQUE SILVER T-LIGHT GLASS). That puts it beside `23300` GARDENERS KNEELING PAD CUP OF TEA (slot 43). Effect vs Baseline: train −425 m, held-out −254 m. Backup with a similar effect: `22727` ALARM CLOCK BAKELIKE RED (slot 25) ↔ slot 43, beside `22726` ALARM CLOCK BAKELIKE GREEN: train −309 m, held-out −265 m. Keep a swap only if the KPI card shows **both** columns improving.
- **Hottest carton (0:50).** `23084` RABBIT NIGHT LIGHT, train rank #1 (238 train picks, 487 in the whole month), sits in slot 0 under Baseline. The hover label shows its train picks.
- **Hero order (1:15).** The Replay tab opens on the first train order with 6–9 lines; the **Hero order** button returns to it. Use it.

## If something goes wrong

| Problem | Do this | Say |
|---|---|---|
| KPI shows grey bars (still scoring) | Keep talking; it fills in a second or two | "It re-scores every order in a background thread." |
| Anneal not finished by 3:45 | **Cancel**: it keeps the best layout so far | "Cancel keeps the best so far; the dashed line is where the full run ends." |
| Race not finished by 0:45 | Set the speed in the bottom bar to 20× | (nothing) |
| WebGL context lost / black canvas | Reload. The panels keep working without the 3D view | "Same numbers, the 3D view just restarted." |
| A number looks wrong | Do not improvise. Open Evidence | "This is the simulator's output; the same numbers are in eval/results.md." |
| Deployed URL down / no Wi-Fi | `npm run preview` on the laptop, or play the recording | "Same build, served locally." |
| Out of time at 4:05 | Go straight to the limitations | Never skip the limitations. |

## Recording the ≤ 5-minute demo (submission item)

1. Rehearse the run once end to end with a timer. It must finish under **5:00**, the hard limit in the rules. Aim for 4:50.
2. Record at 1920 × 1080, 30 fps, with the microphone on. Use OBS (Display Capture + Mic) or the Windows Game Bar (`Win + Alt + R`).
3. Record the deployed site, not localhost, so the URL bar matches what judges will open.
4. Export to MP4 (H.264 + AAC). Check the length, and that audio is present throughout.
5. Save it as `Ghostwalk_demo.mp4` and keep it out of git (it is large). Upload it where the submission form asks, and keep a local copy as the on-stage fallback.

## 3-minute overview cut (YouTube bonus, #11)

The same run, shortened: 0:00 Baseline-vs-SA race → 0:25 data in one sentence → 0:40 replay with the S-shape flip → 1:15 Baseline + kneeling-pad swap → 1:50 why Baseline barely beats catalogue order → 2:10 a 1k anneal → 2:35 Evidence and limitations → 2:55 links. Upload as **Public** or **Unlisted** with the title "Ghostwalk: race your old warehouse (NexAI Hack 2026, PS 4.2)", then link it in the README and in both posts.
