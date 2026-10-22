// Shared engine types. Contract between sim/, worker/, scene/, ui/ and eval/.
// Extend freely; never rename or remove an exported field.

export type Split = 'train' | 'holdout'
export type SetName = Split | 'all'
export type Policy = 'exact' | 'sshape'

/** assignment[skuIdx] = slotId (0..99). Always a permutation of 0..99. */
export type Assignment = Uint8Array

// ---- raw dataset (web/public/data/orders.json, produced by data/prepare.py) ----

export interface Product {
  sku: string
  desc: string
  rank: number // 1 = most picked in the month
  picks: number
  picksTrain: number
  picksHoldout: number
  qty: number
}

export interface RawOrderLine {
  sku: string
  qty: number
}

export interface RawOrder {
  id: string
  ts: string // "2011-11-03T10:12:00"
  split: Split
  lines: RawOrderLine[]
}

export interface DatasetMeta {
  source: string
  doi: string
  licence: string
  month: string
  topSkus: number
  split: { rule: string; train: number; holdout: number }
  cleaning: string[]
  stats: Record<string, unknown>
  orderCount: number
  lineCount: number
  linesPerOrderHistogram: Record<string, number>
}

export interface Dataset {
  meta: DatasetMeta
  products: Product[]
  orders: RawOrder[]
}

// ---- prepared (indexed) dataset ----

export interface Order {
  idx: number // position in PreparedData.orders
  id: string
  ts: string
  split: Split
  skus: number[] // product indices 0..99, distinct
  qtys: number[]
}

export interface PreparedData {
  meta: DatasetMeta
  products: Product[]
  orders: Order[]
  train: number[] // order idx list, chronological
  holdout: number[]
}

// ---- scoring ----

export interface PickStop {
  pathIdx: number // index into OrderScore.path where the picker stops
  node: number // bay node id
  lines: number // order lines picked at this node (pause = lines * PICK_SECONDS)
}

export interface OrderScore {
  idx: number // order idx
  m: number // walking metres, dock -> picks -> dock
  s: number // seconds = m / WALK_SPEED + PICK_SECONDS * lines
  lines: number
  path: number[] // node ids, starts and ends at DOCK, consecutive nodes are graph edges
  picks: PickStop[] // in tour order
  exact: boolean // true = Held–Karp optimal, false = NN + 2-opt heuristic (or S-shape policy)
}

export interface ScoreResult {
  set: SetName
  policy: Policy
  totalM: number
  totalS: number
  orders: number
  lines: number
  exactOrders: number
  heuristicOrders: number
  exactShareM: number // share of metres from exactly-routed orders, 0..1
  perOrder: OrderScore[]
  visitsPerNode: Uint32Array // length NODE_COUNT, pick stops per node
  elapsedMs: number // measurement only
}

// ---- simulated annealing ----

export interface AnnealOptions {
  seed: number
  iterations: number
  startFrom: Assignment
  set: Split // always 'train' in the app; the optimiser never sees holdout
  reportEvery: number
}

export interface AnnealProgress {
  iter: number
  T: number
  current: number // metres on `set`
  best: number
  accepted: number
  swap?: [number, number] // last accepted swap since previous report, sku indices
  assignment?: Assignment // current assignment snapshot (for the live 3D view)
}

export interface AnnealResult {
  best: Assignment
  bestM: number
  startM: number
  seed: number
  iterations: number
  curve: [number, number, number][] // [iter, current, best]
  elapsedMs: number
}
