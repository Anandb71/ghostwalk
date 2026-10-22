/// <reference lib="webworker" />
// Sim worker: owns the prepared dataset and the route memo cache, so the main thread stays free.
// ANNEAL runs in setTimeout(0)-yielded chunks, so CANCEL (and SCORE) messages are handled
// between chunks; the SA result does not depend on the chunking.
import { Annealer, ordersFor, prepareDataset, simulate } from '../sim'
import type { PreparedData } from '../sim'
import type { FromWorker, ToWorker } from './protocol'

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}
const ctx = self as unknown as WorkerScope

let data: PreparedData | null = null
const running = new Map<number, { cancelled: boolean }>()
const CHUNK_MS = 30 // run SA for about this long before yielding to the message queue

const post = (msg: FromWorker, transfer?: Transferable[]) => ctx.postMessage(msg, transfer)
const fail = (reqId: number, err: unknown) =>
  post({ type: 'ERROR', reqId, message: err instanceof Error ? err.message : String(err) })

function need(): PreparedData {
  if (!data) throw new Error('sim worker: INIT has not been called')
  return data
}

function startAnneal(reqId: number, msg: Extract<ToWorker, { type: 'ANNEAL' }>): void {
  const d = need()
  const sa = new Annealer(d, msg.opts)
  const every = Math.max(1, Math.floor(msg.opts.reportEvery || 250))
  const state = { cancelled: false }
  running.set(reqId, state)
  const finish = (cancelled: boolean) => {
    running.delete(reqId)
    post({ type: 'ANNEAL_DONE', reqId, result: sa.result(), cancelled })
  }
  const chunk = () => {
    try {
      if (state.cancelled) return finish(true)
      const t0 = performance.now()
      do {
        sa.step(every)
        post({ type: 'PROGRESS', reqId, progress: sa.progress() })
      } while (!sa.done && performance.now() - t0 < CHUNK_MS)
      if (sa.done) return finish(false)
      setTimeout(chunk, 0)
    } catch (err) {
      running.delete(reqId)
      fail(reqId, err)
    }
  }
  post({ type: 'PROGRESS', reqId, progress: sa.progress() })
  setTimeout(chunk, 0)
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'INIT': {
        data = prepareDataset(msg.dataset)
        post({ type: 'READY', reqId: msg.reqId })
        break
      }
      case 'SCORE': {
        const d = need()
        const result = simulate(ordersFor(d, msg.set), msg.assignment, msg.policy, msg.set, msg.withPaths)
        post({ type: 'SCORE_RESULT', reqId: msg.reqId, result }, [result.visitsPerNode.buffer])
        break
      }
      case 'ANNEAL': {
        startAnneal(msg.reqId, msg)
        break
      }
      case 'CANCEL': {
        const st = running.get(msg.reqId)
        if (st) st.cancelled = true
        break
      }
    }
  } catch (err) {
    fail(msg.reqId, err)
  }
}
