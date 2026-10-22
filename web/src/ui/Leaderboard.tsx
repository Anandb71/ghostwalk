// Leaderboard of player layouts (stretch S3, issue #8). Self-contained panel: reads the store,
// keeps its own entries in localStorage (see ./leaderboardModel.ts) and never writes to the store.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Assignment, Policy, ScoreResult } from '../sim'
import {
  STORAGE_KEY,
  NAME_MAX,
  addEntry,
  buildRows,
  dataKey,
  deltaVsBaseline,
  describeOrigin,
  exportFilename,
  exportPayload,
  formatDelta,
  formatKm,
  layoutId,
  loadEntries,
  loadName,
  makeEntry,
  parseEntries,
  removeEntry,
  sameLayout,
  sanitizeName,
  saveEntries,
  saveName,
  type BoardRow,
  type LeaderboardEntry,
} from './leaderboardModel'

const COMMIT: string = import.meta.env.VITE_COMMIT || 'dev'
const POLICY_LABEL: Record<Policy, string> = { exact: 'Exact routing', sshape: 'S-shape routing' }

const scored = (r: ScoreResult | null, policy: Policy): r is ScoreResult => r !== null && r.policy === policy

export default function Leaderboard({ className = '' }: { className?: string }) {
  const data = useStore((s) => s.data)
  const policy = useStore((s) => s.policy)
  const scoring = useStore((s) => s.scoring)
  const assignment = useStore((s) => s.assignment)
  const startedFrom = useStore((s) => s.startedFrom)
  const startLayout = useStore((s) => s.layouts[s.startedFrom])
  const baselineLayout = useStore((s) => s.layouts.baseline)
  const saLayout = useStore((s) => s.layouts.sa)
  const shipped = useStore((s) => s.anneal.shipped)
  const annealResult = useStore((s) => s.anneal.result)
  const youTrain = useStore((s) => s.scores.player.train)
  const youHoldout = useStore((s) => s.scores.player.holdout)
  const baseHoldout = useStore((s) => s.scores.baseline.holdout)
  const saHoldout = useStore((s) => s.scores.sa.holdout)

  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => loadEntries())
  const [name, setName] = useState(() => loadName())
  const [note, setNote] = useState('')

  // Scores are fresh only if they arrived after the latest layout change: remember which
  // assignment was on the floor when the player's held-out score last changed.
  const scoredFor = useRef<{ score: ScoreResult | null; assignment: Assignment | null }>({ score: null, assignment: null })
  if (scoredFor.current.score !== youHoldout) scoredFor.current = { score: youHoldout, assignment }
  const fresh =
    !scoring &&
    assignment !== null &&
    scoredFor.current.assignment === assignment &&
    scored(youHoldout, policy) &&
    scored(youTrain, policy) &&
    scored(baseHoldout, policy)

  // Another tab saved: pick up its entries.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEntries(parseEntries(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const key = data ? dataKey(data.meta) : ''

  const origin = useMemo(
    () =>
      assignment
        ? describeOrigin({
            assignment,
            startedFrom,
            startLayout,
            shippedSa: shipped,
            annealResult: annealResult && { assignment: annealResult.best, seed: annealResult.seed, iterations: annealResult.iterations },
          })
        : null,
    [assignment, startedFrom, startLayout, shipped, annealResult],
  )

  const { rows, hidden } = useMemo(() => {
    const onBaseline = assignment !== null && baselineLayout !== null && sameLayout(assignment, baselineLayout)
    const onSa = assignment !== null && saLayout !== null && sameLayout(assignment, saLayout)
    const references: BoardRow[] = []
    if (scored(baseHoldout, policy)) {
      references.push({
        key: 'ref-baseline',
        kind: 'reference',
        name: 'Baseline',
        holdoutM: baseHoldout.totalM,
        delta: 0,
        provenance: 'fast movers nearest the dock',
        isCurrent: onBaseline,
      })
      if (scored(saHoldout, policy)) {
        references.push({
          key: 'ref-sa',
          kind: 'reference',
          name: 'SA optimiser',
          holdoutM: saHoldout.totalM,
          delta: deltaVsBaseline(saHoldout.totalM, baseHoldout.totalM),
          provenance: shipped ? `seed ${shipped.seed} · ${shipped.iterations.toLocaleString('en-US')} it` : 'simulated annealing',
          isCurrent: onSa,
        })
      }
    }
    const current =
      fresh && assignment && origin && !onBaseline && !onSa
        ? {
            id: layoutId(assignment, policy),
            holdoutM: youHoldout!.totalM,
            delta: deltaVsBaseline(youHoldout!.totalM, baseHoldout!.totalM),
            provenance: origin.origin,
          }
        : null
    return buildRows({ entries, references, current, policy, dataKey: key })
  }, [entries, policy, key, fresh, assignment, origin, baselineLayout, saLayout, baseHoldout, saHoldout, youHoldout, shipped])

  const save = () => {
    if (!fresh || !assignment || !origin || !data) return
    const cleanName = sanitizeName(name)
    const entry = makeEntry({
      name: cleanName,
      policy,
      holdoutM: youHoldout!.totalM,
      trainM: youTrain!.totalM,
      baselineHoldoutM: baseHoldout!.totalM,
      origin: origin.origin,
      seed: origin.seed,
      commit: COMMIT,
      dataKey: key,
      savedAt: new Date().toISOString(),
      assignment,
    })
    const next = addEntry(entries, entry)
    setEntries(next)
    setName(cleanName)
    saveName(cleanName)
    const persisted = saveEntries(next)
    const rank = buildRows({ entries: next, references: [], current: null, policy, dataKey: key }).rows.findIndex(
      (r) => r.key === `saved-${entry.id}`,
    )
    setNote(
      persisted
        ? `Saved "${cleanName}" at ${formatKm(entry.holdoutM)} km held-out (#${rank + 1} of saved).`
        : 'Saved for this tab only: browser storage is unavailable. Export JSON still works.',
    )
  }

  const remove = (id: string) => {
    const next = removeEntry(entries, id)
    setEntries(next)
    if (!saveEntries(next)) setNote('Removed for this tab only: browser storage is unavailable.')
  }

  const exportJson = () => {
    if (!data) return
    const exportedAt = new Date().toISOString()
    const payload = exportPayload({
      entries,
      references: rows.filter((r) => r.kind === 'reference'),
      meta: data.meta,
      products: data.products,
      policy,
      commit: COMMIT,
      exportedAt,
    })
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = exportFilename(exportedAt)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setNote(`Exported ${entries.length} saved layout${entries.length === 1 ? '' : 's'}.`)
    } catch {
      setNote('Export failed: this browser blocked the download.')
    }
  }

  const savedIds = new Set(entries.map((e) => `saved-${e.id}`))
  const saveHint = !data
    ? 'Loading data…'
    : !assignment || scoring || !fresh
      ? 'Scoring your layout…'
      : null

  return (
    <section
      aria-labelledby="leaderboard-title"
      className={`w-80 rounded-xl border border-white/10 bg-panel/90 p-3 text-xs shadow-lg backdrop-blur ${className}`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="leaderboard-title" className="text-sm font-semibold tracking-wide">
          Leaderboard
        </h2>
        <span className="text-[11px] opacity-60">Held-out · {POLICY_LABEL[policy]}</span>
      </header>

      {rows.length === 0 ? (
        <p className="py-4 text-center opacity-60">{data ? 'Waiting for the first scores…' : 'Loading data…'}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="tabular w-full border-collapse">
            <thead>
              <tr className="text-left text-[11px] opacity-60">
                <th scope="col" className="w-6 py-1 font-normal">
                  #
                </th>
                <th scope="col" className="py-1 font-normal">
                  Layout
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  km
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Δ vs Baseline
                </th>
                <th scope="col" className="w-5 py-1">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.key}
                  className={`border-t border-white/5 align-top ${r.isCurrent ? 'bg-you/10' : ''}`}
                  aria-current={r.isCurrent ? 'true' : undefined}
                >
                  <td className="py-1 opacity-60">{i + 1}</td>
                  <td className="max-w-0 py-1 pr-2">
                    <div className={`truncate ${r.kind === 'reference' ? 'text-ghost' : r.isCurrent ? 'text-you' : ''}`}>
                      {r.name}
                      {r.isCurrent && r.kind !== 'current' ? <span className="ml-1 opacity-70">(on floor)</span> : null}
                    </div>
                    <div className="truncate text-[10px] opacity-50" title={r.provenance}>
                      {r.provenance}
                    </div>
                  </td>
                  <td className="py-1 text-right" title={`${Math.round(r.holdoutM).toLocaleString('en-US')} m`}>
                    {formatKm(r.holdoutM)}
                  </td>
                  <td className={`py-1 text-right ${r.delta < 0 ? 'text-gain' : r.delta > 0 ? 'text-loss' : 'opacity-70'}`}>
                    {formatDelta(r.delta)}
                  </td>
                  <td className="py-1 text-right">
                    {savedIds.has(r.key) ? (
                      <button
                        type="button"
                        onClick={() => remove(r.key.slice('saved-'.length))}
                        className="rounded px-1 opacity-40 hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Remove ${r.name}`}
                        title="Remove"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label htmlFor="leaderboard-name" className="sr-only">
          Your name
        </label>
        <input
          id="leaderboard-name"
          value={name}
          maxLength={NAME_MAX}
          placeholder="Your name"
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
          // keep Space / R / 1-3 shortcuts from firing while typing
          onKeyDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-ink/60 px-2 py-1 outline-none focus:border-you/60"
        />
        <button
          type="submit"
          disabled={!fresh}
          title={saveHint ?? 'Save the layout on the floor with its held-out score'}
          className="rounded-md bg-you px-2 py-1 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save my layout
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={exportJson}
          disabled={!data}
          className="rounded-md border border-white/15 px-2 py-1 hover:border-white/30 disabled:opacity-40"
        >
          Export JSON
        </button>
        {hidden > 0 ? (
          <span className="text-right text-[10px] opacity-50">
            {hidden} saved under another routing policy or dataset hidden
          </span>
        ) : null}
      </div>

      <p aria-live="polite" className="mt-1 min-h-4 text-[10px] opacity-70">
        {note || saveHint || ''}
      </p>
    </section>
  )
}
