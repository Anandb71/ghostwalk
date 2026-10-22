// Port of the handbook Floor Lab carton models (interactive/lab3d/models.js @ 29e6039), typed for three 0.186.
//
// GPU resources for Cartons.tsx: a unit carton box with a corrugated-board atlas (tape, hand hole,
// "this way up" print) tinted per instance by kraft colours, and a 10 x 10 label atlas with one
// shipping label per sku (SKU, description, Code 39 barcode, TRAIN rank). Two instanced draws
// (bodies, labels). Heat is a uniform: uHeat 0 = plain cardboard, 1 = tinted by train rank with the
// app ramp (shared.ts rankColor, the same stops as ui/heat.ts and the 2D slot map) plus a gentle
// emissive. Cartons.tsx eases uHeat toward store.showHeat and writes the instance matrices with the
// allocation-free write* helpers below. dispose() frees GPU resources only (StrictMode safe).
import * as THREE from 'three'
import { aisleX, bayZ, RACK_OFFSET, SLOTS, slotAisle, slotBay, slotSide } from '../../sim/layout'
import type { Product } from '../../sim/types'
import { rankColor } from '../shared'

const N = SLOTS // instance i = sku index i

/** Nominal carton size: w along the run (z), h up, d into the rack (x). Per-sku sizes vary 84..100 %. */
export const CARTON = { w: 0.78, h: 0.5, d: 0.6 } as const
/** Top of the pick-level beam. Must equal LEVELS[1] in lab/warehouse.ts. */
export const PICK_TOP = 0.74
/** Half rack depth (racks are 0.95 m deep, leaving a 5 cm flue between back-to-back racks). */
export const RACK_HALF = 0.475

const KRAFT = ['#c9955c', '#c48f57', '#cf9c62', '#bf8a52', '#d2a26b'] as const
const FONT_M = '"IBM Plex Mono", "Cascadia Mono", Consolas, "Courier New", monospace'
const FONT_B = '"Public Sans", "Segoe UI", Roboto, Arial, sans-serif'
const TAU = Math.PI * 2
const HEAT_GLOW = 0.3 // dark theme emissive share of the heat colour
const LABEL_CW = 200 // label atlas cell, px
const LABEL_CH = 150

export interface CartonResources {
  /** Unit carton (2 x 2 atlas UVs) with an aHeat instanced attribute (N * 3, linear rgb). */
  bodyGeo: THREE.BufferGeometry
  bodyMat: THREE.MeshStandardMaterial
  /** Unit plane with an aCell instanced attribute (N * 2): label atlas cell of sku i. */
  labelGeo: THREE.BufferGeometry
  labelMat: THREE.MeshStandardMaterial
  /** N * 3 kraft instance colours (linear rgb), for InstancedMesh.instanceColor. */
  kraft: Float32Array
  /** N * 3 carton size (w, h, d) per sku index; deterministic, so it exists before data loads. */
  size: Float32Array
  /** 0 = cardboard, 1 = heat tint. Shared with the compiled shader. */
  uHeat: { value: number }
  /** Paint the labels and heat colours. `ranks` must be TRAIN ranks (sim/data trainRanks). */
  setProducts(products: readonly Product[], ranks: Int16Array): void
  dispose(): void
}

// ---------------------------------------------------------------------------------------------
// Small helpers (private copies; deduplicate with the other lab files after the demo)
// ---------------------------------------------------------------------------------------------

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashi(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Tileable value noise for a w x h image on a cx x cy lattice (lattice hashed once, pixels interpolate). */
function noiseGrid(w: number, h: number, cx: number, cy: number, seed: number): Float32Array {
  const lat = new Float32Array(cx * cy)
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) lat[j * cx + i] = hashi(i, j, seed)
  const xi0 = new Int32Array(w)
  const xi1 = new Int32Array(w)
  const xs = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    const fx = (x / w) * cx
    const i0 = Math.floor(fx)
    const f = fx - i0
    xi0[x] = i0 % cx
    xi1[x] = (i0 + 1) % cx
    xs[x] = f * f * (3 - 2 * f)
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cy
    const j0 = Math.floor(fy)
    const f = fy - j0
    const sy = f * f * (3 - 2 * f)
    const r0 = (j0 % cy) * cx
    const r1 = ((j0 + 1) % cy) * cx
    const row = y * w
    for (let x = 0; x < w; x++) {
      const a = lat[r0 + xi0[x]]
      const b = lat[r0 + xi1[x]]
      const c = lat[r1 + xi0[x]]
      const d = lat[r1 + xi1[x]]
      const sx = xs[x]
      const top = a + (b - a) * sx
      out[row + x] = top + (c + (d - c) * sx - top) * sy
    }
  }
  return out
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '.').width > maxW) t = t.slice(0, -1)
  return t.trimEnd() + '.'
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const test = cur ? cur + ' ' + w : w
    if (ctx.measureText(test).width <= maxW || !cur) cur = test
    else {
      lines.push(cur)
      cur = w
      if (lines.length === maxLines - 1) {
        cur = words.slice(i).join(' ')
        break
      }
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines).map((l) => fitText(ctx, l, maxW))
}

// Code 39 (n = narrow, w = wide; bar, space, bar, ...). Real, scannable patterns.
const CODE39: Readonly<Record<string, string>> = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn',
  6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
}

function drawCode39(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
  const s = '*' + text.toUpperCase().replace(/[^0-9A-Z. -]/g, '') + '*'
  const WIDE = 2.6
  const charUnits = 6 + 3 * WIDE
  const units = s.length * (charUnits + 1) - 1
  const unit = w / units
  let cx = x
  for (let ci = 0; ci < s.length; ci++) {
    const pat = CODE39[s[ci]]
    if (!pat) continue
    for (let k = 0; k < 9; k++) {
      const ww = (pat[k] === 'w' ? WIDE : 1) * unit
      if (k % 2 === 0) ctx.fillRect(cx, y, ww, h)
      cx += ww
    }
    cx += unit
  }
}

// ---------------------------------------------------------------------------------------------
// Canvas atlases
// ---------------------------------------------------------------------------------------------

/** Corrugated board atlas, neutral (tinted by the instance colour). 2 x 2 regions of 256 px. */
function genCartonAtlas(): HTMLCanvasElement {
  const S = 512
  const H = 256
  const c = makeCanvas(S, S)
  const ctx = ctx2d(c)
  const img = ctx.createImageData(S, S)
  const d = img.data
  const NA = noiseGrid(S, S, 23, 23, 4)
  const NB = noiseGrid(S, S, 102, 102, 6)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const lx = x % H
      const ly = y % H
      const n = NA[y * S + x]
      const n2 = NB[y * S + x]
      const g = hashi(x, y, 8)
      const flute = 0.5 + 0.5 * Math.sin(ly * 1.85)
      const e = Math.min(lx, ly, H - 1 - lx, H - 1 - ly)
      const edge = e < 12 ? Math.pow(1 - e / 12, 1.6) : 0
      const v = 0.9 + (n - 0.5) * 0.08 + (n2 - 0.5) * 0.035 + (g - 0.5) * 0.04 - flute * 0.022 - edge * 0.2
      const i = (y * S + x) * 4
      d[i] = clamp(v, 0, 1) * 255
      d[i + 1] = clamp(v * 0.985, 0, 1) * 255
      d[i + 2] = clamp(v * 0.96, 0, 1) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const trnd = mulberry32(31)
  const tape = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = 'rgba(176, 140, 92, 0.92)'
    ctx.fillRect(x, y, w, h)
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = `rgba(255,240,210,${0.06 + trnd() * 0.1})`
      ctx.fillRect(x + 2 + ((k * 7) % (w - 4)), y, 1, h)
    }
    ctx.fillStyle = 'rgba(255,245,225,0.35)'
    ctx.fillRect(x, y, w, 2)
    ctx.fillStyle = 'rgba(80,60,40,0.25)'
    ctx.fillRect(x, y, 1.5, h)
    ctx.fillRect(x + w - 1.5, y, 1.5, h)
  }
  // TOP (0,0): flap seam under a tape strip along v
  ctx.fillStyle = 'rgba(60,45,30,0.35)'
  ctx.fillRect(127, 0, 2, H)
  tape(110, 0, 36, H)
  // FRONT (256,0): tape end down from the top edge
  tape(256 + 110, 0, 36, 44)
  ctx.fillStyle = 'rgba(70,50,30,0.25)'
  ctx.fillRect(256 + 110, 44, 36, 2)
  // SIDE (0,256): hand hole, printed up arrows, recycle mark
  ctx.save()
  ctx.translate(0, 256)
  roundRectPath(ctx, 88, 34, 80, 26, 13)
  ctx.fillStyle = 'rgba(25,18,12,0.88)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(52,38,26,0.75)'
  for (const ax of [96, 160]) {
    ctx.beginPath()
    ctx.moveTo(ax, 108)
    ctx.lineTo(ax + 14, 128)
    ctx.lineTo(ax + 5, 128)
    ctx.lineTo(ax + 5, 150)
    ctx.lineTo(ax - 5, 150)
    ctx.lineTo(ax - 5, 128)
    ctx.lineTo(ax - 14, 128)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillRect(84, 156, 88, 3)
  ctx.strokeStyle = 'rgba(52,38,26,0.6)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(128, 206, 16, 0.3, TAU - 0.3)
  ctx.stroke()
  ctx.font = `600 13px ${FONT_B}`
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(52,38,26,0.6)'
  ctx.fillText('THIS WAY UP', 128, 182)
  ctx.restore()
  // BACK/BOTTOM (256,256): tape ends top and bottom
  tape(256 + 110, 256, 36, 40)
  tape(256 + 110, 512 - 40, 36, 40)
  return c
}

/**
 * Product label atlas: 10 x 10 cells of 200 x 150 px, cell i = sku index i. Repaints `c` in place.
 * The header shows the TRAIN rank only (Product.rank includes held-out picks and is never shown).
 */
function paintLabelAtlas(c: HTMLCanvasElement, products: readonly Product[], ranks: Int16Array | null): void {
  const CW = LABEL_CW
  const CH = LABEL_CH
  const ctx = ctx2d(c)
  ctx.clearRect(0, 0, c.width, c.height)
  for (let i = 0; i < N; i++) {
    const p = products[i]
    ctx.save()
    ctx.translate((i % 10) * CW, Math.floor(i / 10) * CH)
    roundRectPath(ctx, 3, 3, CW - 6, CH - 6, 9)
    ctx.fillStyle = '#f7f4ec'
    ctx.fill()
    ctx.clip()
    if (!p) {
      ctx.restore()
      continue
    }
    ctx.fillStyle = '#15181b'
    ctx.fillRect(0, 0, CW, 28)
    ctx.fillStyle = '#e9edf0'
    ctx.font = `700 14px ${FONT_B}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('SKU', 12, 15)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffd23f'
    ctx.font = `700 15px ${FONT_M}`
    const rank = ranks ? ranks[i] : 0
    ctx.fillText('RANK ' + (rank > 0 ? String(rank) : '-'), CW - 12, 15)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#111417'
    ctx.font = `700 40px ${FONT_M}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(fitText(ctx, String(p.sku), CW - 24), 11, 66)
    ctx.font = `700 14px ${FONT_B}`
    ctx.fillStyle = '#2a2f33'
    const lines = wrapLines(ctx, String(p.desc || '').toUpperCase(), CW - 24, 2)
    lines.forEach((l, k) => ctx.fillText(l, 12, 85 + k * 16))
    ctx.fillStyle = '#111417'
    drawCode39(ctx, String(p.sku), 12, 113, CW - 24, 27)
    ctx.restore()
  }
}

function canvasTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

// ---------------------------------------------------------------------------------------------
// Geometry and shader patches
// ---------------------------------------------------------------------------------------------

/** Unit carton with a 2 x 2 atlas: top (tape), front +z (tape end), sides (hand hole, arrows), back/bottom. */
function cartonGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  type V3 = readonly [number, number, number]
  type Reg = readonly [number, number]
  const R: Record<'top' | 'front' | 'side' | 'back', Reg> = { top: [0, 0], front: [1, 0], side: [0, 1], back: [1, 1] }
  const face = (o: V3, ua: V3, va: V3, n: V3, reg: Reg) => {
    const base = pos.length / 3
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      pos.push(o[0] + ua[0] * su + va[0] * sv, o[1] + ua[1] * su + va[1] * sv, o[2] + ua[2] * su + va[2] * sv)
      nor.push(n[0], n[1], n[2])
      const u = (su + 1) / 2
      const v = (sv + 1) / 2
      uv.push((reg[0] + u) / 2, 1 - (reg[1] + 1 - v) / 2)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  face([0, 0, 0.5], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 1], R.front)
  face([0, 0, -0.5], [-0.5, 0, 0], [0, 0.5, 0], [0, 0, -1], R.back)
  face([0.5, 0, 0], [0, 0, -0.5], [0, 0.5, 0], [1, 0, 0], R.side)
  face([-0.5, 0, 0], [0, 0, 0.5], [0, 0.5, 0], [-1, 0, 0], R.side)
  face([0, 0.5, 0], [0.5, 0, 0], [0, 0, -0.5], [0, 1, 0], R.top)
  face([0, -0.5, 0], [0.5, 0, 0], [0, 0, 0.5], [0, -1, 0], R.back)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Per-instance atlas cell: vMapUv = (uv + aCell) / grid. */
function patchAtlas(material: THREE.Material, cols: number, rows: number, key: string): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (vMapUv + aCell) * vec2(${(1 / cols).toFixed(6)}, ${(1 / rows).toFixed(6)});`)
  }
  material.customProgramCacheKey = () => key
}

/** Heat tint: diffuse mixes toward the per-instance rank colour and glows a little, both scaled by uHeat. */
function patchHeat(material: THREE.Material, uHeat: { value: number }, uHeatGlow: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeat = uHeat
    shader.uniforms.uHeatGlow = uHeatGlow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aHeat;\nvarying vec3 vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHeat;\nuniform float uHeatGlow;\nvarying vec3 vHeat;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vHeat * (0.32 + lum * 1.3), uHeat * 0.86);
}`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vHeat * uHeat * uHeatGlow;')
  }
  material.customProgramCacheKey = () => 'gw-carton-body'
}

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

export function createCartonResources(): CartonResources {
  const c = new THREE.Color()

  // per-sku size and kraft tone, keyed by sku index (not SKU text) so they exist before data loads
  const size = new Float32Array(N * 3)
  const kraft = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const h = strHash('p' + i)
    size[i * 3] = CARTON.w * (0.86 + ((h & 255) / 255) * 0.14)
    size[i * 3 + 1] = CARTON.h * (0.84 + (((h >>> 8) & 255) / 255) * 0.16)
    size[i * 3 + 2] = CARTON.d * (0.88 + (((h >>> 16) & 255) / 255) * 0.12)
    c.set(KRAFT[strHash('k' + i) % KRAFT.length])
    kraft[i * 3] = c.r
    kraft[i * 3 + 1] = c.g
    kraft[i * 3 + 2] = c.b
  }

  const tCarton = canvasTex(genCartonAtlas())
  const labelCanvas = makeCanvas(LABEL_CW * 10, LABEL_CH * 10)
  paintLabelAtlas(labelCanvas, [], null)
  const tLabels = canvasTex(labelCanvas)

  const uHeat = { value: 0 }
  const uHeatGlow = { value: HEAT_GLOW }
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tCarton, roughness: 0.84, metalness: 0 })
  patchHeat(bodyMat, uHeat, uHeatGlow)
  const labelMat = new THREE.MeshStandardMaterial({
    map: tLabels,
    roughness: 0.55,
    metalness: 0,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  })
  patchAtlas(labelMat, 10, 10, 'gw-carton-labels')

  // heat starts as the kraft tone, so a Heat-on frame before products load still looks like cardboard
  const bodyGeo = cartonGeometry()
  const heatAttr = new THREE.InstancedBufferAttribute(kraft.slice(), 3)
  bodyGeo.setAttribute('aHeat', heatAttr)

  const labelGeo = new THREE.PlaneGeometry(1, 1)
  const cells = new Float32Array(N * 2)
  for (let i = 0; i < N; i++) {
    cells[i * 2] = i % 10
    cells[i * 2 + 1] = 9 - Math.floor(i / 10)
  }
  labelGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2))

  let lastProducts: readonly Product[] | null = null
  let lastRanks: Int16Array | null = null

  return {
    bodyGeo,
    bodyMat,
    labelGeo,
    labelMat,
    kraft,
    size,
    uHeat,
    setProducts(products, ranks) {
      if (products === lastProducts && ranks === lastRanks) return
      lastProducts = products
      lastRanks = ranks
      paintLabelAtlas(labelCanvas, products, ranks)
      tLabels.needsUpdate = true
      const heat = heatAttr.array as Float32Array
      for (let i = 0; i < N; i++) {
        rankColor(ranks[i] || N, c)
        heat[i * 3] = c.r
        heat[i * 3 + 1] = c.g
        heat[i * 3 + 2] = c.b
      }
      heatAttr.needsUpdate = true
    },
    dispose() {
      // GPU resources only: never detach anything (StrictMode re-mounts reuse these objects and
      // three re-uploads them on the next render)
      bodyGeo.dispose()
      labelGeo.dispose()
      bodyMat.dispose()
      labelMat.dispose()
      tCarton.dispose()
      tLabels.dispose()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Poses and allocation-free matrix writers
// ---------------------------------------------------------------------------------------------

/**
 * Resting pose of a carton of depth d and height h at `slot`: out[o..o+3] = x, y, z, ry. The carton
 * sits on the pick beam, pushed 3.5 cm back from the rack face, its front (+z local, the label side)
 * turned toward the aisle: ry = +PI/2 for the left rack (side 0, aisle at +x), -PI/2 for the right.
 */
export function cartonPose(slot: number, d: number, h: number, out: Float32Array, o: number): void {
  const side = slotSide(slot)
  const f = side === 0 ? 1 : -1
  const rackX = aisleX(slotAisle(slot)) + (side === 0 ? -RACK_OFFSET : RACK_OFFSET)
  out[o] = rackX + f * (RACK_HALF - 0.035 - d / 2)
  out[o + 1] = PICK_TOP + 0.008 + h / 2
  out[o + 2] = bayZ(slotBay(slot))
  out[o + 3] = f > 0 ? Math.PI / 2 : -Math.PI / 2
}

/** Instance matrix of carton i: scale (w, h, d), rotation ry about y, translation (x, y, z). */
export function writeCartonMatrix(a: Float32Array, i: number, x: number, y: number, z: number, ry: number, w: number, h: number, d: number): void {
  const o = i * 16
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  a[o] = c * w
  a[o + 1] = 0
  a[o + 2] = -s * w
  a[o + 3] = 0
  a[o + 4] = 0
  a[o + 5] = h
  a[o + 6] = 0
  a[o + 7] = 0
  a[o + 8] = s * d
  a[o + 9] = 0
  a[o + 10] = c * d
  a[o + 11] = 0
  a[o + 12] = x
  a[o + 13] = y
  a[o + 14] = z
  a[o + 15] = 1
}

/** Label i: a 0.3 x 0.225 m sticker on the carton front (local +z face), 3.5 cm below its centre. */
export function writeLabelMatrix(a: Float32Array, i: number, x: number, y: number, z: number, ry: number, d: number): void {
  const o = i * 16
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  const off = d / 2 + 0.004
  a[o] = c * 0.3
  a[o + 1] = 0
  a[o + 2] = -s * 0.3
  a[o + 3] = 0
  a[o + 4] = 0
  a[o + 5] = 0.225
  a[o + 6] = 0
  a[o + 7] = 0
  a[o + 8] = s
  a[o + 9] = 0
  a[o + 10] = c
  a[o + 11] = 0
  a[o + 12] = x + s * off
  a[o + 13] = y - 0.035
  a[o + 14] = z + c * off
  a[o + 15] = 1
}

/** Nominal carton centre at a slot (for markers and tags; allocates, so not for per-frame use). */
export function slotCartonCentre(slot: number): { x: number; y: number; z: number } {
  const side = slotSide(slot)
  const f = side === 0 ? 1 : -1
  const rackX = aisleX(slotAisle(slot)) + (side === 0 ? -RACK_OFFSET : RACK_OFFSET)
  return { x: rackX + f * (RACK_HALF - 0.035 - CARTON.d / 2), y: PICK_TOP + 0.008 + CARTON.h / 2, z: bayZ(slotBay(slot)) }
}
