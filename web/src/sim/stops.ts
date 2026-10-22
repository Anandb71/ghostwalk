// Stop sets: the distinct bay nodes an order must visit on a given layout.
// A stop set is encoded as a 50-bit integer key (one bit per bay node; both rack
// sides of a bay share a node), packed into a JS number as hi * 2^25 + lo.
// Keys are exact (< 2^53) and are what the route memo cache is keyed on.
import { AISLES, BAYS, NODE_COUNT, SLOTS, bayNode, slotAisle, slotBay } from './layout'
import type { Assignment, Order } from './types'

export const BAY_NODES = AISLES * BAYS // 50
const HALF = 25
const HI_MUL = 1 << HALF // 2^25

/** bay index (aisle*10 + bay, 0..49) -> node id */
export const BAY_INDEX_NODE: Int16Array = (() => {
  const t = new Int16Array(BAY_NODES)
  for (let a = 0; a < AISLES; a++) for (let b = 0; b < BAYS; b++) t[a * BAYS + b] = bayNode(a, b)
  return t
})()

/** node id -> bay index, or -1 for dock / junctions */
export const NODE_BAY_INDEX: Int8Array = (() => {
  const t = new Int8Array(NODE_COUNT).fill(-1)
  for (let i = 0; i < BAY_NODES; i++) t[BAY_INDEX_NODE[i]] = i
  return t
})()

/** slot id -> bay index */
export const SLOT_BAY_INDEX: Int8Array = (() => {
  const t = new Int8Array(SLOTS)
  for (let s = 0; s < SLOTS; s++) t[s] = slotAisle(s) * BAYS + slotBay(s)
  return t
})()

/** Stop-set key of an order on a layout. */
export function orderKey(skus: readonly number[], assignment: Assignment): number {
  let lo = 0
  let hi = 0
  for (let i = 0; i < skus.length; i++) {
    const bi = SLOT_BAY_INDEX[assignment[skus[i]]]
    if (bi < HALF) lo |= 1 << bi
    else hi |= 1 << (bi - HALF)
  }
  return (hi >>> 0) * HI_MUL + (lo >>> 0)
}

/** Key of an explicit node list (non-bay nodes are ignored). */
export function stopsKey(nodes: readonly number[]): number {
  let lo = 0
  let hi = 0
  for (const n of nodes) {
    const bi = NODE_BAY_INDEX[n]
    if (bi < 0) continue
    if (bi < HALF) lo |= 1 << bi
    else hi |= 1 << (bi - HALF)
  }
  return (hi >>> 0) * HI_MUL + (lo >>> 0)
}

/** Decode a key into bay node ids, ascending (aisle by aisle, front to back). */
export function keyStops(key: number): number[] {
  const hi = Math.floor(key / HI_MUL)
  const lo = key - hi * HI_MUL
  const out: number[] = []
  for (let b = 0; b < HALF; b++) if (lo & (1 << b)) out.push(BAY_INDEX_NODE[b])
  for (let b = 0; b < HALF; b++) if (hi & (1 << b)) out.push(BAY_INDEX_NODE[b + HALF])
  return out
}

/** Number of stops in a key. */
export function keySize(key: number): number {
  const hi = Math.floor(key / HI_MUL)
  const lo = key - hi * HI_MUL
  return popcount(lo) + popcount(hi)
}

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/** Distinct bay nodes an order visits on a layout, ascending. */
export function orderStops(order: Order, assignment: Assignment): number[] {
  return keyStops(orderKey(order.skus, assignment))
}

/** Is `a` a permutation of 0..SLOTS-1? */
export function isPermutation(a: ArrayLike<number>): boolean {
  if (a.length !== SLOTS) return false
  const seen = new Uint8Array(SLOTS)
  for (let i = 0; i < a.length; i++) {
    const v = a[i]
    if (!Number.isInteger(v) || v < 0 || v >= SLOTS || seen[v]) return false
    seen[v] = 1
  }
  return true
}
