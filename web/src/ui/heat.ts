// Pick-heat colour by product rank (rank 1 = hottest): hot orange -> amber -> grey-lavender -> cool blue.
// Mirrors RANK_STOPS in scene/shared.ts (the 3D cartons) so the 2D slot map and the floor agree.
// ui/ does not import scene/ (keeps three.js out of the UI modules), so keep the two lists in sync.

// t = (rank - 1) / (n - 1): 0 = most picked, 1 = least picked
const STOPS: [number, string][] = [
  [0, '#ff5a0a'],
  [0.12, '#ff8f1f'],
  [0.3, '#f2c14e'],
  [0.55, '#9d9fbf'],
  [0.78, '#4f86e8'],
  [1, '#2546c8'],
]

const RGB: [number, [number, number, number]][] = STOPS.map(([t, h]) => [
  t,
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)],
])

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/** t in 0..1 (0 = hottest) -> "#rrggbb". */
export function rankRamp(t: number): string {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  for (let i = 1; i < RGB.length; i++) {
    const [t1, c1] = RGB[i]
    if (x <= t1) {
      const [t0, c0] = RGB[i - 1]
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0)
      return `#${hex(c0[0] + (c1[0] - c0[0]) * f)}${hex(c0[1] + (c1[1] - c0[1]) * f)}${hex(c0[2] + (c1[2] - c0[2]) * f)}`
    }
  }
  return STOPS[STOPS.length - 1][1]
}

/** Rank 1..n -> colour (rank 1 hottest). */
export const heatColor = (rank: number, n = 100): string => rankRamp((rank - 1) / Math.max(1, n - 1))
