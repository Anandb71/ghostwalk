import { describe, expect, it } from 'vitest'
import {
  Annealer,
  DOCK,
  SLOTS,
  anneal,
  baselineFastMovers,
  catalogueLayout,
  clearRouteCache,
  dist,
  isEdge,
  isPermutation,
  orderStops,
  ordersFor,
  pickRaceOrders,
  planOrder,
  randomLayout,
  simulate,
  slotNode,
  verifyIncremental,
} from '../src/sim'
import { loadData } from './helpers'

const { raw, data } = loadData()
const train = ordersFor(data, 'train')
const holdout = ordersFor(data, 'holdout')

describe('dataset', () => {
  it('keeps every order, in file order, split as in meta', () => {
    expect(data.orders.length).toBe(raw.meta.orderCount)
    expect(data.train.length).toBe(raw.meta.split.train)
    expect(data.holdout.length).toBe(raw.meta.split.holdout)
    data.orders.forEach((o, i) => {
      expect(o.idx).toBe(i)
      expect(o.id).toBe(raw.orders[i].id)
      expect(new Set(o.skus).size).toBe(o.skus.length)
    })
    for (let i = 1; i < data.orders.length; i++) expect(data.orders[i].ts >= data.orders[i - 1].ts).toBe(true)
    expect(train.every((o) => o.split === 'train')).toBe(true)
    expect(holdout.every((o) => o.split === 'holdout')).toBe(true)
  })
})

describe('layouts', () => {
  it('are permutations', () => {
    expect(isPermutation(catalogueLayout(data.products))).toBe(true)
    expect(isPermutation(randomLayout(42))).toBe(true)
    expect(isPermutation(baselineFastMovers(data.products))).toBe(true)
    expect(randomLayout(42)).toEqual(randomLayout(42))
    expect(randomLayout(42)).not.toEqual(randomLayout(43))
  })
  it('catalogue puts the smallest StockCode in slot 0', () => {
    const a = catalogueLayout(data.products)
    const first = data.products.map((p) => p.sku).sort()[0]
    expect(a[data.products.findIndex((p) => p.sku === first)]).toBe(0)
  })
  it('baseline puts the top train-pick product on the slot nearest the dock', () => {
    const a = baselineFastMovers(data.products)
    let top = 0
    data.products.forEach((p, i) => {
      if (p.picksTrain > data.products[top].picksTrain) top = i
    })
    const nearest = Math.min(...Array.from({ length: SLOTS }, (_, s) => dist(DOCK, slotNode(s))))
    expect(dist(DOCK, slotNode(a[top]))).toBe(nearest)
    expect(a[top]).toBe(0) // ties by slot id
    // distance from the dock never decreases as train picks fall
    const byPicks = data.products.map((_, i) => i).sort((x, y) => data.products[y].picksTrain - data.products[x].picksTrain || x - y)
    for (let k = 1; k < byPicks.length; k++)
      expect(dist(DOCK, slotNode(a[byPicks[k]]))).toBeGreaterThanOrEqual(dist(DOCK, slotNode(a[byPicks[k - 1]])))
  })
})

describe('simulate', () => {
  const base = baselineFastMovers(data.products)

  it('is deterministic (and independent of the memo cache)', () => {
    const r1 = simulate(data.orders, base, 'exact', 'all', false)
    clearRouteCache()
    const r2 = simulate(data.orders, base, 'exact', 'all', false)
    const r3 = simulate(data.orders, base, 'exact', 'all', true)
    expect(r2.totalM).toBe(r1.totalM)
    expect(r3.totalM).toBe(r1.totalM)
    expect(r2.totalS).toBe(r1.totalS)
    expect(r2.perOrder.map((o) => o.m)).toEqual(r1.perOrder.map((o) => o.m))
    expect(Array.from(r2.visitsPerNode)).toEqual(Array.from(r1.visitsPerNode))
    expect(r1.exactOrders + r1.heuristicOrders).toBe(data.orders.length)
  })

  it('every consecutive pair of every path is a graph edge (no rack crossing), real dataset', () => {
    for (const layout of [base, catalogueLayout(data.products)]) {
      for (const policy of ['exact', 'sshape'] as const) {
        const r = simulate(data.orders, layout, policy, 'all', true)
        r.perOrder.forEach((sc, i) => {
          const p = sc.path
          expect(p[0]).toBe(DOCK)
          expect(p[p.length - 1]).toBe(DOCK)
          for (let k = 1; k < p.length; k++) {
            if (!isEdge(p[k - 1], p[k])) throw new Error(`order ${sc.idx}: ${p[k - 1]} -> ${p[k]} is not an edge`)
          }
          const stops = orderStops(data.orders[i], layout)
          expect(sc.picks.map((pk) => pk.node).sort((a, b) => a - b)).toEqual(stops)
          expect(sc.picks.reduce((t, pk) => t + pk.lines, 0)).toBe(sc.lines)
          for (const pk of sc.picks) expect(p[pk.pathIdx]).toBe(pk.node)
        })
      }
    }
  })

  it('time = metres / 1.2 + 8 s per line', () => {
    const o = data.orders[0]
    const sc = planOrder(o, base, 'exact')
    expect(sc.s).toBeCloseTo(sc.m / 1.2 + 8 * o.skus.length, 9)
  })

  it('S-shape is never shorter than the exact policy, every train order', () => {
    for (const layout of [base, catalogueLayout(data.products), randomLayout(42)]) {
      const ex = simulate(train, layout, 'exact', 'train', false)
      const ss = simulate(train, layout, 'sshape', 'train', false)
      ex.perOrder.forEach((o, i) => expect(ss.perOrder[i].m).toBeGreaterThanOrEqual(o.m - 1e-9))
    }
  })

  it('race picks the largest holdout gaps, deterministically', () => {
    const a = simulate(holdout, catalogueLayout(data.products), 'exact', 'holdout', false)
    const b = simulate(holdout, base, 'exact', 'holdout', false)
    const picked = pickRaceOrders(a, b, 6)
    expect(picked.length).toBe(6)
    expect(pickRaceOrders(a, b, 6)).toEqual(picked)
    const gap = new Map(a.perOrder.map((o, i) => [o.idx, Math.abs(o.m - b.perOrder[i].m)]))
    const g = picked.map((i) => gap.get(i)!)
    for (let k = 1; k < g.length; k++) expect(g[k]).toBeLessThanOrEqual(g[k - 1])
    const sixth = g[g.length - 1]
    const strictlyBigger = Array.from(gap.values()).filter((v) => v > sixth).length
    expect(strictlyBigger).toBeLessThanOrEqual(5)
  })
})

describe('anneal', () => {
  const base = baselineFastMovers(data.products)
  const opts = { seed: 42, iterations: 600, startFrom: base, set: 'train' as const, reportEvery: 100 }

  it('incremental totals equal a full recompute', () => {
    const v = verifyIncremental(data, opts)
    expect(v.accepted).toBeGreaterThan(0)
    expect(Math.abs(v.incrementalM - v.fullM)).toBeLessThan(1e-6)
    expect(Math.abs(v.bestIncrementalM - v.bestFullM)).toBeLessThan(1e-6)
  })

  it('is deterministic for a seed and independent of chunking', () => {
    const r1 = anneal(data, opts)
    clearRouteCache()
    const sa = new Annealer(data, opts)
    while (!sa.step(37));
    const r2 = sa.result()
    expect(Array.from(r2.best)).toEqual(Array.from(r1.best))
    expect(r2.bestM).toBe(r1.bestM)
    expect(r2.curve).toEqual(r1.curve)
    expect(isPermutation(r1.best)).toBe(true)
    expect(r1.bestM).toBeLessThanOrEqual(r1.startM)
    expect(r1.bestM).toBe(simulate(train, r1.best, 'exact', 'train', false).totalM)
    const other = anneal(data, { ...opts, seed: 43 })
    expect(Array.from(other.best)).not.toEqual(Array.from(r1.best))
  })

  it('reports progress and honours cancel with best-so-far', () => {
    const seen: number[] = []
    let calls = 0
    const r = anneal(
      data,
      { ...opts, iterations: 1000 },
      (p) => {
        seen.push(p.iter)
        expect(p.assignment && isPermutation(p.assignment)).toBe(true)
      },
      () => ++calls > 3,
    )
    expect(seen).toEqual([100, 200, 300])
    expect(r.iterations).toBe(300)
    expect(r.curve.length).toBeLessThanOrEqual(302)
  })
})
