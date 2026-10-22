import type { ReactNode } from 'react'
import type { ScoreResult } from '../sim'
import { useStore } from '../store'
import { fmtInt, fmtKm, fmtPct, gain, num, rel } from './format'
import { Button, Panel, Skeleton, cx } from './primitives'

const COMMIT: string = (import.meta.env.VITE_COMMIT as string | undefined) ?? 'dev'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.06] pt-2.5 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{title}</h3>
      {children}
    </section>
  )
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
      <span className="text-white/55">{k}</span>
      <span className="tabular text-right text-white/90">{v}</span>
    </div>
  )
}

const maybe = (v: number | null, f: (n: number) => string = fmtInt) => (v === null ? '—' : f(v))

function routingLine(sc: ScoreResult | null) {
  if (!sc) return <Skeleton className="h-3 w-40" />
  if (sc.policy === 'sshape') return <>S-shape policy (human picker, not optimised) · {fmtInt(sc.orders)} orders</>
  return (
    <>
      {fmtInt(sc.exactOrders)} exact ({(sc.exactShareM * 100).toFixed(1)}% of metres) · {fmtInt(sc.heuristicOrders)} heuristic
    </>
  )
}

export default function EvidencePanel() {
  const data = useStore((s) => s.data)
  const scores = useStore((s) => s.scores)
  const policy = useStore((s) => s.policy)
  const ablation = useStore((s) => s.ablation)
  const runAblation = useStore((s) => s.runAblation)
  const anneal = useStore((s) => s.anneal)
  const ready = useStore((s) => s.status === 'ready')

  const meta = data?.meta
  const st = meta?.stats ?? {}
  const coverage = num(st['coverage_of_month_lines_by_top_skus'])
  const coveragePct = coverage === null ? 'X' : `${(coverage * 100).toFixed(1)}`
  const droppedPrice = num(st['dropped_nonpositive_price'])
  const droppedQty = num(st['dropped_nonpositive_qty'])

  const you = scores.player
  const base = scores.baseline
  const sa = scores.sa
  const trainGain = you.train && base.train ? gain(you.train.totalM, base.train.totalM) : null
  const holdGain = you.holdout && base.holdout ? gain(you.holdout.totalM, base.holdout.totalM) : null
  const saTrainGain = sa.train && base.train ? gain(sa.train.totalM, base.train.totalM) : null
  const saHoldGain = sa.holdout && base.holdout ? gain(sa.holdout.totalM, base.holdout.totalM) : null

  return (
    <Panel title="Evidence · how the numbers are made">
      <div className="space-y-3">
        <Section title="Data">
          <Row k="Source" v={<span className="text-[11px]">UCI Online Retail II · {meta?.month ?? '2011-11'}</span>} />
          <Row k="Raw rows (year sheet)" v={maybe(num(st['raw_rows']))} />
          <Row k="Dropped: cancellations" v={maybe(num(st['dropped_cancellations']))} />
          <Row
            k="Dropped: qty ≤ 0 / price ≤ 0"
            v={droppedQty === null && droppedPrice === null ? '—' : `${maybe(droppedQty)} / ${maybe(droppedPrice)}`}
          />
          <Row k="Dropped: non-product codes" v={maybe(num(st['dropped_non_product_codes']))} />
          <Row
            k="Orders · lines (top 100 SKUs)"
            v={meta ? `${fmtInt(meta.orderCount)} · ${fmtInt(meta.lineCount)}` : '—'}
          />
          <Row k="Train / held-out orders" v={meta ? `${fmtInt(meta.split.train)} / ${fmtInt(meta.split.holdout)}` : '—'} />
          <Row k="Top-100 coverage of month lines" v={coverage === null ? '—' : `${coveragePct}%`} />
          {meta?.cleaning?.length ? (
            <>
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40">Cleaning rules (data/prepare.py)</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-white/65">
                {meta.cleaning.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>

        <Section title={`Routing honesty · You (${policy === 'exact' ? 'exact' : 'S-shape'})`}>
          <Row k="Train" v={routingLine(you.train)} />
          <Row k="Held-out" v={routingLine(you.holdout)} />
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            {policy === 'exact'
              ? 'Held–Karp is exact for ≤ 11 stops; larger orders use nearest-neighbour + 2-opt and are flagged. eval/results.md measures that heuristic against an offline exact solver.'
              : 'S-shape is the ablation: every order is walked aisle by aisle the way a human picker does, with no optimisation. Switch to Exact for the Held–Karp / heuristic split.'}
          </p>
        </Section>

        <Section title="Policy ablation · held-out">
          {ablation.status === 'done' ? (
            <table className="tabular w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="text-left font-medium">Layout</th>
                  <th className="text-right font-medium">Exact km</th>
                  <th className="text-right font-medium">S-shape km</th>
                  <th className="text-right font-medium">S-shape cost</th>
                </tr>
              </thead>
              <tbody>
                {ablation.rows.map((r) => (
                  <tr key={r.key} className="border-t border-white/[0.05]">
                    <td className={cx('py-1', r.key === 'player' ? 'text-you' : 'text-white/80')}>{r.label}</td>
                    <td className="py-1 text-right">{r.exact ? fmtKm(r.exact.totalM) : '—'}</td>
                    <td className="py-1 text-right">{r.sshape ? fmtKm(r.sshape.totalM) : '—'}</td>
                    <td className="py-1 text-right text-loss">
                      {r.exact && r.sshape ? fmtPct(rel(r.sshape.totalM, r.exact.totalM)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/50">
                {ablation.status === 'error'
                  ? `Failed: ${ablation.error}`
                  : 'Score Baseline and You with both routing policies (4 worker runs).'}
              </span>
              <Button onClick={runAblation} disabled={!ready || ablation.status === 'running'}>
                {ablation.status === 'running' ? 'Scoring…' : 'Run'}
              </Button>
            </div>
          )}
          {ablation.status === 'done' && (
            <button type="button" onClick={runAblation} className="mt-1 text-[10px] text-white/40 underline hover:text-white/70">
              re-run for the current layout
            </button>
          )}
        </Section>

        <Section title="In-sample vs held-out · gain vs Baseline">
          <table className="tabular w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="text-left font-medium">Layout</th>
                <th className="text-right font-medium">Train</th>
                <th className="text-right font-medium">Held-out</th>
                <th className="text-right font-medium">Shrinkage</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['You', trainGain, holdGain, true],
                  ['SA', saTrainGain, saHoldGain, false],
                ] as [string, number | null, number | null, boolean][]
              ).map(([label, tr, ho, isYou]) => (
                <tr key={label} className="border-t border-white/[0.05]">
                  <td className={cx('py-1', isYou ? 'text-you' : 'text-white/80')}>{label}</td>
                  <td className="py-1 text-right">{tr === null ? '—' : fmtPct(tr)}</td>
                  <td className="py-1 text-right">{ho === null ? '—' : fmtPct(ho)}</td>
                  <td className="py-1 text-right text-white/60">{tr === null || ho === null ? '—' : `${((tr - ho) * 100).toFixed(1)} pp`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            Slotting is learned on 1–15 Nov; held-out (16–30 Nov) is what the headline reports.
          </p>
        </Section>

        <Section title="Reproducibility">
          <Row k="Re-score (worker, held-out / train)" v={you.holdout && you.train ? `${you.holdout.elapsedMs.toFixed(0)} / ${you.train.elapsedMs.toFixed(0)} ms` : '—'} />
          <Row k="Random layout seed" v="42" />
          <Row
            k="SA seed · iterations"
            v={
              anneal.result
                ? `${anneal.result.seed} · ${fmtInt(anneal.result.iterations)} (live)`
                : anneal.shipped
                  ? `${anneal.shipped.seed} · ${fmtInt(anneal.shipped.iterations)} (shipped)`
                  : `${anneal.seed} (not run)`
            }
          />
          {anneal.itersPerSec !== null && <Row k="SA speed (measured)" v={`${fmtInt(anneal.itersPerSec)} it/s`} />}
          <Row k="App build commit" v={<code className="text-[11px] text-ghost">{COMMIT}</code>} />
          {anneal.shipped?.commit && (
            <Row
              k="Eval numbers & shipped SA from"
              v={
                <span className="text-[11px]">
                  <code className="text-ghost">{anneal.shipped.commit}</code>
                  {anneal.shipped.commit !== COMMIT && <span className="text-white/45"> (eval/results.md)</span>}
                </span>
              }
            />
          )}
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            Every km on screen is re-scored live in the worker by the same sim/ code; eval/results.md is a separate headless
            run of it (npm run eval), so the two hashes can differ while the numbers agree.
          </p>
        </Section>

        <Section title="Assumptions & limitations">
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-white/65">
            <li>Geometry is declared: 5 aisles × 2 sides × 10 bays (100 slots), 3 cross-aisles (front, middle, back).</li>
            <li>Walking speed 1.2 m/s; 8 s per order line at the shelf.</li>
            <li>Top-100 SKUs cover {coveragePct}% of the month's order lines; the rest of the catalogue is out of scope.</li>
            <li>
              The top-100 SKU set is chosen on the full month (both halves). Within it, every ranking you see (carton colour,
              top-10 labels), the Baseline and SA use train picks (1–15 Nov) only.
            </li>
            <li>Data is a UK online gift retailer (B2B-heavy), Nov 2011.</li>
            <li>The warehouse layout is declared, not observed: we do not know the retailer's real floor.</li>
            <li>Time model is synthetic (walk + fixed pick time); no search, travel up ladders, or packing.</li>
            <li>One picker, one order per trip, no congestion or batching.</li>
          </ul>
        </Section>

        <p className="border-t border-white/[0.06] pt-2 text-[10px] text-white/40">
          Data licence: UCI Online Retail II (Chen 2019), CC BY 4.0
          {meta?.doi && (
            <>
              {' · '}
              <a href={meta.doi} target="_blank" rel="noreferrer" className="underline hover:text-white/70">
                doi
              </a>
            </>
          )}
        </p>
      </div>
    </Panel>
  )
}
