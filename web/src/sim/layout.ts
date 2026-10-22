// Warehouse geometry: the single source of truth (BUILD_SPEC §5).
// x = across aisles, z = along aisles, y = up. Units: metres.

export const AISLES = 5
export const SIDES = 2
export const BAYS = 10
export const SLOTS = AISLES * SIDES * BAYS // 100

export const BAY_PITCH = 1.2
export const RACK_DEPTH = 1.0
export const WALKWAY = 3.0
export const AISLE_PITCH = 5.0
export const CROSS_AISLE = 4.0
export const RACK_HEIGHT = 2.4
export const RACK_OFFSET = 2.0 // rack centre distance from the aisle centre line

export const WALK_SPEED = 1.2 // m/s
export const PICK_SECONDS = 8 // s per order line

export const FRONT_Z = -2.0
export const MIDDLE_Z = 8.0
export const BACK_Z = 18.0

export const DOCK = 0
export const DOCK_X = -4.0
export const DOCK_Z = FRONT_Z

export const NODES_PER_AISLE = 13
export const NODE_COUNT = 1 + AISLES * NODES_PER_AISLE // 66

export type NodeKind = 'dock' | 'front' | 'bay' | 'middle' | 'back'

export interface NodeInfo {
  id: number
  kind: NodeKind
  aisle: number // -1 for dock
  bay: number // 0..9 for bay nodes, -1 otherwise
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const aisleX = (a: number): number => a * AISLE_PITCH
export const bayZ = (b: number): number => (b < 5 ? 0.6 + b * BAY_PITCH : 10.6 + (b - 5) * BAY_PITCH)

/** k: 0 = front junction, 1..5 = bays 0..4, 6 = middle junction, 7..11 = bays 5..9, 12 = back junction */
export const nodeId = (a: number, k: number): number => 1 + a * NODES_PER_AISLE + k
export const frontNode = (a: number): number => nodeId(a, 0)
export const middleNode = (a: number): number => nodeId(a, 6)
export const backNode = (a: number): number => nodeId(a, 12)
export const bayNode = (a: number, b: number): number => nodeId(a, b < 5 ? 1 + b : 2 + b)

/** slot id = aisle*20 + side*10 + bay; side 0 = left (-x), side 1 = right (+x) */
export const slotId = (aisle: number, side: number, bay: number): number => aisle * 20 + side * 10 + bay
export const slotAisle = (s: number): number => Math.floor(s / 20)
export const slotSide = (s: number): number => Math.floor(s / 10) % 2
export const slotBay = (s: number): number => s % 10
export const slotNode = (s: number): number => bayNode(slotAisle(s), slotBay(s))

/** Carton world position (centre of the box on the rack shelf). */
export function slotPosition(s: number): Vec3 {
  const a = slotAisle(s)
  return { x: aisleX(a) + (slotSide(s) === 0 ? -RACK_OFFSET : RACK_OFFSET), y: 1.0, z: bayZ(slotBay(s)) }
}

function buildNodes(): NodeInfo[] {
  const nodes: NodeInfo[] = [{ id: DOCK, kind: 'dock', aisle: -1, bay: -1, x: DOCK_X, z: DOCK_Z }]
  for (let a = 0; a < AISLES; a++) {
    const x = aisleX(a)
    for (let k = 0; k < NODES_PER_AISLE; k++) {
      let kind: NodeKind
      let bay = -1
      let z: number
      if (k === 0) {
        kind = 'front'
        z = FRONT_Z
      } else if (k === 6) {
        kind = 'middle'
        z = MIDDLE_Z
      } else if (k === 12) {
        kind = 'back'
        z = BACK_Z
      } else {
        kind = 'bay'
        bay = k < 6 ? k - 1 : k - 2
        z = bayZ(bay)
      }
      nodes.push({ id: nodeId(a, k), kind, aisle: a, bay, x, z })
    }
  }
  return nodes
}

export const NODES: readonly NodeInfo[] = buildNodes()

export function nodePosition(n: number): { x: number; z: number } {
  const node = NODES[n]
  return { x: node.x, z: node.z }
}

function buildEdges(): [number, number, number][] {
  const edges: [number, number, number][] = []
  const add = (u: number, v: number) => {
    const w = Math.abs(NODES[u].x - NODES[v].x) + Math.abs(NODES[u].z - NODES[v].z) // axis-aligned segments
    edges.push([u, v, Math.round(w * 1000) / 1000])
  }
  add(DOCK, frontNode(0))
  for (let a = 0; a < AISLES; a++) {
    if (a + 1 < AISLES) {
      add(frontNode(a), frontNode(a + 1))
      add(middleNode(a), middleNode(a + 1))
      add(backNode(a), backNode(a + 1))
    }
    // walk along the aisle: F, bays 0..4, M, bays 5..9, B
    for (let k = 0; k < NODES_PER_AISLE - 1; k++) add(nodeId(a, k), nodeId(a, k + 1))
  }
  return edges
}

/** Undirected edges [u, v, metres]. Walking happens only along these. */
export const EDGES: readonly [number, number, number][] = buildEdges()

const ADJ: [number, number][][] = Array.from({ length: NODE_COUNT }, () => [])
for (const [u, v, w] of EDGES) {
  ADJ[u].push([v, w])
  ADJ[v].push([u, w])
}
export const adjacency = (n: number): readonly [number, number][] => ADJ[n]

const EDGE_SET = new Set<number>()
for (const [u, v] of EDGES) {
  EDGE_SET.add(u * NODE_COUNT + v)
  EDGE_SET.add(v * NODE_COUNT + u)
}
export const isEdge = (u: number, v: number): boolean => EDGE_SET.has(u * NODE_COUNT + v)

// All-pairs shortest paths (Dijkstra from every node; 66 nodes, trivially cheap).
const D = new Float64Array(NODE_COUNT * NODE_COUNT)
const PRED = new Int16Array(NODE_COUNT * NODE_COUNT) // PRED[s*N+v] = node before v on the path s -> v

for (let s = 0; s < NODE_COUNT; s++) {
  const dist = new Float64Array(NODE_COUNT).fill(Infinity)
  const done = new Uint8Array(NODE_COUNT)
  const pred = new Int16Array(NODE_COUNT).fill(-1)
  dist[s] = 0
  for (let it = 0; it < NODE_COUNT; it++) {
    let u = -1
    for (let i = 0; i < NODE_COUNT; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i
    if (u === -1 || dist[u] === Infinity) break
    done[u] = 1
    for (const [v, w] of ADJ[u]) {
      const nd = dist[u] + w
      if (nd < dist[v] - 1e-9) {
        dist[v] = nd
        pred[v] = u
      }
    }
  }
  for (let v = 0; v < NODE_COUNT; v++) {
    D[s * NODE_COUNT + v] = Math.round(dist[v] * 1000) / 1000
    PRED[s * NODE_COUNT + v] = pred[v]
  }
}

/** Distance matrix, row-major NODE_COUNT x NODE_COUNT. */
export const allPairs = (): Float64Array => D
export const dist = (u: number, v: number): number => D[u * NODE_COUNT + v]

/** Node path u -> v inclusive, following graph edges only. */
export function pathBetween(u: number, v: number): number[] {
  if (u === v) return [u]
  const out: number[] = [v]
  let cur = v
  while (cur !== u) {
    cur = PRED[u * NODE_COUNT + cur]
    if (cur < 0) throw new Error(`no path ${u} -> ${v}`)
    out.push(cur)
  }
  return out.reverse()
}
