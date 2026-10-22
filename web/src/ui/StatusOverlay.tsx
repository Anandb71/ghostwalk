import { useStore } from '../store'
import { Button } from './primitives'

/** Full-screen loading / error states. Renders nothing once the app is ready. */
export default function StatusOverlay() {
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const load = useStore((s) => s.load)
  if (status === 'ready') return null

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-ink/70 backdrop-blur-sm">
      {status === 'loading' ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-2xl font-bold tracking-[0.3em] text-white">
            GHOST<span className="text-you">WALK</span>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded bg-white/10">
            <div className="loading-bar h-full w-1/3 rounded bg-you" />
          </div>
          <div className="text-xs text-white/50">Loading one month of real orders and warming up the simulator…</div>
        </div>
      ) : (
        <div className="max-w-md rounded-xl border border-loss/40 bg-panel/95 p-5 text-center shadow-2xl">
          <div className="text-sm font-semibold text-loss">Could not start the simulator</div>
          <p className="mt-2 break-words text-xs text-white/65">{error ?? 'Unknown error'}</p>
          <Button className="mt-4" tone="primary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
