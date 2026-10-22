import type { AnnealOptions, AnnealProgress, AnnealResult, Assignment, Dataset, Policy, ScoreResult, SetName } from '../sim/types'
import type { AnnealHandle, FromWorker, SimClient, ToWorker } from './protocol'

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  onProgress?: (p: AnnealProgress) => void
}

/** Promise API over the sim worker. One worker per client; dispose() terminates it. */
export function createSimClient(): SimClient {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Pending>()
  let nextId = 1
  let disposed = false

  const rejectAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
  }

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    const p = pending.get(msg.reqId)
    if (!p) return
    switch (msg.type) {
      case 'PROGRESS':
        p.onProgress?.(msg.progress)
        return
      case 'READY':
        pending.delete(msg.reqId)
        p.resolve(undefined)
        return
      case 'SCORE_RESULT':
        pending.delete(msg.reqId)
        p.resolve(msg.result)
        return
      case 'ANNEAL_DONE':
        pending.delete(msg.reqId)
        p.resolve(msg.result)
        return
      case 'ERROR':
        pending.delete(msg.reqId)
        p.reject(new Error(msg.message))
        return
    }
  }
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault()
    rejectAll(new Error(`sim worker crashed: ${e.message || 'unknown error'}`))
  }
  worker.onmessageerror = () => rejectAll(new Error('sim worker: message could not be deserialised'))

  function request<T>(build: (reqId: number) => ToWorker, onProgress?: (p: AnnealProgress) => void): { reqId: number; promise: Promise<T> } {
    const reqId = nextId++
    const promise = new Promise<T>((resolve, reject) => {
      if (disposed) {
        reject(new Error('sim client disposed'))
        return
      }
      pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      worker.postMessage(build(reqId))
    })
    return { reqId, promise }
  }

  return {
    init(dataset: Dataset): Promise<void> {
      return request<void>((reqId) => ({ type: 'INIT', reqId, dataset })).promise
    },
    score(assignment: Assignment, set: SetName, policy: Policy, withPaths = false): Promise<ScoreResult> {
      return request<ScoreResult>((reqId) => ({ type: 'SCORE', reqId, assignment, set, policy, withPaths })).promise
    },
    anneal(opts: AnnealOptions, onProgress: (p: AnnealProgress) => void): AnnealHandle {
      const { reqId, promise } = request<AnnealResult>((id) => ({ type: 'ANNEAL', reqId: id, opts }), onProgress)
      return {
        promise,
        cancel() {
          if (!disposed && pending.has(reqId)) worker.postMessage({ type: 'CANCEL', reqId } satisfies ToWorker)
        },
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      worker.terminate()
      rejectAll(new Error('sim client disposed'))
    },
  }
}
