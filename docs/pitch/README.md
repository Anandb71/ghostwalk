# Pitch material (#10)

| File | What it is |
|---|---|
| [`Ghostwalk_pitch.pptx`](Ghostwalk_pitch.pptx) | The pitch deck (PowerPoint, as the rules require). **Generated, do not edit by hand.** |
| [`deck/build-deck.ts`](deck/build-deck.ts) | Builds the deck from the repo's own data: geometry from `web/src/sim/layout.ts`, counts from `orders.json`, results from `eval/results.md`, the SA curve from `sa_seed42.json` |
| [`deck/links.json`](deck/links.json) | Repo, live and video URLs shown on the last slide |
| [`demo_script.md`](demo_script.md) | The timed 5-minute demo, fallbacks, and how to record it |
| [`qa_cards.md`](qa_cards.md) | Answers for the 3-minute Q&A |
| `img/` | Screenshots the deck embeds (you add these, see below) |

## Rebuild the deck

```bash
cd docs/pitch/deck
npm ci
npm run build              # writes ../Ghostwalk_pitch.pptx and lists anything still pending
npm run build -- --strict  # same, but exits 1 if anything is pending: run this before submitting
```

Inputs that do not exist yet render as dashed "Pending: …" frames, so the deck always builds. The build lists each one. In order of arrival:

1. **`eval/results.md` and `web/public/layouts/sa_seed42.json`**: run `npm run eval` in `web/` (#2). They fill the Results slide (table + held-out headline) and the annealing convergence chart.
2. **Live URL**: put the Vercel URL in `deck/links.json` → `live` (#7).
3. **Screenshots** (16:9 PNG, 1600 × 900): `img/race.png` (Race, Baseline ghost vs SA, both counter groups), `img/slot.png` (Slot, top camera, the #1 carton selected, KPI filled), `img/anneal.png` (Anneal, 3k run part-drawn, cartons mid-flight). The current files were captured on 22 Oct from a local production build of engine commit `7aba833`. Later engine commits changed the Anneal panel (shipped curve behind the live run, Apply or Discard) and the carton labels (train picks), so re-capture from the deployed app before submitting. `docs/img/hero.png` (the README image) is the same race shot.
4. **Video URL** (optional): the YouTube overview in `deck/links.json` → `video` (#11).

Then rebuild, and open the deck once in PowerPoint to check it.

## Before submitting

- [ ] `npm run build -- --strict` prints "nothing pending" (if we make no video, the only allowed pending line is the video URL).
- [ ] The Results slide's numbers match `eval/results.md` from the commit being submitted.
- [ ] Every row of "Numbers to re-check after the final eval" (below) is checked.
- [ ] The demo recording is ≤ 5:00, with audio throughout.
- [ ] One full rehearsal with both of us, using `demo_script.md` and a timer.

## Numbers to re-check after the final eval

The README headline and results, and the deck's Results slide and SA curve, are generated from `eval/results.md` and `sa_seed42.json`: re-run `npm run eval`, `npx tsx ../scripts/sync-readme.ts` (from `web/`) and `npm run build` (here) and they update themselves. The numbers below are typed by hand and do **not** update. The files in this commit were built from `eval/results.md` generated at engine commit `7aba833` (committed in `3d80437` on the engine branch, which was not yet pushed at review time). If the eval is re-run again, re-check this table.

| Where | Typed number | Source to check against |
|---|---|---|
| `docs/posts.md` (LinkedIn, X) | 11.1 % less walking; 101.71 km → 90.40 km; 10.0 % ± 1.2 pp over five seeds | `eval/results.md` → Headline |
| `docs/posts.md`, README first screen | 2,362 orders | `orders.json` meta (stable) |
| `demo_script.md` 0:25 | [about 11 %] full held-out | Race panel / KPI card with the SA layout applied |
| `demo_script.md` 0:50 | [238] train picks for 23084 | hover label (data, stable) |
| `demo_script.md` 2:20 and Picks | swap 23301 ↔ slot 42: train −425 m, held-out −254 m, [about 0.2 %]; backup 22727 ↔ slot 43: −309 m / −265 m | KPI card after the swap from Baseline |
| `demo_script.md` 2:45 | [3.8 %] Baseline vs Original | KPI card, Original row |
| README "Why Baseline barely beats catalogue order", `qa_cards.md` card 17 | 7 of 8 top pairs are families; catalogue keeps 6 of 8 within 5.2 m; Baseline puts 6 of 8 at 10–20 m; shipped SA has all 8 within 2.4 m | engine `dist(slotNode(a), slotNode(b))` on each layout; the SA figure depends on the new `sa_seed42.json` |
| `DEV_LOG.md` | results quoted for `645629f` and `7aba833` | historical: leave as written, each is labelled with its commit |
