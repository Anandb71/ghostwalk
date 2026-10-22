import type { Dataset, Order, PreparedData, Product, SetName } from './types'

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

const trainOrderCache = new WeakMap<readonly Product[], number[]>()
const trainRankCache = new WeakMap<readonly Product[], Int16Array>()

/**
 * Product indices ranked by TRAIN picks only (1–15 Nov), most picked first; ties broken by sku
 * string (plain code-unit compare). Nothing from the held-out half leaks in: `Product.rank` and
 * the array order are month-wide, so neither is used here. Baseline slotting, the carton heat
 * colours and the top-10 labels all use this one ranking. Cached per products array.
 */
export function trainOrder(products: readonly Product[]): number[] {
  const hit = trainOrderCache.get(products)
  if (hit) return hit
  const idx = products.map((_, i) => i)
  idx.sort((a, b) => {
    const d = products[b].picksTrain - products[a].picksTrain
    if (d !== 0) return d
    const sa = products[a].sku
    const sb = products[b].sku
    return sa < sb ? -1 : sa > sb ? 1 : 0
  })
  trainOrderCache.set(products, idx)
  return idx
}

/** trainRanks(products)[skuIdx] = 1-based rank by train picks (1 = most picked on 1–15 Nov). */
export function trainRanks(products: readonly Product[]): Int16Array {
  const hit = trainRankCache.get(products)
  if (hit) return hit
  const out = new Int16Array(products.length)
  trainOrder(products).forEach((p, k) => (out[p] = k + 1))
  trainRankCache.set(products, out)
  return out
}
