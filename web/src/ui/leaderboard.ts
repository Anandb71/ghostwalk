// Leaderboard of player layouts (stretch S3, issue #8). Pure helpers: no React and no store,
// so they run in Node tests. Entries live in localStorage; every access is guarded because
// storage can be missing, full or blocked (private windows, embedded previews).
import { SLOTS } from '../sim/layout'
import type { DatasetMeta, Policy, Product } from '../sim/types'
import type { StartKey } from '../store'

export const STORAGE_KEY = 'ghostwalk.leaderboard.v1'
export const NAME_KEY = 'ghostwalk.playerName'
export const MAX_ENTRIES = 50
export const NAME_MAX = 24
export const DEFAULT_NAME = 'Player'

export interface LeaderboardEntry {
  id: string // layoutId(assignment, policy): saving the same layout again updates one row
  name: string
  policy: Policy
  holdoutM: number
  trainM: number
  baselineHoldoutM: number // Baseline under the same policy when the entry was saved
  origin: string // "Baseline + 6 moved", "SA seed 42 · 30,000 it"
  seed: number | null // SA seed when the layout came straight from the optimiser
  commit: string
  dataKey: string // dataKey(meta): entries scored on another orders.json are not comparable
  savedAt: string // ISO timestamp
  assignment: number[] // assignment[skuIdx] = slotId, so anyone can re-score it with the same engine
}

export type RowKind = 'reference' | 'saved' | 'current'

export interface BoardRow {
  key: string
  kind: RowKind
  name: string
  holdoutM: number
  delta: number // vs Baseline held-out metres, as a fraction; negative = less walking = better
  provenance: string
  isCurrent: boolean // this row is the layout on the floor right now
}

// ---- layouts ----

/** True when `a` is a permutation of 0..n-1 (every SKU in exactly one slot). */
export function isPermutation(a: ArrayLike<number>, n = SLOTS): boolean {
  if (a.length !== n) return false
  const seen = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const v = a[i]
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false
    seen[v] = 1
  }
  return true
}

export function sameLayout(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Number of SKUs that sit in a different slot in `a` than in `b`. */
export function countMoved(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let moved = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++
  return moved
}

/** Stable 8-hex id of a layout under a routing policy (FNV-1a). */
export function layoutId(a: ArrayLike<number>, policy: Policy): string {
  let h = 0x811c9dc5
  const mix = (byte: number) => {
    h ^= byte & 0xff
    h = Math.imul(h, 0x01000193)
  }
  for (let i = 0; i < policy.length; i++) mix(policy.charCodeAt(i))
  for (let i = 0; i < a.length; i++) mix(a[i])
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Fingerprint of the dataset the scores were measured on. */
export const dataKey = (meta: DatasetMeta): string =>
  `${meta.month}|${meta.orderCount}|${meta.lineCount}|${meta.split.train}/${meta.split.holdout}`

const START_LABEL: Record<StartKey, string> = { original: 'Original', baseline: 'Baseline', sa: 'SA' }

export interface SaRun {
  assignment: ArrayLike<number>
  seed: number
  iterations: number
}

export interface OriginInput {
  assignment: ArrayLike<number>
  startedFrom: StartKey
  startLayout: ArrayLike<number> | null // layouts[startedFrom]
  shippedSa: SaRun | null // public/layouts/sa_seed42.json
  annealResult: SaRun | null // last live run in this session
}

/** Where a layout came from, in words, plus the SA seed when it is an untouched optimiser result. */
export function describeOrigin(i: OriginInput): { origin: string; seed: number | null } {
  const runs = [i.annealResult, i.shippedSa]
  for (const run of runs) {
    if (run && sameLayout(i.assignment, run.assignment)) {
      return { origin: `SA seed ${run.seed} · ${run.iterations.toLocaleString('en-US')} it`, seed: run.seed }
    }
  }
  const label = START_LABEL[i.startedFrom]
  if (!i.startLayout) return { origin: label, seed: null }
  const moved = countMoved(i.assignment, i.startLayout)
  return { origin: moved === 0 ? `${label} (unchanged)` : `${label} + ${moved} moved`, seed: null }
}

// ---- entries ----

/** Collapse whitespace, drop control characters, cap the length; empty falls back to "Player". */
export function sanitizeName(raw: string): string {
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
  return clean || DEFAULT_NAME
}

/** (m - baseline) / baseline; negative means the layout walks less than Baseline. */
export const deltaVsBaseline = (m: number, baselineM: number): number => (m - baselineM) / baselineM

export interface EntryInput {
  name: string
  policy: Policy
  holdoutM: number
  trainM: number
  baselineHoldoutM: number
  origin: string
  seed: number | null
  commit: string
  dataKey: string
  savedAt: string
  assignment: ArrayLike<number>
}

export function makeEntry(e: EntryInput): LeaderboardEntry {
  return {
    id: layoutId(e.assignment, e.policy),
    name: sanitizeName(e.name),
    policy: e.policy,
    holdoutM: e.holdoutM,
    trainM: e.trainM,
    baselineHoldoutM: e.baselineHoldoutM,
    origin: e.origin,
    seed: e.seed,
    commit: e.commit,
    dataKey: e.dataKey,
    savedAt: e.savedAt,
    assignment: Array.from(e.assignment),
  }
}

const byScore = (a: LeaderboardEntry, b: LeaderboardEntry) => a.holdoutM - b.holdoutM || a.savedAt.localeCompare(b.savedAt)

/** Insert or update (same layout + policy). Over capacity, the worst other entries are dropped, never the new one. */
export function addEntry(entries: readonly LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  const rest = entries.filter((e) => e.id !== entry.id).sort(byScore)
  return [...rest.slice(0, MAX_ENTRIES - 1), entry].sort(byScore)
}

export const removeEntry = (entries: readonly LeaderboardEntry[], id: string): LeaderboardEntry[] =>
  entries.filter((e) => e.id !== id)

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function toEntry(v: unknown): LeaderboardEntry | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (o.policy !== 'exact' && o.policy !== 'sshape') return null
  if (!isFiniteNum(o.holdoutM) || o.holdoutM <= 0) return null
  if (!isFiniteNum(o.trainM) || o.trainM < 0) return null
  if (!isFiniteNum(o.baselineHoldoutM) || o.baselineHoldoutM <= 0) return null
  if (!isStr(o.name) || !isStr(o.origin) || !isStr(o.commit) || !isStr(o.dataKey) || !isStr(o.savedAt)) return null
  if (!(o.seed === null || isFiniteNum(o.seed))) return null
  if (!Array.isArray(o.assignment) || !isPermutation(o.assignment as number[])) return null
  // id is derived, never trusted from storage
  return makeEntry({
    name: o.name,
    policy: o.policy,
    holdoutM: o.holdoutM,
    trainM: o.trainM,
    baselineHoldoutM: o.baselineHoldoutM,
    origin: o.origin,
    seed: o.seed,
    commit: o.commit,
    dataKey: o.dataKey,
    savedAt: o.savedAt,
    assignment: o.assignment as number[],
  })
}

/** Parse stored JSON; malformed input yields [] and invalid rows are dropped. */
export function parseEntries(raw: string | null): LeaderboardEntry[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  let out: LeaderboardEntry[] = []
  for (const item of data) {
    const e = toEntry(item)
    if (e) out = addEntry(out, e)
  }
  return out
}

// ---- storage ----

/** localStorage, or null where it is missing or blocked (the getter itself can throw). */
export function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadEntries(storage: Storage | null = getStorage()): LeaderboardEntry[] {
  if (!storage) return []
  try {
    return parseEntries(storage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

/** False when the entries could not be persisted (no storage, quota, blocked). */
export function saveEntries(entries: readonly LeaderboardEntry[], storage: Storage | null = getStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries))
    return true
  } catch {
    return false
  }
}

export function loadName(storage: Storage | null = getStorage()): string {
  if (!storage) return ''
  try {
    return storage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string, storage: Storage | null = getStorage()): void {
  if (!storage) return
  try {
    storage.setItem(NAME_KEY, name)
  } catch {
    // a remembered name is a convenience; ignore
  }
}

// ---- board ----

export interface CurrentRow {
  id: string // layoutId of the layout on the floor
  holdoutM: number
  delta: number
  provenance: string
}

export interface BoardInput {
  entries: readonly LeaderboardEntry[]
  references: readonly BoardRow[] // Baseline / SA rows computed live from the store
  current: CurrentRow | null // the unsaved layout on the floor, when its scores are fresh
  policy: Policy
  dataKey: string
}

const KIND_ORDER: Record<RowKind, number> = { reference: 0, saved: 1, current: 2 }

/** Rows ranked by held-out metres. Entries scored under another policy or dataset are hidden and counted. */
export function buildRows(input: BoardInput): { rows: BoardRow[]; hidden: number } {
  const visible = input.entries.filter((e) => e.policy === input.policy && e.dataKey === input.dataKey)
  const rows: BoardRow[] = [...input.references]
  let currentSaved = false
  for (const e of visible) {
    const isCurrent = input.current !== null && e.id === input.current.id
    currentSaved ||= isCurrent
    rows.push({
      key: `saved-${e.id}`,
      kind: 'saved',
      name: e.name,
      holdoutM: e.holdoutM,
      delta: deltaVsBaseline(e.holdoutM, e.baselineHoldoutM),
      provenance: `${e.origin} · ${e.commit}`,
      isCurrent,
    })
  }
  if (input.current && !currentSaved) {
    rows.push({
      key: 'current',
      kind: 'current',
      name: 'You (unsaved)',
      holdoutM: input.current.holdoutM,
      delta: input.current.delta,
      provenance: input.current.provenance,
      isCurrent: true,
    })
  }
  rows.sort((a, b) => a.holdoutM - b.holdoutM || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  return { rows, hidden: input.entries.length - visible.length }
}

// ---- formatting ----

export const formatKm = (m: number): string => (m / 1000).toFixed(2)

/** "−3.42 %" (typographic minus), "+1.10 %", "0.00 %". */
export function formatDelta(d: number): string {
  const pct = Math.abs(d * 100).toFixed(2)
  if (pct === '0.00') return '0.00 %'
  return `${d < 0 ? '−' : '+'}${pct} %`
}

// ---- export ----

export interface ExportInput {
  entries: readonly LeaderboardEntry[]
  references: readonly BoardRow[]
  meta: DatasetMeta
  products: readonly Product[]
  policy: Policy
  commit: string
  exportedAt: string
}

/** Self-describing JSON: with the sku list and slot scheme, any assignment can be re-scored by eval/run.ts. */
export function exportPayload(i: ExportInput) {
  return {
    app: 'ghostwalk',
    kind: 'leaderboard',
    version: 1,
    exportedAt: i.exportedAt,
    commit: i.commit,
    policy: i.policy,
    dataset: {
      source: i.meta.source,
      doi: i.meta.doi,
      licence: i.meta.licence,
      month: i.meta.month,
      orderCount: i.meta.orderCount,
      lineCount: i.meta.lineCount,
      split: i.meta.split,
      dataKey: dataKey(i.meta),
    },
    scoring: 'held-out = orders dated 16-30 Nov 2011; metres walked dock -> picks -> dock on the aisle graph',
    slotScheme: 'assignment[skuIdx] = slotId; skuIdx = index in skus; slotId = aisle*20 + side*10 + bay',
    skus: i.products.map((p) => p.sku),
    references: i.references.map((r) => ({ name: r.name, holdoutM: r.holdoutM, delta: r.delta, provenance: r.provenance })),
    entries: i.entries,
  }
}

export const exportFilename = (exportedAt: string): string => `ghostwalk-leaderboard-${exportedAt.slice(0, 10)}.json`
