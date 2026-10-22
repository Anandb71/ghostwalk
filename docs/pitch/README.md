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
3. **Screenshots**: from the **deployed** app, 16:9 PNG, ideally 1600 × 900, saved as:
   - `img/race.png`: Race mode mid-run, ghost and solid picker both visible, both counter groups on screen.
   - `img/slot.png`: Slot mode, top camera, one carton selected, KPI card filled.
   - `img/anneal.png`: Anneal mode with the curve partly drawn and cartons mid-flight.
4. **Video URL** (optional): the YouTube overview in `deck/links.json` → `video` (#11).

Then rebuild, and open the deck once in PowerPoint to check it.

## Before submitting

- [ ] `npm run build -- --strict` prints "nothing pending".
- [ ] The Results slide's numbers match `eval/results.md` from the commit being submitted.
- [ ] The demo recording is ≤ 5:00, with audio throughout.
- [ ] One full rehearsal with both of us, using `demo_script.md` and a timer.
