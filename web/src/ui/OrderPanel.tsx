import { useMemo } from 'react'
import { slotBay } from '../sim'
import { useStore } from '../store'
import { fmtTs } from './format'
import { heatColor } from './heat'
import { Badge, Button, Panel, Stat } from './primitives'

export default function OrderPanel() {
  const data = useStore((s) => s.data)
  const orderIdx = useStore((s) => s.replay.orderIdx)
  const plan = useStore((s) => s.replay.plan)
  const policy = useStore((s) => s.policy)
  const assignment = useStore((s) => s.assignment)
  const hero = useStore((s) => s.heroOrderIdx)
  const setOrder = useStore((s) => s.setOrder)

  const order = data?.orders[orderIdx] ?? null

  const lines = useMemo(() => {
    if (!data || !order) return []
    return order.skus.map((sku, i) => ({ sku, product: data.products[sku], qty: order.qtys[i] ?? 0 }))
  }, [data, order])

  const frontHalf = useMemo(() => {
    if (!assignment || !order) return null
    return order.skus.filter((sku) => slotBay(assignment[sku]) < 5).length
  }, [assignment, order])

  /** Next / previous order in the same split, so held-out stays held-out. */
  const step = (dir: 1 | -1) => {
    if (!data || !order) return
    const list = order.split === 'holdout' ? data.holdout : data.train
    const pos = list.indexOf(orderIdx)
    const next = list[pos + dir]
    if (next !== undefined) setOrder(next)
    else setOrder(orderIdx + dir)
  }

  if (!data || !order) {
    return (
      <Panel title="Order">
        <p className="text-xs text-white/50">Waiting for the dataset…</p>
      </Panel>
    )
  }

  const routeBadge = !plan ? null : policy === 'sshape' ? (
    <Badge tone="ghost">S-shape</Badge>
  ) : plan.exact ? (
    <Badge tone="gain">exact · Held–Karp</Badge>
  ) : (
    <Badge tone="you">heuristic · NN + 2-opt</Badge>
  )

  return (
    <Panel
      title="Replay · one real order"
      right={
        <div className="flex items-center gap-1">
          <Button tone="quiet" onClick={() => step(-1)} aria-label="Previous order" title="Previous order in this split">
            ‹ Prev
          </Button>
          <Button tone="quiet" onClick={() => step(1)} aria-label="Next order" title="Next order in this split">
            Next ›
          </Button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Invoice</div>
          <div className="tabular text-lg font-semibold leading-tight text-white">#{order.id}</div>
          <div className="text-[11px] text-white/55">{fmtTs(order.ts)}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={order.split === 'holdout' ? 'ghost' : 'default'}>{order.split === 'holdout' ? 'held-out' : 'train'}</Badge>
          {routeBadge}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
        <Stat label="Lines">{order.skus.length}</Stat>
        <Stat label="Stops">{plan ? plan.picks.length : '—'}</Stat>
        <Stat label="Route">{plan ? `${Math.round(plan.m)} m` : '—'}</Stat>
      </div>
      {plan && (
        <p className="tabular mt-1.5 text-[11px] text-white/45">
          {Math.round(plan.m)} m ÷ 1.2 m/s + {order.skus.length} × 8 s = {Math.round(plan.s)} s
          {frontHalf !== null && (
            <>
              {' '}
              · {frontHalf} of {order.skus.length} lines in the front block
            </>
          )}
        </p>
      )}

      <ul className="mt-2.5 max-h-[34vh] space-y-0.5 overflow-y-auto pr-1">
        {lines.map(({ sku, product, qty }) => (
          <li key={sku} className="flex items-center gap-2 rounded px-1 py-1 text-[12px] hover:bg-white/[0.04]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: heatColor(product?.rank ?? 100) }} />
            <span className="tabular w-[52px] shrink-0 text-white/50">{product?.sku ?? sku}</span>
            <span className="min-w-0 flex-1 truncate text-white/85" title={product?.desc}>
              {product?.desc ?? '?'}
            </span>
            <span className="tabular shrink-0 text-white/55">×{qty}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <Button onClick={() => setOrder(hero)} disabled={orderIdx === hero} title="First held-out order with 6–9 lines">
          Hero order
        </Button>
        <span className="text-[10px] text-white/40">Space play/pause · route never crosses a rack</span>
      </div>
    </Panel>
  )
}
