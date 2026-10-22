import { liveCounters, useStore, type Speed } from '../store'
import { useLiveText } from '../hooks/useLiveText'
import { fmtH, fmtKm } from './format'
import { Panel, Segmented, Skeleton, cx } from './primitives'

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M4 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5Z" fill="currentColor" />
    </svg>
  )
}

function ReplayCounters() {
  const mRef = useLiveText<HTMLSpanElement>(() => `${Math.round(liveCounters.replay.m).toLocaleString('en-GB')} m`)
  const sRef = useLiveText<HTMLSpanElement>(() => `${Math.round(liveCounters.replay.s).toLocaleString('en-GB')} s`)
  const plan = useStore((s) => s.replay.plan)
  return (
    <div className="min-w-[150px]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">This replay</div>
      <div className="tabular text-[15px] font-semibold text-you">
        <span ref={mRef}>0 m</span>
        <span className="mx-1 text-white/30">/</span>
        <span ref={sRef}>0 s</span>
      </div>
      <div className="tabular text-[10px] text-white/40">
        {plan ? `route ${Math.round(plan.m)} m · ${Math.round(plan.s)} s` : 'no route yet'}
      </div>
    </div>
  )
}

function MonthCounters() {
  const train = useStore((s) => s.scores.player.train)
  const holdout = useStore((s) => s.scores.player.holdout)
  const both = train && holdout
  return (
    <div className="min-w-[150px]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Full month (headless) · You</div>
      <div className="tabular text-[15px] font-semibold text-white/90">
        {both ? (
          <>
            {fmtKm(train.totalM + holdout.totalM, 1)} km<span className="mx-1 text-white/30">/</span>
            {fmtH(train.totalS + holdout.totalS)}
          </>
        ) : (
          <Skeleton className="h-4 w-28" />
        )}
      </div>
      <div className="tabular text-[10px] text-white/40">
        {both ? `${(train.orders + holdout.orders).toLocaleString('en-GB')} orders, simulated in the worker` : 'scoring…'}
      </div>
    </div>
  )
}

export default function Hud() {
  const playing = useStore((s) => s.replay.playing)
  const speed = useStore((s) => s.replay.speed)
  const orderIdx = useStore((s) => s.replay.orderIdx)
  const togglePlay = useStore((s) => s.togglePlay)
  const setSpeed = useStore((s) => s.setSpeed)
  const setOrder = useStore((s) => s.setOrder)
  const nOrders = useStore((s) => s.data?.orders.length ?? 0)
  const order = useStore((s) => s.data?.orders[s.replay.orderIdx] ?? null)
  const raceActive = useStore((s) => s.race.active)
  const ready = useStore((s) => s.status === 'ready')

  return (
    <Panel className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!ready}
            title="Play / pause (Space)"
            aria-label={playing ? 'Pause' : 'Play'}
            className={cx(
              'grid h-9 w-9 place-items-center rounded-full border transition-colors disabled:opacity-40',
              playing ? 'border-white/20 bg-white/10 text-white' : 'border-you/60 bg-you text-[#1a0d02] hover:brightness-110',
            )}
          >
            <PlayIcon playing={playing} />
          </button>
          <Segmented<Speed>
            label="Speed"
            value={speed}
            onChange={setSpeed}
            size="xs"
            options={[
              { value: 1, label: '1×' },
              { value: 4, label: '4×' },
              { value: 20, label: '20×' },
            ]}
          />
        </div>

        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-white/45">
            <span>{raceActive ? 'Race in progress' : 'Order'}</span>
            <span className="tabular normal-case tracking-normal text-white/55">
              {order ? (
                <>
                  #{order.id} · {order.split === 'holdout' ? 'held-out' : 'train'} · {orderIdx + 1}/{nOrders}
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <input
            type="range"
            aria-label="Order scrubber"
            min={0}
            max={Math.max(0, nOrders - 1)}
            value={orderIdx}
            disabled={!ready || raceActive}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="scrubber w-full"
          />
        </div>

        <ReplayCounters />
        <MonthCounters />
      </div>
    </Panel>
  )
}
