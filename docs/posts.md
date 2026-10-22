# Public posts and submission URLs (#11)

Drafts for the LinkedIn and X posts the rules require (§7), plus every URL the final submission form asks for (§8). **Nothing here has been posted.** Post from your own accounts after filling the `{{…}}` placeholders.

Rules §7 checklist for each post: problem + solution ✔ (in the drafts) · screenshot or short clip · repository URL ✔ · deployment URL · **#NEXAI2026** ✔ · tag teammates · tag the official conclave handles (once announced).

## Placeholders to fill

| Placeholder | Where it comes from |
|---|---|
| `{{LIVE_URL}}` | The Vercel URL (#7). Also put it in `docs/pitch/deck/links.json` and the README. |
| `{{RESULT}}` | One sentence built from `eval/results.md` (e.g. the SA vs Baseline held-out row). Copy the number from that file; do not round it differently. |
| `{{VIDEO_URL}}` | The ≤ 3-min YouTube overview, if we make it (bonus). Otherwise delete that line. |
| `{{TEAMMATE}}` | LinkedIn: type `@` and pick the teammate's profile. X: their handle. Junaid tags Anand; Anand tags Junaid. |
| `{{OFFICIAL_HANDLES}}` | The NexAI conclave handles, once the organisers announce them. |

## Media

- **Image:** `docs/pitch/img/race.png` (the ghost race, once captured from the deployed app).
  Alt text: *"Ghostwalk: a 3D warehouse floor where a translucent ghost picker on the old layout races a solid picker on the new layout over the same orders, with distance and time counters for each."*
- **Or a clip (better):** 15–30 s of the ghost race, 1080p, no audio needed. Windows Game Bar (`Win + Alt + R`) is enough. Both LinkedIn and X play MP4 inline.

## LinkedIn draft

> In a warehouse, pickers can spend more time walking between shelves than picking. Where each product sits (its slot) decides how far they walk.
>
> For #NEXAI2026 (Problem 4.2: Warehouse Digital Twin), {{TEAMMATE}} and I built **Ghostwalk**, a 3D digital twin of a picking floor that runs in the browser. It is driven by one real month of orders: 2,362 invoices from the UCI Online Retail II dataset, November 2011.
>
> How it works:
> → Every invoice replays in 3D. The picker walks the aisles, never through racks, on the exact shortest tour, with live distance and time counters.
> → You re-slot the cartons, then race a translucent ghost of your old layout against the new one, over exactly the same orders.
> → The bar to beat is the classic "fast movers nearest the dock" baseline, and after that a simulated-annealing optimiser that runs live in the browser.
> → Every number is measured on held-out orders (16–30 Nov) that no layout was built from. {{RESULT}}
>
> No backend and no API keys: it is a static site, and all scoring runs in a Web Worker.
>
> ▶ Try it: {{LIVE_URL}}
> 💻 Code: https://github.com/Anandb71/ghostwalk
> 🎬 3-min overview: {{VIDEO_URL}}
>
> Built with React Three Fiber, TypeScript and Claude Code. Data: UCI Online Retail II (Chen, 2019), CC BY 4.0.
>
> {{OFFICIAL_HANDLES}}
> #NEXAI2026 #DigitalTwin #Warehousing #Logistics #ThreeJS

## X draft (single post)

X's limit is 280 weighted characters: each link counts as 23 and each emoji as 2. With a 10-character teammate handle, this post measures **259**. That leaves no room for the official handles, so put `{{OFFICIAL_HANDLES}}` in the first reply (the thread below).

> Ghostwalk 👻 race the ghost of your old warehouse
>
> A 3D picking-floor twin on 2,362 real orders. Re-slot cartons, beat the baseline and a live optimiser, all on held-out orders.
>
> Play {{LIVE_URL}}
> Code https://github.com/Anandb71/ghostwalk
>
> #NEXAI2026 {{TEAMMATE}}

### Optional thread (replies to the post above)

> 2/ Honest scoring: layouts are built on 1–15 Nov and scored on 16–30 Nov. Every route is an exact Held–Karp tour on the aisle graph, and the optimiser is seeded and iteration-capped, so it reproduces anywhere. {{RESULT}} {{OFFICIAL_HANDLES}}

> 3/ Stack: React Three Fiber + TypeScript, with scoring in a Web Worker. A static site on Vercel, no backend. Data: UCI Online Retail II, CC BY 4.0. Built with Claude Code by {{TEAMMATE}} and me.

Measured without the placeholders: reply 2 is 209 and reply 3 is 192, so `{{RESULT}}` plus the handles must fit in about 70 characters. Re-check any edited post before posting. This prints the X-weighted length:

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
| 3b | Pitch deck (PowerPoint) | [`docs/pitch/Ghostwalk_pitch.pptx`](pitch/Ghostwalk_pitch.pptx) | draft, rebuild once results and screenshots land |
| 4a | LinkedIn post | {{LINKEDIN_POST_URL}} | to post |
| 4b | X post | {{X_POST_URL}} | to post |
| ★ | YouTube overview ≤ 3 min (bonus) | {{VIDEO_URL}}: public or unlisted, linked in the README and both posts | optional |

## Order of operations on the day

1. Deploy is live → put `{{LIVE_URL}}` into the README, `links.json` and this file.
2. `npm run eval` → `npx tsx ../scripts/sync-readme.ts` (README results) → capture the three screenshots → `npm run build -- --strict` in `docs/pitch/deck` (deck).
3. Record the demo (and the optional overview, then upload it to YouTube).
4. Post on LinkedIn, then X. Paste both post URLs into the table above.
5. Fill the submission form from the table.
