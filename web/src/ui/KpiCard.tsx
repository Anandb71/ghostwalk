import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { LAYOUT_LABEL, useStore, type LayoutKey } from '../store'
import { fmtKm, fmtPct, gain, rel } from './format'
import { Panel, Skeleton, cx } from './primitives'

const ROWS: LayoutKey[] = ['original', 'random', 'baseline', 'sa', 'player']

function AnimatedPct({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const from = prev.current
    prev.current = value
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        el.textContent = fmtPct(v)
      },
    })
    return () => controls.stop()
  }, [value])
  return (
    <span ref={ref} className={className}>
      {fmtPct(value)}
    </span>
  )
}

export default function KpiCard() {
  const scores = useStore((s) => s.scores)
  const layouts = useStore((s) => s.layouts)
  const startedFrom = useStore((s) => s.startedFrom)
  const swaps = useStore((s) => s.undo.length)
  const policy = useStore((s) => s.policy)
  const holdoutOrders = useStore((s) => s.data?.meta.split.holdout ?? null)

  const base = scores.baseline.holdout
  const you = scores.player.holdout
  const orig = scores.original.holdout
  const headline = base && you ? gain(you.totalM, base.totalM) : null
  const vsOrig = orig && you ? gain(you.totalM, orig.totalM) : null

  return (
    <Panel
      title="Walking distance"
      right={<span className="text-[10px] uppercase tracking-[0.14em] text-white/40">{policy === 'exact' ? 'exact routing' : 'S-shape routing'}</span>}
    >
      {/* headline */}
      <div
        className={cx(
          'mb-3 rounded-lg border px-3 py-2.5',
          headline === null
            ? 'border-white/10 bg-white/[0.03]'
            : headline >= 0
              ? 'border-gain/40 bg-gain/[0.08]'
              : 'border-loss/40 bg-loss/[0.08]',
        )}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/55">Held-out gain vs Baseline · You</div>
        <div className="flex items-end justify-between gap-2">
          {headline === null ? (
            <Skeleton className="mt-1.5 h-9 w-32" />
          ) : (
            <AnimatedPct
              value={headline}
              className={cx('tabular text-[40px] font-bold leading-none tracking-tight', headline >= 0 ? 'text-gain' : 'text-loss')}
            />
          )}
          <div className="pb-0.5 text-right text-[11px] leading-tight text-white/55">
            {headline === null ? (
              'scoring…'
            ) : (
              <>
                {headline >= 0 ? 'less' : 'more'} walking than
                <br />
                fast-movers-near-dock
              </>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/55">
          <span>
            vs Original:{' '}
            {vsOrig === null ? (
              <Skeleton className="h-3 w-10 align-middle" />
            ) : (
              <span className={cx('tabular font-medium', vsOrig >= 0 ? 'text-gain' : 'text-loss')}>{fmtPct(vsOrig)}</span>
            )}
          </span>
          <span className="tabular text-white/40">
            from {LAYOUT_LABEL[startedFrom]} · {swaps} {swaps === 1 ? 'swap' : 'swaps'}
          </span>
        </div>
      </div>

      {/* table */}
      <table className="tabular w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
            <th className="pb-1.5 text-left font-medium">Layout</th>
            <th className="pb-1.5 text-right font-medium">Train km</th>
            <th className="pb-1.5 text-right font-medium">Held-out km</th>
            <th className="pb-1.5 text-right font-medium" title="Seconds per held-out order (walk at 1.2 m/s + 8 s per line)">
              s/order
            </th>
            <th className="pb-1.5 text-right font-medium" title="Held-out metres vs Baseline (negative = less walking)">
              Δ Base
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key) => {
            const sc = scores[key]
            const present = layouts[key] !== null
            const isYou = key === 'player'
            const delta = sc.holdout && base ? rel(sc.holdout.totalM, base.totalM) : null
            return (
              <tr
                key={key}
                className={cx(
                  'border-t border-white/[0.05]',
                  isYou && 'bg-you/[0.07]',
                  key === 'baseline' && 'text-white/95',
                )}
              >
                <td className={cx('py-1.5 pl-1 text-left', isYou ? 'font-semibold text-you' : 'text-white/80')}>
                  {LAYOUT_LABEL[key]}
                </td>
                {!present ? (
                  <td colSpan={4} className="py-1.5 text-right text-[11px] text-white/35">
                    {key === 'sa' ? 'run Anneal to fill' : '—'}
                  </td>
                ) : (
                  <>
                    <td className="py-1.5 text-right">{sc.train ? fmtKm(sc.train.totalM) : <Skeleton className="h-3 w-10" />}</td>
                    <td className="py-1.5 text-right">{sc.holdout ? fmtKm(sc.holdout.totalM) : <Skeleton className="h-3 w-10" />}</td>
                    <td className="py-1.5 text-right text-white/70">
                      {sc.holdout ? (sc.holdout.totalS / Math.max(1, sc.holdout.orders)).toFixed(0) : <Skeleton className="h-3 w-7" />}
                    </td>
                    <td className="py-1.5 pr-1 text-right">
                      {key === 'baseline' ? (
                        <span className="text-white/35">ref</span>
                      ) : delta === null ? (
                        <Skeleton className="h-3 w-9" />
                      ) : (
                        <span className={delta <= 0 ? 'text-gain' : 'text-loss'}>{fmtPct(delta)}</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2.5 text-[10px] leading-snug text-white/40">
        train = 1–15 Nov · held-out = 16–30 Nov 2011
        {holdoutOrders !== null && <> · {holdoutOrders.toLocaleString('en-GB')} held-out orders</>}. Baseline = fast movers
        (by train picks) nearest the dock.
      </p>
    </Panel>
  )
}
