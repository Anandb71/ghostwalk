// Flattens one or more OrderScore plans into a walk timeline the picker plays back.
// Time is simulated seconds: walking a segment takes metres / WALK_SPEED, a pick stop pauses
// lines * PICK_SECONDS. So at the end, elapsed time == sum of plan.s and metres == sum of plan.m,
// the same numbers simulate() reports.
import type { OrderScore } from '../sim/types'
import { nodePosition, PICK_SECONDS, WALK_SPEED, DOCK_X, DOCK_Z } from '../sim/layout'

export interface Timeline {
  id: number
  /** number of segments (moves + pauses) */
  n: number
  t0: Float64Array // segment start, sim seconds
  dur: Float64Array
  x0: Float32Array
  z0: Float32Array
  x1: Float32Array
  z1: Float32Array
  m0: Float64Array // metres walked before this segment
  len: Float32Array // metres walked in this segment (0 for pauses)
  lines: Int32Array // order lines picked during this segment (0 for moves)
  order: Int32Array // plan index this segment belongs to
  stop: Int32Array // -1 for a move, global pick-stop index for a pause
  /** move: polyline segment index; pause: number of polyline segments already completed */
  seg: Int32Array
  totalT: number
  totalM: number
  /** sums of the simulator's own numbers, used to snap counters exactly when the walk ends */
  sumM: number
  sumS: number
  planCount: number
  /** polyline vertices (route line), y = lineY */
  points: [number, number, number][]
  segCount: number
  stopX: Float32Array
  stopZ: Float32Array
  stopCount: number
  startX: number
  startZ: number
  endX: number
  endZ: number
}

let nextId = 1

export function buildTimeline(plans: readonly OrderScore[], lineY: number): Timeline {
  const t0: number[] = []
  const dur: number[] = []
  const x0: number[] = []
  const z0: number[] = []
  const x1: number[] = []
  const z1: number[] = []
  const m0: number[] = []
  const len: number[] = []
  const lines: number[] = []
  const order: number[] = []
  const stop: number[] = []
  const seg: number[] = []
  const points: [number, number, number][] = []
  const stopX: number[] = []
  const stopZ: number[] = []

  let t = 0
  let m = 0
  let segCount = 0
  let sumM = 0
  let sumS = 0
  let cx = NaN
  let cz = NaN
  let startX = DOCK_X
  let startZ = DOCK_Z

  for (let k = 0; k < plans.length; k++) {
    const plan = plans[k]
    sumM += plan.m
    sumS += plan.s
    const path = plan.path
    if (!path || path.length === 0) continue

    const pauseAt = new Map<number, number>()
    for (const p of plan.picks ?? []) {
      if (p.pathIdx < 0 || p.pathIdx >= path.length) continue
      pauseAt.set(p.pathIdx, (pauseAt.get(p.pathIdx) ?? 0) + Math.max(0, p.lines))
    }

    for (let i = 0; i < path.length; i++) {
      const pos = nodePosition(path[i])
      if (Number.isNaN(cx)) {
        cx = pos.x
        cz = pos.z
        startX = cx
        startZ = cz
        points.push([cx, lineY, cz])
      }
      const L = Math.hypot(pos.x - cx, pos.z - cz)
      if (L > 1e-6) {
        const d = L / WALK_SPEED
        t0.push(t)
        dur.push(d)
        x0.push(cx)
        z0.push(cz)
        x1.push(pos.x)
        z1.push(pos.z)
        m0.push(m)
        len.push(L)
        lines.push(0)
        order.push(k)
        stop.push(-1)
        seg.push(segCount)
        points.push([pos.x, lineY, pos.z])
        segCount++
        t += d
        m += L
        cx = pos.x
        cz = pos.z
      }
      const pl = pauseAt.get(i)
      if (pl) {
        const d = pl * PICK_SECONDS
        t0.push(t)
        dur.push(d)
        x0.push(cx)
        z0.push(cz)
        x1.push(cx)
        z1.push(cz)
        m0.push(m)
        len.push(0)
        lines.push(pl)
        order.push(k)
        stop.push(stopX.length)
        seg.push(segCount)
        stopX.push(cx)
        stopZ.push(cz)
        t += d
      }
    }
  }

  return {
    id: nextId++,
    n: t0.length,
    t0: Float64Array.from(t0),
    dur: Float64Array.from(dur),
    x0: Float32Array.from(x0),
    z0: Float32Array.from(z0),
    x1: Float32Array.from(x1),
    z1: Float32Array.from(z1),
    m0: Float64Array.from(m0),
    len: Float32Array.from(len),
    lines: Int32Array.from(lines),
    order: Int32Array.from(order),
    stop: Int32Array.from(stop),
    seg: Int32Array.from(seg),
    totalT: t,
    totalM: m,
    sumM,
    sumS,
    planCount: plans.length,
    points,
    segCount,
    stopX: Float32Array.from(stopX),
    stopZ: Float32Array.from(stopZ),
    stopCount: stopX.length,
    startX,
    startZ,
    endX: Number.isNaN(cx) ? DOCK_X : cx,
    endZ: Number.isNaN(cz) ? DOCK_Z : cz,
  }
}
