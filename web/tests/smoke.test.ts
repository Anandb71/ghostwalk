// Headless end-to-end smoke: the same path the app takes on load, minus the browser.
// orders.json -> prepareDataset -> layouts -> held-out scoring -> one replay plan -> walk timeline.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DOCK,
  SLOTS,
  baselineFastMovers,
  catalogueLayout,
  isEdge,
  isPermutation,
  ordersFor,
  planOrder,
  prepareDataset,
  randomLayout,
  simulate,
  slotNode,
  type Dataset,
} from '../src/sim'
import { buildTimeline } from '../src/scene/timeline'

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as T

const raw = readJson<Dataset>('../public/data/orders.json')
const data = prepareDataset(raw)
const holdout = ordersFor(data, 'holdout')

const original = catalogueLayout(data.products)
const baseline = baselineFastMovers(data.products)
const random = randomLayout(42)

describe('smoke: data -> layouts -> scores -> replay', () => {
  it('loads the month and builds three valid layouts', () => {
    expect(data.products.length).toBe(SLOTS)
    expect(data.orders.length).toBe(raw.meta.orderCount)
    expect(holdout.length).toBe(raw.meta.split.holdout)
    for (const a of [original, baseline, random]) {
      expect(a.length).toBe(SLOTS)
      expect(isPermutation(a)).toBe(true)
    }
  })

  it('Baseline beats Original on held-out orders (exact routing)', () => {
    const base = simulate(holdout, baseline, 'exact', 'holdout', false)
    const orig = simulate(holdout, original, 'exact', 'holdout', false)
    expect(base.orders).toBe(holdout.length)
    expect(orig.orders).toBe(holdout.length)
    expect(base.totalM).toBeGreaterThan(0)
    expect(base.totalM).toBeLessThan(orig.totalM)
    // KPI-only scoring drops paths; replay/race must use planOrder instead
    expect(base.perOrder.every((o) => o.path.length === 0)).toBe(true)
  })

  it('plans the hero order on graph edges only, dock to dock, stopping at every slot', () => {
    const heroIdx = data.holdout.find((i) => data.orders[i].skus.length >= 6 && data.orders[i].skus.length <= 9)
    expect(heroIdx).toBeDefined()
    const order = data.orders[heroIdx!]
    for (const layout of [original, baseline]) {
      const plan = planOrder(order, layout, 'exact')
      expect(plan.path[0]).toBe(DOCK)
      expect(plan.path[plan.path.length - 1]).toBe(DOCK)
      for (let i = 1; i < plan.path.length; i++) expect(isEdge(plan.path[i - 1], plan.path[i])).toBe(true)
      const stopNodes = new Set(order.skus.map((sku) => slotNode(layout[sku])))
      expect(new Set(plan.picks.map((p) => p.node))).toEqual(stopNodes)
      expect(plan.picks.reduce((a, p) => a + p.lines, 0)).toBe(order.skus.length)
      for (const p of plan.picks) expect(plan.path[p.pathIdx]).toBe(p.node)

      // the scene walks exactly the simulator's metres and seconds
      const tl = buildTimeline([plan], 0.06)
      expect(tl.totalM).toBeCloseTo(plan.m, 6)
      expect(tl.totalT).toBeCloseTo(plan.s, 6)
      expect(tl.stopCount).toBe(plan.picks.length)
    }
  })

  it('the shipped SA layout matches what the engine scores today', () => {
    const sa = readJson<{ assignment: number[]; trainM: number; holdoutM: number }>('../public/layouts/sa_seed42.json')
    const a = Uint8Array.from(sa.assignment)
    expect(isPermutation(a)).toBe(true)
    const hold = simulate(holdout, a, 'exact', 'holdout', false)
    const train = simulate(ordersFor(data, 'train'), a, 'exact', 'train', false)
    expect(hold.totalM).toBeCloseTo(sa.holdoutM, 0)
    expect(train.totalM).toBeCloseTo(sa.trainM, 0)
    expect(hold.totalM).toBeLessThan(simulate(holdout, baseline, 'exact', 'holdout', false).totalM)
  })
})
