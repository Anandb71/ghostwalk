import { DOCK, SLOTS, dist, slotNode } from './layout'
import { mulberry32 } from './rng'
import { ordersFor } from './data'
import { costForKey, totalMetres } from './simulate'
import { isPermutation, orderKey } from './stops'
import type { AnnealOptions, AnnealProgress, AnnealResult, Assignment, Order, PreparedData, Product } from './types'

/** "Original": SKUs in StockCode order, slot 0, 1, 2, ... (aisle by aisle). */
export function catalogueLayout(products: readonly Product[]): Assignment {
  const idx = products.map((_, i) => i)
  // plain code-unit comparison (not localeCompare) so the order is identical on every machine
  idx.sort((a, b) => (products[a].sku < products[b].sku ? -1 : products[a].sku > products[b].sku ? 1 : a - b))
  const out = new Uint8Array(SLOTS)
  idx.forEach((p, slot) => (out[p] = slot))
  return out
}

/** Random permutation with mulberry32(seed) (Fisher–Yates). */
export function randomLayout(seed: number): Assignment {
  const rng = mulberry32(seed)
  const perm = Array.from({ length: SLOTS }, (_, i) => i)
  for (let i = SLOTS - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = perm[i]
    perm[i] = perm[j]
    perm[j] = t
  }
  return Uint8Array.from(perm)
}

/** Slots ordered by walking distance from the dock, ties by slot id. */
export function slotsByDockDistance(): number[] {
  const slots = Array.from({ length: SLOTS }, (_, s) => s)
  slots.sort((a, b) => dist(DOCK, slotNode(a)) - dist(DOCK, slotNode(b)) || a - b)
  return slots
}

/** Baseline: rank by picksTrain desc (ties by product index) -> slots by distance from the dock asc (ties by slot id). */
export function baselineFastMovers(products: readonly Product[]): Assignment {
  const prods = products.map((_, i) => i)
  prods.sort((a, b) => products[b].picksTrain - products[a].picksTrain || a - b)
  const slots = slotsByDockDistance()
  const out = new Uint8Array(SLOTS)
  prods.forEach((p, k) => (out[p] = slots[k]))
  return out
}

// ---- simulated annealing -----------------------------------------------------------------

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : 0)
const CURVE_POINTS = 300
const PROBES = 200

/**
 * Incremental SA over product-slot swaps, driven in steps so a worker can interleave
 * CANCEL / SCORE messages between chunks. Deterministic: the result depends only on
 * (data, seed, iterations, startFrom), never on how step() calls are chunked.
 *
 * Move: swap the slots of two distinct products. Only orders that contain exactly one of
 * the two products can change their stop set (an order holding both still occupies the
 * same two slots), so only those are re-routed, through the stop-set memo cache.
 * T0 = median |delta| over 200 probe swaps / ln 2 (a median uphill move is accepted with
 * p = 0.5 at the start); geometric cooling to T0/1000, indexed by iteration.
 */
export class Annealer {
  readonly seed: number
  readonly iterations: number
  readonly startM: number
  readonly T0: number
  iter = 0
  accepted = 0
  current: Assignment
  currentM: number
  best: Assignment
  bestM: number
  curve: [number, number, number][] = []
  elapsedMs = 0

  private readonly orders: Order[]
  private readonly rng: () => number
  private readonly bySku: Int32Array[] // sku -> order positions containing it
  private readonly costs: Float64Array // per-order metres on `current`
  private readonly keys: Float64Array // per-order stop-set key on `current`
  private readonly mark: Int32Array
  private stamp = 0
  private readonly newCost: Float64Array
  private readonly newKey: Float64Array
  private readonly affected: Int32Array
  private nAffected = 0
  private readonly curveEvery: number
  private lastSwap: [number, number] | undefined

  constructor(data: PreparedData, opts: AnnealOptions) {
    if (!isPermutation(opts.startFrom)) throw new Error('anneal: startFrom is not a permutation of 0..99')
    const t0 = nowMs()
    this.seed = opts.seed
    this.iterations = Math.max(0, Math.floor(opts.iterations))
    this.orders = ordersFor(data, opts.set)
    this.rng = mulberry32(opts.seed)
    this.current = Uint8Array.from(opts.startFrom)
    this.best = Uint8Array.from(opts.startFrom)

    const P = data.products.length
    const lists: number[][] = Array.from({ length: P }, () => [])
    this.orders.forEach((o, i) => {
      for (const sku of o.skus) lists[sku].push(i)
    })
    this.bySku = lists.map((l) => Int32Array.from(l))

    const n = this.orders.length
    this.costs = new Float64Array(n)
    this.keys = new Float64Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const k = orderKey(this.orders[i].skus, this.current)
      this.keys[i] = k
      this.costs[i] = costForKey(k, 'exact')
      total += this.costs[i]
    }
    this.startM = total
    this.currentM = total
    this.bestM = total
    this.mark = new Int32Array(n)
    this.newCost = new Float64Array(n)
    this.newKey = new Float64Array(n)
    this.affected = new Int32Array(n)
    this.curveEvery = Math.max(1, Math.ceil(this.iterations / CURVE_POINTS))

    // Temperature from probe swaps (evaluated, not applied).
    const probes: number[] = []
    for (let p = 0; p < PROBES; p++) {
      const [a, b] = this.drawPair()
      probes.push(Math.abs(this.evaluate(a, b)))
    }
    probes.sort((x, y) => x - y)
    const med = probes.length ? (probes[(probes.length - 1) >> 1] + probes[probes.length >> 1]) / 2 : 0
    this.T0 = med > 1e-9 ? med / Math.LN2 : 1
    this.curve.push([0, this.currentM, this.bestM])
    this.elapsedMs += nowMs() - t0
  }

  get done(): boolean {
    return this.iter >= this.iterations
  }

  /** Temperature at iteration i: geometric from T0 to T0/1000 over the budget. */
  temperature(i = this.iter): number {
    if (this.iterations <= 1) return this.T0
    return this.T0 * Math.pow(1e-3, i / (this.iterations - 1))
  }

  private drawPair(): [number, number] {
    const P = this.bySku.length
    const a = Math.floor(this.rng() * P)
    let b = Math.floor(this.rng() * (P - 1))
    if (b >= a) b++
    return [a, b]
  }

  /** Delta metres of swapping products a and b on `current`; fills affected/newCost/newKey. */
  private evaluate(a: number, b: number): number {
    const cur = this.current
    const sa = cur[a]
    const sb = cur[b]
    this.nAffected = 0
    if (slotNode(sa) === slotNode(sb)) return 0 // opposite sides of the same bay: no stop set changes
    const st = ++this.stamp
    const mark = this.mark
    const la = this.bySku[a]
    const lb = this.bySku[b]
    for (let i = 0; i < la.length; i++) mark[la[i]] = st
    cur[a] = sb
    cur[b] = sa
    let delta = 0
    const consider = (i: number) => {
      const k = orderKey(this.orders[i].skus, cur)
      if (k === this.keys[i]) return
      const c = costForKey(k, 'exact')
      const j = this.nAffected++
      this.affected[j] = i
      this.newKey[j] = k
      this.newCost[j] = c
      delta += c - this.costs[i]
    }
    // orders with b but not a
    for (let i = 0; i < lb.length; i++) {
      const o = lb[i]
      if (mark[o] === st) mark[o] = -st // holds both: unchanged
      else consider(o)
    }
    // orders with a but not b
    for (let i = 0; i < la.length; i++) {
      const o = la[i]
      if (mark[o] === st) consider(o)
    }
    cur[a] = sa
    cur[b] = sb
    return delta
  }

  /** Run up to k iterations. Returns true when the budget is exhausted. */
  step(k: number): boolean {
    const t0 = nowMs()
    const end = Math.min(this.iterations, this.iter + Math.max(0, Math.floor(k)))
    while (this.iter < end) {
      const T = this.temperature(this.iter)
      const [a, b] = this.drawPair()
      const delta = this.evaluate(a, b)
      const accept = delta <= 0 || this.rng() < Math.exp(-delta / T)
      if (accept) {
        const cur = this.current
        const t = cur[a]
        cur[a] = cur[b]
        cur[b] = t
        for (let j = 0; j < this.nAffected; j++) {
          const i = this.affected[j]
          this.costs[i] = this.newCost[j]
          this.keys[i] = this.newKey[j]
        }
        this.currentM += delta
        this.accepted++
        this.lastSwap = [a, b]
        if (this.currentM < this.bestM - 1e-9) {
          this.bestM = this.currentM
          this.best.set(cur)
        }
      }
      this.iter++
      if (this.iter % this.curveEvery === 0 || this.iter === this.iterations) {
        this.curve.push([this.iter, this.currentM, this.bestM])
      }
    }
    this.elapsedMs += nowMs() - t0
    return this.done
  }

  /** Progress snapshot; `swap` is the last accepted swap since the previous snapshot. */
  progress(): AnnealProgress {
    const p: AnnealProgress = {
      iter: this.iter,
      T: this.temperature(Math.min(this.iter, Math.max(0, this.iterations - 1))),
      current: this.currentM,
      best: this.bestM,
      accepted: this.accepted,
      assignment: Uint8Array.from(this.current),
    }
    if (this.lastSwap) p.swap = this.lastSwap
    this.lastSwap = undefined
    return p
  }

  /** Best-so-far. bestM is re-summed from scratch so it equals simulate(best).totalM exactly. */
  result(): AnnealResult {
    const last = this.curve[this.curve.length - 1]
    if (!last || last[0] !== this.iter) this.curve.push([this.iter, this.currentM, this.bestM])
    return {
      best: Uint8Array.from(this.best),
      bestM: totalMetres(this.orders, this.best, 'exact'),
      startM: this.startM,
      seed: this.seed,
      iterations: this.iter,
      curve: this.curve.map((c) => [c[0], c[1], c[2]] as [number, number, number]),
      elapsedMs: this.elapsedMs,
    }
  }
}

/** Simulated annealing on train orders, exact routing, iteration budget. Deterministic for a seed. */
export function anneal(
  data: PreparedData,
  opts: AnnealOptions,
  onProgress?: (p: AnnealProgress) => void,
  shouldCancel?: () => boolean,
): AnnealResult {
  const sa = new Annealer(data, opts)
  const every = Math.max(1, Math.floor(opts.reportEvery || 1000))
  while (!sa.done) {
    if (shouldCancel?.()) break
    sa.step(every)
    onProgress?.(sa.progress())
  }
  return sa.result()
}

/**
 * Test helper: run SA and compare the incrementally maintained totals with a full
 * recompute of the same assignments.
 */
export function verifyIncremental(
  data: PreparedData,
  opts: AnnealOptions,
): { incrementalM: number; fullM: number; bestIncrementalM: number; bestFullM: number; accepted: number } {
  const sa = new Annealer(data, opts)
  sa.step(opts.iterations)
  const orders = ordersFor(data, opts.set)
  return {
    incrementalM: sa.currentM,
    fullM: totalMetres(orders, sa.current, 'exact'),
    bestIncrementalM: sa.bestM,
    bestFullM: totalMetres(orders, sa.best, 'exact'),
    accepted: sa.accepted,
  }
}
