// Self-drawing route line (drei Line, lineWidth 3) and pulse rings at completed pick stops.
// Both are driven from the Walker's useFrame through the update helpers below, so the line tip
// is always exactly at the picker (no frame lag) and nothing allocates per frame.
import type { RefObject } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2, LineSegments2 } from 'three-stdlib'
import type { Timeline } from './timeline'
import { writeScaleTranslate } from './shared'

export type RouteLineObject = Line2 | LineSegments2

/** Mutable walk cursor shared by Walker and these helpers. */
export interface WalkState {
  t: number // sim seconds since start
  cursor: number // current timeline segment
  stopsDone: number
  finished: boolean
  notified: boolean
  heading: number
  bob: number
  partialSeg: number // polyline segment whose end currently sits at the picker (-1 = none)
  ringFrom: number // first ring still animating
  wasPlaying: boolean
}

export const newWalkState = (): WalkState => ({
  t: 0,
  cursor: 0,
  stopsDone: 0,
  finished: false,
  notified: false,
  heading: 0,
  bob: 0,
  partialSeg: -1,
  ringFrom: 0,
  wasPlaying: false,
})

interface RouteLineProps {
  lineRef: RefObject<RouteLineObject | null>
  points: [number, number, number][]
  color: string
}

export default function RouteLine({ lineRef, points, color }: RouteLineProps) {
  // visibility/instanceCount are driven by growRouteLine; do not pass `visible` here (drei spreads
  // extra props onto the material too, which would hide it permanently).
  return <Line ref={lineRef} points={points} color={color} lineWidth={3} toneMapped={false} renderOrder={4} />
}

function endArray(line: RouteLineObject): { arr: Float32Array; attr: THREE.InterleavedBufferAttribute } | null {
  const attr = line.geometry.getAttribute('instanceEnd') as THREE.InterleavedBufferAttribute | undefined
  if (!attr) return null
  return { arr: attr.data.array as Float32Array, attr }
}

/** Put every segment end back to its node position (used on restart). */
export function restoreRouteLine(line: RouteLineObject | null, tl: Timeline): void {
  if (!line) return
  const e = endArray(line)
  if (!e) return
  const n = Math.min(tl.segCount, Math.floor(e.arr.length / 6))
  for (let p = 0; p < n; p++) {
    const q = tl.points[p + 1]
    e.arr[p * 6 + 3] = q[0]
    e.arr[p * 6 + 4] = q[1]
    e.arr[p * 6 + 5] = q[2]
  }
  e.attr.data.needsUpdate = true
  line.geometry.instanceCount = 0
  line.visible = false
}

/** Draw the route up to the picker's current point (x, z). */
export function growRouteLine(line: RouteLineObject | null, tl: Timeline, w: WalkState, x: number, z: number, y: number): void {
  if (!line || tl.segCount === 0) return
  const e = endArray(line)
  if (!e) return
  let count: number
  let partial = -1
  if (w.cursor >= tl.n) count = tl.segCount
  else if (tl.stop[w.cursor] < 0) {
    partial = tl.seg[w.cursor]
    count = partial + 1
  } else count = tl.seg[w.cursor]

  let dirty = false
  if (w.partialSeg >= 0 && w.partialSeg !== partial) {
    const p = w.partialSeg
    const q = tl.points[p + 1]
    e.arr[p * 6 + 3] = q[0]
    e.arr[p * 6 + 4] = q[1]
    e.arr[p * 6 + 5] = q[2]
    dirty = true
  }
  if (partial >= 0) {
    e.arr[partial * 6 + 3] = x
    e.arr[partial * 6 + 4] = y
    e.arr[partial * 6 + 5] = z
    dirty = true
  }
  w.partialSeg = partial
  if (dirty) e.attr.data.needsUpdate = true
  line.geometry.instanceCount = count
  line.visible = count > 0
}

// ---- pulse rings at completed stops ----

const RING_GEO = new THREE.RingGeometry(0.34, 0.46, 32).rotateX(-Math.PI / 2)
const RING_Y = 0.03

interface StopRingsProps {
  meshRef: RefObject<THREE.InstancedMesh | null>
  count: number
  color: string
}

export function StopRings({ meshRef, count, color }: StopRingsProps) {
  return (
    <instancedMesh ref={meshRef} args={[RING_GEO, undefined, count]} frustumCulled={false} renderOrder={3}>
      <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

export function resetStopRings(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return
  ;(mesh.instanceMatrix.array as Float32Array).fill(0)
  mesh.instanceMatrix.needsUpdate = true
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/** Animate rings of stops completed recently (ringStart = real time of completion). */
export function updateStopRings(mesh: THREE.InstancedMesh | null, tl: Timeline, w: WalkState, ringStart: Float64Array, now: number): void {
  if (!mesh || w.ringFrom >= w.stopsDone) return
  const arr = mesh.instanceMatrix.array as Float32Array
  const cap = Math.min(w.stopsDone, mesh.count)
  for (let j = w.ringFrom; j < cap; j++) {
    const age = now - ringStart[j]
    let s: number
    if (age < 0.45) s = 0.2 + 1.3 * easeOut(Math.max(0, age) / 0.45)
    else if (age < 0.9) s = 1.5 - 0.9 * ((age - 0.45) / 0.45)
    else {
      s = 0.6
      if (j === w.ringFrom) w.ringFrom++
    }
    writeScaleTranslate(arr, j, s, tl.stopX[j], RING_Y, tl.stopZ[j])
  }
  mesh.instanceMatrix.needsUpdate = true
}
