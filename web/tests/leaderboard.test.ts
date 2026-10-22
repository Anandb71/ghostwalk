import { describe, expect, it } from 'vitest'
import type { DatasetMeta } from '../src/sim/types'
import {
  MAX_ENTRIES,
  NAME_MAX,
  STORAGE_KEY,
  addEntry,
  buildRows,
  countMoved,
  dataKey,
  deltaVsBaseline,
  describeOrigin,
  exportPayload,
  formatDelta,
  formatKm,
  isPermutation,
  layoutId,
  loadEntries,
  makeEntry,
  parseEntries,
  removeEntry,
  sanitizeName,
  saveEntries,
  type BoardRow,
  type EntryInput,
} from '../src/ui/leaderboard'

const identity = () => Array.from({ length: 100 }, (_, i) => i)
const swapped = (a: number[], i: number, j: number) => {
  const b = a.slice()
  ;[b[i], b[j]] = [b[j], b[i]]
  return b
}

const meta: DatasetMeta = {
  source: 'UCI Online Retail II',
  doi: 'https://doi.org/10.24432/C5CG6D',
  licence: 'CC BY 4.0',
  month: '2011-11',
  topSkus: 100,
  split: { rule: 'r', train: 1130, holdout: 1232 },
  cleaning: [],
  stats: {},
  orderCount: 2362,
  lineCount: 17056,
  linesPerOrderHistogram: {},
}

const input = (over: Partial<EntryInput> = {}): EntryInput => ({
  name: 'Ada',
  policy: 'exact',
  holdoutM: 90_000,
  trainM: 85_000,
  baselineHoldoutM: 100_000,
  origin: 'Baseline + 2 moved',
  seed: null,
  commit: 'abc1234',
  dataKey: dataKey(meta),
  savedAt: '2026-10-22T10:00:00.000Z',
  assignment: identity(),
  ...over,
})

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

class BrokenStorage extends MemoryStorage {
  getItem(): string | null {
    throw new DOMException('blocked', 'SecurityError')
  }
  setItem(): void {
    throw new DOMException('full', 'QuotaExceededError')
  }
}

describe('layouts', () => {
  it('isPermutation accepts 0..99 and rejects duplicates, gaps, wrong length and non-integers', () => {
    expect(isPermutation(identity())).toBe(true)
    expect(isPermutation(Uint8Array.from(identity().reverse()))).toBe(true)
    expect(isPermutation(identity().slice(0, 99))).toBe(false)
    expect(isPermutation([...identity().slice(0, 99), 0])).toBe(false)
    expect(isPermutation([...identity().slice(0, 99), 100])).toBe(false)
    expect(isPermutation([...identity().slice(0, 99), 98.5])).toBe(false)
  })

  it('countMoved counts SKUs in a different slot', () => {
    expect(countMoved(identity(), identity())).toBe(0)
    expect(countMoved(swapped(identity(), 3, 7), identity())).toBe(2)
  })

  it('layoutId is stable and depends on layout and policy', () => {
    const a = identity()
    expect(layoutId(a, 'exact')).toBe(layoutId(Uint8Array.from(a), 'exact'))
    expect(layoutId(a, 'exact')).toMatch(/^[0-9a-f]{8}$/)
    expect(layoutId(a, 'exact')).not.toBe(layoutId(a, 'sshape'))
    expect(layoutId(a, 'exact')).not.toBe(layoutId(swapped(a, 0, 1), 'exact'))
  })
})

describe('describeOrigin', () => {
  const base = identity()
  it('names an untouched SA result with its seed and iterations', () => {
    const sa = swapped(base, 0, 99)
    const r = describeOrigin({
      assignment: sa,
      startedFrom: 'baseline',
      startLayout: base,
      shippedSa: { assignment: sa, seed: 42, iterations: 30000 },
      annealResult: null,
    })
    expect(r).toEqual({ origin: 'SA seed 42 · 30,000 it', seed: 42 })
  })

  it('prefers the live run over the shipped one when both match', () => {
    const sa = swapped(base, 0, 99)
    const r = describeOrigin({
      assignment: sa,
      startedFrom: 'baseline',
      startLayout: base,
      shippedSa: { assignment: sa, seed: 42, iterations: 30000 },
      annealResult: { assignment: sa, seed: 7, iterations: 3000 },
    })
    expect(r.seed).toBe(7)
  })

  it('counts moved SKUs from the start layout', () => {
    const r = describeOrigin({
      assignment: swapped(swapped(base, 1, 2), 5, 6),
      startedFrom: 'baseline',
      startLayout: base,
      shippedSa: null,
      annealResult: null,
    })
    expect(r).toEqual({ origin: 'Baseline + 4 moved', seed: null })
    expect(
      describeOrigin({ assignment: base, startedFrom: 'original', startLayout: base, shippedSa: null, annealResult: null }).origin,
    ).toBe('Original (unchanged)')
  })
})

describe('entries', () => {
  it('sanitizeName trims, collapses whitespace, strips control chars, caps length, falls back', () => {
    expect(sanitizeName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(sanitizeName('a\u0007b')).toBe('ab')
    expect(sanitizeName('x'.repeat(100))).toHaveLength(NAME_MAX)
    expect(sanitizeName('   ')).toBe('Player')
  })

  it('deltaVsBaseline is negative when the layout walks less', () => {
    expect(deltaVsBaseline(90, 100)).toBeCloseTo(-0.1)
    expect(deltaVsBaseline(110, 100)).toBeCloseTo(0.1)
  })

  it('makeEntry copies the assignment into a plain array and derives the id', () => {
    const e = makeEntry(input({ assignment: Uint8Array.from(identity()) }))
    expect(Array.isArray(e.assignment)).toBe(true)
    expect(e.id).toBe(layoutId(identity(), 'exact'))
  })

  it('addEntry updates the same layout instead of duplicating it, and ranks by held-out metres', () => {
    let list = addEntry([], makeEntry(input({ holdoutM: 95_000 })))
    list = addEntry(list, makeEntry(input({ name: 'Grace', holdoutM: 95_000, savedAt: '2026-10-22T11:00:00.000Z' })))
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Grace')
    list = addEntry(list, makeEntry(input({ assignment: swapped(identity(), 0, 1), holdoutM: 91_000 })))
    expect(list.map((e) => e.holdoutM)).toEqual([91_000, 95_000])
    expect(removeEntry(list, list[0].id).map((e) => e.holdoutM)).toEqual([95_000])
  })

  it('addEntry keeps at most MAX_ENTRIES and never drops the entry being saved', () => {
    let list: ReturnType<typeof addEntry> = []
    for (let i = 0; i < MAX_ENTRIES; i++) {
      list = addEntry(list, makeEntry(input({ assignment: swapped(identity(), 0, i + 1), holdoutM: 80_000 + i })))
    }
    const worst = makeEntry(input({ assignment: swapped(identity(), 10, 20), holdoutM: 99_999 }))
    list = addEntry(list, worst)
    expect(list).toHaveLength(MAX_ENTRIES)
    expect(list.at(-1)!.id).toBe(worst.id)
    expect(list.some((e) => e.holdoutM === 80_000 + MAX_ENTRIES - 1)).toBe(false)
  })
})

describe('parseEntries', () => {
  it('returns [] for null, malformed JSON and non-arrays', () => {
    expect(parseEntries(null)).toEqual([])
    expect(parseEntries('{nope')).toEqual([])
    expect(parseEntries('{"a":1}')).toEqual([])
  })

  it('drops rows with a bad assignment, policy or numbers and keeps the rest', () => {
    const good = makeEntry(input())
    const rows = [
      good,
      { ...good, assignment: [1, 2, 3] },
      { ...good, assignment: [...identity().slice(0, 99), 0] },
      { ...good, policy: 'teleport' },
      { ...good, holdoutM: -1 },
      { ...good, baselineHoldoutM: 0 },
      { ...good, name: 42 },
      { ...good, seed: 'x' },
      null,
      'row',
    ]
    const parsed = parseEntries(JSON.stringify(rows))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual(good)
  })

  it('re-derives ids instead of trusting stored ones', () => {
    const good = makeEntry(input())
    expect(parseEntries(JSON.stringify([{ ...good, id: 'forged' }]))[0].id).toBe(good.id)
  })
})

describe('storage', () => {
  it('round-trips through a Storage', () => {
    const s = new MemoryStorage()
    const list = [makeEntry(input())]
    expect(saveEntries(list, s)).toBe(true)
    expect(s.getItem(STORAGE_KEY)).not.toBeNull()
    expect(loadEntries(s)).toEqual(list)
  })

  it('survives missing, blocked or full storage', () => {
    expect(loadEntries(null)).toEqual([])
    expect(saveEntries([makeEntry(input())], null)).toBe(false)
    const broken = new BrokenStorage()
    expect(loadEntries(broken)).toEqual([])
    expect(saveEntries([makeEntry(input())], broken)).toBe(false)
  })

  it('defaults to no storage in Node instead of throwing', () => {
    expect(loadEntries()).toEqual([])
  })
})

describe('buildRows', () => {
  const baselineRow: BoardRow = {
    key: 'ref-baseline',
    kind: 'reference',
    name: 'Baseline',
    holdoutM: 100_000,
    delta: 0,
    provenance: 'fast movers nearest the dock',
    isCurrent: false,
  }

  it('ranks references, saved entries and the unsaved current layout together', () => {
    const e = makeEntry(input({ holdoutM: 90_000 }))
    const { rows, hidden } = buildRows({
      entries: [e],
      references: [baselineRow],
      current: { id: 'ffffffff', holdoutM: 95_000, delta: -0.05, provenance: 'Baseline + 2 moved' },
      policy: 'exact',
      dataKey: dataKey(meta),
    })
    expect(rows.map((r) => r.kind)).toEqual(['saved', 'current', 'reference'])
    expect(rows[0].delta).toBeCloseTo(-0.1)
    expect(rows[0].provenance).toBe('Baseline + 2 moved · abc1234')
    expect(hidden).toBe(0)
  })

  it('marks a saved entry as current instead of adding a duplicate row', () => {
    const e = makeEntry(input())
    const { rows } = buildRows({
      entries: [e],
      references: [],
      current: { id: e.id, holdoutM: e.holdoutM, delta: -0.1, provenance: '' },
      policy: 'exact',
      dataKey: dataKey(meta),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].isCurrent).toBe(true)
  })

  it('hides and counts entries scored under another policy or dataset', () => {
    const { rows, hidden } = buildRows({
      entries: [makeEntry(input({ policy: 'sshape' })), makeEntry(input({ dataKey: 'other' })), makeEntry(input())],
      references: [],
      current: null,
      policy: 'exact',
      dataKey: dataKey(meta),
    })
    expect(rows).toHaveLength(1)
    expect(hidden).toBe(2)
  })
})

describe('formatting and export', () => {
  it('formats km and signed deltas', () => {
    expect(formatKm(74_123)).toBe('74.12')
    expect(formatDelta(-0.0342)).toBe('−3.42 %')
    expect(formatDelta(0.011)).toBe('+1.10 %')
    expect(formatDelta(0)).toBe('0.00 %')
    expect(formatDelta(-0.00001)).toBe('0.00 %')
  })

  it('exports a self-describing payload with the sku list and dataset fingerprint', () => {
    const products = identity().map((i) => ({ sku: `S${i}`, desc: '', rank: i + 1, picks: 1, picksTrain: 1, picksHoldout: 0, qty: 1 }))
    const e = makeEntry(input())
    const p = exportPayload({
      entries: [e],
      references: [],
      meta,
      products,
      policy: 'exact',
      commit: 'abc1234',
      exportedAt: '2026-10-22T12:00:00.000Z',
    })
    expect(p.skus).toHaveLength(100)
    expect(p.dataset.dataKey).toBe(dataKey(meta))
    expect(p.entries[0].assignment).toEqual(identity())
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })
})
