import type { Dataset, Order, PreparedData, SetName } from './types'

/**
 * Index the raw dataset: sku string -> product index (array position in `products`),
 * orders keep file order (prepare.py writes them chronologically), idx = position.
 * Lines whose sku is not in the top-100 product list are dropped (prepare.py already
 * restricts orders to those SKUs, so this is a guard, not a filter). Repeated skus inside
 * one order are merged (quantities summed) so `skus` is always distinct.
 */
export function prepareDataset(raw: Dataset): PreparedData {
  const skuIdx = new Map<string, number>()
  raw.products.forEach((p, i) => skuIdx.set(p.sku, i))

  const orders: Order[] = []
  const train: number[] = []
  const holdout: number[] = []
  for (const ro of raw.orders) {
    const skus: number[] = []
    const qtys: number[] = []
    const pos = new Map<number, number>()
    for (const line of ro.lines) {
      const k = skuIdx.get(line.sku)
      if (k === undefined) continue
      const at = pos.get(k)
      if (at === undefined) {
        pos.set(k, skus.length)
        skus.push(k)
        qtys.push(line.qty)
      } else {
        qtys[at] += line.qty
      }
    }
    if (skus.length === 0) continue
    const idx = orders.length
    orders.push({ idx, id: ro.id, ts: ro.ts, split: ro.split, skus, qtys })
    if (ro.split === 'train') train.push(idx)
    else holdout.push(idx)
  }
  return { meta: raw.meta, products: raw.products, orders, train, holdout }
}

const setCache = new WeakMap<PreparedData, Partial<Record<SetName, Order[]>>>()

/** Orders of a set, chronological. Cached per dataset (do not mutate the returned array). */
export function ordersFor(data: PreparedData, set: SetName): Order[] {
  let c = setCache.get(data)
  if (!c) {
    c = {}
    setCache.set(data, c)
  }
  const hit = c[set]
  if (hit) return hit
  const out = set === 'all' ? data.orders : (set === 'train' ? data.train : data.holdout).map((i) => data.orders[i])
  c[set] = out
  return out
}

/** sku string -> product index, or -1. */
export function skuIndexOf(data: PreparedData, sku: string): number {
  return data.products.findIndex((p) => p.sku === sku)
}
