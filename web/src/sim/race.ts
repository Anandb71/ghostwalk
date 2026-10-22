import type { ScoreResult } from './types'

/**
 * Orders scored in both results (pass holdout scores) with the largest |mA - mB|;
 * deterministic tie-break by idx ascending. Returns order idx list (at most n).
 */
export function pickRaceOrders(a: ScoreResult, b: ScoreResult, n = 6): number[] {
  const mB = new Map<number, number>()
  for (const o of b.perOrder) mB.set(o.idx, o.m)
  const rows: { idx: number; gap: number }[] = []
  for (const o of a.perOrder) {
    const other = mB.get(o.idx)
    if (other === undefined) continue
    rows.push({ idx: o.idx, gap: Math.abs(o.m - other) })
  }
  rows.sort((x, y) => y.gap - x.gap || x.idx - y.idx)
  return rows.slice(0, Math.max(0, n)).map((r) => r.idx)
}
