// Draws docs/img/floorplan.svg from the engine's own geometry (web/src/sim/layout.ts), so the
// README diagram can never disagree with the simulator. Run from web/: npx tsx ../scripts/floorplan.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AISLES,
  AISLE_PITCH,
  BACK_Z,
  BAYS,
  BAY_PITCH,
  CROSS_AISLE,
  DOCK,
  DOCK_X,
  DOCK_Z,
  EDGES,
  FRONT_Z,
  MIDDLE_Z,
  NODES,
  NODE_COUNT,
  PICK_SECONDS,
  RACK_DEPTH,
  RACK_OFFSET,
  SIDES,
  SLOTS,
  WALKWAY,
  WALK_SPEED,
  aisleX,
  bayZ,
  dist,
  frontNode,
  nodePosition,
  slotPosition,
} from '../web/src/sim/layout'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'img', 'floorplan.svg')

const S = 26 // px per metre
const XMIN = DOCK_X - 2.5
const XMAX = aisleX(AISLES - 1) + RACK_OFFSET + RACK_DEPTH / 2 + 2.5
const ZMIN = FRONT_Z - CROSS_AISLE / 2 - 0.5
const ZMAX = BACK_Z + CROSS_AISLE / 2 + 0.5
const ML = 104 // room for the cross-aisle dimension on the left
const MR = 80 // room for the bay-pitch dimension on the right
const MT = 96 // title + aisle-pitch dimension
const MB = 64 // aisle labels + footer
const W = Math.round(ML + (XMAX - XMIN) * S + MR)
const H = Math.round(MT + (ZMAX - ZMIN) * S + MB)

const px = (x: number) => +(ML + (x - XMIN) * S).toFixed(1)
const py = (z: number) => +(MT + (ZMAX - z) * S).toFixed(1) // front (dock) at the bottom
const m = (v: number) => `${v.toFixed(1)} m`

const C = {
  bg: '#0b0f17',
  floor: '#121826',
  band: '#1a2233',
  rack: '#24324a',
  rackEdge: '#3b4d6b',
  text: '#e6edf7',
  muted: '#8a97ad',
  edge: '#ff7a1a',
  junction: '#39d0ff',
  dim: '#c3cede',
}

const parts: string[] = []
const add = (s: string) => parts.push(s)
const text = (x: number, y: number, s: string, opts = '') =>
  add(`<text x="${x}" y="${y}" ${opts}>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`)

// Arrowed dimension line with a centred label (horizontal or vertical).
function dimension(x1: number, y1: number, x2: number, y2: number, label: string, labelAt: [number, number], anchor = 'middle') {
  add(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.dim}" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`)
  text(labelAt[0], labelAt[1], label, `fill="${C.dim}" font-size="12" text-anchor="${anchor}"`)
}

add(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`)
add(
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${C.dim}"/></marker></defs>`,
)
text(ML, 30, `Ghostwalk floor plan (declared): ${AISLES} aisles × ${SIDES} sides × ${BAYS} bays = ${SLOTS} slots`, `fill="${C.text}" font-size="17" font-weight="600"`)

// floor and cross-aisles
add(`<rect x="${px(XMIN)}" y="${py(ZMAX)}" width="${(XMAX - XMIN) * S}" height="${(ZMAX - ZMIN) * S}" rx="6" fill="${C.floor}"/>`)
const bands: [number, string][] = [
  [FRONT_Z, 'front cross-aisle'],
  [MIDDLE_Z, 'middle cross-aisle'],
  [BACK_Z, 'back cross-aisle'],
]
for (const [z, label] of bands) {
  add(`<rect x="${px(XMIN)}" y="${py(z + CROSS_AISLE / 2)}" width="${(XMAX - XMIN) * S}" height="${CROSS_AISLE * S}" fill="${C.band}"/>`)
  text(px(XMAX) - 8, py(z) - 6, label, `fill="${C.muted}" font-size="11" text-anchor="end"`)
}

// racks: one cell per slot, labelled with its slot id (aisle*20 + side*10 + bay)
for (let s = 0; s < SLOTS; s++) {
  const p = slotPosition(s)
  const x = px(p.x - RACK_DEPTH / 2)
  const y = py(p.z + BAY_PITCH / 2)
  add(`<rect x="${x}" y="${y}" width="${RACK_DEPTH * S}" height="${BAY_PITCH * S}" fill="${C.rack}" stroke="${C.rackEdge}" stroke-width="1"/>`)
  text(px(p.x), py(p.z) + 4, String(s), `fill="${C.muted}" font-size="10" text-anchor="middle"`)
}

// walking graph: pickers move only along these edges
for (const [u, v] of EDGES) {
  const a = nodePosition(u)
  const b = nodePosition(v)
  add(`<line x1="${px(a.x)}" y1="${py(a.z)}" x2="${px(b.x)}" y2="${py(b.z)}" stroke="${C.edge}" stroke-opacity="0.55" stroke-width="1.5"/>`)
}
for (const n of NODES) {
  if (n.kind === 'dock') continue
  const r = n.kind === 'bay' ? 2.5 : 3.5
  add(`<circle cx="${px(n.x)}" cy="${py(n.z)}" r="${r}" fill="${n.kind === 'bay' ? C.edge : C.junction}"/>`)
}

// dock (packing station)
const dockSize = 1.6
add(
  `<rect x="${px(DOCK_X - dockSize / 2)}" y="${py(DOCK_Z + dockSize / 2)}" width="${dockSize * S}" height="${dockSize * S}" rx="3" fill="${C.text}"/>`,
)
text(px(DOCK_X), py(DOCK_Z) + 4, 'DOCK', `fill="${C.bg}" font-size="10" font-weight="700" text-anchor="middle"`)

// aisle labels
for (let a = 0; a < AISLES; a++) text(px(aisleX(a)), py(ZMIN) + 18, `Aisle ${a}`, `fill="${C.text}" font-size="12" text-anchor="middle"`)

// dimensions
const yTop = py(ZMAX) - 18
dimension(px(aisleX(0)), yTop, px(aisleX(1)), yTop, `${m(AISLE_PITCH)} aisle pitch`, [px(aisleX(0) + AISLE_PITCH / 2), yTop - 7])
const wx = aisleX(2)
dimension(px(wx - WALKWAY / 2), yTop, px(wx + WALKWAY / 2), yTop, `${m(WALKWAY)} walkway`, [px(wx), yTop - 7])
const bx = px(aisleX(AISLES - 1) + RACK_OFFSET + RACK_DEPTH / 2) + 16
dimension(bx, py(bayZ(0) - BAY_PITCH / 2), bx, py(bayZ(0) + BAY_PITCH / 2), `${m(BAY_PITCH)} bay`, [bx + 8, py(bayZ(0)) + 4], 'start')
const cx = px(XMIN) - 16
dimension(cx, py(MIDDLE_Z - CROSS_AISLE / 2), cx, py(MIDDLE_Z + CROSS_AISLE / 2), m(CROSS_AISLE), [cx - 6, py(MIDDLE_Z) + 4], 'end')
text(cx - 6, py(MIDDLE_Z) + 18, 'cross-aisle', `fill="${C.dim}" font-size="11" text-anchor="end"`)

// legend + footer
const ly = H - 22
add(`<circle cx="${ML + 6}" cy="${ly - 4}" r="3.5" fill="${C.junction}"/>`)
text(ML + 16, ly, 'junction', `fill="${C.muted}" font-size="12"`)
add(`<circle cx="${ML + 86}" cy="${ly - 4}" r="2.5" fill="${C.edge}"/>`)
text(ML + 96, ly, 'bay node (both rack sides share it)', `fill="${C.muted}" font-size="12"`)
text(
  ML + 320,
  ly,
  `walking graph: ${NODE_COUNT} nodes, ${EDGES.length} edges · dock → aisle 0 = ${m(dist(DOCK, frontNode(0)))} · ${WALK_SPEED} m/s · ${PICK_SECONDS} s per line`,
  `fill="${C.muted}" font-size="12"`,
)

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
  `font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" role="img" ` +
  `aria-label="Floor plan: ${AISLES} aisles, ${SLOTS} slots, dock at the front-left, three cross-aisles">\n` +
  parts.join('\n') +
  '\n</svg>\n'

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, svg)
console.log(`wrote ${out} (${W}×${H})`)
