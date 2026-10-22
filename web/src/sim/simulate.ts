import { NODE_COUNT, PICK_SECONDS, SLOTS, WALK_SPEED, slotNode } from './layout'
import { MAX_EXACT_STOPS, routeExact, routeHeuristic, routeSShape, tourPath, type Tour } from './route'
import { keySize, keyStops, orderKey } from './stops'
import type { Assignment, Order, OrderScore, PickStop, Policy, ScoreResult, SetName } from './types'

// ---- route memo cache --------------------------------------------------------------------
// Stop sets repeat a lot (across orders and across SA iterations), and routing is a pure
// function of (sorted stop set, policy), so both the cost and the tour are memoised on the
// 50-bit stop-set key. Two generations: when the young map fills up it becomes the old one
// and a fresh young map starts; hits in the old map are promoted. This keeps the recently
// used keys (what SA needs) with bounded memory. Eviction only costs time, never changes a result.

class TwoGen<V> {
  private young = new Map<number, V>()
  private old = new Map<number, V>()
  constructor(private readonly cap: number) {}
  get(k: number): V | undefined {
    const y = this.young.get(k)
    if (y !== undefined) return y
    const o = this.old.get(k)
    if (o !== undefined) this.set(k, o)
    return o
  }
  set(k: number, v: V): void {
    if (this.young.size >= this.cap) {
      this.old = this.young
      this.young = new Map()
    }
    this.young.set(k, v)
  }
  clear(): void {
    this.young.clear()
    this.old.clear()
  }
  get size(): number {
    return this.young.size + this.old.size
  }
}

const costCache: Record<Policy, TwoGen<number>> = { exact: new TwoGen(300_000), sshape: new TwoGen(300_000) }
const tourCache: Record<Policy, TwoGen<Tour>> = { exact: new TwoGen(20_000), sshape: new TwoGen(20_000) }

/** Route a stop list under a policy (no cache). Exact policy falls back to the heuristic above 11 stops. */
export function routeStops(stops: number[], policy: Policy): Tour {
  if (policy === 'sshape') return routeSShape(stops)
  return stops.length <= MAX_EXACT_STOPS ? routeExact(stops) : routeHeuristic(stops)
}

/** Memoised tour for a stop-set key. */
export function tourForKey(key: number, policy: Policy): Tour {
  const cache = tourCache[policy]
  let t = cache.get(key)
  if (t === undefined) {
    t = routeStops(keyStops(key), policy)
    cache.set(key, t)
    costCache[policy].set(key, t.cost)
  }
  return t
}

/** Memoised walking metres for a stop-set key (the SA hot path). */
export function costForKey(key: number, policy: Policy): number {
  const cache = costCache[policy]
  let c = cache.get(key)
  if (c === undefined) {
    c = routeStops(keyStops(key), policy).cost
    cache.set(key, c)
  }
  return c
}

/** Is an order with this stop-set key routed exactly under the policy? */
export const keyIsExact = (key: number, policy: Policy): boolean =>
  policy === 'exact' && keySize(key) <= MAX_EXACT_STOPS

export function clearRouteCache(): void {
  for (const p of ['exact', 'sshape'] as Policy[]) {
    costCache[p].clear()
    tourCache[p].clear()
  }
}

export function routeCacheSize(): { exact: number; sshape: number } {
  return { exact: costCache.exact.size, sshape: costCache.sshape.size }
}

/** Walking metres of one order on a layout (memoised). */
export function orderCost(order: Order, assignment: Assignment, policy: Policy): number {
  return costForKey(orderKey(order.skus, assignment), policy)
}

// ---- scoring -----------------------------------------------------------------------------

/** Route one order on a layout. Used by the worker (all orders) and the main thread (replay of one order). */
export function planOrder(order: Order, assignment: Assignment, policy: Policy): OrderScore {
  const key = orderKey(order.skus, assignment)
  const tour = tourForKey(key, policy)
  const path = tourPath(tour.order)
  const linesAt = new Map<number, number>()
  for (const sku of order.skus) {
    const n = slotNode(assignment[sku])
    linesAt.set(n, (linesAt.get(n) ?? 0) + 1)
  }
  // The picker stops the first time the walk reaches each stop node.
  const picks: PickStop[] = []
  const done = new Set<number>()
  for (let i = 0; i < path.length; i++) {
    const n = path[i]
    const lines = linesAt.get(n)
    if (lines !== undefined && !done.has(n)) {
      done.add(n)
      picks.push({ pathIdx: i, node: n, lines })
    }
  }
  const lines = order.skus.length
  const m = tour.cost
  return {
    idx: order.idx,
    m,
    s: m / WALK_SPEED + PICK_SECONDS * lines,
    lines,
    path,
    picks,
    exact: keyIsExact(key, policy),
  }
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : 0)

/** Score a set of orders. withPaths=false leaves path/picks empty to save memory. */
export function simulate(
  orders: readonly Order[],
  assignment: Assignment,
  policy: Policy,
  set: SetName = 'all',
  withPaths = true,
): ScoreResult {
  if (assignment.length !== SLOTS) throw new Error(`assignment length ${assignment.length} != ${SLOTS}`)
  const t0 = nowMs()
  const perOrder: OrderScore[] = new Array(orders.length)
  const visitsPerNode = new Uint32Array(NODE_COUNT)
  let totalM = 0
  let totalS = 0
  let lines = 0
  let exactOrders = 0
  let exactM = 0
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    let sc: OrderScore
    if (withPaths) {
      sc = planOrder(o, assignment, policy)
    } else {
      const key = orderKey(o.skus, assignment)
      const m = costForKey(key, policy)
      const ln = o.skus.length
      sc = {
        idx: o.idx,
        m,
        s: m / WALK_SPEED + PICK_SECONDS * ln,
        lines: ln,
        path: [],
        picks: [],
        exact: keyIsExact(key, policy),
      }
    }
    // pick stops per node = distinct bay nodes of the order
    const seen = new Set<number>()
    for (const sku of o.skus) {
      const n = slotNode(assignment[sku])
      if (!seen.has(n)) {
        seen.add(n)
        visitsPerNode[n]++
      }
    }
    perOrder[i] = sc
    totalM += sc.m
    totalS += sc.s
    lines += sc.lines
    if (sc.exact) {
      exactOrders++
      exactM += sc.m
    }
  }
  return {
    set,
    policy,
    totalM,
    totalS,
    orders: orders.length,
    lines,
    exactOrders,
    heuristicOrders: orders.length - exactOrders,
    exactShareM: totalM > 0 ? exactM / totalM : 0,
    perOrder,
    visitsPerNode,
    elapsedMs: nowMs() - t0,
  }
}

/** Per-order walking metres (Float64Array aligned with `orders`), memoised routing. Used by SA. */
export function perOrderCosts(orders: readonly Order[], assignment: Assignment, policy: Policy = 'exact'): Float64Array {
  const out = new Float64Array(orders.length)
  for (let i = 0; i < orders.length; i++) out[i] = costForKey(orderKey(orders[i].skus, assignment), policy)
  return out
}

/** Total walking metres of a set (no per-order objects). */
export function totalMetres(orders: readonly Order[], assignment: Assignment, policy: Policy = 'exact'): number {
  let t = 0
  for (let i = 0; i < orders.length; i++) t += costForKey(orderKey(orders[i].skus, assignment), policy)
  return t
}
