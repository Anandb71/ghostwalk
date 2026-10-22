import { describe, expect, it } from 'vitest'
import {
  BAY_INDEX_NODE,
  DOCK,
  backNode,
  bayNode,
  dist,
  frontNode,
  isEdge,
  keyStops,
  middleNode,
  mulberry32,
  normaliseStops,
  routeExact,
  routeHeuristic,
  routeSShape,
  stopsKey,
  tourCost,
  tourPath,
} from '../src/sim'

function bruteForce(stops: number[]): number {
  const s = normaliseStops(stops)
  let best = Infinity
  const perm = s.slice()
  const rec = (k: number) => {
    if (k === perm.length) {
      best = Math.min(best, tourCost([DOCK, ...perm, DOCK]))
      return
    }
    for (let i = k; i < perm.length; i++) {
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
      rec(k + 1)
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
    }
  }
  rec(0)
  return best
}

function randomStops(rng: () => number, n: number): number[] {
  const set = new Set<number>()
  while (set.size < n) set.add(BAY_INDEX_NODE[Math.floor(rng() * BAY_INDEX_NODE.length)])
  return Array.from(set)
}

describe('geometry: hand-checked distances', () => {
  it('dock -> N(0,0) = 4.0 + 2.6 = 6.6', () => expect(dist(DOCK, bayNode(0, 0))).toBeCloseTo(6.6, 9))
  it('N(0,0) -> N(1,0) = 2.6 + 5.0 + 2.6 = 10.2', () => expect(dist(bayNode(0, 0), bayNode(1, 0))).toBeCloseTo(10.2, 9))
  it('dock -> F(0) = 4.0', () => expect(dist(DOCK, frontNode(0))).toBeCloseTo(4.0, 9))
  it('N(0,4) -> N(0,5) through the middle cross-aisle = 2.6 + 2.6 = 5.2', () =>
    expect(dist(bayNode(0, 4), bayNode(0, 5))).toBeCloseTo(5.2, 9))
  it('N(0,7) -> N(2,7) via middle or back = 5.0 + 10.0 + 5.0 = 20.0', () =>
    expect(dist(bayNode(0, 7), bayNode(2, 7))).toBeCloseTo(20.0, 9))
  it('dock -> B(4) = 4 + 20 + 20 = 44', () => expect(dist(DOCK, backNode(4))).toBeCloseTo(44, 9))
  it('distance matrix is symmetric', () => {
    for (let u = 0; u < 66; u++) for (let v = 0; v < 66; v++) expect(dist(u, v)).toBe(dist(v, u))
  })
})

describe('stop-set keys', () => {
  it('round-trip every bay node', () => {
    for (const n of BAY_INDEX_NODE) expect(keyStops(stopsKey([n]))).toEqual([n])
    const all = Array.from(BAY_INDEX_NODE)
    expect(keyStops(stopsKey(all))).toEqual(all.slice().sort((a, b) => a - b))
  })
})

describe('Held–Karp', () => {
  it('equals brute force on 200 random stop sets with n <= 7', () => {
    const rng = mulberry32(2026)
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rng() * 7)
      const stops = randomStops(rng, n)
      const hk = routeExact(stops)
      expect(hk.exact).toBe(true)
      expect(hk.cost).toBeCloseTo(bruteForce(stops), 6)
      expect(hk.cost).toBeCloseTo(tourCost(hk.order), 9)
      expect(hk.order[0]).toBe(DOCK)
      expect(hk.order[hk.order.length - 1]).toBe(DOCK)
      expect(hk.order.slice(1, -1).slice().sort((a, b) => a - b)).toEqual(normaliseStops(stops))
    }
  })

  it('is never worse than the heuristic or S-shape (n <= 11)', () => {
    const rng = mulberry32(7)
    for (let t = 0; t < 60; t++) {
      const stops = randomStops(rng, 8 + Math.floor(rng() * 4))
      const hk = routeExact(stops).cost
      expect(hk).toBeLessThanOrEqual(routeHeuristic(stops).cost + 1e-9)
      expect(hk).toBeLessThanOrEqual(routeSShape(stops).cost + 1e-9)
    }
  })

  it('handles empty and single-stop orders', () => {
    expect(routeExact([]).cost).toBe(0)
    expect(routeExact([bayNode(0, 0)]).cost).toBeCloseTo(13.2, 9)
    expect(routeExact([DOCK, bayNode(0, 0), bayNode(0, 0)]).order).toEqual([DOCK, bayNode(0, 0), DOCK])
  })
})

describe('S-shape', () => {
  it('turns at the middle cross-aisle when every pick is in the front block', () => {
    const t = routeSShape([bayNode(0, 1), bayNode(2, 3)])
    expect(t.order).toEqual([DOCK, frontNode(0), bayNode(0, 1), middleNode(0), middleNode(2), bayNode(2, 3), frontNode(2), DOCK])
  })
  it('uses the return policy on the last aisle when entering from the front', () => {
    const t = routeSShape([bayNode(1, 7)])
    expect(t.order).toEqual([DOCK, frontNode(1), bayNode(1, 7), frontNode(1), DOCK])
    expect(t.cost).toBeCloseTo(2 * dist(DOCK, bayNode(1, 7)), 9)
  })
  it('traverses to the back cross-aisle when any pick is in the back block', () => {
    const t = routeSShape([bayNode(0, 1), bayNode(3, 8)])
    expect(t.order).toEqual([DOCK, frontNode(0), bayNode(0, 1), backNode(0), backNode(3), bayNode(3, 8), frontNode(3), DOCK])
  })
})

describe('tourPath', () => {
  it('only uses graph edges, for random tours of every policy', () => {
    const rng = mulberry32(99)
    for (let t = 0; t < 100; t++) {
      const stops = randomStops(rng, 1 + Math.floor(rng() * 30))
      const tours = [routeSShape(stops), routeHeuristic(stops)]
      if (stops.length <= 11) tours.push(routeExact(stops))
      for (const tour of tours) {
        const path = tourPath(tour.order)
        for (let i = 1; i < path.length; i++) expect(isEdge(path[i - 1], path[i])).toBe(true)
        let walked = 0
        for (let i = 1; i < path.length; i++) walked += dist(path[i - 1], path[i])
        expect(walked).toBeCloseTo(tour.cost, 6)
        for (const s of stops) expect(path).toContain(s)
      }
    }
  })
})
