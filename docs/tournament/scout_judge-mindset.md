<!-- top_candidates: 4.2, 4.3, 3.3, 2.3, 1.3, 3.2, 1.2, 4.1, 3.1, 2.1, 2.2, 1.1 -->

# NexAI Hack 2026 — Judge-Mindset Analysis (for downstream agents)

Source of truth: `_inputs/instructions.txt` (rules) and `_inputs/problems.txt` (12 PS). Everything below is derived from those two docs plus domain knowledge of the named datasets/libraries. Items marked **(verify)** are from memory and should be checked against the live page before being quoted in the README/pitch.

---

## 1. Reconstructed scoring rubric (implicit, not published)

The instructions never state weights. Reconstruct from what they *insist* on. Treat the first block as **gates** (fail any → you are out of the prize conversation regardless of polish), the second as **scored differentiators**.

### 1.1 Gates (pass/fail)
| # | Gate | Where it comes from | How a judge checks in <2 min |
|---|---|---|---|
| G1 | Public GitHub repo exists **from kickoff**, commits **at least hourly**, no bulk dump, no pre-18:00-IST-21-Oct code | §3 "Commit history will be reviewed… disqualification review" | `git log --date=iso --format='%ad %an %s'` → first commit time, hourly spacing, commit sizes |
| G2 | All **3 must-haves** of the chosen PS are done and visible in the deployed app | §1 "Complete the three mandatory requirements… before attempting stretch goals" | Opens the live URL, tries each must-have |
| G3 | **Public deployment URL** (free tier OK) or the documented exception (local demo + YouTube linked in README) | §4, §8 | Clicks the URL during Q&A; cold-start > 30 s already looks bad |
| G4 | **Held-out evaluation, honest metrics, stated limitations**; fabricated results = disqualification | §5 | Asks "show me the split"; cross-checks numbers in README vs app vs deck |
| G5 | **Data provenance**: recommended / licensed public / clearly-labelled synthetic; no scraped personal or private company data | §5 | README "Dataset attribution and licence" section |
| G6 | **No secrets in repo or frontend**; `.env.example` present; exposed key rotated | §3 | `git log -p | grep -i "api_key"`; DevTools → Network/Sources on the live app |
| G7 | README has the 7 required sections (problem+solution, architecture diagram+stack, setup/run, deployment URL, dataset attribution+licence, team, DEV_LOG link) and **declares AI tools + dependencies** | §3, §6 | Scrolls README |
| G8 | LinkedIn + X posts with **#NEXAI2026**, screenshot/clip, repo URL, deploy URL, teammates tagged, official handles | §7, §8 | Opens the two post URLs |
| G9 | Demo recording ≤5 min + **PowerPoint (.pptx)** pitch deck submitted | §8 | File type check |
| G10 | **Every member can explain the code, including AI-generated code** | §3 | Picks a random member in Q&A, points at a function |

### 1.2 Scored differentiators (reconstructed weights)
| Weight | Criterion | What "10/10" looks like |
|---|---|---|
| 25% | **Core-challenge handling** (the sentence after "Core challenge:" in each PS) | The specific hard behaviour (refuse / unknown / trap / re-plan / data-driven twin) is demonstrated live on an input the judge chooses |
| 20% | **Evaluation rigour & honesty** | Held-out split described (sizes, seed, no leakage), optional metrics from the PS reported, a baseline, an ablation, limitations that are real not cosmetic |
| 15% | **Pitch + demo clarity in 5 min** | Problem → live app → evidence → limitations, no slide-reading, no dead air, deployed app not localhost |
| 10% | **UX / visual quality & live-demo smoothness** | Runs on an average laptop at 60 fps / <2 s responses, readable on a projector |
| 10% | **Code quality & explainability** | Small, boring, readable code; hand-rolled loops over opaque frameworks; one eval command |
| 10% | **Process evidence** | Hourly commits with meaningful messages, DEV_LOG with decisions/experiments/rejected ideas/AI assistance |
| 10% | **Stretch goals & originality** | Stretch goals that are *measured* (not just present), done only after must-haves |

Hidden multiplier: **"Progress reviews during the event"** (§1). A deployed walking skeleton by hour 3–4 earns goodwill that persists into final scoring.

---

## 2. Per-problem: explicit watch-outs + implicit gotchas judges will probe in the 3-minute Q&A

Format per PS: must-haves (compressed) → explicit watch-outs (from the doc) → implicit gotchas (what the judge actually asks) → proof artifacts to have ready → winning move.

### PS 1.1 Code-Mixed Support Triage (★) — Bitext, HF
**Must-haves:** (1) intent+urgency classifier over dataset categories returning a confidence; (2) ≥30 team-written Tanglish/Hinglish messages with expected labels, results shown in-app; (3) deployed inbox: message → intent, urgency, draft reply, escalate flag + one-line reason below threshold. **Optional metrics:** macro-F1 on held-out Bitext split and separately on the code-mixed set; escalation rate and how many escalated were actually wrong.
**Explicit watch-outs:** synthetic English with `{{Order Number}}`-style placeholders → clean them; keep the code-mixed test set out of any few-shot prompt; call the LLM from a backend, never ship a key in frontend code.
**Implicit gotchas:**
- **"Bitext has no urgency label. Where is your urgency ground truth?"** (dataset columns: `flags, instruction, category, intent, response` — 27 intents, ~11 categories **(verify)**). You must define urgency yourself (e.g. 3 levels), annotate it on the 30+ code-mixed set *and* a Bitext sample (say 200 rows) with 2 annotators and report agreement (Cohen's κ). Otherwise "urgency" is unevaluated.
- **"What is the confidence number, and why that threshold?"** An LLM's self-reported confidence is not calibrated. Defensible: TF-IDF+LogReg probability (the doc's own suggested baseline) + LLM label; escalate on disagreement or max-prob < τ; choose τ on the held-out Bitext split from an escalation-rate vs error-caught curve; show the curve.
- **"Who wrote the 30 messages — a human or the same LLM that classifies them?"** If generated by the classifying model, judges call it contamination. Have humans write/edit them; commit the file *before* any prompt tuning commit (timestamp proof).
- **"What happens when Gemini/Groq rate-limits you mid-demo?"** Free-tier RPM/RPD limits are small **(verify current numbers)**. Need a cached-result mode and the sklearn fallback path.
- **Is the baseline actually compared?** Doc suggests TF-IDF+LR "for comparison" — a judge expects a table LLM vs baseline on both test sets.
- **Escalation precision/recall:** of escalated messages, how many were wrong (precision of the escalation); of wrong predictions, how many got escalated (recall). Both numbers, not just "escalation rate".
**Proof artifacts:** `data/codemixed_test.jsonl` (≥30, with `expected_intent, expected_urgency, annotator`), `eval/` with split seed and per-set macro-F1, threshold curve PNG, backend-only API key path.
**Winning move:** hybrid classifier (LR + LLM) with disagreement-based escalation, similarity-picked few-shots from the *Bitext train split only*, reply drafted in the customer's language mix, queue dashboard. Crowded problem — only rigour stands out.

### PS 1.2 Ask-Your-Data Sales Agent, text-to-SQL (★★) — Online Retail II, UCI
**Must-haves:** (1) data in DuckDB/SQLite + README "data rules" note (cancellations, returns, missing customers); (2) agent: question → SQL on read-only connection, retry on failure, answer with SQL shown; (3) ≥10 trap questions (≥5 on cancellations/returns/ambiguity) with expected answers from hand-written SQL, app runs the suite with pass/fail. **Optional metrics:** execution accuracy on trap suite; share of ambiguous questions where the agent asked back.
**Explicit watch-outs:** `Invoice` starting with "C" = cancellation; wholesalers dominate revenue; prices in GBP, say so; LLM never gets write access, block anything not a SELECT.
**Implicit gotchas:**
- **"Is your SELECT-only guard a regex?"** Judge types `SELECT 1; DROP TABLE x`, `WITH t AS (...) SELECT`, `COPY`, `ATTACH`, `INSTALL`, `PRAGMA`, `SELECT * FROM read_csv('/etc/passwd')`. Defensible: `duckdb.connect(path, read_only=True)` + `SET enable_external_access=false` + single-statement parse (sqlglot) allowing only `Select`/CTE roots + statement timeout + row limit.
- **"How did you treat non-product StockCodes?"** POST, D, M, S, BANK CHARGES, DOT, CRUK, ADJUST, AMAZONFEE, gift vouchers; and `Price <= 0` rows. The data-rules note must list them and the regex used.
- **"Did you net cancellations against their originals?"** Many C-invoices have no matching original in the file; negative quantities without a C prefix exist (adjustments). State: revenue = non-C rows with Price>0 and product codes; returns = C rows; do **not** attempt matching, say why.
- **~25% rows have null `Customer ID`** — "best customers" must exclude nulls; "total revenue" must include them. Judge asks which the agent did for each.
- **Column names:** Online Retail II uses `Invoice, StockCode, Description, Quantity, InvoiceDate, Price, Customer ID, Country` (not `UnitPrice`/`InvoiceNo`). Two sheets (2009–2010, 2010–2011) with duplicate rows — dedupe and report count removed.
- **"Last quarter relative to what?"** Data ends 9 Dec 2011; the app needs a fixed "as-of" date shown in the UI.
- **"Were the trap questions in the prompt?"** Trap suite and expected answers must be committed before prompt engineering; judge will ask a *new* ambiguous question not in the suite.
- **Hard-coded passes:** if the suite "passes" because expected answers are cached, judges will re-run live. Show the live SQL + live result + diff against expected.
**Proof artifacts:** `data_rules.md`, `tests/trap_suite.yaml` (question, expected SQL, expected value, category), `eval.py` producing the pass/fail table, guard unit tests.
**Winning move:** clarifying-question step that is actually LLM-driven (not keyword), auto chart choice, multi-turn, and a visible "SQL guard" badge per query.

### PS 1.3 Maintenance Copilot — agentic RAG over logbooks (★★★) — MaintNet aviation
**Must-haves:** (1) ingestion normalising text (abbreviation expansion via MaintNet list or your own) + hybrid index BM25 + embeddings; (2) agent with ≥2 tools (`search_records`, `get_record`) answering with cited record IDs, refusing when matches are weak; (3) deployed chat UI with answer, cited records side-by-side, tool-call trace. **Optional metrics:** hit@5 on 15 team-written question→record pairs; citation precision; correct refusals on 5 unanswerable questions.
**Explicit watch-outs:** short records → similarity scores bunch → set *and justify* a refusal threshold; show a "not approved maintenance procedures" disclaimer; write test questions before tuning.
**Implicit gotchas:**
- **"Show me the commit where the 15 questions were written and the commit where you first tuned retrieval."** Ordering is checkable.
- **"How did you pick the gold record without paraphrasing it?"** If a question is a paraphrase of its gold record, hit@5 is inflated. Write questions from the *technician's* side (symptom-first), then find the gold by hand.
- **"Does hybrid beat BM25 alone? Does abbreviation expansion help?"** Expect an ablation: BM25 / dense / hybrid × with/without expansion on the 15 pairs.
- **"Why that threshold?"** Show the top-1 score histogram for the 15 answerable vs the 5 unanswerable questions; threshold at the point maximising refusal accuracy; admit n is small.
- **"What stops the LLM from citing an ID it never retrieved?"** A post-hoc citation validator that drops/flags IDs not present in the tool results — judges love seeing this fire.
- **"Is it actually agentic?"** The trace must show the LLM choosing `get_record` after `search_records`; a fixed pipeline with a fake trace is spotted immediately.
- **Deployment:** `sentence-transformers/all-MiniLM-L6-v2` (~90 MB) runs on HF Spaces CPU; precompute and commit the index; LLM key backend-only.
- **Licence/citation:** MaintNet page (RIT, Akhbardeh et al., COLING 2020) — cite the paper; Kaggle mirror "Aircraft Historical Maintenance Dataset (2012–2017)" is a fallback.
**Proof artifacts:** `eval/questions.jsonl` (15 + 5 refusal), `eval/ablation.md`, trace JSON per answer, disclaimer in UI.
**Winning move:** query-rewrite with the abbreviation dictionary shown inline ("GRD → ground"), recurring-defect detector, both domains. ★★★ and RAG fatigue among judges: only the evidence panel + refusal demo differentiates.

### PS 2.1 Maintenance Shift Planner (★) — AI4I 2020, UCI
**Must-haves:** (1) model + `/predict` taking one reading → failure probability + predicted failure mode; (2) alert threshold from a stated cost model (e.g. missed failure = 20× false alarm) with the cost-vs-threshold curve shown; (3) deployed planner: replay a batch as one shift, input technician slots (e.g. 3), show which machines get serviced and why. **Optional metrics:** PR-AUC on held-out; recall at the precision the cost model selects.
**Explicit watch-outs:** ~3.4% failures → accuracy meaningless, use class weights/resampling; drop UID and Product ID (leak row identity); data is synthetic — say so in README and pitch.
**Implicit gotchas:**
- **Leakage #2:** `Machine failure` is the OR of TWF/HDF/PWF/OSF/RNF. If any mode flag is a feature of the failure model, it's leakage. `Type` (L/M/H) is the first letter of Product ID and *is* legitimate.
- **"How do you predict failure *mode*?"** Multi-label (rows can carry >1 mode); RNF (~19 rows) is by construction random — admit it is unpredictable. There are inconsistent rows (failure=1 with no mode; RNF=1 with failure=0) **(verify counts ≈ 9 and 18)** — detect and state treatment.
- **"Where does 20× come from?"** Make it a slider with a stated default and a one-line justification (downtime cost vs technician hour); the threshold must move when the slider moves.
- **"Are your probabilities calibrated?"** Cost-based thresholds need calibrated probabilities. Show a reliability diagram; apply isotonic/Platt on the validation split; no-skill PR-AUC baseline is ≈0.034.
- **"AI4I has no machine IDs or timestamps — what is a 'shift'?"** Each row is an independent reading. You must declare: one row = one machine's latest reading; a shift = a sampled batch of N rows. "Per-machine history" stretch requires synthetic IDs — say so.
- **"Why these 3 machines?"** Ranking must be by expected cost avoided (p × C_miss − C_service), not raw probability; show the marginal gain for the 4th machine that didn't get a slot.
- **Threshold tuned on test?** Tune on validation, report on test; say the split sizes.
**Proof artifacts:** split description, PR curve, cost curve, calibration plot, planner explanation column.
**Winning move:** SHAP top-3 per machine, drift detector that fires when the judge types absurd torque, LLM-drafted ticket. Crowded; stands out only via cost-model rigour and planner explanation.

### PS 2.2 Leaf Doctor for Real Field Photos (★) — PlantDoc
**Must-haves:** (1) transfer-learning classifier (MobileNetV3/EfficientNet-B0, ImageNet-pretrained) on PlantDoc, 3–5 species OK; (2) photo-quality gate: blur, brightness, leaf-fills-frame, with specific retake tips; (3) deployed mobile-friendly app: upload/capture → gate → top-3 with confidence or "not sure, consult an expert". **Optional metrics:** top-1/top-3 on the PlantDoc test split; coverage curve.
**Explicit watch-outs:** small imbalanced classes → augmentation + per-class results; don't start from a PlantVillage-trained model; scraped images repeat → check no test image also sits in train.
**Implicit gotchas:**
- **"Show me the duplicate check."** Perceptual hash (`imagehash` pHash/dHash, Hamming ≤ 4–6) across train/test; report how many pairs found and removed. Use PlantDoc's **official** train/test folders (test ≈ 236 images **(verify)**), don't re-split.
- **Out-of-distribution upload:** judge uploads a hand, a wall, or a species you didn't train. Softmax will confidently say "Tomato late blight". The gate (vegetation-hue ratio in the centre crop + edge density) and the confidence threshold must catch it; show the OOD test you ran (e.g. 50 non-leaf images → rejection rate).
- **"Diseased leaves are yellow/brown — does your 'green' check reject them?"** Report the gate's false-reject rate on the real PlantDoc test set (should accept ≥90%).
- **"Why that confidence threshold?"** Temperature-scale on validation, then pick τ for a target accuracy-on-accepted (e.g. 85%) and report coverage; show the curve.
- **Grad-CAM stretch:** judge checks whether the heatmap sits on the lesion or the background.
- **Mobile:** `<input type="file" accept="image/*" capture="environment">`; put a QR code on the slide so a judge tries it on their phone.
- **Deploy:** training on Colab/Kaggle free GPU (≈10 min); inference on HF Spaces CPU; or export ONNX and run in-browser with `onnxruntime-web` (no cold start, static on Vercel) — impressive and robust.
**Proof artifacts:** per-class confusion matrix, dedupe log, coverage curve, OOD rejection test.
**Winning move:** in-browser inference + Tamil/Hindi UI + cited care notes. Most crowded problem of the 12; hard to stand out.

### PS 2.3 Unknown-Defect Steel Inspector (★★) — NEU-CLS
**Must-haves:** (1) classifier on 5 of 6 classes, README states the held-out class; (2) unknown detection (threshold / energy / centroid distance) with a confusion matrix that includes "unknown"; (3) deployed UI: upload → class or "unknown, send to operator"; operator labels 5 examples → new class added (e.g. prototype) → recognised thereafter. **Optional metrics:** known-class accuracy; AUROC known vs unknown; new-class accuracy after the 5-example update and whether known accuracy dropped.
**Explicit watch-outs:** grayscale → repeat channel ×3; known-class accuracy will look very high, report unknown detection separately; keep the 5 operator examples out of every evaluation set.
**Implicit gotchas:**
- **"How did you set the unknown threshold without looking at the unknown class?"** Only legit answer: from known-class validation distances (e.g. 95th/99th percentile of distance to nearest centroid). Tuning τ on held-out-class images is cheating and judges know it.
- **"Why *that* held-out class?"** Holding out the most distinctive class makes detection easy. Run **leave-one-class-out for all 6** and report AUROC per choice — parallel agents make this cheap and it is the single most convincing table.
- **"Frozen or fine-tuned backbone?"** Fine-tuning on 5 classes can collapse the unknown class into a known cluster; report both frozen ImageNet features and fine-tuned.
- **"After adding the class, does the state persist?"** HF Spaces is ephemeral; session state only — say so; show that nothing is retrained (prototype mean of 5 embeddings) and that known accuracy is unchanged by construction.
- **Variance of the 5-shot update:** repeat with 5 random draws of 5 examples (fixed seeds), report mean±sd on the remaining 295.
- **Non-steel upload** (a face) must come out "unknown".
- **Data access:** the Northeastern page is often down; Kaggle mirror exists **(verify)**; cite Song & Yan (2013), Applied Surface Science 285:858–864.
**Proof artifacts:** 6×LOCO table, confusion matrix with unknown, distance histogram with τ line, few-shot update log.
**Winning move:** the live "teach it a new defect in 5 clicks" moment + LOCO table + inspection log per shift + operator reject/merge.

### PS 3.1 Safe Outdoor Hours Planner for Schools (★) — Air Quality Data in India, Kaggle
**Must-haves:** (1) data-quality layer marking each city-hour reliable/unreliable (missing, stale, stuck); (2) planner: city + date + activity length → best window 06:00–18:00 using CPCB AQI bands, with reasons, or "no advice"; (3) deployed app: hour strip coloured by band, recommended window, one-paragraph forwardable advisory. **Optional metrics:** back-test vs the lowest-observed-AQI window; share of unreliable city-hours by city and year.
**Explicit watch-outs:** data ends 2020 → replay mode, say so in the UI; early years have gaps → reliability rules handle them, don't drop silently; official National AQI bands (Good 0–50, Satisfactory 51–100, Moderate 101–200, Poor 201–300, Very Poor 301–400, Severe 401–500) and cite CPCB.
**Implicit gotchas:**
- **The tautology trap:** if the recommendation uses *that day's* observed hourly values, the "back-test vs lowest observed window" metric is trivially 100% and the judge will say "a teacher at 6 am doesn't know the 3 pm reading". Defensible design: recommend from data available *before* the day (e.g. typical-day profile from the previous 2–4 weeks + the morning's readings), then back-test against the actual day. State clearly which mode the UI is in.
- **"Is the AQI column hourly or a rolling 24-h value?"** The Kaggle AQI is computed per CPCB from rolling averages (24-h for PM, 8-h for CO/O₃) **(verify in the dataset author's notebook)**, which smooths diurnal swings. Say whether you used the AQI column or an hourly PM2.5 sub-index proxy, and why.
- **"Define stale and stuck."** E.g. stuck = ≥6 consecutive identical PM2.5 values; stale = reading older than N hours relative to the planner's "now"; justify N and k with the empirical frequency.
- **City vs station:** `city_hour.csv` is a city aggregate; `station_hour.csv` exists — say which and why.
- **Licence:** Kaggle page lists the licence as "Other / see description" **(verify)**; attribute CPCB and the Kaggle uploader.
- **Sensitive groups stretch:** cite CPCB's band-wise health advisories, don't invent thresholds.
**Proof artifacts:** reliability table by city×year, back-test table, band legend with CPCB citation, "replay mode" banner.
**Winning move:** forecast-from-past mode with honest back-test, month heatmap, two-city compare. Medium-crowded; the forecasting honesty is the differentiator.

### PS 3.2 Workplace EV Charging Scheduler (★) — ACN-Data, Caltech
**Must-haves:** (1) replay simulator, one week, one site, 15-min steps; (2) two policies: uncontrolled (full rate on arrival) and yours (EDF / least-laxity under the cap); (3) deployed dashboard: pick day + cap → site load for both vs cap line, peak kW, share of energy delivered, drivers left short. **Optional metrics:** peak-kW reduction; share of needed energy delivered; sessions under-served.
**Explicit watch-outs:** register/download before 22 Oct; many sessions lack driver inputs → use delivered energy and unplug time as stand-ins, say so; acnportal ships reference algorithms — compare if you like, but the scheduler must be your own.
**Implicit gotchas:**
- **"What is each car's max charging rate?"** Uncontrolled at a fictitious 6.6 kW from arrival makes the baseline peak look worse than reality. Use the same per-session max rate for both policies (e.g. max(observed average rate, site EVSE rating)) and say so.
- **"What happens when the cap is infeasible?"** Show the trade-off curve: cap vs peak vs under-served sessions; do not hide shortfalls.
- **"Is this acnportal's EDF?"** Implement in NumPy yourself; optionally compare to acnportal's as a reference line.
- **Simplifications to state:** no per-phase constraints, no charging-curve taper, 15-min rounding of energy.
- **Site/week choice:** Caltech usage dropped after paid parking began (Nov 2018) **(verify)**; JPL weeks are denser — justify the week chosen.
- **Static copy** (2018–2020, GitHub, no sign-up) is in the Sources list — use it if the portal token fails.
**Proof artifacts:** session table with stand-in flags, cap sweep CSV, policy code in one readable file.
**Winning move:** solar-aware shift, ToU cost, driver "you'll get X kWh" view. Under-picked (registration friction) but visually modest.

### PS 3.3 BIM Model Checker, IFC (★★) — buildingSMART Sample-Test-Files
**Must-haves:** (1) parser listing storeys, spaces, doors, windows, walls with key properties; (2) YAML/JSON-driven rules engine, ≥5 rules, ≥2 on energy/sustainability completeness (doors <900 mm, unnamed spaces, windows without U-value, walls without material, storeys without spaces); (3) deployed app: upload IFC → summary + violation table (rule, element type, GlobalId, storey, value found), CSV download. **Optional metric:** inject 10 known violations into a clean model, report found vs false alarms.
**Explicit watch-outs:** read project length units first (mm vs m); IFC2x3 vs IFC4 store properties differently — test both; a missing property set is a finding, not a crash.
**Implicit gotchas:**
- **"Show me the mutated model and the diff."** Judges expect a script (`ifcopenshell` can edit) that injects the 10 violations, plus a recall/precision table — this is the evaluation for this PS.
- **"Which GlobalIds have no storey?"** Elements reached via `IfcRelContainedInSpatialStructure` vs aggregated/space-contained elements; report "no storey" rather than crash.
- **Door width source:** `IfcDoor.OverallWidth` vs `Pset_DoorCommon` vs geometry; U-value from `Pset_WindowCommon.ThermalTransmittance` / `Pset_WallCommon`; material via `IfcRelAssociatesMaterial` (`ifcopenshell.util.element.get_material`); units via `ifcopenshell.util.unit.calculate_unit_scale`.
- **"Does it run on both an IFC2x3 and an IFC4 file?"** Most Sample-Test-Files are tiny unit-test models; "complete buildings" are e.g. KIT AC20-FZK-Haus (IFC4), AC20-Institute-Var-2 (IFC4), NIBS Duplex Apartment (IFC2x3) — found via the Open IFC Model Repository linked in the repo README **(verify exact links)**.
- **"Add a rule live."** Judge edits the YAML threshold from 900 to 1000 and expects a re-run; config-driven means config-driven.
- **3D stretch:** web-ifc / That Open Engine must highlight the *violating GlobalIds from the table* — a static viewer earns nothing.
- **Deploy:** `pip install ifcopenshell` (0.8.x wheels on PyPI) works on HF Spaces Docker/Render; mind upload size limits.
**Proof artifacts:** `rules.yaml`, `eval/inject_violations.py`, `eval/results.md`, CSV export, two sample reports (2x3 and 4).
**Winning move:** 3D highlight + embodied-carbon estimate with cited emission factors + IDS import. Very under-picked; low competition, high reward if the viewer is data-driven.

### PS 4.1 Markdown Before Waste (★) — synthetic, team-designed
**Must-haves:** (1) simulator: one store, ~20 perishables, 30 days, batch arrivals with expiry, daily demand depends on price **and** days-to-expiry, every assumption documented; (2) two policies: fixed price vs markdown rule with adjustable thresholds; (3) deployed dashboard: same seed, compare units wasted, revenue, margin, per-product markdown timeline. **Optional metric:** waste reduction % and margin change vs fixed price averaged over ≥10 seeds.
**Explicit watch-outs:** fix and display the seed; "discount everything" always cuts waste — show margin next to waste; keep the simulator explainable in one slide.
**Implicit gotchas:**
- **"Where do your elasticity numbers come from?"** Cite literature ranges for grocery price elasticity and freshness aversion; the sensitivity panel ("shoppers respond half as strongly") is effectively a must.
- **"Does the markdown create demand or shift it?"** Cannibalisation: discounted near-expiry units should displace full-price sales of the same product; if total demand grows unboundedly with discount, judges will call it a toy.
- **"Which batch sells first?"** Shoppers often take the freshest (LEFO); FIFO vs LEFO changes waste dramatically — state and justify.
- **"Same random draws for both policies?"** Common random numbers: the demand noise stream must be independent of policy, seeded per product-day.
- **Restocking policy** drives waste more than pricing — declare the order-up-to rule.
- **Margin, not revenue:** profit = revenue − cost of all units received (wasted units are cost).
**Proof artifacts:** `assumptions.md` with sources, seed shown in UI, 10-seed table with CI, sensitivity plot.
**Winning move:** in-browser JS simulator (static Vercel, zero cold start), per-category discount-step search, sensitivity panel. Medium crowd; easy to look fake — rigour of assumptions is the differentiator.

### PS 4.2 Warehouse Digital Twin: 3D Picking Floor Game (★★) — Online Retail II
**Must-haves:** (1) preprocessing: one month of order lines → JSON (top ~100 products, pick frequency, order list); (2) 3D grid warehouse (racks, aisles, packing dock, ≥1 animated picker) replaying orders with aisle-following walking and live distance/time counters; (3) game mode: swap/drag products between slots, replay the same orders, before/after distance and pick time, plus an automatic baseline (fast movers nearest the dock). **Optional metrics:** total walking distance and average pick time per order for original, baseline and player layouts.
**Explicit watch-outs:** remove cancelled invoices ("C…") and non-product codes before counting picks; walking distance must follow aisles, not straight lines; keep geometry simple for an average laptop.
**Implicit gotchas:**
- **"Is the twin really driven by the order data?"** Show the order ID being replayed on screen ("Invoice 581483, 7 lines"), click a slot → see its StockCode and pick count from the JSON.
- **"What is the 'original' layout?"** The data has no layout. Declare it (e.g. StockCode order or seeded random) and state it.
- **"Does the score come from the animation?"** It must come from a headless simulation (same `simulate()` function) that scores 1,000+ orders in milliseconds; the animation replays a subset. If you only count during animation, judges will ask you to replay the whole month live.
- **Routing policy inside an order:** S-shape / return / nearest-neighbour; keep the same policy for before/after; show the path line on the floor so judges can see no rack is crossed.
- **Coverage honesty:** top-100 SKUs cover only a minority of order lines (likely 20–30% **(verify on your month)**). Say "the twin models the forward-pick area for the top-100 SKUs; orders are filtered to those lines; coverage = X%".
- **Determinism:** same orders + same policy → identical numbers every run; judges may click "replay" twice.
- **Parameters:** walking speed (e.g. 1.2 m/s), seconds per pick, aisle width, rack cells — in README and in-UI.
- **Performance:** `InstancedMesh` for racks/boxes, ≤100 slots, no shadows/post-processing, cap pixel ratio; test on a 4-year-old laptop in a different browser.
**Proof artifacts:** `data/orders_<month>.json` with `meta` (lines total, lines covered, C-invoices removed, non-product codes removed), `sim/simulate.ts` shared by scoring and animation, before/baseline/after table.
**Winning move:** data-driven heatmap of rack visits, batch picking, multiple pickers with congestion, leaderboard — all measured by the same simulator. Static deploy (Vercel/Cloudflare Pages): no API keys, no cold start, no rate limits — the safest live demo of the 12.

### PS 4.3 Last-Mile Route Planner with Live Re-planning (★★★) — Solomon VRPTW, SINTEF
**Must-haves:** (1) static solver on a 25-customer Solomon instance (C101/R101) with capacity + time windows, reporting vehicles and distance vs SINTEF best known; (2) event simulator with a clock injecting (a) 5 new orders at a chosen time, (b) one vehicle breakdown, then re-planning from current state (completed stops fixed, vans starting where they are) and reassigning the broken van's stops; (3) deployed dispatcher dashboard: routes on a 2D map, timeline slider, event buttons, before/after KPIs (distance, late deliveries, orders not served). **Optional metrics:** static distance/vehicles vs BKS; dynamic re-plan time, late deliveries, orders dropped per event.
**Explicit watch-outs:** OR-Tools needs integer costs → scale ×100 before rounding; solver time limit 5–10 s; copying the OR-Tools VRPTW sample covers only part of item 1 — re-planning is the problem.
**Implicit gotchas:**
- **"Other vans left the depot with their own cargo — how do they deliver the broken van's parcels?"** The deepest probe. Options to state explicitly: (a) add a pickup node at the broken van's location (pickup-and-delivery formulation), (b) vans may return to depot to reload, (c) a spare vehicle from depot. (a) is most impressive; any of them must be stated.
- **"Hard or soft time windows after the disruption?"** With hard windows OR-Tools drops stops instead of being late, so "late deliveries" is always 0. Use soft windows (`SetCumulVarSoftUpperBound`) with lateness penalty plus drop penalties (`AddDisjunction`) in re-plan mode; report both late and dropped.
- **"Your distance vs BKS: why the gap?"** Solomon uses hierarchical objective (vehicles first, then distance) and Euclidean distances; integer scaling and OR-Tools' fixed vehicle cost cause small gaps. 25-customer BKS to quote **(verify on SINTEF page)**: C101 191.3 / 3 veh; R101 617.1 / 8 veh; RC101 461.1 / 4 veh.
- **"Where do the 5 new orders come from?"** Use customers 26–30 of the 100-customer parent instance (real benchmark coordinates/windows) — better than random.
- **Re-plan from current state:** per-vehicle start nodes (`RoutingIndexManager(n, k, starts, ends)`), start time = clock time, completed stops removed, vehicle mid-arc handled by its projected position; warm-start via `ReadAssignmentFromRoutes` to limit churn; report "stops that changed vehicle" as a stability KPI.
- **"Why is this on a real city map if the coordinates are synthetic?"** If you overlay on a city, say it is an affine mapping for visuals and distances remain Solomon units; or use Leaflet `CRS.Simple` with no tiles.
- **Deployment:** OR-Tools (`ortools` 9.11+) cannot run on Vercel/Netlify functions; HF Spaces Docker (FastAPI, 2 vCPU/16 GB, sleeps only after 48 h idle) is safer than Render free (spins down after 15 min; 30–60 s cold start). Warm it before the demo either way.
**Proof artifacts:** `bench/static_results.md` (instance, vehicles, distance, BKS, gap %, time), event log JSON, re-plan timing in UI, assumption note on cargo transfer.
**Winning move:** pickup-from-broken-van formulation, full re-solve vs local repair comparison, 100-customer scaling, driver mobile view. Under-picked (★★★ scares teams); the live breakdown animation is a judge-lean-forward moment.

---

## 3. Universal submission checklist (exact items)

### 3.1 Repository layout
```
README.md            .env.example        DEV_LOG.md        LICENSE (MIT)      .gitignore (.env, data/raw, *.pt > 100MB)
docs/architecture.md (Mermaid)           docs/pitch/<team>_NexAI2026.pptx     docs/demo/script.md
data/README.md (source, licence, download cmd, preprocessing cmd, row counts before/after cleaning)
eval/ (test sets committed BEFORE tuning; eval.py; results.md with date/commit hash)
app/ or web/ (deployable); api/ (if backend)
```

### 3.2 README.md — required sections in this order
1. **Title + one-line pitch + badges**: Live URL, Demo video, Repo licence, "Built at NexAI Hack 2026 — PS x.y".
2. **Problem statement & solution overview** (PS id and title verbatim; the "core challenge" sentence quoted; 3 bullets on how you meet it).
3. **Live deployment** URL(s) + fallback (local demo steps + YouTube link) + "cold start note".
4. **Architecture diagram** (Mermaid renders natively on GitHub) + **tech stack table with versions** (runtime, framework, model, libs, hosting).
5. **Setup & execution**: prerequisites, `cp .env.example .env`, install, run, `make eval` (one command reproduces every number in the README).
6. **Must-have checklist**: M1/M2/M3 → feature → file path → screenshot; then **Stretch goals** done/not done.
7. **Data**: dataset name, URL, licence, citation, subset used, cleaning rules with counts, "synthetic" statement where applicable.
8. **Evaluation**: split description (sizes, seed, stratification, dedupe), metrics table (incl. the PS's optional metrics), baseline/ablation, how to reproduce, commit hash of the frozen test set.
9. **Limitations & responsible AI**: what it is not (not a forecast / not an approved procedure / synthetic data), failure modes, disclaimers shown in UI.
10. **AI tools & dependencies declaration**: coding assistants used (e.g. Claude Code, Copilot), runtime LLMs/models, how AI-generated code was reviewed; key libraries.
11. **Team**: name, role, GitHub, LinkedIn, which modules each member owns (this is what Q&A will test).
12. **DEV_LOG link**, **public post links** (LinkedIn, X), **YouTube overview** link.

### 3.3 `.env.example`
```
# Copy to .env — never commit .env
LLM_PROVIDER=gemini            # gemini | groq
GEMINI_API_KEY=your_key_here   # backend only; never referenced from client code
GROQ_API_KEY=
DATABASE_PATH=data/retail.duckdb
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,https://<app>.vercel.app
```
Rules: every variable the code reads appears here with a comment; `.env` in `.gitignore` from the first commit; run `gitleaks detect` (or `git log -p | grep -iE "api[_-]?key|sk-|AIza"`) before each push; if a key ever hits a commit, rotate it and note it in DEV_LOG.

### 3.4 DEV_LOG.md format
```
# DEV_LOG — <Team> — NexAI Hack 2026 — PS <x.y> <title>
## Timeline (IST)
| Time | Milestone | Commit |
| 21:45 21-Oct | Repo init, README skeleton, .env.example | abc1234 |
| 22:30 | Data download + cleaning script, counts recorded | ... |
## Decisions (ADR style, newest last)
### D1 21:50 — <decision>
Context · Options considered · Decision · Why · Consequences/risks
## Experiments
| # | Time | Hypothesis | Setup (split/seed) | Result | Kept? | Commit |
## AI assistance
| Tool | Used for | Human verification performed |
| Claude Code | scaffolding, tests, docs | reviewed line-by-line by <name>; eval re-run |
## Rejected approaches (and why)
## Known issues / limitations at submission
```
Judges read this to check the §3 bullet "key decisions, AI assistance, experiments, rejected approaches". Update it at least every 2 hours; the Experiments table is where "honest metrics" live.

### 3.5 Pitch deck (.pptx, 16:9, ≤10 slides, 5 minutes total incl. demo)
| # | Slide | Time | Content |
|---|---|---|---|
| 1 | Title | 0:10 | Team, PS id/title, one-liner, QR codes (live app, repo) |
| 2 | Problem | 0:30 | Who hurts, the "core challenge" sentence, why naive solutions fail (watch-out examples) |
| 3 | What we built | 0:20 | M1/M2/M3 as ticks + 1-line each; stretch goals marked |
| 4 | LIVE DEMO cue | 2:20 | Switch to deployed app; scripted path hitting each must-have and the honest behaviour (refuse/unknown/trap/re-plan) |
| 5 | How it works | 0:30 | Architecture diagram, the one clever mechanism (threshold curve / hybrid index / headless simulator / re-plan state) |
| 6 | Evidence | 0:30 | Held-out split + metrics table + baseline/ablation; the PS's optional metrics |
| 7 | Watch-outs handled | 0:15 | 3 bullets mapping the doc's watch-outs to code |
| 8 | Limitations & responsible AI | 0:15 | Honest, specific |
| 9 | What's next | 0:05 | 2 bullets |
| 10 | Team + AI tools + links | 0:05 | Names/roles, AI tools declared, #NEXAI2026 |
Generate with python-pptx or export from Google Slides as .pptx; embed screenshots at 1920×1080; fonts ≥24 pt; test on the venue projector resolution.

### 3.6 Demo recording plan (≤5 min, plus 3-min YouTube cut for the bonus)
- Tooling: OBS Studio or Windows Game Bar (Win+G), 1080p30, system+mic audio; browser at 125% zoom, dedicated clean profile, notifications off.
- Script: 0:00–0:20 problem hook; 0:20–0:40 what the app does; 0:40–3:30 walkthrough of M1→M2→M3 including the judge-bait case (OOD upload / trap question / breakdown event / unreliable-hour refusal); 3:30–4:20 evidence (metrics, split, baseline); 4:20–4:50 limitations + stretch; 4:50–5:00 links.
- The 3-min YouTube overview = same recording cut to 0:00–0:40 + 1:30 of demo + 0:50 of evidence; unlisted is allowed; link it in README and both posts.
- Keep the MP4 locally on two laptops as the venue fallback; also run the app locally (`npm run dev` / `uvicorn`) in a second window in case Wi-Fi fails; tether a phone hotspot.

### 3.7 Public post templates (publish before submission; include screenshot/clip; tag teammates and the official handles once announced)
**LinkedIn (≤1,300 chars):**
> We just shipped **<AppName>** at #NEXAI2026 (NexAI Hack 2026) — <one-line>.
> The problem: <2 lines on who hurts>.
> What it does: <M1>, <M2>, <M3>.
> Honest numbers: <metric> on a held-out split (<n> samples) vs <baseline>. Limitations: <one line>.
> Try it: <live URL> · Code: <repo URL> · 3-min overview: <YouTube>
> Built in 17 hours with <@teammate1> <@teammate2> <@teammate3> using <stack>; AI coding tools declared in the README.
> <@official conclave handle> #NEXAI2026 #AI #<domain> #Hackathon

**X (≤280 chars):**
> <AppName>: <one-line>. <metric> on held-out data. Live: <short URL> Code: <short URL> Built in 17h w/ @t1 @t2 @t3 @official #NEXAI2026
Attach a 15–30 s screen clip (not just a screenshot) for both.

### 3.8 Commit cadence plan (hourly minimum is a hard rule)
- **Now (21:30–21:45):** create the public repo if not yet done; first commit = README skeleton, `.env.example`, `DEV_LOG.md`, `.gitignore`, LICENSE. DEV_LOG notes that 18:00–21:30 was planning/data exploration (explicitly allowed by §2).
- **Every 60 min at the latest**, `main` receives at least one meaningful commit (not `wip`). Agents work on branches `feat/m1-*`, `feat/m2-*`, `eval/*`, merge to main via fast-forward/PR every hour; a cron reminder every 45 min.
- **Order of commits matters**: `eval: add trap suite / 30 code-mixed msgs / 15 Q-record pairs / violation-injection script` must land **before** any `tune:` or `prompt:` commit.
- Conventional messages: `feat(m2): aisle-following path scorer`, `eval: PR-AUC 0.71 on held-out (seed 42)`, `docs: data rules`, `fix: block non-SELECT via sqlglot`.
- Tags: `mvp-m1`, `mvp-m2`, `mvp-m3`, `eval-frozen`, `feature-freeze`, `submission`.
- Never force-push; never commit `.env`, raw datasets >100 MB (use the download script), or model weights >100 MB (use HF Hub).
- Overnight: agents keep committing hourly under the team's account; author/co-author lines consistent with the README's AI declaration.
- **Hard timeline (IST, 22 Oct):** 11:00 feature freeze → 11:00–12:30 eval re-run + README/DEV_LOG final → 12:30–13:30 record demo + deck → 13:30–14:15 posts (LinkedIn, X), YouTube upload → 14:15–14:45 final deploy smoke test on a different laptop/phone → 14:45 submit (15:00 deadline; do not cut it close).

### 3.9 Q&A preparation (3 minutes ≈ 3–4 questions)
Prepare 10 answer cards (≤20 s each): the split; the threshold; the watch-out handling; what is synthetic/assumed; what breaks it; why this stack; what each member built; why the deployed URL may be slow; what you'd do with one more day; the AI tools used and how code was verified. Assign every file in the repo to a named owner.

---

## 4. What makes a judge DISLIKE a project (ranked by damage)
1. **Fabricated or unreproducible numbers** (README ≠ app ≠ deck; no eval script) — §5 says disqualification.
2. **Commit history that is one dump, or starts before 18:00 IST 21 Oct** — §3 disqualification review.
3. **API key in frontend bundle or git history**, missing `.env.example` — §3.
4. **No held-out split / threshold tuned on the test set / test questions used in prompts** — contradicts §5 and three separate watch-outs (1.1, 1.3, 2.3).
5. **A missing must-have while stretch goals are shown** — contradicts §1; judges stop listening.
6. **Static 3D model / static map / static chart not driven by the data** (4.2, 4.3, 3.3 viewer) — the doc literally says "not a static 3D model".
7. **A copy of a library sample**: OR-Tools VRPTW tutorial (4.3 watch-out), acnportal EDF (3.2 watch-out), Gradio image-classifier template (2.2/2.3), LangChain SQL-agent tutorial (1.2), three.js example scene (4.2).
8. **Deployed URL down, cold-starting for 60 s, or "let me show localhost instead"** without the documented exception.
9. **Accuracy on 3.4% positives; "99% accuracy" on known classes while unknown detection is absent** (2.1/2.3 watch-outs name this).
10. **Ignoring named watch-outs**: GBP not stated, synthetic not stated, replay-mode not stated, units not read, placeholders not cleaned, C-invoices not removed.
11. **Refusal/"not sure"/"unknown"/"no advice" implemented as an arbitrary constant with no curve or justification.**
12. **Hard-coded answers** that make the trap suite / test set "pass".
13. **Over-engineered stack nobody can explain** (LangGraph/microservices) — fails §3 "every member must be able to explain".
14. **Simulators with undocumented assumptions** (4.1, 4.2, 3.2, 2.1 shifts) or elasticities pulled from the air.
15. **Demo over 5 minutes, slide-reading, no live interaction, projector-illegible UI.**
16. **README missing required sections, dataset licence, or AI-tool declaration; posts missing #NEXAI2026 / URLs.**
17. **Overclaiming** ("production-ready", "replaces engineers", "99% on field photos").
18. **LLM-only pipelines with no deterministic guardrails** (no SQL guard, no citation validator, no quality gate).
19. **Scraped personal/private data or an undeclared non-recommended dataset** — §5.
20. **Pitch deck not in .pptx** — §8 is explicit.

---

## 5. Crowdedness estimate and reward

| PS | Expected pick rate | Why | Reward for a strong team |
|---|---|---|---|
| 2.2 Leaf Doctor | **Very high** | ★, every student has done plant disease, Gradio template | Low — hard to stand out even with rigour |
| 1.1 Code-mixed triage | **Very high** | ★, LLM + Streamlit, Indian flavour, cheapest to "finish" | Low–medium |
| 2.1 Shift planner | **High** | ★, AI4I is a Kaggle staple, sklearn | Medium if cost model + calibration are rigorous |
| 1.2 Text-to-SQL | **High** | trendy, LangChain tutorials exist | Medium; the guard + trap suite differentiate |
| 3.1 Outdoor hours | **Medium** | ★, pandas/Plotly, familiar Kaggle data | Medium; forecast-honesty differentiator |
| 4.1 Markdown pricing | **Medium** | ★ but "no dataset" scares some | Medium; easy to look like a toy |
| 1.3 Agentic RAG | **Medium** | RAG is popular but ★★★ deters | Medium–high; ablation + refusal + traces |
| 3.2 EV scheduler | **Low–medium** | registration friction, niche | Medium; visually modest |
| 2.3 Steel open-set | **Low–medium** | open-set recognition is conceptually unfamiliar | High; live 5-shot "teach" moment + LOCO table |
| 3.3 IFC checker | **Low** | IfcOpenShell/BIM unfamiliar, "not AI enough" perception | High; empty field, 3D highlight is a wow |
| 4.3 VRPTW live re-plan | **Low** | ★★★, OR-Tools, dynamic replanning scares teams | High; live breakdown re-route animation |
| 4.2 3D warehouse twin | **Low** | three.js intimidates ML students; "game design" | **Highest**: stunning + measurable + static deploy (no keys, no cold start) |

### Ranking rationale for `top_candidates`
1. **4.2** — satisfies "visually stunning AND technically deep" by construction (3D twin + headless simulator + measured before/after); safest live demo (static site, deterministic, no LLM rate limits); low competition; parallel agents can add heatmap/batch-picking/multi-picker as *measured* stretch goals. Main risk: laptop performance and proving data-drive — both mitigable (InstancedMesh; on-screen order IDs; coverage %).
2. **4.3** — ★★★ ambition signal, under-picked, the breakdown re-route is a lean-forward moment; depth in the cargo-transfer formulation and soft windows. Risk: Python backend cold start (use HF Spaces Docker, warm it) and the BKS gap explanation.
3. **3.3** — emptiest field; config-driven rules + injected-violation eval is a clean rigour story; web-ifc 3D highlight makes it visual. Risk: judges at an "AI" event may discount a rules engine — counter with the carbon estimate and IDS import.
4. **2.3** — the live "label 5, now it knows" demo plus the leave-one-class-out table is the most *honest* ML story in the set; moderate crowd. Visuals are grayscale 200×200 — less stunning.
5. **1.3** — deep, under-crowded relative to its ★★★ label; evidence panel + trace is visual enough. Risk: LLM free-tier dependence during the demo.
6. **3.2**, 7. **1.2**, 8. **4.1**, 9. **3.1**, 10. **2.1**, 11. **2.2**, 12. **1.1** — decreasing ability to stand out given crowding and visual ceiling.
