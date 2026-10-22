// Store <-> worker integration, headless. The real sim.worker.ts module runs in-process behind a
// fake Worker that copies every message with structuredClone (and honours transfer lists), and
// fetch reads web/public. This walks the app's main flows through the real store actions:
// load -> scores -> click-click swap -> re-score -> undo/reset -> policy flip -> race -> anneal.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { isEdge, isPermutation, ordersFor, simulate, type Assignment, type OrderScore } from '../src/sim'
import type { useStore as UseStore, GhostState } from '../src/store'

type Listener = ((e: { data: unknown }) => void) | null

let toMain: Listener = null
const workerScope = {
  onmessage: null as Listener,
  postMessage(msg: unknown, transfer?: Transferable[]) {
    const copy = structuredClone(msg, transfer?.length ? { transfer } : undefined)
    setTimeout(() => toMain?.({ data: copy }), 0)
  },
}

class FakeWorker {
  onmessage: Listener = null
  onerror: unknown = null
  onmessageerror: unknown = null
  constructor() {
    toMain = (e) => this.onmessage?.(e)
  }
  postMessage(msg: unknown) {
    const copy = structuredClone(msg)
    setTimeout(() => workerScope.onmessage?.({ data: copy }), 0)
  }
  terminate() {}
}

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
async function fakeFetch(url: string) {
  try {
    const text = readFileSync(publicDir + String(url).replace(/^\/+/, ''), 'utf8')
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: 404, json: async () => ({}) }
  }
}

async function until(cond: () => boolean, what: string, ms = 30_000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

const edgesOnly = (p: OrderScore) => p.path.length > 1 && p.path.every((n, i) => i === 0 || isEdge(p.path[i - 1], n))
const same = (a: Assignment | null, b: Assignment | null) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i])
const allScored = (s: GhostState) =>
  (['original', 'random', 'baseline', 'sa', 'player'] as const).every((k) => s.scores[k].train && s.scores[k].holdout) && !s.scoring

let useStore: typeof UseStore
const S = () => useStore.getState()

beforeAll(async () => {
  vi.stubGlobal('self', workerScope)
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('fetch', fakeFetch)
  await import('../src/worker/sim.worker')
  ;({ useStore } = await import('../src/store'))
})

describe('store + worker integration', () => {
  it('load(): dataset, five layouts, hero replay plan on graph edges', async () => {
    await S().load()
    const s = S()
    expect(s.status).toBe('ready')
    expect(s.data?.orders.length).toBeGreaterThan(2000)
    for (const k of ['original', 'random', 'baseline', 'sa', 'player'] as const) expect(isPermutation(s.layouts[k]!)).toBe(true)
    expect(s.anneal.shipped?.iterations).toBe(30000)
    expect(s.assignment).toBe(s.layouts.player)
    expect(s.replay.orderIdx).toBe(s.heroOrderIdx)
    expect(s.data!.orders[s.heroOrderIdx].split).toBe('holdout')
    expect(s.replay.plan && edgesOnly(s.replay.plan)).toBe(true)
  })

  it('scores every layout on train and held-out in the worker; numbers agree with the shipped eval', async () => {
    await until(() => allScored(S()), 'initial scores')
    const { scores, anneal, data, layouts } = S()
    expect(scores.baseline.holdout!.totalM).toBeLessThan(scores.original.holdout!.totalM)
    expect(scores.sa.holdout!.totalM).toBeLessThan(scores.baseline.holdout!.totalM)
    expect(scores.sa.holdout!.totalM).toBeCloseTo(anneal.shipped!.holdoutM, 0)
    expect(scores.player.holdout!.totalM).toBeCloseTo(scores.original.holdout!.totalM, 6)
    // transferred typed array arrives intact
    const v = scores.player.train!.visitsPerNode
    expect(v).toBeInstanceOf(Uint32Array)
    expect(v.reduce((a, x) => a + x, 0)).toBeGreaterThan(0)
    // worker result == main-thread simulate on the same layout
    const direct = simulate(ordersFor(data!, 'holdout'), layouts.baseline!, 'exact', 'holdout', false)
    expect(scores.baseline.holdout!.totalM).toBeCloseTo(direct.totalM, 6)
  })

  it('click-click swap updates the layout, re-plans the replay and re-scores You', async () => {
    const before = S()
    const run0 = before.replay.runId
    const oldHold = before.scores.player.holdout
    // swap the carton in the slot nearest the dock with one in the far back corner
    S().selectSlot(0)
    expect(S().selectedSlot).toBe(0)
    S().selectSlot(99)
    const s = S()
    expect(s.selectedSlot).toBeNull()
    expect(s.undo.length).toBe(1)
    expect(s.assignment).toBe(s.layouts.player)
    expect(same(s.assignment, s.layouts.original)).toBe(false)
    expect(s.replay.runId).toBe(run0 + 1)
    await until(() => S().scores.player.holdout !== oldHold && !S().scoring, 're-score after swap')
    const direct = simulate(ordersFor(s.data!, 'holdout'), s.assignment!, 'exact', 'holdout', false)
    expect(S().scores.player.holdout!.totalM).toBeCloseTo(direct.totalM, 6)

    S().undoSwap()
    expect(same(S().assignment, S().layouts.original)).toBe(true)
    expect(S().undo.length).toBe(0)
  })

  it('Start from Baseline copies the layout and its scores', async () => {
    S().resetTo('baseline')
    const s = S()
    expect(s.startedFrom).toBe('baseline')
    expect(same(s.assignment, s.layouts.baseline)).toBe(true)
    expect(s.scores.player.holdout!.totalM).toBe(s.scores.baseline.holdout!.totalM)
    await until(() => allScored(S()), 're-score after reset')
  })

  it('policy flip re-scores everything under S-shape and back', async () => {
    S().setPolicy('sshape')
    expect(S().scores.player.holdout).toBeNull()
    await until(() => allScored(S()), 'S-shape scores')
    const sh = S().scores.baseline.holdout!
    expect(sh.policy).toBe('sshape')
    expect(S().replay.plan!.exact).toBe(false)
    S().setPolicy('exact')
    await until(() => allScored(S()), 'exact scores again')
    expect(sh.totalM).toBeGreaterThan(S().scores.baseline.holdout!.totalM)
  })

  it('race: ghost Original vs solid Baseline over six held-out orders with full paths', async () => {
    S().startRace()
    expect(S().mode).toBe('race')
    await until(() => S().race.active, 'race start')
    const { race, replay, data } = S()
    expect(race.ghostKey).toBe('original') // your layout == Baseline, so the ghost falls back to Original
    expect(race.ghostLabel).toBe('Original')
    expect(race.solidLabel).toBe('Baseline')
    expect(race.orderIdxs.length).toBe(6)
    expect(race.orderIdxs.every((i) => data!.orders[i].split === 'holdout')).toBe(true)
    expect(race.ghostPlans.every(edgesOnly) && race.solidPlans.every(edgesOnly)).toBe(true)
    expect(replay.playing).toBe(true)
    const g = race.ghostPlans.reduce((a, p) => a + p.m, 0)
    const p = race.solidPlans.reduce((a, q) => a + q.m, 0)
    expect(p).toBeLessThan(g)
    S().raceFinished('ghost')
    expect(S().replay.playing).toBe(true)
    S().raceFinished('solid')
    expect(S().replay.playing).toBe(false)
    S().setMode('slot')
    expect(S().race.active).toBe(false)
  })

  it('anneal streams live layouts, finishes, and its result can be applied', async () => {
    const start = S().assignment
    S().startAnneal(300, 7)
    expect(S().anneal.running).toBe(true)
    expect(same(S().anneal.live, start)).toBe(true)
    await until(() => !S().anneal.running, 'anneal finish')
    const a = S().anneal
    expect(a.error).toBeNull()
    expect(a.live).toBeNull()
    expect(a.progress.length).toBeGreaterThan(3)
    expect(a.result!.iterations).toBe(300)
    expect(a.result!.bestM).toBeLessThanOrEqual(a.result!.startM)
    const undo0 = S().undo.length
    S().applyAnnealResult()
    expect(same(S().assignment, a.result!.best)).toBe(true)
    expect(S().undo.length).toBe(undo0 + 1)
  })

  it('anneal cancel returns the best-so-far', async () => {
    S().startAnneal(200_000, 3)
    await until(() => S().anneal.progress.length >= 2, 'anneal progress')
    S().cancelAnneal()
    await until(() => !S().anneal.running, 'anneal cancel')
    const r = S().anneal.result!
    expect(r.iterations).toBeLessThan(200_000)
    expect(isPermutation(r.best)).toBe(true)
  })
})
