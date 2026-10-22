import { useMemo, useRef, useState } from 'react'
import { liveCounters, sameLayout, useStore, type StartKey } from '../store'
import { useLiveText, useRafLoop } from '../hooks/useLiveText'
import { fmtKm, fmtPct, gain } from './format'
import { Badge, Button, Panel, Segmented, Skeleton, cx } from './primitives'

function RunnerColumn({ who, label }: { who: 'ghost' | 'solid'; label: string }) {
  const total = useStore((s) => s.race.orderIdxs.length)
  const plans = useStore((s) => (who === 'ghost' ? s.race.ghostPlans : s.race.solidPlans))
  const finished = useStore((s) => s.race.finished[who])
  const plannedM = useMemo(() => plans.reduce((a, p) => a + p.m, 0), [plans])
  const mRef = useLiveText<HTMLDivElement>(() => `${Math.round(liveCounters[who].m).toLocaleString('en-GB')} m`)
  const sRef = useLiveText<HTMLSpanElement>(() => `${Math.round(liveCounters[who].s).toLocaleString('en-GB')} s`)
  const oRef = useLiveText<HTMLSpanElement>(() => {
    const c = liveCounters[who]
    return `${c.done ? total : Math.min(total, c.orderPos + 1)}/${total}`
  })
  const barRef = useRef<HTMLDivElement>(null)
  useRafLoop(() => {
    if (barRef.current) {
      const f = plannedM > 0 ? Math.min(1, liveCounters[who].m / plannedM) : 0
      barRef.current.style.transform = `scaleX(${f})`
    }
  })
  const ghost = who === 'ghost'
  return (
    <div
      className={cx(
        'rounded-lg border px-2.5 py-2',
        ghost ? 'border-ghost/35 bg-ghost/[0.06]' : 'border-you/35 bg-you/[0.06]',
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cx('text-[10px] font-semibold uppercase tracking-[0.14em]', ghost ? 'text-ghost' : 'text-you')}>
          {ghost ? 'Ghost' : 'Solid'} · {label}
        </span>
        {finished && <Badge tone={ghost ? 'ghost' : 'you'}>done</Badge>}
      </div>
      <div ref={mRef} className={cx('tabular mt-0.5 text-2xl font-bold leading-tight', ghost ? 'text-ghost' : 'text-you')}>
        0 m
      </div>
      <div className="tabular text-[11px] text-white/55">
        <span ref={sRef}>0 s</span> · order <span ref={oRef}>0/{total}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10">
        <div ref={barRef} className={cx('h-full origin-left', ghost ? 'bg-ghost' : 'bg-you')} style={{ transform: 'scaleX(0)' }} />
      </div>
    </div>
  )
}

export default function RacePanel() {
  const race = useStore((s) => s.race)
  const startRace = useStore((s) => s.startRace)
  const stopRace = useStore((s) => s.stopRace)
  const startedFrom = useStore((s) => s.startedFrom)
  const layouts = useStore((s) => s.layouts)
  const assignment = useStore((s) => s.assignment)
  const scores = useStore((s) => s.scores)
  const ready = useStore((s) => s.status === 'ready')

  // Ghost defaults to where the player started; the store falls back if that layout equals yours.
  const [choice, setChoice] = useState<StartKey>(startedFrom)

  const ghostPlannedM = useMemo(() => race.ghostPlans.reduce((a, p) => a + p.m, 0), [race.ghostPlans])
  const solidPlannedM = useMemo(() => race.solidPlans.reduce((a, p) => a + p.m, 0), [race.solidPlans])
  const thisRace = race.ghostPlans.length ? gain(solidPlannedM, ghostPlannedM) : null
  const ghostHold = race.ghostKey ? scores[race.ghostKey].holdout : null
  const youHold = scores.player.holdout
  const fullHeldOut = ghostHold && youHold ? gain(youHold.totalM, ghostHold.totalM) : null
  const bothDone = race.active && race.finished.ghost && race.finished.solid

  const option = (k: StartKey, label: string) => ({
    value: k,
    label,
    disabled: !layouts[k],
    title: !layouts[k] ? 'not available yet' : sameLayout(layouts[k], assignment) ? 'identical to your layout: the race falls back to another ghost' : undefined,
  })

  return (
    <Panel title="Race · same orders, two layouts">
      <p className="text-[11px] leading-snug text-white/55">
        A translucent <span className="text-ghost">ghost</span> walks the old layout while the{' '}
        <span className="text-you">solid</span> picker walks yours, over the same held-out orders: the six where the two layouts
        disagree most. Every metre comes from the same simulator as the KPI table.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Ghost</span>
        <Segmented<StartKey>
          label="Ghost layout"
          value={choice}
          onChange={setChoice}
          size="xs"
          options={[option('original', 'Original'), option('baseline', 'Baseline'), option('sa', 'SA')]}
        />
        <div className="ml-auto flex gap-1.5">
          {(race.active || race.preparing) && (
            <Button tone="quiet" onClick={stopRace}>
              Stop
            </Button>
          )}
          <Button tone="primary" disabled={!ready || race.preparing} onClick={() => startRace(choice)} title="Start race (R)">
            {race.preparing ? 'Preparing…' : race.active ? 'Restart race' : 'Start race'}
          </Button>
        </div>
      </div>

      {race.error && <p className="mt-2 text-[11px] text-loss">{race.error}</p>}

      {(race.active || race.preparing) && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <RunnerColumn who="ghost" label={race.ghostLabel} />
            <RunnerColumn who="solid" label={race.solidLabel} />
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md bg-black/25 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">This race ({race.orderIdxs.length} orders)</div>
              {thisRace === null ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <div className="tabular">
                  <span className={cx('text-base font-semibold', thisRace >= 0 ? 'text-gain' : 'text-loss')}>{fmtPct(thisRace)}</span>
                  <span className="ml-1 text-white/45">
                    {Math.round(solidPlannedM)} vs {Math.round(ghostPlannedM)} m
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-md bg-black/25 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Full held-out (all orders)</div>
              {fullHeldOut === null ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <div className="tabular">
                  <span className={cx('text-base font-semibold', fullHeldOut >= 0 ? 'text-gain' : 'text-loss')}>{fmtPct(fullHeldOut)}</span>
                  <span className="ml-1 text-white/45">
                    {fmtKm(youHold!.totalM, 1)} vs {fmtKm(ghostHold!.totalM, 1)} km
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-white/40">
            The race shows the orders where layouts differ most, so its gap is larger than the month-wide one. Positive = less
            walking for {race.solidLabel}.
          </p>

          {bothDone && thisRace !== null && (
            <div
              className={cx(
                'mt-2 rounded-md border px-2.5 py-2 text-center text-sm font-semibold',
                thisRace > 0 ? 'border-gain/40 text-gain' : thisRace < 0 ? 'border-loss/40 text-loss' : 'border-white/20 text-white/70',
              )}
            >
              {thisRace > 0
                ? `${race.solidLabel} beat the ${race.ghostLabel} ghost`
                : thisRace < 0
                  ? `The ${race.ghostLabel} ghost wins this one`
                  : 'Dead heat: identical routes'}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
