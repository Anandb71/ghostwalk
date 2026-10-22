// Pick-heat colour ramp by product rank (rank 1 = hottest). Cool blue -> violet -> hot orange.
// The 3D cartons use the same idea (BUILD_SPEC §7); keep the stops in sync if the scene changes its ramp.

const STOPS: [number, [number, number, number]][] = [
  [0.0, [0x1c, 0x2f, 0x55]],
  [0.4, [0x2c, 0x68, 0xb0]],
  [0.65, [0x8a, 0x5a, 0xd0]],
  [0.85, [0xff, 0x6a, 0x1a]],
  [1.0, [0xff, 0xc0, 0x4a]],
]

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/** t in 0..1 (1 = hottest) -> "#rrggbb". */
export function heatRamp(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    if (x <= t1) {
      const [t0, c0] = STOPS[i - 1]
      const f = (x - t0) / (t1 - t0 || 1)
      return `#${hex(c0[0] + (c1[0] - c0[0]) * f)}${hex(c0[1] + (c1[1] - c0[1]) * f)}${hex(c0[2] + (c1[2] - c0[2]) * f)}`
    }
  }
  const c = STOPS[STOPS.length - 1][1]
  return `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`
}

/** Rank 1..n -> colour (rank 1 hottest). */
export const heatColor = (rank: number, n = 100): string => heatRamp(1 - (rank - 1) / Math.max(1, n - 1))
