// Builds docs/pitch/Ghostwalk_pitch.pptx. No number on a slide is typed here:
//   geometry      <- web/src/sim/layout.ts (imported)
//   data counts   <- web/public/data/orders.json (meta, written by data/prepare.py)
//   results       <- eval/results.md (tables copied as they are)
//   SA curve      <- web/public/layouts/sa_seed42.json (written by npm run eval)
//   screenshots   <- docs/pitch/img/{race,slot,anneal}.png (captured from the deployed app)
//   links         <- docs/pitch/deck/links.json
// Missing inputs render as labelled "pending" frames and are listed at the end of the build.
//
//   cd docs/pitch/deck && npm ci && npm run build            (add -- --strict to fail on anything pending)
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'
import QRCode from 'qrcode'
import sharp from 'sharp'
import {
  AISLES,
  BAYS,
  CROSS_AISLE,
  EDGES,
  NODE_COUNT,
  PICK_SECONDS,
  SIDES,
  SLOTS,
  WALK_SPEED,
} from '../../../web/src/sim/layout'
import type { DatasetMeta } from '../../../web/src/sim/types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const at = (p: string) => join(root, p)
const OUT = at('docs/pitch/Ghostwalk_pitch.pptx')
const STRICT = process.argv.includes('--strict')
const pending: string[] = []

// Hard cap on exact routing, from BUILD_SPEC §2 / sim/route.ts (12 nodes including the dock).
const EXACT_MAX_STOPS = 11
const SA_SEED = 42
const SA_ITERATIONS = 30_000

// ---------- theme ----------
const THEME = {
  name: 'Ghostwalk',
  headFontFace: 'Arial',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '0B0F17', // ink: slide background
    lt1: 'E6EDF7', // main text
    dk2: '121826', // panels
    lt2: '8A97AD', // muted text
    accent1: 'FF7A1A', // "you" / solid picker
    accent2: '39D0FF', // ghost
    accent3: '3DDC84', // gain
    accent4: 'FF5470', // loss
    accent5: '1A2233', // raised panel
    accent6: '3B4D6B', // rule / outline
    hlink: '39D0FF',
    folHlink: '8A97AD',
  },
}
const HEX = THEME.colors

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 in
pres.title = 'Ghostwalk: race your old warehouse'
pres.subject = 'NexAI Hack 2026 · PS 4.2 · Warehouse Digital Twin'
pres.author = 'Anand B, Junaid Ahamed'
pres.company = 'Ghostwalk'
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }

const C = pres.SchemeColor
const INK = C.text1
const PANEL = C.text2
const FG = C.background1
const MUTED = C.background2
const YOU = C.accent1
const GHOST = C.accent2
const GAIN = C.accent3
const RAISED = C.accent5
const RULE = C.accent6

const W = 13.333
const M = 0.6
const CONTENT_W = W - 2 * M

// ---------- inputs ----------
const fmt = (n: number) => n.toLocaleString('en-US')
const NBSP = String.fromCharCode(160) // keeps "CC BY 4.0" on one line
const links = JSON.parse(readFileSync(join(here, 'links.json'), 'utf8')) as { repo: string; live: string; video: string }
if (!links.live) pending.push('links.json: live URL (Vercel deploy, #7)')
if (!links.video) pending.push('links.json: video URL (optional YouTube overview, #11)')

const meta = (JSON.parse(readFileSync(at('web/public/data/orders.json'), 'utf8')) as { meta: DatasetMeta }).meta
const stats = meta.stats as Record<string, number>
const coveragePct = `${(stats.coverage_of_month_lines_by_top_skus * 100).toFixed(1)}${NBSP}%`

interface MdTable {
  header: string[]
  rows: string[][]
}

function parseTables(md: string): MdTable[] {
  const tables: MdTable[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\*\*/g, '').replace(/`/g, ''))
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const t: MdTable = { header: cells(lines[i]), rows: [] }
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) t.rows.push(cells(lines[i++]))
      tables.push(t)
    }
  }
  return tables
}

const resultsPath = at('eval/results.md')
const resultsMd = existsSync(resultsPath) ? readFileSync(resultsPath, 'utf8') : null
const resultTables = resultsMd ? parseTables(resultsMd) : []
const heldTable = resultTables.find((t) => t.header.some((h) => /held/i.test(h))) ?? resultTables[0] ?? null
if (!resultsMd) pending.push('eval/results.md (run npm run eval in web/)')
else if (!heldTable) pending.push('eval/results.md has no markdown table to show')

/** "SA vs Baseline" on the first held-out column, computed from the copied table (never typed). */
function headline(t: MdTable | null): { pct: number; col: string } | null {
  if (!t) return null
  const col = t.header.findIndex((h) => /held/i.test(h))
  if (col < 0) return null
  const num = (s: string | undefined) => (s === undefined ? NaN : Number(s.replace(/[^0-9.\-]/g, '')))
  const row = (re: RegExp) => t.rows.find((r) => re.test(r[0]))
  const base = num(row(/^baseline/i)?.[col])
  const sa = num(row(/^(sa|simulated)/i)?.[col])
  if (!Number.isFinite(base) || !Number.isFinite(sa) || base <= 0) return null
  return { pct: ((sa - base) / base) * 100, col: t.header[col] }
}
const head = headline(heldTable)

const saPath = at('web/public/layouts/sa_seed42.json')
const saShipped = existsSync(saPath)
  ? (JSON.parse(readFileSync(saPath, 'utf8')) as { seed: number; iterations: number; curve: [number, number, number][] })
  : null
if (!saShipped) pending.push('web/public/layouts/sa_seed42.json (run npm run eval in web/)')

const shot = (name: string): string | null => {
  const p = at(`docs/pitch/img/${name}.png`)
  if (existsSync(p)) return p
  pending.push(`docs/pitch/img/${name}.png (screenshot from the deployed app)`)
  return null
}

const floorplanPng = await sharp(readFileSync(at('docs/img/floorplan.svg')), { density: 192 }).png().toBuffer()
const floorMeta = await sharp(floorplanPng).metadata()
const floorAspect = (floorMeta.width ?? 1) / (floorMeta.height ?? 1)
const floorData = `image/png;base64,${floorplanPng.toString('base64')}`
const qrData = await QRCode.toDataURL(links.repo, { margin: 1, width: 600, color: { dark: '#0B0F17', light: '#E6EDF7' } })

// ---------- layouts ----------
// Brand motif: the translucent ghost picker behind the solid one. Layout objects cannot be
// ellipses in pptxgenjs, so it is a small transparent PNG.
const motifPng = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="310" height="200" viewBox="0 0 310 200">` +
      `<circle cx="100" cy="100" r="92" fill="#${HEX.accent2}" fill-opacity="0.32" stroke="#${HEX.accent2}" stroke-width="6"/>` +
      `<circle cx="210" cy="100" r="92" fill="#${HEX.accent1}"/></svg>`,
  ),
)
  .png()
  .toBuffer()
const motifData = `image/png;base64,${motifPng.toString('base64')}`
const motif = (x: number, y: number, h: number) => [{ image: { x, y, w: h * 1.55, h, data: motifData, altText: '' } }]

pres.defineSlideMaster({
  title: 'GW_TITLE',
  background: { color: HEX.dk1 },
  objects: [
    ...motif(M, 0.75, 0.55),
    {
      placeholder: {
        options: { name: 'title', type: 'title', x: M, y: 2.35, w: 5.6, h: 1.9, fontSize: 50, bold: true, color: FG, align: 'left', valign: 'top', margin: 0, fontFace: THEME.headFontFace },
        text: '',
      },
    },
  ],
})

pres.defineSlideMaster({
  title: 'GW_CONTENT',
  background: { color: HEX.dk1 },
  margin: [0.5, M, 0.6, M],
  objects: [
    ...motif(W - M - 0.32 * 1.55, 0.66, 0.32),
    {
      placeholder: {
        options: { name: 'title', type: 'title', x: M, y: 0.42, w: CONTENT_W - 1.0, h: 0.8, fontSize: 32, bold: true, color: FG, align: 'left', valign: 'middle', margin: 0, fontFace: THEME.headFontFace },
        text: '',
      },
    },
    { text: { text: 'GHOSTWALK · NexAI Hack 2026 · PS 4.2', options: { x: M, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: MUTED, margin: 0, charSpacing: 2 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: MUTED, align: 'right' },
})

// ---------- helpers ----------
type Slide = ReturnType<typeof pres.addSlide>

const text = (s: Slide, t: Parameters<Slide['addText']>[0], o: Record<string, unknown>) =>
  s.addText(t, { isTextBox: true, margin: 0, fontFace: THEME.bodyFontFace, color: FG, fontSize: 15, valign: 'top', ...o })

const panel = (s: Slide, x: number, y: number, w: number, h: number, name: string, fill = PANEL) =>
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: RULE, width: 0.75 }, objectName: name })

const badge = (s: Slide, x: number, y: number, label: string, color = YOU) => {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color }, line: { color, width: 0 } })
  text(s, label, { x, y, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: INK, align: 'center', valign: 'middle' })
}

function card(s: Slide, x: number, y: number, w: number, h: number, n: string, title: string, body: string, accent = YOU, bodySize = 15) {
  panel(s, x, y, w, h, `card-${title}`)
  badge(s, x + 0.3, y + 0.3, n, accent)
  text(s, title, { x: x + 0.85, y: y + 0.3, w: w - 1.1, h: 0.42, fontSize: 19, bold: true, valign: 'middle', fontFace: THEME.headFontFace })
  text(s, body, { x: x + 0.3, y: y + 0.95, w: w - 0.6, h: h - 1.2, fontSize: bodySize, color: FG })
}

function pendingFrame(s: Slide, x: number, y: number, w: number, h: number, what: string) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.1, fill: { color: RAISED }, line: { color: RULE, width: 1, dashType: 'dash' }, objectName: `pending-${what}` })
  text(s, `Pending: ${what}`, { x: x + 0.3, y, w: w - 0.6, h, fontSize: 14, color: MUTED, align: 'center', valign: 'middle', italic: true })
}

function arrow(s: Slide, x1: number, y1: number, x2: number, y2: number, color = MUTED, both = false) {
  s.addShape(pres.ShapeType.line, {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.max(Math.abs(x2 - x1), 0.001),
    h: Math.max(Math.abs(y2 - y1), 0.001),
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: { color, width: 1.5, endArrowType: 'triangle', ...(both ? { beginArrowType: 'triangle' } : {}) },
  })
}

function box(s: Slide, x: number, y: number, w: number, h: number, label: string, sub = '', fill = RAISED, edge = RULE) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: edge, width: 1 }, objectName: `box-${label}` })
  const runs: { text: string; options: Record<string, unknown> }[] = [{ text: label, options: { bold: true, fontSize: 14, color: FG, breakLine: !!sub } }]
  if (sub) runs.push({ text: sub, options: { fontSize: 11, color: MUTED } })
  text(s, runs, { x: x + 0.1, y, w: w - 0.2, h, align: 'center', valign: 'middle' })
}

const contentSlide = (section: string, title: string) => {
  const s = pres.addSlide({ masterName: 'GW_CONTENT', sectionTitle: section })
  s.addText(title, { placeholder: 'title' })
  return s
}

// ---------- 1. title ----------
pres.addSection({ title: 'Problem' })
{
  const s = pres.addSlide({ masterName: 'GW_TITLE', sectionTitle: 'Problem' })
  text(s, 'GHOSTWALK', { x: M, y: 1.75, w: 6, h: 0.45, fontSize: 16, bold: true, color: YOU, charSpacing: 6, fontFace: THEME.headFontFace })
  s.addText('Race your old warehouse', { placeholder: 'title' })
  text(
    s,
    'A 3D digital twin of a picking floor, driven by one real month of orders. Re-slot the cartons, race the ghost of your old layout, and beat the optimiser, with every gain measured on held-out orders.',
    { x: M, y: 4.35, w: 5.6, h: 1.4, fontSize: 18, color: MUTED },
  )
  text(s, 'NexAI Hack 2026 · Problem 4.2 · Warehouse Digital Twin', { x: M, y: 5.95, w: 5.6, h: 0.35, fontSize: 14, color: FG, bold: true })
  text(s, 'Anand B (@Anandb71) · Junaid Ahamed (@JunaidAhamed-7777)', { x: M, y: 6.35, w: 5.6, h: 0.35, fontSize: 14, color: MUTED })
  const h = 4.8
  const w = h * floorAspect
  s.addImage({ data: floorData, x: W - M - w, y: (7.5 - h) / 2, w, h, altText: 'Floor plan of the declared warehouse: 5 aisles, 100 slots, dock at the front-left', objectName: 'floorplan' })
  s.addNotes(
    'Hook line: same orders, two layouts, and the ghost is our old warehouse. Ghostwalk is a browser 3D twin of a picking floor driven by real November 2011 orders from UCI Online Retail II. The rest of the deck backs up one claim: the walking we save is measured on orders the layout never saw.',
  )
}

// ---------- 2. problem ----------
{
  const s = contentSlide('Problem', 'Slotting decides how far pickers walk')
  const w = (CONTENT_W - 0.8) / 3
  const y = 1.75
  const h = 3.1
  card(s, M, y, w, h, '1', 'The cost', "Every order is a walk from the dock to each product's slot and back. Put the fast movers far away and every single order pays for it.", YOU, 17)
  card(s, M + w + 0.4, y, w, h, '2', 'The ask', 'A browser 3D twin of a picking floor, driven by real orders, where the player re-slots products and the twin shows the walking saved.', GHOST, 17)
  card(s, M + 2 * (w + 0.4), y, w, h, '3', 'The catch', 'The improvement has to be measured by replaying the same orders before and after, not claimed. Walking must follow aisles, never cut through racks.', GAIN, 17)
  panel(s, M, 5.3, CONTENT_W, 1.05, 'answer', RAISED)
  text(s, [
    { text: 'Our answer  ', options: { bold: true, color: YOU } },
    { text: 'replay real invoices on an exact aisle graph, and score every layout on orders it has never seen.', options: { color: FG } },
  ], { x: M + 0.35, y: 5.3, w: CONTENT_W - 0.7, h: 1.05, fontSize: 18, valign: 'middle' })
  s.addNotes(
    "Problem statement PS 4.2 in one line: where each product sits decides how far pickers walk. The core challenge is in card 3. The twin must be driven by real order data, and the gain has to be measured by replaying exactly the same orders before and after. That sentence shaped every design decision we made.",
  )
}

// ---------- 3. data ----------
{
  const s = contentSlide('Problem', 'One real month of orders, cleaned and split')
  const stat = (x: number, y: number, value: string, label: string, color = YOU) => {
    panel(s, x, y, 2.85, 1.95, `stat-${label}`)
    text(s, value, { x: x + 0.25, y: y + 0.25, w: 2.4, h: 0.85, fontSize: 40, bold: true, color, fontFace: THEME.headFontFace, valign: 'middle' })
    text(s, label, { x: x + 0.25, y: y + 1.15, w: 2.4, h: 0.6, fontSize: 14, color: MUTED })
  }
  stat(M, 1.6, fmt(meta.orderCount), 'real invoices replayed')
  stat(M + 3.1, 1.6, fmt(meta.lineCount), 'order lines')
  stat(M, 3.8, fmt(meta.topSkus), 'SKUs slotted (top by order lines)', GHOST)
  stat(M + 3.1, 3.8, coveragePct, "of the month's lines they cover", GHOST)

  const rx = M + 6.6
  const rw = CONTENT_W - 6.6
  text(s, 'Cleaning (whole sheet, Dec 2010 – Dec 2011)', { x: rx, y: 1.6, w: rw, h: 0.4, fontSize: 16, bold: true, fontFace: THEME.headFontFace })
  const rows: [string, string][] = [
    ['raw rows', fmt(stats.raw_rows)],
    ['cancelled invoices removed', fmt(stats.dropped_cancellations)],
    ['quantity ≤ 0 removed', fmt(stats.dropped_nonpositive_qty)],
    ['price ≤ 0 removed', fmt(stats.dropped_nonpositive_price)],
    ['non-product codes removed', fmt(stats.dropped_non_product_codes)],
  ]
  s.addTable(
    rows.map(([k, v]) => [
      { text: k, options: { color: MUTED, fontSize: 14 } },
      { text: v, options: { color: FG, fontSize: 14, align: 'right', bold: true } },
    ]),
    { x: rx, y: 2.1, w: rw, colW: [rw - 1.6, 1.6], rowH: 0.36, fontFace: THEME.bodyFontFace, border: { type: 'none' }, fill: { color: INK }, margin: [0, 0, 0, 0] },
  )

  text(s, `Chronological split of ${meta.month}`, { x: rx, y: 4.15, w: rw, h: 0.4, fontSize: 16, bold: true, fontFace: THEME.headFontFace })
  const total = meta.split.train + meta.split.holdout
  const tw = (rw * meta.split.train) / total
  s.addShape(pres.ShapeType.rect, { x: rx, y: 4.7, w: tw, h: 0.62, fill: { color: GHOST }, line: { color: GHOST, width: 0 }, objectName: 'split-train' })
  s.addShape(pres.ShapeType.rect, { x: rx + tw, y: 4.7, w: rw - tw, h: 0.62, fill: { color: YOU }, line: { color: YOU, width: 0 }, objectName: 'split-holdout' })
  text(s, `train · ${fmt(meta.split.train)}`, { x: rx + 0.15, y: 4.7, w: tw - 0.3, h: 0.62, fontSize: 15, bold: true, color: INK, valign: 'middle' })
  text(s, `held-out · ${fmt(meta.split.holdout)}`, { x: rx + tw + 0.15, y: 4.7, w: rw - tw - 0.3, h: 0.62, fontSize: 15, bold: true, color: INK, valign: 'middle' })
  text(s, '1–15 Nov: the player, heatmap and optimiser see these', { x: rx, y: 5.45, w: tw, h: 0.6, fontSize: 12, color: MUTED })
  text(s, '16–30 Nov: used only for scoring', { x: rx + tw + 0.1, y: 5.45, w: rw - tw - 0.1, h: 0.6, fontSize: 12, color: MUTED })

  text(s, `Chen, D. (2019). Online Retail II. UCI Machine Learning Repository. ${meta.doi}. ${meta.licence}.`, { x: M, y: 6.3, w: CONTENT_W, h: 0.3, fontSize: 11, color: MUTED })
  s.addNotes(
    'Real data: UCI Online Retail II, a UK gift retailer, November 2011. We removed cancellations, returns and adjustments, and postage or fee codes, then kept the 100 most-picked products. That is what the problem statement asks for, and it is why the coverage figure is shown: we slot the top 100, not the whole catalogue. The split is chronological. The first half of November trains, the second half scores.',
  )
}

// ---------- 4. floor ----------
pres.addSection({ title: 'Solution' })
{
  const s = contentSlide('Solution', 'A declared floor, walked only along aisles')
  const h = 5.45
  const w = h * floorAspect
  s.addImage({ data: floorData, x: M, y: 1.4, w, h, altText: 'Floor plan generated from web/src/sim/layout.ts', objectName: 'floorplan' })
  const rx = M + w + 0.45
  const rw = W - M - rx
  const fact = (y: number, value: string, label: string) => {
    text(s, value, { x: rx, y, w: rw, h: 0.55, fontSize: 26, bold: true, color: YOU, fontFace: THEME.headFontFace })
    text(s, label, { x: rx, y: y + 0.55, w: rw, h: 0.6, fontSize: 14, color: MUTED })
  }
  fact(1.45, `${SLOTS} slots`, `${AISLES} aisles × ${SIDES} rack sides × ${BAYS} bays, one SKU per slot`)
  fact(2.75, `${NODE_COUNT} nodes · ${EDGES.length} edges`, 'the only places a picker can walk: no shortcuts through racks')
  fact(4.05, `3 cross-aisles`, `front, middle and back, ${CROSS_AISLE.toFixed(1)} m wide; the dock sits on the front one`)
  fact(5.35, `${WALK_SPEED} m/s · ${PICK_SECONDS} s/line`, 'declared walking speed and pick time')
  text(s, 'Diagram and numbers generated from web/src/sim/layout.ts', { x: rx, y: 6.55, w: rw, h: 0.3, fontSize: 10, color: MUTED, italic: true })
  s.addNotes(
    'The problem statement leaves the warehouse to us, so we declare it. One file, sim/layout.ts, is the single source of truth: the simulator, this diagram and the README table all come from it. Pickers move only on the aisle graph. Both rack sides of a bay share one node, because the picker stands in the aisle and turns.',
  )
}

// ---------- 5. routing ----------
{
  const s = contentSlide('Solution', 'Every order is an exact tour on the aisle graph')
  const steps: [string, string][] = [
    ['Order', 'a real invoice and its lines'],
    ['Stops', "the distinct bay nodes of its products' slots"],
    ['Tour', `Held–Karp, exact up to ${EXACT_MAX_STOPS} stops; NN + 2-opt above, flagged`],
    ['Score', `path expanded edge by edge; seconds = m / ${WALK_SPEED} + ${PICK_SECONDS} × lines`],
  ]
  const bw = 2.6
  const gap = (CONTENT_W - 4 * bw) / 3
  steps.forEach(([t, sub], i) => {
    const x = M + i * (bw + gap)
    panel(s, x, 1.65, bw, 2.0, `step-${t}`, RAISED)
    badge(s, x + 0.25, 1.85, String(i + 1), i === 2 ? GHOST : YOU)
    text(s, t, { x: x + 0.8, y: 1.85, w: bw - 1.0, h: 0.42, fontSize: 20, bold: true, valign: 'middle', fontFace: THEME.headFontFace })
    text(s, sub, { x: x + 0.25, y: 2.45, w: bw - 0.5, h: 1.1, fontSize: 14, color: MUTED })
    if (i < 3) arrow(s, x + bw + 0.08, 2.65, x + bw + gap - 0.08, 2.65, MUTED)
  })
  const cw = (CONTENT_W - 0.4) / 2
  card(
    s, M, 4.05, cw, 2.65, 'HK', 'Held–Karp dynamic programming',
    `dp[mask][j] is the shortest walk from the dock through exactly the stops in mask, ending at j. That is O(2ⁿ·n²): about 250k steps at n = ${EXACT_MAX_STOPS}, under a millisecond. The share of metres routed exactly is reported.`,
    GHOST,
  )
  card(
    s, M + cw + 0.4, 4.05, cw, 2.65, 'S', 'S-shape ablation',
    'What a human picker usually does: walk every aisle that has a pick, end to end. Toggling it separates the gain from routing from the gain from slotting. It can never beat the exact tour, and a test checks that.',
  )
  s.addNotes(
    "Why exact routing matters: if routing is heuristic, a layout can look better just because the heuristic got lucky on it. With exact tours, the difference between two layouts is the layout. Held–Karp is exponential, so we cap it at 11 stops and are open about the rest. The Evidence panel shows how many orders and what share of the metres were exact.",
  )
}

// ---------- 6. the game ----------
{
  const s = contentSlide('Solution', 'Re-slot, replay, race the ghost')
  const shots: [string, string][] = [
    ['race', 'Race: ghost = the layout you started from, solid = yours, same held-out orders'],
    ['slot', 'Slot: click a carton, click another to swap, in 3D or on the 2D map; train and held-out re-score'],
    ['anneal', 'Anneal: the optimiser runs live in a worker, and cartons fly as swaps are accepted'],
  ]
  const sw = (CONTENT_W - 0.8) / 3
  const sh = sw * (9 / 16)
  shots.forEach(([name, caption], i) => {
    const x = M + i * (sw + 0.4)
    const p = shot(name)
    if (p) s.addImage({ path: p, x, y: 1.6, w: sw, h: sh, altText: caption, objectName: `shot-${name}`, sizing: { type: 'cover', w: sw, h: sh } })
    else pendingFrame(s, x, 1.6, sw, sh, `${name}.png`)
    text(s, caption, { x, y: 1.6 + sh + 0.15, w: sw, h: 0.85, fontSize: 14, color: FG })
  })
  const modes = ['Replay', 'Slot', 'Race', 'Anneal', 'Evidence']
  const pw = (CONTENT_W - 4 * 0.45) / 5
  modes.forEach((m, i) => {
    const x = M + i * (pw + 0.45)
    s.addShape(pres.ShapeType.roundRect, { x, y: 5.7, w: pw, h: 0.6, rectRadius: 0.3, fill: { color: i === 2 ? YOU : RAISED }, line: { color: RULE, width: 0.75 }, objectName: `mode-${m}` })
    text(s, m, { x, y: 5.7, w: pw, h: 0.6, fontSize: 16, bold: true, align: 'center', valign: 'middle', color: i === 2 ? INK : FG })
    if (i < modes.length - 1) arrow(s, x + pw + 0.05, 6.0, x + pw + 0.4, 6.0, MUTED)
  })
  text(s, 'Must-haves: replay with live distance and time counters · swap and re-score before / after · automatic fast-movers baseline', { x: M, y: 6.45, w: CONTENT_W, h: 0.35, fontSize: 12, color: MUTED })
  s.addNotes(
    'The game loop. Replay one invoice in 3D. Slot: press Baseline, then make your own swaps. Race your layout against the ghost of the one you started from. Anneal: watch the optimiser play. Evidence: the numbers behind it all. The three must-haves of PS 4.2 are on the bottom line. Heatmap and leaderboard are the stretch goals we built.',
  )
}

// ---------- 7. opponent ----------
{
  const s = contentSlide('Solution', 'The opponent: simulated annealing')
  const steps: [string, string][] = [
    ['Swap', "two SKUs' slots"],
    ['Re-route', 'only the train orders that contain them'],
    ['Accept', 'if shorter, else with probability exp(−Δ/T)'],
    ['Cool', 'T from T₀ to T₀/1000 over the iteration budget'],
  ]
  steps.forEach(([t, sub], i) => {
    const y = 1.6 + i * 1.12
    panel(s, M, y, 4.6, 0.92, `sa-${t}`, RAISED)
    badge(s, M + 0.25, y + 0.25, String(i + 1), GHOST)
    text(s, [
      { text: `${t}  `, options: { bold: true, color: FG } },
      { text: sub, options: { color: MUTED } },
    ], { x: M + 0.85, y, w: 3.6, h: 0.92, fontSize: 15, valign: 'middle' })
  })
  text(
    s,
    `Seed ${SA_SEED} × ${fmt(SA_ITERATIONS)} iterations gives the same layout on any machine. The optimiser sees train orders only.`,
    { x: M, y: 6.15, w: 4.6, h: 0.7, fontSize: 13, color: FG, italic: true },
  )
  const cx = M + 5.0
  const cw = W - M - cx
  if (saShipped && saShipped.curve.length > 1) {
    const step = Math.max(1, Math.ceil(saShipped.curve.length / 120))
    const pts = saShipped.curve.filter((_, i) => i % step === 0 || i === saShipped.curve.length - 1)
    const labels = pts.map(([it]) => fmt(it))
    s.addChart(
      pres.ChartType.line,
      [
        { name: 'current', labels, values: pts.map(([, cur]) => +(cur / 1000).toFixed(3)) },
        { name: 'best so far', labels, values: pts.map(([, , best]) => +(best / 1000).toFixed(3)) },
      ],
      {
        x: cx, y: 1.5, w: cw, h: 5.3,
        chartColors: [HEX.accent6, HEX.accent1],
        lineSize: 2, lineDataSymbol: 'none',
        showTitle: true, title: `Train km, seed ${saShipped.seed}, ${fmt(saShipped.iterations)} iterations (from sa_seed42.json)`,
        titleColor: HEX.lt1, titleFontSize: 14, titleFontFace: '+mn-lt',
        showLegend: true, legendPos: 'b', legendColor: HEX.lt2, legendFontSize: 12, legendFontFace: '+mn-lt',
        catAxisLabelColor: HEX.lt2, valAxisLabelColor: HEX.lt2, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
        catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
        catAxisLabelFrequency: Math.max(1, Math.floor(pts.length / 6)),
        valGridLine: { color: HEX.accent5, size: 0.5 }, catGridLine: { style: 'none' },
        valAxisTitle: 'train km', showValAxisTitle: true, valAxisTitleColor: HEX.lt2, valAxisTitleFontSize: 11, valAxisTitleFontFace: '+mn-lt',
        catAxisTitle: 'iteration', showCatAxisTitle: true, catAxisTitleColor: HEX.lt2, catAxisTitleFontSize: 11, catAxisTitleFontFace: '+mn-lt',
        plotArea: { fill: { color: HEX.dk1 } },
      },
    )
  } else {
    pendingFrame(s, cx, 1.6, cw, 5.0, 'convergence curve from web/public/layouts/sa_seed42.json (npm run eval)')
  }
  s.addNotes(
    "The opponent to beat after Baseline. Simulated annealing swaps two products, re-routes only the orders those products appear in, which is why it is fast, and sometimes accepts a worse layout early on to escape local optima. The budget is iterations, not seconds, so the result is reproducible. It never sees the held-out half.",
  )
}

// ---------- 8. architecture ----------
{
  const s = contentSlide('Solution', 'One simulator: browser, worker and eval')
  box(s, M, 1.5, 2.6, 0.85, 'online_retail_II.xlsx', 'UCI · CC BY 4.0')
  box(s, M + 3.2, 1.5, 2.6, 0.85, 'data/prepare.py', 'pandas · offline')
  box(s, M + 6.4, 1.5, 2.6, 0.85, 'orders.json', 'web/public/data', RAISED, YOU)
  arrow(s, M + 2.6, 1.925, M + 3.2, 1.925)
  arrow(s, M + 5.8, 1.925, M + 6.4, 1.925)

  // browser group
  const bx = M
  const by = 2.85
  const bw = 8.1
  const bh = 3.95
  s.addShape(pres.ShapeType.roundRect, { x: bx, y: by, w: bw, h: bh, rectRadius: 0.1, fill: { color: PANEL }, line: { color: GHOST, width: 1, dashType: 'dash' }, objectName: 'group-browser' })
  text(s, 'Browser · static site on Vercel · no backend', { x: bx + 0.2, y: by + 0.1, w: 5, h: 0.35, fontSize: 12, color: GHOST, bold: true })
  box(s, bx + 2.9, by + 0.55, 2.3, 0.8, 'store.ts', 'zustand state', RAISED, YOU)
  box(s, bx + 0.25, by + 1.85, 3.3, 1.8, 'Web Worker · sim/', 'aisle graph · Held–Karp · S-shape · simulate · layouts · annealing')
  box(s, bx + 3.9, by + 1.85, 1.9, 1.8, 'scene/', 'React Three Fiber: racks, cartons, picker + ghost')
  box(s, bx + 6.0, by + 1.85, 1.85, 1.8, 'ui/', 'KPI · slot map · race · evidence · leaderboard')
  arrow(s, bx + 7.6, 2.35, bx + 4.05, by + 0.55, YOU) // orders.json -> store
  arrow(s, bx + 2.9, by + 1.1, bx + 1.9, by + 1.85, GHOST, true) // store <-> worker
  arrow(s, bx + 4.6, by + 1.35, bx + 4.85, by + 1.85)
  arrow(s, bx + 5.2, by + 1.2, bx + 6.9, by + 1.85)

  // node group
  const nx = M + 8.5
  const nw = W - M - nx
  s.addShape(pres.ShapeType.roundRect, { x: nx, y: by, w: nw, h: bh, rectRadius: 0.1, fill: { color: PANEL }, line: { color: RULE, width: 1, dashType: 'dash' }, objectName: 'group-node' })
  text(s, 'Node · npm run eval', { x: nx + 0.2, y: by + bh - 0.45, w: nw - 0.4, h: 0.35, fontSize: 12, color: MUTED, bold: true })
  const ncx = nx + nw / 2
  box(s, nx + 0.3, by + 0.3, nw - 0.6, 0.8, 'eval/run.ts', 'the same sim/ engine')
  box(s, nx + 0.3, by + 1.4, nw - 0.6, 0.8, 'eval/results.md', '→ README and this deck')
  box(s, nx + 0.3, by + 2.5, nw - 0.6, 0.8, 'sa_seed42.json', '→ shipped SA layout in the app')
  // orders.json -> eval/run.ts: right, then down
  s.addShape(pres.ShapeType.line, { x: M + 9.0, y: 1.925, w: ncx - (M + 9.0), h: 0.001, line: { color: MUTED, width: 1.5 } })
  arrow(s, ncx, 1.925, ncx, by + 0.3)
  arrow(s, ncx, by + 1.1, ncx, by + 1.4)
  // eval/run.ts -> sa_seed42.json, down the right-hand gutter
  const gx = nx + nw - 0.15
  s.addShape(pres.ShapeType.line, { x: gx - 0.15, y: by + 0.7, w: 0.15, h: 0.001, line: { color: MUTED, width: 1.5 } })
  s.addShape(pres.ShapeType.line, { x: gx, y: by + 0.7, w: 0.001, h: 2.2, line: { color: MUTED, width: 1.5 } })
  arrow(s, gx, by + 2.9, gx - 0.15, by + 2.9)
  // sa_seed42.json -> the app (the store loads it as the SA reference)
  arrow(s, nx + 0.3, by + 2.9, bx + bw, by + 2.9, YOU)
  s.addNotes(
    "One simulator everywhere. The engine is plain TypeScript with no DOM. In the browser it runs in a Web Worker so the 3D stays at 60 fps. The scene only plays back paths the simulator produced. The same files run in Node for npm run eval, which writes the results this deck and the README quote, plus the shipped SA layout.",
  )
}

// ---------- 9. results ----------
pres.addSection({ title: 'Evidence' })
{
  const s = contentSlide('Evidence', 'Results on held-out orders (16–30 Nov)')
  if (heldTable) {
    const lx = M
    let tx = M
    if (head) {
      panel(s, lx, 1.6, 3.6, 3.0, 'headline', RAISED)
      const good = head.pct < 0
      text(s, `${head.pct > 0 ? '+' : head.pct < 0 ? '−' : ''}${Math.abs(head.pct).toFixed(1)} %`, {
        x: lx + 0.3, y: 1.85, w: 3.0, h: 1.2, fontSize: 54, bold: true, color: good ? GAIN : C.accent4, fontFace: THEME.headFontFace,
      })
      text(s, `SA vs Baseline, ${head.col}`, { x: lx + 0.3, y: 3.1, w: 3.0, h: 0.5, fontSize: 15, color: FG, bold: true })
      text(s, 'walking distance on orders neither layout was built from', { x: lx + 0.3, y: 3.6, w: 3.0, h: 0.8, fontSize: 13, color: MUTED })
      tx = M + 4.0
    }
    const tw = W - M - tx
    const cols = heldTable.header.length
    const rows = [
      heldTable.header.map((h) => ({ text: h, options: { bold: true, color: MUTED, fontSize: 13, fill: { color: HEX.dk2 } } })),
      ...heldTable.rows.slice(0, 9).map((r) =>
        r.map((c, j) => ({ text: c, options: { color: /^baseline/i.test(r[0]) ? HEX.accent2 : HEX.lt1, fontSize: 13, bold: j === 0, align: (j === 0 ? 'left' : 'right') as 'left' | 'right' } })),
      ),
    ]
    s.addTable(rows, {
      x: tx, y: 1.6, w: tw, colW: Array.from({ length: cols }, (_, j) => (j === 0 ? tw * 0.3 : (tw * 0.7) / (cols - 1))),
      fontFace: THEME.bodyFontFace, rowH: 0.4, border: { type: 'solid', pt: 0.5, color: HEX.accent5 }, fill: { color: HEX.dk1 }, margin: [0.04, 0.08, 0.04, 0.08],
    })
    text(s, 'Copied from eval/results.md, produced by npm run eval with the same engine as the app. No number on this slide is typed by hand.', { x: M, y: 6.3, w: CONTENT_W, h: 0.4, fontSize: 11, color: MUTED, italic: true })
  } else {
    pendingFrame(s, M, 1.6, CONTENT_W, 4.9, 'held-out results table from eval/results.md (run npm run eval in web/, then rebuild this deck)')
  }
  s.addNotes(
    'Read the headline as the held-out gain versus Baseline, the layout the problem statement told us to beat. Original and Random are there so nobody can say we picked a weak starting point. SA is reported over several seeds in eval/results.md, so the spread is visible.',
  )
}

// ---------- 10. honesty ----------
{
  const s = contentSlide('Evidence', 'Built so the numbers can be trusted')
  const cw = (CONTENT_W - 0.4) / 2
  const ch = 2.4
  card(s, M, 1.55, cw, ch, '1', 'Held-out split', 'Layouts are built on 1–15 Nov and scored on 16–30 Nov. The split is chronological, the way a real warehouse re-slots on the past and lives with the future.', GHOST, 17)
  card(s, M + cw + 0.4, 1.55, cw, ch, '2', 'Baseline is the target', 'The headline is the gain vs fast movers nearest the dock, ranked by train picks. Original (catalogue order) and Random (seed 42) are shown, but second.', YOU, 17)
  card(s, M, 4.3, cw, ch, '3', 'Exact routing, limits reported', `Held–Karp up to ${EXACT_MAX_STOPS} stops, NN + 2-opt above, flagged per order. The Evidence panel prints the exact share of metres.`, GAIN, 17)
  card(s, M + cw + 0.4, 4.3, cw, ch, '4', 'Deterministic, one simulator', 'No Math.random or Date.now in the engine; mulberry32 with the seed on screen. The worker, the 3D playback and npm run eval share one engine.', GHOST, 17)
  s.addNotes(
    'These are the four questions we expect from judges, answered by design rather than by argument. The Q&A cards in docs/pitch go deeper on each.',
  )
}

// ---------- 11. limitations ----------
{
  const s = contentSlide('Evidence', 'What we assumed, and what we did not build')
  const cw = (CONTENT_W - 0.4) / 2
  panel(s, M, 1.55, cw, 4.75, 'assumed')
  text(s, 'Declared, not observed', { x: M + 0.35, y: 1.8, w: cw - 0.7, h: 0.45, fontSize: 20, bold: true, color: YOU, fontFace: THEME.headFontFace })
  text(s, [
    { text: 'The warehouse geometry is ours. The orders are real; the building is not.', options: { bullet: true, breakLine: true } },
    { text: `The time model is synthetic: metres / ${WALK_SPEED}${NBSP}m/s + ${PICK_SECONDS}${NBSP}s per line. No acceleration, search or queueing.`, options: { bullet: true, breakLine: true } },
    { text: `Only the top ${meta.topSkus} SKUs are slotted. They cover ${coveragePct} of the month's lines, and other lines are left out.`, options: { bullet: true, breakLine: true } },
    { text: 'One retailer, one pre-Christmas month: gains may differ in other seasons or sectors.', options: { bullet: true } },
  ], { x: M + 0.35, y: 2.45, w: cw - 0.7, h: 3.7, fontSize: 17, paraSpaceAfter: 12 })

  const rx = M + cw + 0.4
  panel(s, rx, 1.55, cw, 4.75, 'not-built')
  text(s, 'Not built (yet)', { x: rx + 0.35, y: 1.8, w: cw - 0.7, h: 0.45, fontSize: 20, bold: true, color: GHOST, fontFace: THEME.headFontFace })
  text(s, [
    { text: 'Batch picking: one trip serving several orders.', options: { bullet: true, breakLine: true } },
    { text: 'Several pickers with congestion in narrow aisles.', options: { bullet: true, breakLine: true } },
    { text: 'Rack levels, carton sizes and weights.', options: { bullet: true, breakLine: true } },
    { text: `Exact routing above ${EXACT_MAX_STOPS} stops: those orders use a heuristic, and their share is reported.`, options: { bullet: true } },
  ], { x: rx + 0.35, y: 2.45, w: cw - 0.7, h: 3.7, fontSize: 17, paraSpaceAfter: 12 })
  s.addNotes('Read these aloud in the demo. Stating limits plainly is part of the result.')
}

// ---------- 12. close ----------
pres.addSection({ title: 'Close' })
{
  const s = contentSlide('Close', 'Thank you. Questions?')
  const lw = 7.4
  const linkRow = (y: number, label: string, value: string, url?: string) => {
    text(s, label, { x: M, y, w: 1.4, h: 0.45, fontSize: 15, color: MUTED, valign: 'middle' })
    text(s, url ? [{ text: value, options: { hyperlink: { url }, color: GHOST } }] : value, { x: M + 1.45, y, w: lw - 1.45, h: 0.45, fontSize: 17, bold: true, valign: 'middle' })
  }
  linkRow(1.65, 'Repository', links.repo.replace(/^https?:\/\//, ''), links.repo)
  if (links.live) linkRow(2.2, 'Live app', links.live.replace(/^https?:\/\//, ''), links.live)
  else linkRow(2.2, 'Live app', 'pending deploy')
  if (links.video) linkRow(2.75, 'Overview', links.video.replace(/^https?:\/\//, ''), links.video)

  const tw = (lw - 0.4) / 2
  const team: [string, string, string][] = [
    ['Anand B', '@Anandb71', 'engine, worker, 3D scene, core UI, integration and deploy'],
    ['Junaid Ahamed', '@JunaidAhamed-7777', 'leaderboard, README and docs, pitch deck, demo, posts'],
  ]
  team.forEach(([n, gh, role], i) => {
    const x = M + i * (tw + 0.4)
    panel(s, x, 3.55, tw, 1.95, `team-${n}`)
    text(s, n, { x: x + 0.3, y: 3.75, w: tw - 0.6, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace })
    text(s, gh, { x: x + 0.3, y: 4.2, w: tw - 0.6, h: 0.35, fontSize: 14, color: GHOST })
    text(s, role, { x: x + 0.3, y: 4.65, w: tw - 0.6, h: 0.75, fontSize: 14, color: MUTED })
  })
  text(s, `Built with Claude Code (Anthropic), declared in the README and DEV_LOG. Data: UCI Online Retail II, CC${NBSP}BY${NBSP}4.0. Code: MIT.`, {
    x: M, y: 6.1, w: lw, h: 0.6, fontSize: 12, color: MUTED,
  })
  const q = 3.3
  panel(s, W - M - q - 0.3, 1.6, q + 0.3, q + 0.95, 'qr-panel', RAISED)
  s.addImage({ data: qrData, x: W - M - q - 0.15, y: 1.75, w: q, h: q, altText: `QR code for ${links.repo}`, objectName: 'qr-repo' })
  text(s, 'Scan for the repo', { x: W - M - q - 0.3, y: 1.75 + q + 0.15, w: q + 0.3, h: 0.45, fontSize: 14, color: FG, align: 'center' })
  s.addNotes('Close on the links and hand over for questions. Both of us can explain every module; see docs/pitch/qa_cards.md.')
}

// ---------- write + theme ----------
await pres.writeFile({ fileName: OUT })

{
  const require = createRequire(import.meta.url)
  const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))
  const zip = await JSZip.loadAsync(readFileSync(OUT))
  const part = 'ppt/theme/theme1.xml'
  const xml: string = await zip.file(part).async('string')
  const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const
  const scheme = `<a:clrScheme name="${THEME.name}">${slots.map((k) => `<a:${k}><a:srgbClr val="${HEX[k]}"/></a:${k}>`).join('')}</a:clrScheme>`
  const themed = xml
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_: string, h: string) => `${h}${THEME.name}"`)
  if (!themed.includes(scheme)) throw new Error('theme1.xml has no clrScheme to replace')
  zip.file(part, themed)
  // a scheme color passed to a hex-only option is written as srgbClr val="tx1": not a colour
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.xml')) continue
    const body: string = await zip.file(name).async('string')
    const bad = body.match(/<a:srgbClr val="(?![0-9A-Fa-f]{6}")[^"]*"/)
    if (bad) throw new Error(`${name}: ${bad[0]} is not a hex colour (scheme colour in a hex-only option)`)
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(OUT, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

console.log(`wrote ${relative(root, OUT)}`)
if (pending.length) {
  console.log(`\npending (${pending.length}):`)
  for (const p of pending) console.log(`  - ${p}`)
  if (STRICT) process.exit(1)
} else {
  console.log('nothing pending')
}
