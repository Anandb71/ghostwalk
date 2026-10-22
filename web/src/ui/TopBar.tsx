import { useStore, type CameraPreset, type Mode } from '../store'
import { Segmented, cx } from './primitives'

const MODES: { value: Mode; label: string; key: string }[] = [
  { value: 'replay', label: 'Replay', key: 'Watch one real order being picked' },
  { value: 'slot', label: 'Slot', key: 'Swap cartons between slots' },
  { value: 'race', label: 'Race', key: 'Ghost on the old layout vs you (R)' },
  { value: 'anneal', label: 'Anneal', key: 'Simulated-annealing opponent' },
  { value: 'evidence', label: 'Evidence', key: 'Data, method, assumptions' },
]

const CAMS: { value: CameraPreset; label: string; title: string }[] = [
  { value: 'overview', label: 'Overview', title: 'Overview (1)' },
  { value: 'follow', label: 'Follow', title: 'Follow the picker (2)' },
  { value: 'top', label: 'Top', title: 'Top-down (3)' },
]

export default function TopBar() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const policy = useStore((s) => s.policy)
  const setPolicy = useStore((s) => s.setPolicy)
  const showHeat = useStore((s) => s.showHeat)
  const toggleHeat = useStore((s) => s.toggleHeat)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const camera = useStore((s) => s.camera)
  const setCamera = useStore((s) => s.setCamera)
  const scoring = useStore((s) => s.scoring)
  const ready = useStore((s) => s.status === 'ready')

  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.08] bg-panel/85 px-3.5 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="flex items-baseline gap-2.5 pr-1">
        <span className="text-[17px] font-bold tracking-[0.22em] text-white">
          GHOST<span className="text-you">WALK</span>
        </span>
        <span className="hidden text-xs italic text-white/45 xl:inline">race your old warehouse</span>
      </div>

      <nav aria-label="Mode" className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/25 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.key}
            disabled={!ready}
            aria-current={mode === m.value ? 'page' : undefined}
            onClick={() => setMode(m.value)}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-medium tracking-wide transition-colors disabled:opacity-40',
              mode === m.value ? 'bg-you text-[#1a0d02]' : 'text-white/65 hover:bg-white/[0.07] hover:text-white',
            )}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex flex-wrap items-center gap-2.5">
        {scoring && (
          <span className="flex items-center gap-1.5 text-[11px] text-white/45" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-you" /> scoring
          </span>
        )}
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
          Routing
          <Segmented
            label="Routing policy"
            value={policy}
            onChange={setPolicy}
            size="xs"
            options={[
              { value: 'exact', label: 'Exact', title: 'Optimal tour on the aisle graph (Held–Karp ≤ 11 stops)' },
              { value: 'sshape', label: 'S-shape', title: 'What a human picker does: traverse every aisle with a pick' },
            ]}
          />
        </label>
        <Segmented
          label="Camera"
          value={camera}
          onChange={setCamera}
          size="xs"
          options={CAMS.map((c) => ({ value: c.value, label: c.label, title: c.title }))}
        />
        <button
          type="button"
          onClick={toggleHeat}
          aria-pressed={showHeat}
          title="Floor heatmap of pick visits (train)"
          className={cx(
            'rounded-md border px-2 py-1 text-[11px] transition-colors',
            showHeat ? 'border-you/60 bg-you/15 text-you' : 'border-white/10 text-white/55 hover:text-white',
          )}
        >
          Heat
        </button>
        <button
          type="button"
          onClick={() => setQuality(quality === 'high' ? 'medium' : 'high')}
          aria-pressed={quality === 'high'}
          title="High quality enables bloom post-processing"
          className={cx(
            'rounded-md border px-2 py-1 text-[11px] transition-colors',
            quality === 'high' ? 'border-ghost/60 bg-ghost/10 text-ghost' : 'border-white/10 text-white/55 hover:text-white',
          )}
        >
          {quality === 'high' ? 'HQ' : 'MQ'}
        </button>
      </div>
    </header>
  )
}
