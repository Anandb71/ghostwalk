// Scene-local helpers: palette, colour ramps, the shared follow target and the DEV-only motion fallback.
// Nothing in here touches React state; everything is safe to call inside useFrame.
import * as THREE from 'three'
import type { OrderScore } from '../sim/types'
import { DOCK_X, DOCK_Z } from '../sim/layout'

export const PALETTE = {
  bg: '#0b0f17',
  floor: '#121826',
  solid: '#ff7a1a',
  ghost: '#39d0ff',
  marking: '#e8b923',
  rackPost: '#2c3850',
  rackBeam: '#46587a',
  rackDeck: '#1c2433',
  cardboard: '#c8955a',
} as const

/**
 * Where the solid picker is right now. The active solid walker writes it every frame;
 * CameraRig's 'follow' preset reads it. Plain mutable object, never React state.
 */
export const followTarget = { x: DOCK_X, z: DOCK_Z, heading: 0 }

type Stop = readonly [number, THREE.Color]

function ramp(stops: readonly Stop[], t: number, out: THREE.Color): THREE.Color {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]
    if (x <= t1) {
      const [t0, c0] = stops[i - 1]
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0)
      return out.copy(c0).lerp(c1, f)
    }
  }
  return out.copy(stops[stops.length - 1][1])
}

const stop = (t: number, hex: string): Stop => [t, new THREE.Color(hex)]

// rank 1 = hot orange ... rank 100 = cool blue
const RANK_STOPS: readonly Stop[] = [
  stop(0, '#ff5a0a'),
  stop(0.12, '#ff8f1f'),
  stop(0.3, '#f2c14e'),
  stop(0.55, '#9d9fbf'),
  stop(0.78, '#4f86e8'),
  stop(1, '#2546c8'),
]

/** Carton colour from product rank (1 = most picked). */
export function rankColor(rank: number, out: THREE.Color): THREE.Color {
  return ramp(RANK_STOPS, (rank - 1) / 99, out)
}

const VIRIDIS: readonly Stop[] = [
  stop(0, '#440154'),
  stop(0.25, '#3b528b'),
  stop(0.5, '#21918c'),
  stop(0.75, '#5ec962'),
  stop(1, '#fde725'),
]

/** Viridis-like ramp, t in 0..1. */
export function viridis(t: number, out: THREE.Color): THREE.Color {
  return ramp(VIRIDIS, t, out)
}

/** Write a uniform-scale + translation matrix straight into an instanceMatrix array (no allocation). */
export function writeScaleTranslate(arr: ArrayLike<number> & { [i: number]: number }, i: number, s: number, x: number, y: number, z: number): void {
  const o = i * 16
  arr[o] = s
  arr[o + 1] = 0
  arr[o + 2] = 0
  arr[o + 3] = 0
  arr[o + 4] = 0
  arr[o + 5] = s
  arr[o + 6] = 0
  arr[o + 7] = 0
  arr[o + 8] = 0
  arr[o + 9] = 0
  arr[o + 10] = s
  arr[o + 11] = 0
  arr[o + 12] = x
  arr[o + 13] = y
  arr[o + 14] = z
  arr[o + 15] = 1
}

/** Shortest signed angle a -> b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * DEV-only motion check: open the dev server with `?devwalk` to make the idle replay picker walk a
 * hand-written route before the store/engine provide real plans. Compiled out of production builds.
 */
export const DEV_WALK: boolean =
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devwalk')

export const DEV_PLAN: OrderScore = {
  idx: -1,
  m: 20.4,
  s: 33,
  lines: 2,
  path: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0],
  picks: [
    { pathIdx: 3, node: 3, lines: 1 },
    { pathIdx: 5, node: 5, lines: 1 },
  ],
  exact: true,
}
