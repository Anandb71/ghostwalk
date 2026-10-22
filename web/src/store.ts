// App state (zustand). Contract between scene/ (reads, calls selection actions) and ui/ (everything).
// Owner: UI (#5). Scene may only READ state and call: selectSlot, setHover, swapSlots, replayFinished,
// raceFinished. Never rename or remove fields; add new ones freely.
import { create } from 'zustand'
import type {
  AnnealProgress,
  AnnealResult,
  Assignment,
  OrderScore,
  Policy,
  PreparedData,
  ScoreResult,
} from './sim'

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
}

export interface AnnealState {
  running: boolean
  seed: number
  iterations: number
  progress: AnnealProgress[] // downsampled curve for the chart
  live: Assignment | null // current SA layout while running (scene shows this instead of `assignment`)
  lastSwap: [number, number] | null // sku indices, for the fly fx
  result: AnnealResult | null
  shipped: { seed: number; iterations: number; assignment: number[]; trainM: number; holdoutM: number; curve: [number, number, number][] } | null // public/layouts/sa_seed42.json
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
}

/** Layout the scene should draw right now. */
export const displayAssignment = (s: GhostState): Assignment | null =>
  s.anneal.running && s.anneal.live ? s.anneal.live : s.assignment

const emptyScores = (): Record<LayoutKey, LayoutScores> => ({
  original: { train: null, holdout: null },
  random: { train: null, holdout: null },
  baseline: { train: null, holdout: null },
  sa: { train: null, holdout: null },
  player: { train: null, holdout: null },
})

const todo = (name: string) => () => {
  console.warn(`store.${name} not implemented yet`)
}

export const useStore = create<GhostState>()(() => ({
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
  },
  anneal: { running: false, seed: 42, iterations: 3000, progress: [], live: null, lastSwap: null, result: null, shipped: null },

  // TODO(ui #5): implement all actions.
  load: async () => todo('load')(),
  setMode: todo('setMode'),
  setPolicy: todo('setPolicy'),
  setCamera: todo('setCamera'),
  setQuality: todo('setQuality'),
  toggleHeat: todo('toggleHeat'),
  selectSlot: todo('selectSlot'),
  setHover: todo('setHover'),
  swapSlots: todo('swapSlots'),
  undoSwap: todo('undoSwap'),
  resetTo: todo('resetTo'),
  play: todo('play'),
  pause: todo('pause'),
  togglePlay: todo('togglePlay'),
  setSpeed: todo('setSpeed'),
  setOrder: todo('setOrder'),
  replayFinished: todo('replayFinished'),
  startRace: todo('startRace'),
  stopRace: todo('stopRace'),
  raceFinished: todo('raceFinished'),
  startAnneal: todo('startAnneal'),
  cancelAnneal: todo('cancelAnneal'),
  applyAnnealResult: todo('applyAnnealResult'),
}))
