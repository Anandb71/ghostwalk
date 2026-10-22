import type { SimClient } from './protocol'

// TODO(worker #3): implement with new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' }).
export function createSimClient(): SimClient {
  throw new Error('not implemented')
}
