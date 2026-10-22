// App state (zustand). Contract between scene/ (reads, calls selection actions) and ui/ (everything).
// Owner: UI (#5). Scene may only READ state and call: selectSlot, setHover, swapSlots, replayFinished,
// raceFinished. Never rename or remove fields; add new ones freely.
import { create } from 'zustand'
import type {
  AnnealProgress,
  AnnealResult,
  Assignment,
  Dataset,
  OrderScore,
  Policy,
  PreparedData,
  ScoreResult,
  Split,
} from './sim'
import { SLOTS, baselineFastMovers, catalogueLayout, pickRaceOrders, planOrder, prepareDataset, randomLayout } from './sim'
import type { AnnealHandle, SimClient } from './worker/protocol'
import { createSimClient } from './worker/client'

export type Mode = 'replay' | 'slot' | 'race' | 'anneal' | 'evidence'
export type LayoutKey = 'original' | 'random' | 'baseline' | 'sa' | 'player'
export type StartKey = 'original' | 'baseline' | 'sa'
export type CameraPreset = 'overview' | 'follow' | 'top'
export type Quality = 'medium' | 'high'
export type Speed = 1 | 4 | 20

export interface LayoutScores {
  train: ScoreResult | null // perOrder without paths
  holdout: ScoreResult | null
}

export interface ReplayState {
  orderIdx: number // index into data.orders
  playing: boolean
  speed: Speed
  plan: OrderScore | null // route of orderIdx on the current assignment (computed with sim.planOrder)
  runId: number // bump to restart the picker animation from the dock
}

export interface RaceState {
  active: boolean
  orderIdxs: number[] // holdout orders raced back to back (sim.pickRaceOrders)
  ghostLabel: string // e.g. "Original", "Baseline" — always shown on screen
  solidLabel: string // e.g. "You", "Baseline"
  ghostAssignment: Assignment | null
  ghostPlans: OrderScore[] // one per orderIdxs entry, ghost layout
  solidPlans: OrderScore[] // same orders, current layout
  runId: number
  finished: { ghost: boolean; solid: boolean }
  /** Which stored layout the ghost walks (null before the first race). */
  ghostKey: StartKey | null
  /** True while startRace waits for held-out scores / plans. */
  preparing: boolean
  error: string | null
}

export interface ShippedSA {
  seed: number
  iterations: number
  assignment: number[]
  trainM: number
  holdoutM: number
  curve: [number, number, number][]
}

export interface AnnealState {
  running: boolean
  seed: number
  iterations: number
  progress: AnnealProgress[] // downsampled curve for the chart
  live: Assignment | null // current SA layout while running (scene shows this instead of `assignment`)
  lastSwap: [number, number] | null // sku indices, for the fly fx
  result: AnnealResult | null
  shipped: ShippedSA | null // public/layouts/sa_seed42.json
  /** performance.now() when the run started (UI measurement only, never fed to the sim). */
  startedAt: number | null
  itersPerSec: number | null
  error: string | null
}

export interface AblationRow {
  key: 'baseline' | 'player'
  label: string
  exact: ScoreResult | null
  sshape: ScoreResult | null
}

export interface AblationState {
  status: 'idle' | 'running' | 'done' | 'error'
  rows: AblationRow[]
  error: string | null
}

/** Mutable per-frame counters. Scene WRITES these in useFrame; UI READS them in requestAnimationFrame. Never put them in React state. */
export const liveCounters = {
  replay: { m: 0, s: 0, picksDone: 0, done: false },
  ghost: { m: 0, s: 0, orderPos: 0, done: false },
  solid: { m: 0, s: 0, orderPos: 0, done: false },
}

export interface GhostState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  data: PreparedData | null

  layouts: Record<LayoutKey, Assignment | null>
  assignment: Assignment | null // the player's current layout (=== layouts.player)
  startedFrom: StartKey
  scores: Record<LayoutKey, LayoutScores>
  scoring: boolean

  policy: Policy
  mode: Mode
  camera: CameraPreset
  quality: Quality
  showHeat: boolean
  selectedSlot: number | null
  hoverSlot: number | null
  undo: Assignment[]

  replay: ReplayState
  race: RaceState
  anneal: AnnealState

  /** First held-out order with 6–9 lines; the replay starts here. */
  heroOrderIdx: number
  /** Evidence panel: Baseline and You scored on held-out with both routing policies. */
  ablation: AblationState

  load: () => Promise<void>
  setMode: (m: Mode) => void
  setPolicy: (p: Policy) => void
  setCamera: (c: CameraPreset) => void
  setQuality: (q: Quality) => void
  toggleHeat: () => void

  selectSlot: (slot: number | null) => void // second select of a different slot swaps
  setHover: (slot: number | null) => void
  swapSlots: (a: number, b: number) => void
  undoSwap: () => void
  resetTo: (key: StartKey) => void

  play: () => void
  pause: () => void
  togglePlay: () => void
  setSpeed: (s: Speed) => void
  setOrder: (orderIdx: number) => void
  replayFinished: () => void // scene calls when the picker is back at the dock

  startRace: (ghost?: StartKey) => void
  stopRace: () => void
  raceFinished: (who: 'ghost' | 'solid') => void

  startAnneal: (iterations: number, seed: number) => void
  cancelAnneal: () => void
  applyAnnealResult: () => void

  runAblation: () => void
}

/** Layout the scene should draw right now. */
export const displayAssignment = (s: GhostState): Assignment | null =>
  s.anneal.running && s.anneal.live ? s.anneal.live : s.assignment

export const LAYOUT_LABEL: Record<LayoutKey, string> = {
  original: 'Original',
  random: 'Random (42)',
  baseline: 'Baseline',
  sa: 'SA',
  player: 'You',
}

const emptyScores = (): Record<LayoutKey, LayoutScores> => ({
  original: { train: null, holdout: null },
  random: { train: null, holdout: null },
  baseline: { train: null, holdout: null },
  sa: { train: null, holdout: null },
  player: { train: null, holdout: null },
})

// ---------------------------------------------------------------------------------------------
// helpers (pure)

const copy = (a: Assignment): Assignment => new Uint8Array(a)

export const sameLayout = (a: Assignment | null, b: Assignment | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Inverse of an assignment: slot -> sku index (-1 if empty). */
export const slotToSku = (a: Assignment): Int16Array => {
  const inv = new Int16Array(SLOTS).fill(-1)
  for (let sku = 0; sku < a.length; sku++) inv[a[sku]] = sku
  return inv
}

const isPermutation = (arr: unknown, n: number): arr is number[] => {
  if (!Array.isArray(arr) || arr.length !== n) return false
  const seen = new Uint8Array(n)
  for (const v of arr) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false
    seen[v] = 1
  }
  return true
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function safePlan(data: PreparedData, orderIdx: number, assignment: Assignment, policy: Policy): OrderScore | null {
  const order = data.orders[orderIdx]
  if (!order) return null
  try {
    return planOrder(order, assignment, policy)
  } catch (e) {
    console.warn('planOrder failed', e)
    return null
  }
}

function pickHeroOrder(data: PreparedData): number {
  for (const idx of data.holdout) {
    const n = data.orders[idx]?.skus.length ?? 0
    if (n >= 6 && n <= 9) return idx
  }
  return data.holdout[0] ?? 0
}

function resetCounters(which: 'replay' | 'race') {
  if (which === 'replay') Object.assign(liveCounters.replay, { m: 0, s: 0, picksDone: 0, done: false })
  else {
    Object.assign(liveCounters.ghost, { m: 0, s: 0, orderPos: 0, done: false })
    Object.assign(liveCounters.solid, { m: 0, s: 0, orderPos: 0, done: false })
  }
}

// ---------------------------------------------------------------------------------------------
// module-level singletons (one worker, one load, sequence numbers to drop stale worker replies)

let client: SimClient | null = null
let loadPromise: Promise<void> | null = null
const scoreSeq: Record<LayoutKey, number> = { original: 0, random: 0, baseline: 0, sa: 0, player: 0 }
const inflight: Partial<Record<LayoutKey, Promise<LayoutScores | null>>> = {}
let pendingScores = 0
let rescoreTimer: ReturnType<typeof setTimeout> | null = null
let raceSeq = 0
let annealSeq = 0
let annealHandle: AnnealHandle | null = null
let ablationSeq = 0
let replayEnded = false

const PROGRESS_CAP = 400
const UNDO_CAP = 50

export const useStore = create<GhostState>()((set, get) => {
  const updateScoring = () => set({ scoring: pendingScores > 0 || rescoreTimer !== null })

  /** Score one stored layout on train + holdout with the current policy. Resolves null if superseded. */
  const scoreKey = (key: LayoutKey): Promise<LayoutScores | null> => {
    const s = get()
    const a = s.layouts[key]
    if (!client || !a) return Promise.resolve(null)
    const c = client
    const seq = ++scoreSeq[key]
    const policy = s.policy
    pendingScores++
    updateScoring()
    const one = (split: Split) =>
      c.score(copy(a), split, policy, false).then((r) => {
        if (seq === scoreSeq[key] && get().policy === policy) {
          set((st) => ({ scores: { ...st.scores, [key]: { ...st.scores[key], [split]: r } } }))
        }
        return r
      })
    const p: Promise<LayoutScores | null> = Promise.all([one('train'), one('holdout')])
      .then(([train, holdout]) => (seq === scoreSeq[key] ? { train, holdout } : null))
      .catch((e) => {
        console.error(`scoring ${key} failed`, e)
        return null
      })
      .finally(() => {
        pendingScores--
        if (inflight[key] === p) delete inflight[key]
        updateScoring()
      })
    inflight[key] = p
    return p
  }

  /** Fresh scores for a layout: flushes a pending debounced re-score and waits for in-flight work. */
  const ensureScores = async (key: LayoutKey): Promise<LayoutScores | null> => {
    if (key === 'player' && rescoreTimer) {
      clearTimeout(rescoreTimer)
      rescoreTimer = null
      void scoreKey('player')
    }
    for (let i = 0; i < 6; i++) {
      const p = inflight[key]
      if (!p) break
      const r = await p
      if (r) return r
    }
    const sc = get().scores[key]
    if (sc.train && sc.holdout) return sc
    return scoreKey(key)
  }

  const scheduleRescore = () => {
    scoreSeq.player++ // anything in flight for the previous player layout is now stale
    if (rescoreTimer) clearTimeout(rescoreTimer)
    rescoreTimer = setTimeout(() => {
      rescoreTimer = null
      void scoreKey('player')
    }, 150)
    updateScoring()
  }

  const replanReplay = () => {
    const s = get()
    if (!s.data || !s.assignment) return
    const plan = safePlan(s.data, s.replay.orderIdx, s.assignment, s.policy)
    replayEnded = false
    resetCounters('replay')
    set((st) => ({ replay: { ...st.replay, plan, runId: st.replay.runId + 1 } }))
  }

  /** Install a new player layout (always a fresh array), re-plan the replay, schedule a re-score. */
  const commitPlayer = (next: Assignment, undo: Assignment[], extra: Partial<GhostState> = {}) => {
    set((st) => ({
      layouts: { ...st.layouts, player: next },
      assignment: next,
      undo,
      selectedSlot: null,
      ...extra,
    }))
    replanReplay()
    scheduleRescore()
  }

  const pushUndo = (prev: Assignment | null): Assignment[] => {
    const u = get().undo
    if (!prev) return u
    const next = [...u, prev]
    return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next
  }

  const planRace = (orderIdxs: number[], ghostAssignment: Assignment) => {
    const s = get()
    if (!s.data || !s.assignment) return null
    const ghostPlans: OrderScore[] = []
    const solidPlans: OrderScore[] = []
    for (const idx of orderIdxs) {
      const g = safePlan(s.data, idx, ghostAssignment, s.policy)
      const p = safePlan(s.data, idx, s.assignment, s.policy)
      if (!g || !p) return null
      ghostPlans.push(g)
      solidPlans.push(p)
    }
    return { ghostPlans, solidPlans }
  }

  const stopRaceState = (): Partial<GhostState> => {
    raceSeq++
    const r = get().race
    return {
      race: { ...r, active: false, preparing: false },
      replay: { ...get().replay, playing: false },
    }
  }

  return {
    status: 'loading',
    error: null,
    data: null,

    layouts: { original: null, random: null, baseline: null, sa: null, player: null },
    assignment: null,
    startedFrom: 'original',
    scores: emptyScores(),
    scoring: false,

    policy: 'exact',
    mode: 'replay',
    camera: 'overview',
    quality: 'medium',
    showHeat: false,
    selectedSlot: null,
    hoverSlot: null,
    undo: [],

    replay: { orderIdx: 0, playing: false, speed: 4, plan: null, runId: 0 },
    race: {
      active: false,
      orderIdxs: [],
      ghostLabel: 'Original',
      solidLabel: 'You',
      ghostAssignment: null,
      ghostPlans: [],
      solidPlans: [],
      runId: 0,
      finished: { ghost: false, solid: false },
      ghostKey: null,
      preparing: false,
      error: null,
    },
    anneal: {
      running: false,
      seed: 42,
      iterations: 3000,
      progress: [],
      live: null,
      lastSwap: null,
      result: null,
      shipped: null,
      startedAt: null,
      itersPerSec: null,
      error: null,
    },

    heroOrderIdx: 0,
    ablation: { status: 'idle', rows: [], error: null },

    // ---- loading ------------------------------------------------------------------------------

    load: () => {
      if (loadPromise) return loadPromise
      loadPromise = (async () => {
        try {
          set({ status: 'loading', error: null })
          const base = import.meta.env.BASE_URL
          const res = await fetch(base + 'data/orders.json')
          if (!res.ok) throw new Error(`could not load data/orders.json (HTTP ${res.status})`)
          const raw = (await res.json()) as Dataset
          const data = prepareDataset(raw)

          const original = catalogueLayout(data.products)
          const random = randomLayout(42)
          const baseline = baselineFastMovers(data.products)
          const player = copy(original)

          // Shipped SA layout is optional (written by `npm run eval`). Dev servers may answer a missing
          // file with index.html, so anything that does not parse into a permutation is ignored.
          let shipped: ShippedSA | null = null
          let sa: Assignment | null = null
          try {
            const r = await fetch(base + 'layouts/sa_seed42.json')
            if (r.ok) {
              const j = (await r.json()) as ShippedSA
              if (j && isPermutation(j.assignment, SLOTS)) {
                shipped = j
                sa = Uint8Array.from(j.assignment)
              }
            }
          } catch {
            /* no shipped SA: fine */
          }

          client ??= createSimClient()
          await client.init(raw)

          const hero = pickHeroOrder(data)
          const policy = get().policy
          const plan = safePlan(data, hero, player, policy)
          replayEnded = false
          resetCounters('replay')
          set((st) => ({
            status: 'ready',
            error: null,
            data,
            layouts: { original, random, baseline, sa, player },
            assignment: player,
            startedFrom: 'original',
            undo: [],
            heroOrderIdx: hero,
            replay: { ...st.replay, orderIdx: hero, plan, runId: st.replay.runId + 1 },
            anneal: { ...st.anneal, shipped },
          }))

          // Worker is single-threaded: score what the headline needs first.
          for (const key of ['player', 'baseline', 'original', 'sa', 'random'] as LayoutKey[]) void scoreKey(key)
        } catch (e) {
          console.error('load failed', e)
          loadPromise = null // allow a retry
          set({ status: 'error', error: errMsg(e) })
        }
      })()
      return loadPromise
    },

    // ---- view settings ------------------------------------------------------------------------

    setMode: (m) => {
      const s = get()
      if (s.mode === m) return
      const patch: Partial<GhostState> = { mode: m }
      if (s.mode === 'race' && (s.race.active || s.race.preparing)) Object.assign(patch, stopRaceState())
      if (m !== 'slot') patch.selectedSlot = null
      set(patch)
    },

    setPolicy: (p) => {
      const s = get()
      if (s.policy === p) return
      set({ policy: p, scores: emptyScores() })
      for (const key of ['player', 'baseline', 'original', 'sa', 'random'] as LayoutKey[]) {
        if (key === 'player' && rescoreTimer) {
          clearTimeout(rescoreTimer)
          rescoreTimer = null
        }
        void scoreKey(key)
      }
      replanReplay()
      const r = get().race
      if ((r.active || r.preparing) && r.ghostAssignment && r.orderIdxs.length) {
        const plans = planRace(r.orderIdxs, r.ghostAssignment)
        resetCounters('race')
        if (plans) {
          set((st) => ({
            race: { ...st.race, ...plans, runId: st.race.runId + 1, finished: { ghost: false, solid: false } },
          }))
        }
      }
    },

    setCamera: (c) => set({ camera: c }),
    setQuality: (q) => set({ quality: q }),
    toggleHeat: () => set((st) => ({ showHeat: !st.showHeat })),

    // ---- slotting -----------------------------------------------------------------------------

    selectSlot: (slot) => {
      const s = get()
      if (slot === null) {
        if (s.selectedSlot !== null) set({ selectedSlot: null })
        return
      }
      if (slot < 0 || slot >= SLOTS) return
      if (s.selectedSlot === null) set({ selectedSlot: slot })
      else if (s.selectedSlot === slot) set({ selectedSlot: null })
      else get().swapSlots(s.selectedSlot, slot)
    },

    setHover: (slot) => {
      if (get().hoverSlot !== slot) set({ hoverSlot: slot })
    },

    swapSlots: (a, b) => {
      const s = get()
      const cur = s.assignment
      if (!cur || a === b || a < 0 || b < 0 || a >= SLOTS || b >= SLOTS) {
        set({ selectedSlot: null })
        return
      }
      const inv = slotToSku(cur)
      const skuA = inv[a]
      const skuB = inv[b]
      const next = copy(cur)
      if (skuA >= 0) next[skuA] = b
      if (skuB >= 0) next[skuB] = a
      commitPlayer(next, pushUndo(cur))
    },

    undoSwap: () => {
      const u = get().undo
      if (!u.length) return
      const prev = u[u.length - 1]
      commitPlayer(copy(prev), u.slice(0, -1))
    },

    resetTo: (key) => {
      const s = get()
      const src = s.layouts[key]
      if (!src) return
      // Identical layout => identical scores: show them immediately, re-score anyway for safety.
      const known = s.scores[key]
      commitPlayer(copy(src), [], {
        startedFrom: key,
        scores: { ...s.scores, player: { train: known.train, holdout: known.holdout } },
      })
    },

    // ---- replay -------------------------------------------------------------------------------

    play: () => {
      const s = get()
      if (s.race.active) {
        const done = s.race.finished.ghost && s.race.finished.solid
        if (done) resetCounters('race')
        set((st) => ({
          replay: { ...st.replay, playing: true },
          race: done ? { ...st.race, runId: st.race.runId + 1, finished: { ghost: false, solid: false } } : st.race,
        }))
        return
      }
      const restart = replayEnded || liveCounters.replay.done
      if (restart) {
        replayEnded = false
        resetCounters('replay')
      }
      set((st) => ({ replay: { ...st.replay, playing: true, runId: restart ? st.replay.runId + 1 : st.replay.runId } }))
    },

    pause: () => set((st) => ({ replay: { ...st.replay, playing: false } })),
    togglePlay: () => (get().replay.playing ? get().pause() : get().play()),
    setSpeed: (speed) => set((st) => ({ replay: { ...st.replay, speed } })),

    setOrder: (orderIdx) => {
      const s = get()
      if (!s.data) return
      const n = s.data.orders.length
      const idx = Math.max(0, Math.min(n - 1, Math.round(orderIdx)))
      const plan = s.assignment ? safePlan(s.data, idx, s.assignment, s.policy) : null
      replayEnded = false
      resetCounters('replay')
      set((st) => ({ replay: { ...st.replay, orderIdx: idx, plan, runId: st.replay.runId + 1 } }))
    },

    replayFinished: () => {
      replayEnded = true
      if (get().race.active) return // the race owns the transport
      set((st) => ({ replay: { ...st.replay, playing: false } }))
    },

    // ---- race ---------------------------------------------------------------------------------

    startRace: (ghost) => {
      const s = get()
      if (s.status !== 'ready' || !s.data || !s.assignment) return
      const player = s.assignment
      const want: StartKey = ghost ?? s.startedFrom
      const order: StartKey[] = [want, 'original', 'baseline', 'sa']
      const g: StartKey =
        order.find((k) => s.layouts[k] && !sameLayout(s.layouts[k], player)) ?? (s.layouts[want] ? want : 'original')
      const ghostLayout = s.layouts[g]
      if (!ghostLayout) return
      const ghostAssignment = copy(ghostLayout)
      const twin = (['baseline', 'sa', 'original'] as StartKey[]).find((k) => sameLayout(s.layouts[k], player))
      const solidLabel = twin ? LAYOUT_LABEL[twin] : 'You'
      const seq = ++raceSeq
      set((st) => ({
        mode: 'race',
        selectedSlot: null,
        race: {
          ...st.race,
          active: false,
          preparing: true,
          error: null,
          ghostKey: g,
          ghostLabel: LAYOUT_LABEL[g],
          solidLabel,
          ghostAssignment,
          finished: { ghost: false, solid: false },
        },
        replay: { ...st.replay, playing: false },
      }))

      void (async () => {
        const [gs, ps] = await Promise.all([ensureScores(g), ensureScores('player')])
        if (seq !== raceSeq) return
        const st = get()
        if (!st.data) return
        let orderIdxs: number[] = []
        try {
          if (gs?.holdout && ps?.holdout) orderIdxs = pickRaceOrders(gs.holdout, ps.holdout, 6)
        } catch (e) {
          console.warn('pickRaceOrders failed', e)
        }
        if (!orderIdxs.length) orderIdxs = st.data.holdout.slice(0, 6)
        const plans = planRace(orderIdxs, ghostAssignment)
        if (!plans) {
          set((x) => ({ race: { ...x.race, preparing: false, error: 'Could not plan race routes (engine not ready).' } }))
          return
        }
        resetCounters('race')
        set((x) => ({
          race: {
            ...x.race,
            ...plans,
            orderIdxs,
            active: true,
            preparing: false,
            error: null,
            runId: x.race.runId + 1,
            finished: { ghost: false, solid: false },
          },
          replay: { ...x.replay, playing: true },
        }))
      })()
    },

    stopRace: () => set(stopRaceState()),

    raceFinished: (who) => {
      const r = get().race
      if (!r.active || r.finished[who]) return
      const finished = { ...r.finished, [who]: true }
      const both = finished.ghost && finished.solid
      set((st) => ({
        race: { ...st.race, finished },
        replay: both ? { ...st.replay, playing: false } : st.replay,
      }))
    },

    // ---- anneal -------------------------------------------------------------------------------

    startAnneal: (iterations, seed) => {
      const s = get()
      if (!client || !s.assignment || s.anneal.running) return
      const iters = Math.max(1, Math.floor(iterations))
      const sd = Math.floor(seed) >>> 0
      const startFrom = copy(s.assignment)
      const reportEvery = Math.max(10, Math.floor(iters / 150))
      const reqSeq = ++annealSeq
      const startedAt = performance.now()
      set((st) => ({
        selectedSlot: null,
        anneal: {
          ...st.anneal,
          running: true,
          seed: sd,
          iterations: iters,
          progress: [],
          live: copy(startFrom),
          lastSwap: null,
          result: null,
          startedAt,
          itersPerSec: null,
          error: null,
        },
      }))

      const onProgress = (p: AnnealProgress) => {
        if (reqSeq !== annealSeq) return
        set((st) => {
          let progress = st.anneal.progress
          if (progress.length >= PROGRESS_CAP) progress = progress.filter((_, i) => i % 2 === 0)
          const { assignment: snap, ...point } = p
          const secs = (performance.now() - startedAt) / 1000
          return {
            anneal: {
              ...st.anneal,
              progress: [...progress, point],
              live: snap ?? st.anneal.live,
              lastSwap: p.swap ?? st.anneal.lastSwap,
              itersPerSec: secs > 0 ? p.iter / secs : st.anneal.itersPerSec,
            },
          }
        })
      }

      let handle: AnnealHandle
      try {
        handle = client.anneal({ seed: sd, iterations: iters, startFrom, set: 'train', reportEvery }, onProgress)
      } catch (e) {
        set((st) => ({ anneal: { ...st.anneal, running: false, live: null, error: errMsg(e) } }))
        return
      }
      annealHandle = handle
      handle.promise.then(
        (result) => {
          if (reqSeq !== annealSeq) return
          annealHandle = null
          const secs = (performance.now() - startedAt) / 1000
          set((st) => ({
            anneal: {
              ...st.anneal,
              running: false,
              live: null,
              result,
              itersPerSec: secs > 0 && result.iterations ? result.iterations / secs : st.anneal.itersPerSec,
            },
          }))
          // No shipped SA layout: the fresh run becomes the "SA" row.
          if (!get().anneal.shipped) {
            set((st) => ({ layouts: { ...st.layouts, sa: copy(result.best) } }))
            void scoreKey('sa')
          }
        },
        (e) => {
          if (reqSeq !== annealSeq) return
          annealHandle = null
          set((st) => ({ anneal: { ...st.anneal, running: false, live: null, error: errMsg(e) } }))
        },
      )
    },

    cancelAnneal: () => {
      // The handle resolves with the best-so-far, which lands in `result` like a normal finish.
      annealHandle?.cancel()
    },

    applyAnnealResult: () => {
      const s = get()
      const r = s.anneal.result
      if (!r || s.anneal.running) return
      commitPlayer(copy(r.best), pushUndo(s.assignment))
    },

    // ---- evidence -----------------------------------------------------------------------------

    runAblation: () => {
      const s = get()
      if (!client || s.ablation.status === 'running') return
      const c = client
      const seq = ++ablationSeq
      const keys: ('baseline' | 'player')[] = ['baseline', 'player']
      const targets = keys.filter((k) => s.layouts[k])
      set({ ablation: { status: 'running', rows: [], error: null } })
      void (async () => {
        try {
          const rows: AblationRow[] = []
          for (const key of targets) {
            const a = s.layouts[key]!
            const exact = await c.score(copy(a), 'holdout', 'exact', false)
            const sshape = await c.score(copy(a), 'holdout', 'sshape', false)
            rows.push({ key, label: LAYOUT_LABEL[key], exact, sshape })
          }
          if (seq !== ablationSeq) return
          set({ ablation: { status: 'done', rows, error: null } })
        } catch (e) {
          if (seq !== ablationSeq) return
          set({ ablation: { status: 'error', rows: [], error: errMsg(e) } })
        }
      })()
    },
  }
})
