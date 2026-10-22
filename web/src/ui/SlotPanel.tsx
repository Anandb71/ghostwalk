import { DOCK, dist, slotAisle, slotBay, slotNode, slotSide } from '../sim'
import { LAYOUT_LABEL, displayAssignment, slotToSku, useStore } from '../store'
import { heatColor } from './heat'
import { Button, Panel } from './primitives'
import SlotMap from './SlotMap'

function SlotInfo({ slot, tag }: { slot: number; tag: string }) {
  const data = useStore((s) => s.data)
  const assignment = useStore(displayAssignment)
  if (!data || !assignment) return null
  const sku = slotToSku(assignment)[slot]
  const p = sku >= 0 ? data.products[sku] : null
  const where = `A${slotAisle(slot) + 1} · ${slotSide(slot) === 0 ? 'left' : 'right'} · bay ${slotBay(slot) + 1}`
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/40">{tag}</span>
      {p && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: heatColor(p.rank) }} />}
      <span className="min-w-0 flex-1 truncate text-white/85" title={p?.desc}>
        {p ? `#${p.rank} ${p.desc}` : 'empty'}
      </span>
      <span className="tabular shrink-0 text-white/45">
        {where} · {Math.round(dist(DOCK, slotNode(slot)))} m
      </span>
    </div>
  )
}

export default function SlotPanel() {
  const selectedSlot = useStore((s) => s.selectedSlot)
  const hoverSlot = useStore((s) => s.hoverSlot)
  const undoCount = useStore((s) => s.undo.length)
  const undoSwap = useStore((s) => s.undoSwap)
  const resetTo = useStore((s) => s.resetTo)
  const hasSA = useStore((s) => s.layouts.sa !== null)
  const startedFrom = useStore((s) => s.startedFrom)
  const annealing = useStore((s) => s.anneal.running)
  const selectSlot = useStore((s) => s.selectSlot)

  return (
    <Panel
      title="Slot · re-slot the floor"
      right={<span className="text-[10px] text-white/40">started from {LAYOUT_LABEL[startedFrom]}</span>}
    >
      <p className="mb-2 text-[11px] leading-snug text-white/55">
        Click a carton, then another: they swap and both months re-score. Colour = pick rank (hot = picked most, by train
        orders). Numbers mark the top 10.
      </p>
      <div className="rounded-lg border border-white/[0.06] bg-black/25 p-1.5">
        <SlotMap interactive={!annealing} />
      </div>

      <div className="mt-2 min-h-[38px] space-y-1">
        {selectedSlot !== null ? (
          <SlotInfo slot={selectedSlot} tag="Selected" />
        ) : (
          <div className="text-[11px] text-white/40">Nothing selected. Esc clears a selection.</div>
        )}
        {hoverSlot !== null && hoverSlot !== selectedSlot && <SlotInfo slot={hoverSlot} tag="Hover" />}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <Button onClick={undoSwap} disabled={!undoCount || annealing} title="Undo the last swap">
          Undo{undoCount ? ` (${undoCount})` : ''}
        </Button>
        <Button onClick={() => selectSlot(null)} disabled={selectedSlot === null}>
          Clear selection
        </Button>
        <Button onClick={() => resetTo('original')} disabled={annealing} title="Catalogue order: SKUs by StockCode, aisle by aisle">
          Start from Original
        </Button>
        <Button onClick={() => resetTo('baseline')} disabled={annealing} title="Fast movers (train picks) nearest the dock">
          Start from Baseline
        </Button>
        <Button
          className="col-span-2"
          tone="ghost"
          onClick={() => resetTo('sa')}
          disabled={!hasSA || annealing}
          title={hasSA ? 'Load the simulated-annealing layout' : 'No SA layout yet: run Anneal'}
        >
          Apply SA layout
        </Button>
      </div>
    </Panel>
  )
}
