// Picker routing on the aisle graph (BUILD_SPEC §6).
// Stops are node ids (bay nodes, deduplicated, DOCK excluded).
// A tour is [DOCK, ...nodes in visiting order, DOCK]; its cost is the sum of shortest-path
// distances between consecutive entries, and tourPath() expands it along graph edges.
import { DOCK, NODE_COUNT, allPairs, backNode, frontNode, middleNode, NODES, pathBetween } from './layout'

export interface Tour {
  cost: number // metres
  order: number[] // node ids, starts and ends at DOCK
  exact: boolean
}

/** Largest stop count routed exactly (12 nodes incl. the dock). */
export const MAX_EXACT_STOPS = 11

const D = allPairs()
const N = NODE_COUNT

/** Dedupe, drop DOCK, sort ascending: the canonical stop list. */
export function normaliseStops(stops: readonly number[]): number[] {
  const out = Array.from(new Set(stops)).filter((n) => n !== DOCK)
  out.sort((a, b) => a - b)
  return out
}

/** Sum of shortest-path distances between consecutive tour entries. */
export function tourCost(order: readonly number[]): number {
  let c = 0
  for (let i = 1; i < order.length; i++) c += D[order[i - 1] * N + order[i]]
  return c
}

// Flat Held–Karp tables, sized for the largest exact instance and reused across calls.
const HK_DP = new Float64Array((1 << MAX_EXACT_STOPS) * MAX_EXACT_STOPS)
const HK_SUB = new Float64Array(MAX_EXACT_STOPS * MAX_EXACT_STOPS) // stop-to-stop distances, transposed

/** Held–Karp, exact. Use for stops.length <= 11 (12 incl. dock). */
export function routeExact(stops: number[]): Tour {
  const s = normaliseStops(stops)
  const n = s.length
  if (n > MAX_EXACT_STOPS) throw new Error(`routeExact: ${n} stops > ${MAX_EXACT_STOPS}`)
  if (n === 0) return { cost: 0, order: [DOCK, DOCK], exact: true }
  if (n === 1) {
    const order = [DOCK, s[0], DOCK]
    return { cost: tourCost(order), order, exact: true }
  }
  const full = (1 << n) - 1
  const dp = HK_DP
  const subT = HK_SUB
  // subT[k*n + j] = distance stop j -> stop k (column-major so the inner loop reads contiguously)
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) subT[k * n + j] = D[s[j] * N + s[k]]
  // dp[mask*n + k] = shortest walk dock -> (every stop in mask) ending at stop k (k in mask).
  for (let k = 0; k < n; k++) dp[(1 << k) * n + k] = D[DOCK * N + s[k]]
  // "Pull" form over set bits only: n(n-1)2^(n-2) relaxations, no parent table; the tour is
  // recovered afterwards by re-finding the arg-min (bit-exact, same arithmetic).
  for (let mask = 3; mask <= full; mask++) {
    if ((mask & (mask - 1)) === 0) continue // singletons are initialised above
    const base = mask * n
    let m = mask
    while (m !== 0) {
      const kb = m & -m
      m ^= kb
      const k = 31 - Math.clz32(kb)
      const prev = mask ^ kb
      const pbase = prev * n
      const col = k * n
      let best = Infinity
      let pm = prev
      while (pm !== 0) {
        const jb = pm & -pm
        pm ^= jb
        const j = 31 - Math.clz32(jb)
        const v = dp[pbase + j] + subT[col + j]
        if (v < best) best = v
      }
      dp[base + k] = best
    }
  }
  let bestK = 0
  let best = Infinity
  for (let k = 0; k < n; k++) {
    const v = dp[full * n + k] + D[s[k] * N + DOCK]
    if (v < best) {
      best = v
      bestK = k
    }
  }
  // Backtrack: the predecessor of k in mask is the first j (ascending) that reproduces dp exactly.
  const seq: number[] = [s[bestK]]
  let mask = full
  let k = bestK
  while (mask & (mask - 1)) {
    const prev = mask ^ (1 << k)
    const target = dp[mask * n + k]
    let pm = prev
    let jj = -1
    while (pm !== 0) {
      const jb = pm & -pm
      pm ^= jb
      const j = 31 - Math.clz32(jb)
      if (dp[prev * n + j] + subT[k * n + j] === target) {
        jj = j
        break
      }
    }
    if (jj < 0) throw new Error('routeExact: backtrack failed')
    seq.push(s[jj])
    mask = prev
    k = jj
  }
  seq.reverse()
  const order = [DOCK, ...seq, DOCK]
  return { cost: tourCost(order), order, exact: true }
}

/** In-place 2-opt on a closed tour (t[0] = t[last] = DOCK stay fixed). */
function twoOpt(t: number[]): number[] {
  const L = t.length
  let improved = true
  while (improved) {
    improved = false
    for (let i = 1; i < L - 2; i++) {
      for (let k = i + 1; k < L - 1; k++) {
        const a = t[i - 1]
        const b = t[i]
        const c = t[k]
        const d = t[k + 1]
        const delta = D[a * N + c] + D[b * N + d] - D[a * N + b] - D[c * N + d]
        if (delta < -1e-9) {
          for (let x = i, y = k; x < y; x++, y--) {
            const tmp = t[x]
            t[x] = t[y]
            t[y] = tmp
          }
          improved = true
        }
      }
    }
  }
  return t
}

function nearestNeighbour(s: readonly number[]): number[] {
  const left = s.slice()
  const out = [DOCK]
  let cur = DOCK
  while (left.length) {
    let bi = 0
    let bd = Infinity
    for (let i = 0; i < left.length; i++) {
      const d = D[cur * N + left[i]]
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    cur = left[bi]
    out.push(cur)
    left.splice(bi, 1)
  }
  out.push(DOCK)
  return out
}

/**
 * Nearest neighbour + 2-opt. For honesty against the S-shape ablation, 2-opt is also run
 * from the S-shape visiting sequence and the shorter of the two tours is kept, so the
 * heuristic is never worse than what a human picker does. Still flagged exact=false.
 */
export function routeHeuristic(stops: number[]): Tour {
  const s = normaliseStops(stops)
  if (s.length === 0) return { cost: 0, order: [DOCK, DOCK], exact: false }
  let best = twoOpt(nearestNeighbour(s))
  let bestCost = tourCost(best)
  // S-shape lists every stop exactly once; keep only the bay nodes (drop junction waypoints).
  const sseq = routeSShape(s).order.filter((n) => NODES[n].kind === 'bay')
  const alt = twoOpt([DOCK, ...sseq, DOCK])
  const altCost = tourCost(alt)
  if (altCost < bestCost - 1e-9) {
    best = alt
    bestCost = altCost
  }
  return { cost: bestCost, order: best, exact: false }
}

/**
 * S-shape (traversal) policy, Hall 1993. What a human picker does.
 *
 * Rules on this layout (dock at the front-left corner, aisles 0..4 left to right):
 *  - Only aisles that contain at least one pick are entered, left to right.
 *  - The picker starts on the front cross-aisle. An aisle entered from the front is walked
 *    end to end to the turn cross-aisle and the next pick aisle is entered from there, walked
 *    back to the front, and so on (the "S").
 *  - The last pick aisle: if the picker is at the front, it uses the return policy (walk in
 *    to the deepest pick, turn round, come back out); if it is at the turn cross-aisle, it
 *    simply traverses the aisle back to the front. Then back to the dock along the front.
 *  - Middle cross-aisle: S-shape is a single-block policy, so the middle cross-aisle is just
 *    walked straight through, EXCEPT when every pick of the order lies in the front block
 *    (bays 0..4): then the middle cross-aisle is used as the turn cross-aisle, because no
 *    sensible picker walks to the back of the warehouse when nothing is there.
 * The returned order includes the junction waypoints, so tourPath() reproduces the walk
 * and cost = sum of consecutive shortest distances = the S-shape walk length.
 */
export function routeSShape(stops: number[]): Tour {
  const s = normaliseStops(stops)
  if (s.length === 0) return { cost: 0, order: [DOCK, DOCK], exact: false }
  const byAisle = new Map<number, number[]>()
  let allFront = true
  for (const n of s) {
    const info = NODES[n]
    if (info.bay >= 5) allFront = false
    const list = byAisle.get(info.aisle)
    if (list) list.push(n)
    else byAisle.set(info.aisle, [n])
  }
  const aisles = Array.from(byAisle.keys()).sort((a, b) => a - b)
  const turn = (a: number) => (allFront ? middleNode(a) : backNode(a))
  const order: number[] = [DOCK]
  let atFront = true
  aisles.forEach((a, i) => {
    const st = byAisle.get(a)! // ascending node id = front to back
    const last = i === aisles.length - 1
    if (atFront) {
      order.push(frontNode(a), ...st)
      if (last) order.push(frontNode(a))
      else {
        order.push(turn(a))
        atFront = false
      }
    } else {
      order.push(turn(a), ...st.slice().reverse(), frontNode(a))
      atFront = true
    }
  })
  order.push(DOCK)
  return { cost: tourCost(order), order, exact: false }
}

/** Expand a tour of stops into a node path that follows graph edges only. */
export function tourPath(order: number[]): number[] {
  if (order.length === 0) return []
  const path = [order[0]]
  for (let i = 1; i < order.length; i++) {
    const seg = pathBetween(order[i - 1], order[i])
    for (let k = 1; k < seg.length; k++) path.push(seg[k])
  }
  return path
}
