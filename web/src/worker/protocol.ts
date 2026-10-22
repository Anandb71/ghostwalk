// Main thread <-> sim worker protocol. Implemented by sim.worker.ts and client.ts.
import type {
  AnnealOptions,
  AnnealProgress,
  AnnealResult,
  Assignment,
  Dataset,
  Policy,
  ScoreResult,
  SetName,
} from '../sim/types'

export type ToWorker =
  | { type: 'INIT'; reqId: number; dataset: Dataset }
  | { type: 'SCORE'; reqId: number; assignment: Assignment; set: SetName; policy: Policy; withPaths: boolean }
  | { type: 'ANNEAL'; reqId: number; opts: AnnealOptions }
  | { type: 'CANCEL'; reqId: number } // reqId of the ANNEAL to cancel

export type FromWorker =
  | { type: 'READY'; reqId: number }
  | { type: 'SCORE_RESULT'; reqId: number; result: ScoreResult }
  | { type: 'PROGRESS'; reqId: number; progress: AnnealProgress }
  | { type: 'ANNEAL_DONE'; reqId: number; result: AnnealResult; cancelled: boolean }
  | { type: 'ERROR'; reqId: number; message: string }

export interface AnnealHandle {
  promise: Promise<AnnealResult> // resolves with best-so-far even when cancelled
  cancel(): void
}

export interface SimClient {
  init(dataset: Dataset): Promise<void>
  /** withPaths=false drops perOrder[].path/picks to keep messages small (KPI scoring). */
  score(assignment: Assignment, set: SetName, policy: Policy, withPaths?: boolean): Promise<ScoreResult>
  anneal(opts: AnnealOptions, onProgress: (p: AnnealProgress) => void): AnnealHandle
  dispose(): void
}
