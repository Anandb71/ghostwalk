# Public posts and submission URLs (#11)

Drafts for the LinkedIn and X posts the rules require (§7), plus every URL the final submission form asks for (§8). **Nothing here has been posted.** Post from your own accounts after filling the `{{…}}` placeholders.

Rules §7 checklist for each post: problem + solution ✔ · screenshot or short clip · repository URL ✔ · deployment URL (`{{LIVE_URL}}`) · **#NEXAI2026** ✔ · tag teammates (`{{TEAMMATE}}`) · tag the official conclave handles (`{{OFFICIAL_HANDLES}}`, once announced).

The result numbers below (11.1 %, 101.67 → 90.38 km, 10.0 % ± 0.9 pp, 2,362 orders) are from `eval/results.md` at engine commit `645629f`. **Re-check them against the final `eval/results.md` before posting** (checklist in [pitch/README.md](pitch/README.md)).

## Placeholders to fill

| Placeholder | Where it comes from |
|---|---|
| `{{LIVE_URL}}` | The Vercel URL (#7). Also put it in `docs/pitch/deck/links.json` and the README. |
| `{{VIDEO_URL}}` | The ≤ 3-min YouTube overview, if we make it (bonus). Otherwise delete that line. |
| `{{TEAMMATE}}` | LinkedIn: type `@` and pick the teammate's profile. X: their handle. Junaid tags Anand; Anand tags Junaid. |
| `{{OFFICIAL_HANDLES}}` | The NexAI conclave handles, once the organisers announce them. |

## Media

- **Image:** `docs/pitch/img/race.png` (the Baseline ghost racing the SA layout).
  Alt text: *"Ghostwalk: a 3D warehouse floor where a translucent ghost picker on the fast-movers baseline layout races a solid picker on the optimised layout over the same orders, with distance and time counters for each."*
- **Or a clip (better):** 15–30 s of the race, 1080p, no audio needed. Windows Game Bar (`Win + Alt + R`) is enough. Both LinkedIn and X play MP4 inline.

## LinkedIn draft

> In a warehouse, pickers can spend more time walking between shelves than picking. Where each product sits (its slot) decides how far they walk.
>
> For #NEXAI2026 (Problem 4.2: Warehouse Digital Twin), {{TEAMMATE}} and I built Ghostwalk, a 3D digital twin of a picking floor that runs in the browser. It replays one real month of orders: 2,362 invoices from the UCI Online Retail II dataset, November 2011.
>
> How it works:
> - Every invoice replays in 3D. The picker walks the aisles, never through racks, on the exact shortest tour, with live distance and time counters.
> - A translucent ghost picker walks the classic "fast movers nearest the dock" baseline. A solid picker walks a layout found by simulated annealing, or your own. Both walk the same orders.
> - You can swap cartons yourself and watch the score change, then run the optimiser live in the browser.
>
> Layouts are built from orders of 1–15 Nov and scored on 16–30 Nov, which none of them saw. On those held-out orders the annealed layout walks 11.1% less than the baseline (101.67 km to 90.38 km). Across five seeds it is 10.0% ± 0.9 pp. The orders are real; the warehouse geometry and the time model are our stated assumptions.
>
> No backend and no API keys: it is a static site, and all scoring runs in a Web Worker.
>
> Try it: {{LIVE_URL}}
> Code: https://github.com/Anandb71/ghostwalk
> 3-min overview: {{VIDEO_URL}}
>
> Built with React Three Fiber, TypeScript and Claude Code. Data: UCI Online Retail II (Chen, 2019), CC BY 4.0.
>
> {{OFFICIAL_HANDLES}}
> #NEXAI2026 #DigitalTwin #Warehousing #Logistics

## X draft (single post)

X's limit is 280 weighted characters: each link counts as 23. With a 16-character teammate handle, this post measures **267**. Put `{{OFFICIAL_HANDLES}}` in the first reply.

> Ghostwalk: a 3D warehouse twin replaying 2,362 real orders. A ghost picker walks the fast-movers baseline, a solid one our annealed layout. On held-out orders: 11.1% less walking.
>
> Play {{LIVE_URL}}
> Code https://github.com/Anandb71/ghostwalk
>
> #NEXAI2026 {{TEAMMATE}}

### Optional reply

> 2/ Layouts are built on 1-15 Nov and scored on 16-30 Nov. Every route is an exact Held-Karp tour on the aisle graph, and the optimiser is seeded and iteration-capped, so it reproduces anywhere. Data: UCI Online Retail II, CC BY 4.0. {{OFFICIAL_HANDLES}}

Without the handles the reply measures 232, so the handles must fit in 48 characters. Re-check any edited post before posting. This prints the X-weighted length (links count 23, emoji 2):

```bash
node -e "const p=process.argv[1].replace(/https?:\/\/\S+/g,'x'.repeat(23)),e=/\p{Extended_Pictographic}️?/gu,L=[[0,4351],[8192,8205],[8208,8223],[8242,8247]];let n=(p.match(e)||[]).length*2;for(const c of p.replace(e,'')){const k=c.codePointAt(0);n+=L.some(([a,b])=>k>=a&&k<=b)?1:2}console.log(n)" "PASTE THE FINAL POST HERE"
```

## Submission form URLs (§8)

Fill these in as they come in. This is the one place to copy them from on submission day.

| # | Item | URL / file | Status |
|---|---|---|---|
| 1 | Public GitHub repository | https://github.com/Anandb71/ghostwalk | ✔ public (checked 22 Oct) |
| 2 | Live deployment | {{LIVE_URL}} | waiting on #7 |
| 3a | Demo recording (≤ 5 min) | `Ghostwalk_demo.mp4`, upload where the form asks; keep it out of git | to record (see `docs/pitch/demo_script.md`) |
| 3b | Pitch deck (PowerPoint) | [`docs/pitch/Ghostwalk_pitch.pptx`](pitch/Ghostwalk_pitch.pptx) | rebuild after the final eval and screenshots |
| 4a | LinkedIn post | {{LINKEDIN_POST_URL}} | to post |
| 4b | X post | {{X_POST_URL}} | to post |
| ★ | YouTube overview ≤ 3 min (bonus) | {{VIDEO_URL}}: public or unlisted, linked in the README and both posts | optional |

## Order of operations on the day

1. Deploy is live → put `{{LIVE_URL}}` into the README, `links.json` and this file.
2. `npm run eval` → `npx tsx ../scripts/sync-readme.ts` (README results) → capture the three screenshots → `npm run build -- --strict` in `docs/pitch/deck` (deck).
3. Re-check the hand-typed numbers (checklist in `docs/pitch/README.md`).
4. Record the demo (and the optional overview, then upload it to YouTube).
5. Post on LinkedIn, then X. Paste both post URLs into the table above.
6. Fill the submission form from the table.
