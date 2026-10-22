// npm run eval (from web/): scores every reference layout with the same sim/ the app ships,
// runs the SA opponent, and writes eval/results.md, eval/results.json and
// web/public/layouts/sa_seed42.json. Every number in those files comes from this run.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCK,
  MAX_EXACT_STOPS,
  anneal,
  baselineFastMovers,
  catalogueLayout,
  clearRouteCache,
  dist,
  orderCost,
  orderStops,
  ordersFor,
  prepareDataset,
  randomLayout,
  routeExact,
  routeHeuristic,
  simulate,
  type AnnealResult,
  type Assignment,
  type Dataset,
  type Policy,
  type ScoreResult,
  type SetName,
} from '../web/src/sim/index'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const ORDERS = resolve(root, 'web/public/data/orders.json')
const OUT_MD = resolve(here, 'results.md')
const OUT_JSON = resolve(here, 'results.json')
const OUT_SA = resolve(root, 'web/public/layouts/sa_seed42.json')

const SA_SEED = 42
const SA_ITERS = 30_000
const EXTRA_SEEDS = [43, 44, 45, 46]
const SEED_BUDGET_MS = 8 * 60_000 // if 5 x 30k would take longer than this, extra seeds get fewer iterations
const EXTRA_ITERS_FALLBACK = 15_000
const LIVE_ITERS = 3_000 // what the app's Anneal panel runs on stage
const OFFLINE_EXACT_MAX_STOPS = 16 // independent Held-Karp for heuristic-routed orders, offline only

const log = (...a: unknown[]) => console.log('[eval]', ...a)
const sh = (cmd: string): string => {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

// ---- data ----------------------------------------------------------------------------------
const raw = JSON.parse(readFileSync(ORDERS, 'utf8')) as Dataset
const data = prepareDataset(raw)
const sets: Record<'train' | 'holdout' | 'all', ReturnType<typeof ordersFor>> = {
  train: ordersFor(data, 'train'),
  holdout: ordersFor(data, 'holdout'),
  all: ordersFor(data, 'all'),
}
const commit = sh('git rev-parse --short HEAD')
const simDirty = sh('git status --porcelain -- web/src/sim eval/run.ts') !== ''
log(`commit ${commit}${simDirty ? ' (sim/ or eval has uncommitted changes)' : ''}; ${data.orders.length} orders`)

const score = (a: Assignment, set: SetName, policy: Policy): ScoreResult =>
  simulate(set === 'all' ? sets.all : sets[set], a, policy, set, false)

// ---- layouts -------------------------------------------------------------------------------
const original = catalogueLayout(data.products)
const random = randomLayout(42)
const baseline = baselineFastMovers(data.products)

function runSA(seed: number, iterations: number): AnnealResult {
  const t0 = performance.now()
  const r = anneal(data, { seed, iterations, startFrom: baseline, set: 'train', reportEvery: Math.max(1, Math.floor(iterations / 10)) }, (p) =>
    log(`  SA seed ${seed}: iter ${p.iter}/${iterations}  T ${p.T.toFixed(3)}  current ${(p.current / 1000).toFixed(3)} km  best ${(p.best / 1000).toFixed(3)} km`),
  )
  log(`SA seed ${seed}: ${iterations} iterations in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  return r
}

log(`SA seed ${SA_SEED}, ${SA_ITERS} iterations from Baseline on train ...`)
const sa = runSA(SA_SEED, SA_ITERS)
const saItPerS = sa.iterations / (sa.elapsedMs / 1000)

const layouts: { key: string; name: string; a: Assignment }[] = [
  { key: 'original', name: 'Original (catalogue order)', a: original },
  { key: 'random', name: 'Random (seed 42)', a: random },
  { key: 'baseline', name: 'Baseline (fast movers nearest dock)', a: baseline },
  { key: 'sa', name: `SA (seed ${SA_SEED}, ${SA_ITERS.toLocaleString('en-US')} it, from Baseline, train only)`, a: sa.best },
]

// ---- scores --------------------------------------------------------------------------------
type Row = {
  key: string
  name: string
  policy: Policy
  trainM: number
  holdoutM: number
  trainSPerOrder: number
  holdoutSPerOrder: number
  deltaTrainVsBaseline: number
  deltaHoldoutVsBaseline: number
  deltaHoldoutVsOriginal: number
}
const scored: Record<string, Record<Policy, { train: ScoreResult; holdout: ScoreResult; all: ScoreResult }>> = {}
for (const L of layouts) {
  scored[L.key] = {
    exact: { train: score(L.a, 'train', 'exact'), holdout: score(L.a, 'holdout', 'exact'), all: score(L.a, 'all', 'exact') },
    sshape: { train: score(L.a, 'train', 'sshape'), holdout: score(L.a, 'holdout', 'sshape'), all: score(L.a, 'all', 'sshape') },
  }
}
const rowFor = (key: string, name: string, policy: Policy): Row => {
  const s = scored[key][policy]
  const b = scored.baseline[policy]
  const o = scored.original[policy]
  return {
    key,
    name,
    policy,
    trainM: s.train.totalM,
    holdoutM: s.holdout.totalM,
    trainSPerOrder: s.train.totalS / s.train.orders,
    holdoutSPerOrder: s.holdout.totalS / s.holdout.orders,
    deltaTrainVsBaseline: s.train.totalM / b.train.totalM - 1,
    deltaHoldoutVsBaseline: s.holdout.totalM / b.holdout.totalM - 1,
    deltaHoldoutVsOriginal: s.holdout.totalM / o.holdout.totalM - 1,
  }
}
const exactRows = layouts.map((L) => rowFor(L.key, L.name, 'exact'))
const sshapeRows = layouts.filter((L) => L.key !== 'random').map((L) => rowFor(L.key, L.name, 'sshape'))

// ---- routing honesty -----------------------------------------------------------------------
const routing = layouts.map((L) => {
  const r = scored[L.key].exact.all
  return { key: L.key, name: L.name, exactOrders: r.exactOrders, heuristicOrders: r.heuristicOrders, exactShareM: r.exactShareM }
})

// heuristic quality where both can run (orders with <= 11 stops on Baseline)
let hqN = 0
let hqSame = 0
let hqGapSum = 0
let hqGapMax = 0
for (const o of sets.all) {
  const st = orderStops(o, baseline)
  if (st.length < 2 || st.length > MAX_EXACT_STOPS) continue
  const ex = routeExact(st).cost
  const he = routeHeuristic(st).cost
  const gap = he / ex - 1
  hqN++
  if (gap < 1e-9) hqSame++
  hqGapSum += gap
  hqGapMax = Math.max(hqGapMax, gap)
}
const heuristicQuality = { orders: hqN, optimal: hqSame, meanGap: hqGapSum / hqN, maxGap: hqGapMax }

/**
 * Independent Held–Karp (not sim/route.ts), used offline only for orders with 12..16 stops: exactly the
 * orders the app routes with the heuristic. 2^16 x 16 states is fine in Node, too slow for the worker.
 */
function heldKarpOffline(stops: number[]): number {
  const n = stops.length
  const full = (1 << n) - 1
  const d = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) d[j * n + k] = dist(stops[j], stops[k])
  const dp = new Float64Array((1 << n) * n).fill(Infinity)
  for (let k = 0; k < n; k++) dp[(1 << k) * n + k] = dist(DOCK, stops[k])
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < n; j++) {
      if (!(mask & (1 << j))) continue
      const v = dp[mask * n + j]
      if (v === Infinity) continue
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue
        const at = (mask | (1 << k)) * n + k
        const c = v + d[j * n + k]
        if (c < dp[at]) dp[at] = c
      }
    }
  }
  let best = Infinity
  for (let k = 0; k < n; k++) best = Math.min(best, dp[full * n + k] + dist(stops[k], DOCK))
  return best
}

// heuristic quality where the heuristic is actually used (Baseline layout, > MAX_EXACT_STOPS stops)
let hxN = 0
let hxSame = 0
let hxGapSum = 0
let hxGapMax = 0
let hxShipped = 0
let hxOptimal = 0
let hxSkipped = 0
let hxMaxStops = 0
for (const o of sets.all) {
  const st = orderStops(o, baseline)
  if (st.length <= MAX_EXACT_STOPS) continue
  hxMaxStops = Math.max(hxMaxStops, st.length)
  if (st.length > OFFLINE_EXACT_MAX_STOPS) {
    hxSkipped++
    continue
  }
  const shipped = orderCost(o, baseline, 'exact') // the metres the simulator actually reports
  const ex = heldKarpOffline(st)
  const gap = shipped / ex - 1
  hxN++
  if (gap < 1e-9) hxSame++
  hxGapSum += gap
  hxGapMax = Math.max(hxGapMax, gap)
  hxShipped += shipped
  hxOptimal += ex
}
const heuristicInUse = {
  orders: hxN,
  optimal: hxSame,
  meanGap: hxN ? hxGapSum / hxN : 0,
  maxGap: hxGapMax,
  metresGap: hxOptimal > 0 ? hxShipped / hxOptimal - 1 : 0,
  skippedOverMaxStops: hxSkipped,
  maxStopsSeen: hxMaxStops,
  offlineMaxStops: OFFLINE_EXACT_MAX_STOPS,
}
log(`heuristic in use: ${hxN} orders checked (${hxSkipped} skipped > ${OFFLINE_EXACT_MAX_STOPS} stops), metre excess ${(heuristicInUse.metresGap * 100).toFixed(2)}%`)

// ---- performance ---------------------------------------------------------------------------
const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const timeIt = (fn: () => void): number => {
  const t = performance.now()
  fn()
  return performance.now() - t
}
const coldMs: number[] = []
const warmMs: number[] = []
const pathsMs: number[] = []
for (let i = 0; i < 5; i++) {
  clearRouteCache()
  coldMs.push(timeIt(() => simulate(sets.all, original, 'exact', 'all', false)))
  warmMs.push(timeIt(() => simulate(sets.all, original, 'exact', 'all', false)))
  pathsMs.push(timeIt(() => simulate(sets.all, original, 'exact', 'all', true)))
}
// the live demo setting: 3k iterations from Baseline, cold route cache (the app's first run)
clearRouteCache()
const live = anneal(data, { seed: SA_SEED, iterations: LIVE_ITERS, startFrom: baseline, set: 'train', reportEvery: LIVE_ITERS }, () => {})
const liveItPerS = live.iterations / (live.elapsedMs / 1000)
log(`SA live setting (${LIVE_ITERS} it, cold cache): ${liveItPerS.toFixed(0)} it/s`)

const perf = {
  fullRescoreOrders: sets.all.length,
  coldMedianMs: median(coldMs),
  warmMedianMs: median(warmMs),
  withPathsMedianMs: median(pathsMs),
  saIterationsPerSecond: saItPerS,
  saElapsedMs: sa.elapsedMs,
  saLiveIterations: LIVE_ITERS,
  saLiveColdIterationsPerSecond: liveItPerS,
}
log(`re-score: cold ${perf.coldMedianMs.toFixed(1)} ms, warm ${perf.warmMedianMs.toFixed(1)} ms; SA ${saItPerS.toFixed(0)} it/s`)

// ---- multi-seed SA -------------------------------------------------------------------------
const projected = sa.elapsedMs * (1 + EXTRA_SEEDS.length)
const extraIters = projected > SEED_BUDGET_MS ? EXTRA_ITERS_FALLBACK : SA_ITERS
if (extraIters !== SA_ITERS)
  log(`5 x ${SA_ITERS} would take ~${(projected / 60000).toFixed(1)} min; extra seeds use ${extraIters} iterations`)
const seedRuns = [{ seed: SA_SEED, iterations: SA_ITERS, r: sa }]
for (const seed of EXTRA_SEEDS) seedRuns.push({ seed, iterations: extraIters, r: runSA(seed, extraIters) })
const seedRows = seedRuns.map(({ seed, iterations, r }) => ({
  seed,
  iterations,
  trainM: r.bestM,
  holdoutM: score(r.best, 'holdout', 'exact').totalM,
  elapsedMs: r.elapsedMs,
}))
const meanSd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0
  return { mean: m, sd }
}
const seedSummary = {
  train: meanSd(seedRows.map((r) => r.trainM)),
  holdout: meanSd(seedRows.map((r) => r.holdoutM)),
  holdoutDeltaVsBaseline: meanSd(seedRows.map((r) => r.holdoutM / scored.baseline.exact.holdout.totalM - 1)),
}

// ---- outputs -------------------------------------------------------------------------------
const km = (m: number) => (m / 1000).toFixed(2)
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`
const r1 = (x: number) => x.toFixed(1)
const st = raw.meta.stats as Record<string, number>
const saRow = exactRows.find((r) => r.key === 'sa')!
const baseRow = exactRows.find((r) => r.key === 'baseline')!
const origRow = exactRows.find((r) => r.key === 'original')!

const md: string[] = []
md.push('# Ghostwalk evaluation results', '')
md.push(`Generated by \`npm run eval\` (\`eval/run.ts\`, Node ${process.version}) at commit \`${commit}\`${simDirty ? ' (with uncommitted changes in sim/ or eval/)' : ''}.`)
md.push('Same `web/src/sim` code the app runs in its worker. Every number below is produced by that run; nothing is typed by hand.', '')
md.push('## Headline (held-out = orders 16–30 Nov 2011, never seen by Baseline ranking or SA)', '')
md.push(`- **SA vs Baseline, held-out walking distance: ${pct(saRow.deltaHoldoutVsBaseline)}** (${km(baseRow.holdoutM)} km → ${km(saRow.holdoutM)} km)`)
md.push(`- SA vs Baseline on train (in-sample): ${pct(saRow.deltaTrainVsBaseline)}, so in-sample → held-out shrinkage is ${r1((saRow.deltaTrainVsBaseline - saRow.deltaHoldoutVsBaseline) * -100)} percentage points`)
md.push(`- Baseline vs Original, held-out: ${pct(baseRow.deltaHoldoutVsOriginal)} (${km(origRow.holdoutM)} km → ${km(baseRow.holdoutM)} km)`)
const budgetNote =
  extraIters === SA_ITERS
    ? `all at ${SA_ITERS.toLocaleString('en-US')} iterations`
    : `seed ${SA_SEED} at ${SA_ITERS.toLocaleString('en-US')}, seeds ${EXTRA_SEEDS.join(', ')} at ${extraIters.toLocaleString('en-US')} iterations`
md.push(`- SA over seeds ${seedRows.map((r) => r.seed).join(', ')} (${budgetNote}; seed ${SA_SEED} was fixed before the run): held-out Δ vs Baseline ${pct(seedSummary.holdoutDeltaVsBaseline.mean)} ± ${r1(seedSummary.holdoutDeltaVsBaseline.sd * 100)} pp (mean ± sd)`)
md.push('- Train-only means train-only: Baseline ranks SKUs by 1–15 Nov picks (ties by StockCode), SA scores train orders only. The top-100 SKU set itself is chosen on the full month by `data/prepare.py` (see Dataset).', '')

md.push('## Layouts, exact routing policy', '')
md.push('| Layout | Train km | Held-out km | Train s/order | Held-out s/order | Δ held-out vs Baseline | Δ train vs Baseline |')
md.push('|---|---:|---:|---:|---:|---:|---:|')
for (const r of exactRows)
  md.push(`| ${r.name} | ${km(r.trainM)} | ${km(r.holdoutM)} | ${r1(r.trainSPerOrder)} | ${r1(r.holdoutSPerOrder)} | ${r.key === 'baseline' ? '—' : pct(r.deltaHoldoutVsBaseline)} | ${r.key === 'baseline' ? '—' : pct(r.deltaTrainVsBaseline)} |`)
md.push('', 'Time model: seconds = metres / 1.2 m/s + 8 s per order line (declared, synthetic).', '')

md.push('## Ablation: S-shape routing policy (what a human picker does)', '')
md.push('| Layout | Train km | Held-out km | Held-out s/order | S-shape vs exact, held-out | Δ held-out vs Baseline (S-shape) |')
md.push('|---|---:|---:|---:|---:|---:|')
for (const r of sshapeRows) {
  const ex = exactRows.find((e) => e.key === r.key)!
  md.push(`| ${r.name} | ${km(r.trainM)} | ${km(r.holdoutM)} | ${r1(r.holdoutSPerOrder)} | ${pct(r.holdoutM / ex.holdoutM - 1)} | ${r.key === 'baseline' ? '—' : pct(r.deltaHoldoutVsBaseline)} |`)
}
md.push('', 'SA optimises exact-policy metres; the S-shape rows show whether the gain survives a cruder picker.', '')

md.push('## Routing honesty (full month, exact policy)', '')
md.push(`Orders with ≤ ${MAX_EXACT_STOPS} distinct stops (12 nodes incl. dock) are solved exactly with Held–Karp; larger ones use nearest neighbour + 2-opt (also seeded from the S-shape sequence), flagged per order.`, '')
md.push('| Layout | Exact orders | Heuristic orders | Share of metres routed exactly |')
md.push('|---|---:|---:|---:|')
for (const r of routing) md.push(`| ${r.name} | ${r.exactOrders} | ${r.heuristicOrders} | ${(r.exactShareM * 100).toFixed(1)}% |`)
md.push('')
md.push(`Heuristic quality where the app actually uses it (Baseline layout, orders with ${MAX_EXACT_STOPS + 1}–${OFFLINE_EXACT_MAX_STOPS} stops, checked offline against an independent Held–Karp in eval/run.ts): ${heuristicInUse.orders} orders; the route the simulator reports was optimal on ${heuristicInUse.optimal} (${heuristicInUse.orders ? ((heuristicInUse.optimal / heuristicInUse.orders) * 100).toFixed(1) : '0.0'}%); **${(heuristicInUse.metresGap * 100).toFixed(2)}% excess over optimal in total metres**, mean ${(heuristicInUse.meanGap * 100).toFixed(2)}% per order, worst ${(heuristicInUse.maxGap * 100).toFixed(1)}%. ${heuristicInUse.skippedOverMaxStops} heuristic orders have more than ${OFFLINE_EXACT_MAX_STOPS} stops (up to ${heuristicInUse.maxStopsSeen}) and are not checked.`, '')
md.push(`Sanity check on small orders only (2–${MAX_EXACT_STOPS} stops, which the app always routes with Held–Karp, so this does not describe shipped routes): NN + 2-opt alone matched Held–Karp on ${heuristicQuality.optimal} of ${heuristicQuality.orders} (${((heuristicQuality.optimal / heuristicQuality.orders) * 100).toFixed(1)}%); mean excess ${(heuristicQuality.meanGap * 100).toFixed(2)}%, worst ${(heuristicQuality.maxGap * 100).toFixed(1)}%.`, '')

md.push('## SA across seeds (from Baseline, train only)', '')
if (extraIters !== SA_ITERS)
  md.push(`**Note:** 5 × ${SA_ITERS.toLocaleString('en-US')} iterations was projected at ${(projected / 60000).toFixed(1)} min on this machine (> ${SEED_BUDGET_MS / 60000} min budget), so seeds ${EXTRA_SEEDS.join(', ')} ran ${extraIters.toLocaleString('en-US')} iterations each; seed ${SA_SEED} ran ${SA_ITERS.toLocaleString('en-US')}.`, '')
md.push('| Seed | Iterations | Train km | Held-out km | Δ held-out vs Baseline | Wall time s |')
md.push('|---:|---:|---:|---:|---:|---:|')
for (const r of seedRows)
  md.push(`| ${r.seed} | ${r.iterations.toLocaleString('en-US')} | ${km(r.trainM)} | ${km(r.holdoutM)} | ${pct(r.holdoutM / scored.baseline.exact.holdout.totalM - 1)} | ${r1(r.elapsedMs / 1000)} |`)
md.push(`| **mean ± sd** | | ${km(seedSummary.train.mean)} ± ${km(seedSummary.train.sd)} | ${km(seedSummary.holdout.mean)} ± ${km(seedSummary.holdout.sd)} | ${pct(seedSummary.holdoutDeltaVsBaseline.mean)} ± ${r1(seedSummary.holdoutDeltaVsBaseline.sd * 100)} pp | |`)
md.push('')

md.push('## Performance (Node, same code as the worker)', '')
md.push('| Measure | Value |')
md.push('|---|---:|')
md.push(`| Full-month re-score, ${perf.fullRescoreOrders} orders, cold route cache (median of 5) | ${r1(perf.coldMedianMs)} ms |`)
md.push(`| Full-month re-score, warm route cache (median of 5) | ${r1(perf.warmMedianMs)} ms |`)
md.push(`| Full-month re-score with paths + pick stops (median of 5) | ${r1(perf.withPathsMedianMs)} ms |`)
md.push(`| SA iterations per second (seed ${SA_SEED}, ${SA_ITERS.toLocaleString('en-US')} it, incremental + memoised) | ${perf.saIterationsPerSecond.toFixed(0)} |`)
md.push(`| SA wall time (seed ${SA_SEED}) | ${r1(perf.saElapsedMs / 1000)} s |`)
md.push(`| SA iterations per second, live-demo setting (${LIVE_ITERS.toLocaleString('en-US')} it from Baseline, cold route cache) | ${perf.saLiveColdIterationsPerSecond.toFixed(0)} |`)
md.push('', 'Speeds are machine-dependent measurements (the SA result depends only on seed and iterations); the app shows its own measured it/s.')
md.push('')

md.push('## Dataset', '')
md.push('| Item | Value |')
md.push('|---|---:|')
md.push(`| Source | ${raw.meta.source} (${raw.meta.licence}) |`)
md.push(`| Month | ${raw.meta.month} |`)
md.push(`| Products (top SKUs by order lines) | ${data.products.length} |`)
md.push(`| Orders (all / train / held-out) | ${data.orders.length} / ${data.train.length} / ${data.holdout.length} |`)
md.push(`| Order lines | ${data.orders.reduce((t, o) => t + o.skus.length, 0)} |`)
if (typeof st.raw_rows === 'number') md.push(`| Raw rows in the source sheet | ${st.raw_rows} |`)
if (typeof st.coverage_of_month_lines_by_top_skus === 'number')
  md.push(`| Share of the month's order lines covered by these SKUs | ${(st.coverage_of_month_lines_by_top_skus * 100).toFixed(1)}% |`)
md.push(`| Split rule | ${raw.meta.split.rule} |`)
md.push('')
md.push('The top-100 SKU set is chosen on the full month (both halves) by `data/prepare.py`; within it, every ranking the player, the Baseline and SA see uses train picks only.', '')

writeFileSync(OUT_MD, md.join('\n'))

const json = {
  commit,
  simDirty,
  node: process.version,
  dataset: {
    products: data.products.length,
    orders: data.orders.length,
    train: data.train.length,
    holdout: data.holdout.length,
    lines: data.orders.reduce((t, o) => t + o.skus.length, 0),
  },
  layouts: exactRows,
  sshape: sshapeRows,
  routing,
  heuristicQuality,
  heuristicInUse,
  perf,
  sa: { seed: SA_SEED, iterations: SA_ITERS, startFrom: 'baseline', set: 'train', startM: sa.startM, bestM: sa.bestM, holdoutM: saRow.holdoutM },
  seeds: { rows: seedRows, summary: seedSummary, extraIterations: extraIters },
}
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2) + '\n')

mkdirSync(dirname(OUT_SA), { recursive: true })
const round3 = (x: number) => Math.round(x * 1000) / 1000
writeFileSync(
  OUT_SA,
  JSON.stringify({
    seed: SA_SEED,
    iterations: SA_ITERS,
    startFrom: 'baseline',
    commit,
    assignment: Array.from(sa.best),
    trainM: round3(saRow.trainM),
    holdoutM: round3(saRow.holdoutM),
    startTrainM: round3(sa.startM),
    curve: sa.curve.map(([i, c, b]) => [i, round3(c), round3(b)]),
  }) + '\n',
)
log(`wrote ${OUT_MD}`)
log(`wrote ${OUT_JSON}`)
log(`wrote ${OUT_SA}`)
