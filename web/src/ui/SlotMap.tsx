import { memo, useMemo } from 'react'
import {
  AISLES,
  AISLE_PITCH,
  BACK_Z,
  BAYS,
  DOCK_X,
  DOCK_Z,
  FRONT_Z,
  MIDDLE_Z,
  SIDES,
  slotId,
  slotPosition,
  type Product,
} from '../sim'
import { displayAssignment, slotToSku, useStore } from '../store'
import { heatColor } from './heat'

// World (x, z) -> SVG: x stays, z is flipped so the front cross-aisle and the dock sit at the bottom.
const Y0 = 19
const sy = (z: number) => Y0 - z
const CELL_W = 0.92
const CELL_H = 1.08

interface CellProps {
  slot: number
  x: number
  y: number
  fill: string
  label: string | null
  title: string
  selected: boolean
  hovered: boolean
}

const Cell = memo(function Cell({ slot, x, y, fill, label, title, selected, hovered }: CellProps) {
  return (
    <g data-slot={slot}>
      <rect
        x={x - CELL_W / 2}
        y={y - CELL_H / 2}
        width={CELL_W}
        height={CELL_H}
        rx={0.14}
        fill={fill}
        stroke={selected ? '#ffffff' : hovered ? '#39d0ff' : 'rgba(0,0,0,0.35)'}
        strokeWidth={selected ? 0.2 : hovered ? 0.16 : 0.05}
      >
        <title>{title}</title>
      </rect>
      {label && (
        <text x={x} y={y + 0.2} textAnchor="middle" fontSize={0.52} fontWeight={700} fill="rgba(10,12,20,0.85)" pointerEvents="none">
          {label}
        </text>
      )}
    </g>
  )
})

export default function SlotMap({ interactive = true }: { interactive?: boolean }) {
  const data = useStore((s) => s.data)
  const assignment = useStore(displayAssignment)
  const selectedSlot = useStore((s) => s.selectedSlot)
  const hoverSlot = useStore((s) => s.hoverSlot)
  const selectSlot = useStore((s) => s.selectSlot)
  const setHover = useStore((s) => s.setHover)

  const products: readonly Product[] = data?.products ?? []
  const inv = useMemo(() => (assignment ? slotToSku(assignment) : null), [assignment])

  const cells = useMemo(() => {
    const out: { slot: number; x: number; y: number; sku: number }[] = []
    for (let a = 0; a < AISLES; a++)
      for (let side = 0; side < SIDES; side++)
        for (let b = 0; b < BAYS; b++) {
          const slot = slotId(a, side, b)
          const p = slotPosition(slot)
          out.push({ slot, x: p.x, y: sy(p.z), sku: inv ? inv[slot] : -1 })
        }
    return out
  }, [inv])

  const xMin = DOCK_X - 2.2
  const xMax = (AISLES - 1) * AISLE_PITCH + 3
  const yMin = sy(BACK_Z + 2.2)
  const yMax = sy(FRONT_Z - 2.6)

  return (
    <svg
      viewBox={`${xMin} ${yMin} ${xMax - xMin} ${yMax - yMin}`}
      className="block w-full select-none"
      role="img"
      aria-label="Slot map: 5 aisles, 2 rack sides, 10 bays; click two cartons to swap them"
      onPointerLeave={() => interactive && setHover(null)}
    >
      {/* cross-aisles */}
      {[FRONT_Z, MIDDLE_Z, BACK_Z].map((z) => (
        <rect key={z} x={-1.5} y={sy(z) - 2} width={(AISLES - 1) * AISLE_PITCH + 3} height={4} fill="rgba(255,255,255,0.035)" />
      ))}
      {/* aisle walkways */}
      {Array.from({ length: AISLES }, (_, a) => (
        <g key={a}>
          <rect x={a * AISLE_PITCH - 1.5} y={sy(BACK_Z)} width={3} height={BACK_Z - FRONT_Z} fill="rgba(255,255,255,0.03)" />
          <line
            x1={a * AISLE_PITCH}
            x2={a * AISLE_PITCH}
            y1={sy(BACK_Z)}
            y2={sy(FRONT_Z)}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={0.06}
            strokeDasharray="0.3 0.3"
          />
          <text x={a * AISLE_PITCH} y={sy(FRONT_Z) + 2.0} textAnchor="middle" fontSize={0.75} fill="rgba(255,255,255,0.45)">
            A{a + 1}
          </text>
        </g>
      ))}
      {/* dock */}
      <g>
        <line x1={DOCK_X} x2={0} y1={sy(DOCK_Z)} y2={sy(DOCK_Z)} stroke="rgba(255,122,26,0.5)" strokeWidth={0.08} />
        <rect x={DOCK_X - 1.3} y={sy(DOCK_Z) - 0.9} width={2.6} height={1.8} rx={0.25} fill="rgba(255,122,26,0.18)" stroke="#ff7a1a" strokeWidth={0.1} />
        <text x={DOCK_X} y={sy(DOCK_Z) + 0.25} textAnchor="middle" fontSize={0.62} fontWeight={700} fill="#ff7a1a">
          DOCK
        </text>
      </g>

      {/* cartons */}
      <g
        style={{ cursor: interactive ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (!interactive) return
          const slot = Number((e.target as Element).closest('[data-slot]')?.getAttribute('data-slot'))
          if (Number.isFinite(slot)) selectSlot(slot)
        }}
        onPointerOver={(e) => {
          if (!interactive) return
          const attr = (e.target as Element).closest('[data-slot]')?.getAttribute('data-slot')
          if (attr != null) setHover(Number(attr))
        }}
      >
        {cells.map(({ slot, x, y, sku }) => {
          const p = sku >= 0 ? products[sku] : undefined
          return (
            <Cell
              key={slot}
              slot={slot}
              x={x}
              y={y}
              fill={p ? heatColor(p.rank, products.length || 100) : '#1a2133'}
              label={p && p.rank <= 10 ? String(p.rank) : null}
              title={p ? `#${p.rank} ${p.sku} ${p.desc} · ${p.picksTrain} train picks` : `slot ${slot}`}
              selected={selectedSlot === slot}
              hovered={hoverSlot === slot}
            />
          )
        })}
      </g>
    </svg>
  )
}
