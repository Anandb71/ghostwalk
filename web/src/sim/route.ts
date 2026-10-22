// TODO(engine #1): implement. Stops are node ids (bay nodes, deduplicated, DOCK excluded).
// A tour is [DOCK, ...stops in visiting order, DOCK].

export interface Tour {
  cost: number // metres
  order: number[] // node ids, starts and ends at DOCK
  exact: boolean
}

/** Held–Karp, exact. Use for stops.length <= 11 (12 incl. dock). */
export function routeExact(stops: number[]): Tour {
  void stops
  throw new Error('not implemented')
}

/** Nearest neighbour + 2-opt. */
export function routeHeuristic(stops: number[]): Tour {
  void stops
  throw new Error('not implemented')
}

/** S-shape (traversal) policy, Hall 1993. What a human picker does. */
export function routeSShape(stops: number[]): Tour {
  void stops
  throw new Error('not implemented')
}

/** Expand a tour of stops into a node path that follows graph edges only. */
export function tourPath(order: number[]): number[] {
  void order
  throw new Error('not implemented')
}
