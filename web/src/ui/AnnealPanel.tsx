import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { fmtKm, fmtPct, gain } from './format'
import { Button, Panel, Segmented, Stat, cx } from './primitives'

const W = 320
const H = 150
const PAD = { l: 34, r: 8, t: 8, b: 18 }

function ConvergenceChart() {
  const progress = useStore((s) => s.anneal.progress)
  const result = useStore((s) => s.anneal.result)
  const running = useStore((s) => s.anneal.running)
  const iterations = useStore((s) => s.anneal.iterations)
  const shipped = useStore((s) => s.anneal.shipped)
  const baseTrain = useStore((s) => s.scores.baseline.train)

  const pts = useMemo<[number, number, number][]>(() => {
    if (!running && result && result.curve.length) return result.curve
    return progress.map((p) => [p.iter, p.current, p.best])
  }, [progress, result, running])

  const baseM = baseTrain && baseTrain.policy === 'exact' ? baseTrain.totalM : null
  const shippedM = shipped ? shipped.trainM : null

  const view = useMemo(() => {
    const ys: number[] = []
    for (const [, c, b] of pts) ys.push(c, b)
    if (baseM !== null) ys.push(baseM)
    if (shippedM !== null) ys.push(shippedM)
    if (!ys.length) return null
    let lo = Math.min(...ys)
    let hi = Math.max(...ys)
    if (hi - lo < 1) {
      lo -= 50
      hi += 50
    }
    const pad = (hi - lo) * 0.06
    lo -= pad
    hi += pad
    const xMax = Math.max(iterations, pts.length ? pts[pts.length - 1][0] : 1, 1)
    const x = (i: number) => PAD.l + (i / xMax) * (W - PAD.l - PAD.r)
    const y = (m: number) => PAD.t + (1 - (m - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
    return { lo, hi, xMax, x, y }
  }, [pts, baseM, shippedM, iterations])

  if (!view) {
    return (
      <div className="grid h-[150px] place-items-center rounded-lg border border-dashed border-white/10 text-[11px] text-white/35">
        convergence curve appears here
      </div>
    )
  }
  const { lo, hi, xMax, x, y } = view
  const line = (k: 1 | 2) => pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Simulated annealing convergence on train metres">
      {/* axes */}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.15)" />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.15)" />
      <text x={PAD.l - 4} y={PAD.t + 8} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)" className="tabular">
        {fmtKm(hi, 1)}
      </text>
      <text x={PAD.l - 4} y={H - PAD.b} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)" className="tabular">
        {fmtKm(lo, 1)}
      </text>
      <text x={PAD.l - 4} y={H / 2} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.3)">
        km
      </text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.45)" className="tabular">
        {xMax.toLocaleString('en-GB')} it
      </text>
      <text x={PAD.l} y={H - 4} fontSize={9} fill="rgba(255,255,255,0.45)">
        0
      </text>

      {/* reference lines */}
      {baseM !== null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(baseM)} y2={y(baseM)} stroke="#e6edf7" strokeOpacity={0.45} strokeDasharray="4 3" />
          <text x={W - PAD.r - 2} y={y(baseM) - 3} textAnchor="end" fontSize={8.5} fill="rgba(230,237,247,0.6)">
            Baseline
          </text>
        </g>
      )}
      {shippedM !== null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(shippedM)} y2={y(shippedM)} stroke="#39d0ff" strokeOpacity={0.7} strokeDasharray="4 3" />
          <text x={W - PAD.r - 2} y={y(shippedM) + 10} textAnchor="end" fontSize={8.5} fill="rgba(57,208,255,0.8)">
            shipped SA {Math.round((shipped?.iterations ?? 30000) / 1000)}k
          </text>
        </g>
      )}

      {/* curves */}
      {pts.length > 1 && (
        <>
          <polyline points={line(1)} fill="none" stroke="#ff7a1a" strokeOpacity={0.35} strokeWidth={1} />
          <polyline points={line(2)} fill="none" stroke="#ff7a1a" strokeWidth={2.2} strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

export default function AnnealPanel() {
  const anneal = useStore((s) => s.anneal)
  const startAnneal = useStore((s) => s.startAnneal)
  const cancelAnneal = useStore((s) => s.cancelAnneal)
  const applyAnnealResult = useStore((s) => s.applyAnnealResult)
  const baseTrain = useStore((s) => s.scores.baseline.train)
  const startedFrom = useStore((s) => s.startedFrom)
  const swaps = useStore((s) => s.undo.length)
  const ready = useStore((s) => s.status === 'ready')

  const [seed, setSeed] = useState(String(anneal.seed))
  const [iters, setIters] = useState<number>(anneal.iterations)

  const last = anneal.progress.length ? anneal.progress[anneal.progress.length - 1] : null
  const done = anneal.running ? (last?.iter ?? 0) / anneal.iterations : anneal.result ? 1 : 0
  const seedNum = Number.parseInt(seed, 10)
  const seedOk = Number.isFinite(seedNum) && seedNum >= 0

  const r = anneal.result
  const vsBase = r && baseTrain && baseTrain.policy === 'exact' ? gain(r.bestM, baseTrain.totalM) : null

  return (
    <Panel title="Anneal · the optimiser to beat">
      <p className="text-[11px] leading-snug text-white/55">
        Simulated annealing swaps cartons on <b className="text-white/75">train</b> orders only (exact routing), starting from your
        current layout ({startedFrom === 'original' ? 'Original' : startedFrom === 'baseline' ? 'Baseline' : 'SA'}
        {swaps ? ` + ${swaps} swaps` : ''}). Budget is iterations, not seconds: same seed ⇒ same layout on any machine.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
          Seed
          <input
            type="number"
            min={0}
            value={seed}
            disabled={anneal.running}
            onChange={(e) => setSeed(e.target.value)}
            className={cx(
              'tabular w-20 rounded-md border bg-black/30 px-2 py-1 text-xs normal-case tracking-normal text-white outline-none focus:border-you/70',
              seedOk ? 'border-white/10' : 'border-loss/60',
            )}
          />
        </label>
        <div className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
          Iterations
          <Segmented<number>
            label="Iterations"
            value={iters}
            onChange={setIters}
            size="xs"
            options={[
              { value: 1000, label: '1k' },
              { value: 3000, label: '3k' },
              { value: 10000, label: '10k' },
            ]}
          />
        </div>
        <div className="ml-auto flex gap-1.5">
          {anneal.running ? (
            <Button tone="danger" onClick={cancelAnneal}>
              Cancel
            </Button>
          ) : (
            <Button tone="primary" disabled={!ready || !seedOk} onClick={() => startAnneal(iters, seedNum)}>
              Run
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-you transition-[width] duration-200" style={{ width: `${Math.round(done * 100)}%` }} />
      </div>

      <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/25 p-1.5">
        <ConvergenceChart />
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-white/40">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-you" /> best
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-px w-4 bg-you/40" /> current
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-white/50" /> reference
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Stat label="Iteration">
          {last ? last.iter.toLocaleString('en-GB') : r ? r.iterations.toLocaleString('en-GB') : '—'}
        </Stat>
        <Stat label="Best train">{last ? `${fmtKm(last.best)} km` : r ? `${fmtKm(r.bestM)} km` : '—'}</Stat>
        <Stat label="it / s" hint="measured, not used">
          {anneal.itersPerSec ? Math.round(anneal.itersPerSec).toLocaleString('en-GB') : '—'}
        </Stat>
      </div>

      {anneal.error && <p className="mt-2 text-[11px] text-loss">{anneal.error}</p>}

      {r && !anneal.running && (
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
          <div className="tabular text-[12px] text-white/80">
            {fmtKm(r.startM)} → <b className="text-you">{fmtKm(r.bestM)} km</b> on train ({fmtPct(-gain(r.bestM, r.startM))})
            {vsBase !== null && (
              <span className={cx('ml-1', vsBase >= 0 ? 'text-gain' : 'text-loss')}> · {fmtPct(vsBase)} vs Baseline</span>
            )}
          </div>
          <div className="tabular text-[10px] text-white/40">
            seed {r.seed} · {r.iterations.toLocaleString('en-GB')} iterations · {(r.elapsedMs / 1000).toFixed(1)} s
          </div>
          <Button className="mt-2 w-full" tone="primary" onClick={applyAnnealResult}>
            Apply result to my layout
          </Button>
        </div>
      )}
    </Panel>
  )
}
