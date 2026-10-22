// Plays back one or more simulator plans: the picker walks plan.path through nodePosition at
// WALK_SPEED x speed (m/s), pauses lines * PICK_SECONDS / speed at each pick stop, turns toward
// motion, draws its route line and stop rings, and writes cumulative metres/seconds into a
// liveCounters entry. Everything per-frame lives in refs; no React state is touched per frame.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { OrderScore } from '../sim/types'
import Picker, { newPickerDrive, type PickerVariant } from './Picker'
import RouteLine, {
  growRouteLine,
  newWalkState,
  resetStopRings,
  restoreRouteLine,
  StopRings,
  updateStopRings,
  type RouteLineObject,
} from './RouteLine'
import { buildTimeline } from './timeline'
import { angleDelta, followTarget, PALETTE } from './shared'

export interface WalkCounters {
  m: number
  s: number
  done: boolean
  picksDone?: number // replay: pick stops completed
  orderPos?: number // race: orders completed (== index of the order being walked)
}

export interface WalkerProps {
  plans: readonly OrderScore[]
  /** bump to restart from the start of the first plan */
  runKey: number
  variant: PickerVariant
  counters: WalkCounters
  isPlaying: () => boolean
  getSpeed: () => number
  onFinished?: () => void
  /** after finishing, a paused -> playing edge restarts the walk */
  restartOnPlay?: boolean
  /** write the picker position to followTarget (camera 'follow') */
  follow?: boolean
  label?: string
  labelY?: number
  lineY?: number
}

export default function Walker(props: WalkerProps) {
  const { plans, runKey, variant, label, labelY, lineY = 0.06 } = props
  const tl = useMemo(() => buildTimeline(plans, lineY), [plans, lineY])
  const [w] = useState(newWalkState)
  const ringStart = useMemo(() => new Float64Array(Math.max(1, tl.stopCount)), [tl])
  // rig drive (walking, pick target, lines in the tote) and the lines picked so far in this order
  const [drive] = useState(newPickerDrive)
  const [carry] = useState(() => ({ base: 0, order: -1 }))

  const rootRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const lineRef = useRef<RouteLineObject>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const reset = useCallback(() => {
    const p = propsRef.current
    w.t = 0
    w.cursor = 0
    w.stopsDone = 0
    w.finished = false
    w.notified = false
    w.partialSeg = -1
    w.ringFrom = 0
    w.bob = 0
    w.wasPlaying = p.isPlaying()
    carry.base = 0
    carry.order = -1
    drive.moving = drive.picking = false
    drive.carried = 0
    // face the first move
    for (let i = 0; i < tl.n; i++) {
      if (tl.stop[i] < 0) {
        w.heading = Math.atan2(tl.x1[i] - tl.x0[i], tl.z1[i] - tl.z0[i])
        break
      }
    }
    const c = p.counters
    c.m = 0
    c.s = 0
    c.done = false
    if ('picksDone' in c) c.picksDone = 0
    if ('orderPos' in c) c.orderPos = 0
    ringStart.fill(-1)
    resetStopRings(ringRef.current)
    restoreRouteLine(lineRef.current, tl)
    const root = rootRef.current
    if (root) {
      root.position.set(tl.startX, 0, tl.startZ)
      root.rotation.y = w.heading
    }
    if (p.follow) {
      followTarget.x = tl.startX
      followTarget.z = tl.startZ
      followTarget.heading = w.heading
    }
  }, [tl, w, ringStart, carry, drive])

  useLayoutEffect(() => {
    reset()
  }, [reset, runKey])

  // priority -1: runs before the camera rig so 'follow' sees this frame's position
  useFrame((state, delta) => {
    const p = propsRef.current
    const playing = p.isPlaying()
    if (p.restartOnPlay && w.finished && playing && !w.wasPlaying) reset()
    w.wasPlaying = playing

    const speed = p.getSpeed()
    const dt = Math.min(delta, 0.1)
    const now = state.clock.elapsedTime
    if (playing && !w.finished && tl.n > 0) w.t += dt * speed

    while (w.cursor < tl.n && w.t >= tl.t0[w.cursor] + tl.dur[w.cursor]) {
      const ord = tl.order[w.cursor]
      if (ord !== carry.order) {
        carry.order = ord // a new order starts at the dock with an empty tote
        carry.base = 0
      }
      const st = tl.stop[w.cursor]
      if (st >= 0) {
        ringStart[st] = now
        w.stopsDone++
        carry.base += tl.lines[w.cursor]
      }
      w.cursor++
    }
    if (w.cursor < tl.n && tl.order[w.cursor] !== carry.order) {
      carry.order = tl.order[w.cursor]
      carry.base = 0
    }

    let x: number
    let z: number
    let m: number
    let moving = false
    let pickF = -1
    let pickLines = 0
    let stopIdx = 0
    if (tl.n === 0) {
      x = tl.startX
      z = tl.startZ
      m = 0
    } else if (w.cursor >= tl.n) {
      x = tl.endX
      z = tl.endZ
      m = tl.totalM
      w.finished = true
    } else {
      const c = w.cursor
      const d = tl.dur[c]
      const f = d > 0 ? Math.min(1, Math.max(0, (w.t - tl.t0[c]) / d)) : 1
      const dx = tl.x1[c] - tl.x0[c]
      const dz = tl.z1[c] - tl.z0[c]
      x = tl.x0[c] + dx * f
      z = tl.z0[c] + dz * f
      m = tl.m0[c] + tl.len[c] * f
      if (tl.stop[c] < 0) {
        moving = true
        const target = Math.atan2(dx, dz)
        w.heading += angleDelta(w.heading, target) * (1 - Math.exp(-dt * (9 + speed)))
      } else {
        pickF = f
        pickLines = tl.lines[c]
        stopIdx = tl.stop[c]
      }
    }

    const root = rootRef.current
    if (root) {
      root.position.set(x, 0, z)
      root.rotation.y = w.heading
    }
    const body = bodyRef.current
    if (body) {
      if (moving && playing) {
        w.bob += dt * Math.min(speed, 6) * 9
        body.position.y = Math.abs(Math.sin(w.bob)) * 0.05
        body.rotation.x = 0.07
      } else if (pickF >= 0 && playing) {
        body.position.y = 0
        body.rotation.x = Math.abs(Math.sin(pickF * Math.PI * Math.max(1, pickLines))) * 0.38
      } else {
        body.position.y = 0
        body.rotation.x = 0
      }
    }
    // the rig reads these in Picker's useFrame (priority 0, after this one). The timeline has no
    // SKU or side per stop, so the rack face the worker reaches for alternates with the stop index.
    drive.moving = moving && playing
    drive.picking = pickF >= 0
    drive.targetX = x + (stopIdx & 1 ? 1.55 : -1.55)
    drive.targetZ = z
    drive.carried = w.finished ? 0 : carry.base + (pickF >= 0 ? Math.min(pickLines, Math.floor(pickF * pickLines + 0.35)) : 0)
    if (p.follow) {
      followTarget.x = x
      followTarget.z = z
      followTarget.heading = w.heading
    }

    const c = p.counters
    if (w.finished) {
      if (!w.notified) {
        w.notified = true
        c.m = tl.sumM > 0 ? tl.sumM : tl.totalM
        c.s = tl.sumS > 0 ? tl.sumS : tl.totalT
        if ('picksDone' in c) c.picksDone = tl.stopCount
        if ('orderPos' in c) c.orderPos = tl.planCount
        c.done = true
        p.onFinished?.()
      }
    } else {
      c.m = m
      c.s = Math.min(w.t, tl.totalT)
      if ('picksDone' in c) c.picksDone = w.stopsDone
      if ('orderPos' in c) c.orderPos = tl.n > 0 ? tl.order[w.cursor] : 0
    }

    growRouteLine(lineRef.current, tl, w, x, z, lineY)
    updateStopRings(ringRef.current, tl, w, ringStart, now)
  }, -1)

  const color = variant === 'ghost' ? PALETTE.ghost : PALETTE.solid
  return (
    <group>
      <Picker variant={variant} rootRef={rootRef} bodyRef={bodyRef} label={label} labelY={labelY} drive={drive} />
      {tl.segCount > 0 ? <RouteLine key={tl.id} lineRef={lineRef} points={tl.points} color={color} /> : null}
      <StopRings key={`rings-${tl.id}`} meshRef={ringRef} count={Math.max(1, tl.stopCount)} color={color} />
    </group>
  )
}
