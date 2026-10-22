// TODO(engine #1): implement. Deterministic PRNG; never use Math.random in sim/.
export function mulberry32(seed: number): () => number {
  void seed
  throw new Error('not implemented')
}
