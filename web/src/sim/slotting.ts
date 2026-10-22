import type { AnnealOptions, AnnealProgress, AnnealResult, Assignment, PreparedData, Product } from './types'

// TODO(engine #2): implement.
/** "Original": SKUs in StockCode order, slot 0, 1, 2, ... (aisle by aisle). */
export function catalogueLayout(products: readonly Product[]): Assignment {
  void products
  throw new Error('not implemented')
}

/** Random permutation with mulberry32(seed). */
export function randomLayout(seed: number): Assignment {
  void seed
  throw new Error('not implemented')
}

/** Baseline: rank by picksTrain desc -> slots by distance from the dock asc (ties by slot id). */
export function baselineFastMovers(products: readonly Product[]): Assignment {
  void products
  throw new Error('not implemented')
}

/** Simulated annealing on train orders, exact routing, iteration budget. Deterministic for a seed. */
export function anneal(
  data: PreparedData,
  opts: AnnealOptions,
  onProgress?: (p: AnnealProgress) => void,
  shouldCancel?: () => boolean,
): AnnealResult {
  void data
  void opts
  void onProgress
  void shouldCancel
  throw new Error('not implemented')
}
