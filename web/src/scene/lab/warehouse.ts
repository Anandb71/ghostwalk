// Port of handbook interactive/lab3d/models.js buildWarehouse (three r160 JS, handbook commit 29e6039) to three 0.186, dark theme only.
// @ts-nocheck
//
// The Floor Lab picking floor, built from three.js primitives and canvas textures (no model or image
// files): polished concrete with saw-cut joints and painted markings (1-based aisle stencils and bay
// numbers, as in the UI), punched blue racking with orange step beams, wire decks and per-slot beam
// labels, about 600 overstock cartons on levels 0, 2 and 3 (the pick level stays free for the 100
// interactive cartons), the packing dock with its bench, conveyor and shutter door, inward-facing
// walls, columns, signs, overhead trusses, fixtures, light pools and contact-shadow decals.
// Draw calls: 26 meshes (merged buckets or InstancedMeshes, one per material); overhead steel and
// fixture glows drop out above 7.4 m and the down-facing ceiling, LEDs and skylights above 9.2 m,
// so the overview and top cameras draw about 21.
// Driven by Floor.tsx: update() each frame (conveyor parcels only), setQuality on the MQ/HQ toggle,
// setCutaway on the Heat toggle. Lights, fog and background live in Scene.tsx; createEnvironment
// builds the reflection map once. dispose() frees GPU resources only and never detaches the group,
// so a StrictMode remount keeps the warehouse in the scene.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  AISLES,
  BACK_Z,
  BAY_PITCH,
  BAYS,
  DOCK_X,
  DOCK_Z,
  FRONT_Z,
  MIDDLE_Z,
  RACK_HEIGHT,
  RACK_OFFSET,
  SLOTS,
  aisleX,
  bayZ,
  slotAisle,
  slotBay,
  slotSide,
} from '../../sim/layout'

export type WarehouseQuality = 'medium' | 'high'

export interface WarehouseHandle {
  group: THREE.Group
  /** Conveyor parcels only; allocation-free. */
  update(dt: number, t: number): void
  /** Contact-shadow strength: stronger at MQ, where there are no real shadows. */
  setQuality(q: WarehouseQuality): void
  /** 1 = rack overstock above the pick level dithered out, null = automatic (cut when looking straight down). */
  setCutaway(v: number | null): void
  /** Frees geometries, materials, textures and instanced meshes. Never detaches the group. */
  dispose(): void
}

export interface EnvironmentHandle {
  texture: THREE.Texture
  dispose(): void
}

const rackX = (a, side) => aisleX(a) + (side === 0 ? -RACK_OFFSET : RACK_OFFSET)
/** +1 when the rack's aisle face points to +x (left rack, side 0), -1 for the right rack. */
const faceSign = (side) => (side === 0 ? 1 : -1)

// Visual rack details (not part of the routing model).
const RUN_Z0 = [0, 10] // rack runs: bays 0-4 span z 0..6, bays 5-9 span z 10..16
const RACK_HALF = 0.475 // half depth, leaves a 5 cm flue between back-to-back racks
const UPRIGHT_X = 0.44 // upright centre offset from the rack centre line
const BEAM_X = 0.445 // beam centre offset (outer face flush with the uprights)
const LEVELS = [0.16, 0.74, 1.48, 2.16] // beam tops; index 1 is the pick level
const PICK_TOP = LEVELS[1]
const BEAM_H = 0.11
const HALL = { x0: -10, x1: 27, z0: -8, z1: 24, h: 7.5, roof: 9.2 }

// Fixtures over walkways (x, z): the light pools and point lights reuse this list.
const FIXTURES = (() => {
  const f = []
  for (let a = 0; a < AISLES; a++) for (const z of [-2, 3, 8, 13, 18]) f.push([aisleX(a), z])
  f.push([-6.4, -4.2], [-6.4, 0.6], [-6.4, 6], [-6.4, 13], [-6.4, 20], [24.8, -2], [24.8, 8], [24.8, 18], [9, 22.2])
  return f
})()

const TAU = Math.PI * 2
const FONT_D = '"Big Shoulders Display", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif'
const FONT_M = '"IBM Plex Mono", "Cascadia Mono", Consolas, "Courier New", monospace'
const FONT_B = '"Public Sans", "Segoe UI", Roboto, Arial, sans-serif'

// Dark-theme values from the Floor Lab palette. The Floor Lab applied these in setTheme('dark') after
// building; here they are set at creation (glow colour, env intensities and contact opacity included).
const DARK = {
  floor: '#878e93',
  ground: '#0b0f12',
  ceiling: '#5a636c',
  wall: '#5f6870',
  wallWindow: '#18304d',
  wallWindowK: 0.75,
  pool: '#ffc888',
  poolK: 0.36,
  led: '#fff0d8',
  ledK: 3.4,
  skylight: '#1a2a40',
  skylightK: 0.6,
  glowK: 0.5,
  envRoom: '#14191d',
  envStrip: '#fff1dc',
  envStripK: 6,
  envFloor: '#22282c',
  envI: 0.5,
  signGlow: 0.42,
  screenK: 1.3,
  contact: 0.62,
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashi(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
/**
 * Value noise for a whole w x h image with a cx x cy lattice (tileable): the lattice is hashed once
 * and each pixel only interpolates, which is far faster than calling vnoise per pixel.
 */
function noiseGrid(w, h, cx, cy, seed) {
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
function fbmGrid(w, h, cells, octaves, seed) {
  const out = new Float32Array(w * h)
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const k = cells * (1 << o)
    const g = noiseGrid(w, h, k, k, seed + o * 17)
    for (let i = 0; i < out.length; i++) out[i] += g[i] * amp
    norm += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function roundRectPath(ctx, x, y, w, h, r) {
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

// Code 39 (n = narrow, w = wide; bar, space, bar, ...). Real, scannable patterns.
const CODE39 = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn',
  6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
}
function drawCode39(ctx, text, x, y, w, h) {
  const s = '*' + String(text).toUpperCase().replace(/[^0-9A-Z. -]/g, '') + '*'
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

// Disposal bag: everything a builder creates goes in here.
function makeBag() {
  const items = new Set()
  return {
    add(x) {
      if (x) items.add(x)
      return x
    },
    dispose() {
      for (const x of items) if (x && typeof x.dispose === 'function') x.dispose()
      items.clear()
    },
  }
}

function matFactory() {
  const e = new THREE.Euler()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  return (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz)
    q.setFromEuler(e)
    p.set(x, y, z)
    s.set(sx, sy, sz)
    return new THREE.Matrix4().compose(p, q, s)
  }
}

/**
 * Collects transformed copies of primitive geometries (position, normal, uv, vertex colour) into
 * flat arrays and builds one BufferGeometry, so a whole class of static parts costs one draw call.
 * Source primitives are converted to non-indexed once and cached.
 */
class Bucket {
  constructor() {
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = []
    this.count = 0
    this.n3 = new THREE.Matrix3()
    this.c = new THREE.Color()
    this.cache = new WeakMap()
  }
  src(geo) {
    let s = this.cache.get(geo)
    if (!s) {
      const g = geo.index ? geo.toNonIndexed() : geo
      if (!g.attributes.normal) g.computeVertexNormals()
      s = {
        p: g.attributes.position.array,
        n: g.attributes.normal.array,
        uv: g.attributes.uv ? g.attributes.uv.array : null,
        count: g.attributes.position.count,
      }
      this.cache.set(geo, s)
      if (g !== geo) g.dispose()
    }
    return s
  }
  /** uvRect = [u0, v0, su, sv]: uv' = u0 + uv * su. Pass su = sv = 0 for a constant uv. */
  add(geo, matrix, color = 0xffffff, uvRect = null) {
    const s = this.src(geo)
    const e = matrix ? matrix.elements : null
    if (matrix) this.n3.getNormalMatrix(matrix)
    const ne = this.n3.elements
    const c = this.c.set(color)
    const { pos, nor, uv, col } = this
    const flip = matrix ? matrix.determinant() < 0 : false
    for (let k = 0; k < s.count; k++) {
      // a mirroring matrix flips the winding: swap the 2nd and 3rd vertex of each triangle
      const i = flip ? k - (k % 3) + [0, 2, 1][k % 3] : k
      const x = s.p[i * 3]
      const y = s.p[i * 3 + 1]
      const z = s.p[i * 3 + 2]
      const nx = s.n[i * 3]
      const ny = s.n[i * 3 + 1]
      const nz = s.n[i * 3 + 2]
      if (e) {
        pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14])
        const ox = ne[0] * nx + ne[3] * ny + ne[6] * nz
        const oy = ne[1] * nx + ne[4] * ny + ne[7] * nz
        const oz = ne[2] * nx + ne[5] * ny + ne[8] * nz
        const l = Math.hypot(ox, oy, oz) || 1
        nor.push(ox / l, oy / l, oz / l)
      } else {
        pos.push(x, y, z)
        nor.push(nx, ny, nz)
      }
      let u = s.uv ? s.uv[i * 2] : 0
      let v = s.uv ? s.uv[i * 2 + 1] : 0
      if (uvRect) {
        u = uvRect[0] + u * uvRect[2]
        v = uvRect[1] + v * uvRect[3]
      }
      uv.push(u, v)
      col.push(c.r, c.g, c.b)
    }
    this.count += s.count
    return this
  }
  get size() {
    return this.count
  }
  build() {
    if (!this.count) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = []
    this.count = 0
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

// ---------------------------------------------------------------------------------------------
// Canvas texture generators
// ---------------------------------------------------------------------------------------------

function canvasTex(canvas, { srgb = true, repeat = null, aniso = 8, flipY = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  t.flipY = flipY
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  if (!mips) {
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
  }
  t.needsUpdate = true
  return t
}

/** Polished concrete, 512 px tile = 4 m. Returns colour and roughness canvases. */
function genConcrete(size = 512) {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')
  const r = makeCanvas(size, size)
  const rctx = r.getContext('2d')
  const img = ctx.createImageData(size, size)
  const rim = rctx.createImageData(size, size)
  const d = img.data
  const rd = rim.data
  const N1 = fbmGrid(size, size, 6, 4, 7)
  const N2 = noiseGrid(size, size, 48, 48, 9)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = N1[y * size + x]
      const n2 = N2[y * size + x]
      const g = hashi(x, y, 3)
      const s = hashi(x, y, 5)
      let val = 0.62 + (n1 - 0.5) * 0.26 + (n2 - 0.5) * 0.09 + (g - 0.5) * 0.07
      let rough = 0.6 + (n1 - 0.5) * 0.24 + (g - 0.5) * 0.08
      if (s > 0.9968) {
        val -= 0.2
        rough += 0.25
      } else if (s < 0.0035) val += 0.13
      const i = (y * size + x) * 4
      const k = clamp(val, 0, 1) * 255
      d[i] = k * 0.985
      d[i + 1] = k
      d[i + 2] = Math.min(255, k * 1.025)
      d[i + 3] = 255
      const rr = clamp(rough, 0.05, 1) * 255
      rd[i] = rr
      rd[i + 1] = rr
      rd[i + 2] = rr
      rd[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  rctx.putImageData(rim, 0, 0)
  // Power-trowel swirls: lighter and smoother arcs, drawn with wrap so the tile still repeats.
  const rnd = mulberry32(21)
  ctx.lineCap = 'round'
  rctx.lineCap = 'round'
  for (let k = 0; k < 64; k++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const rad = 30 + rnd() * 120
    const a0 = rnd() * TAU
    const a1 = a0 + 0.5 + rnd() * 1.7
    const w = 4 + rnd() * 16
    const reach = rad + w
    for (const ox of [-size, 0, size]) {
      if (cx + ox + reach < 0 || cx + ox - reach > size) continue
      for (const oy of [-size, 0, size]) {
        if (cy + oy + reach < 0 || cy + oy - reach > size) continue
        ctx.beginPath()
        ctx.arc(cx + ox, cy + oy, rad, a0, a1)
        ctx.lineWidth = w
        ctx.strokeStyle = 'rgba(255,255,255,0.032)'
        ctx.stroke()
        rctx.beginPath()
        rctx.arc(cx + ox, cy + oy, rad, a0, a1)
        rctx.lineWidth = w
        rctx.strokeStyle = 'rgba(0,0,0,0.11)'
        rctx.stroke()
      }
    }
  }
  return { color: c, rough: r }
}

/** Non-tiling large-scale variation over the hall (R: tone, G: roughness). flipY false. */
function genMacro(size = 512) {
  const W = HALL.x1 - HALL.x0
  const D = HALL.z1 - HALL.z0
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  const NA = fbmGrid(size, size, 5, 4, 31)
  const NB = fbmGrid(size, size, 12, 3, 37)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size
      const v = py / size
      const x = HALL.x0 + u * W
      const z = HALL.z0 + v * D
      const n = NA[py * size + px]
      const n2 = NB[py * size + px]
      // traffic: cross-aisles, dock zone and the back lane get polished by wheels
      const band = (zc, w) => Math.exp(-((z - zc) * (z - zc)) / (w * w))
      let traffic = Math.max(band(FRONT_Z, 1.4), band(MIDDLE_Z, 1.3), band(BACK_Z, 1.3), band(22.2, 1.0) * 0.8)
      if (x < -2.5) traffic = Math.max(traffic, 0.7 * Math.exp(-((x + 6) * (x + 6)) / 9))
      const wall = Math.min(x - HALL.x0, HALL.x1 - x, z - HALL.z0, HALL.z1 - z)
      const dust = wall < 1.4 ? 1 - wall / 1.4 : 0
      const tone = 0.5 + (n - 0.5) * 0.95 - traffic * 0.1 + dust * 0.12
      const rough = 0.5 + (n2 - 0.5) * 0.9 - traffic * 0.28 + dust * 0.2
      const i = (py * size + px) * 4
      d[i] = clamp(tone, 0, 1) * 255
      d[i + 1] = clamp(rough, 0, 1) * 255
      d[i + 2] = 128
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Painted floor markings over the hall: lanes, cross-aisle bands, stencils, dock zone, wear. */
function genFloorOverlay(ppm) {
  const W = HALL.x1 - HALL.x0
  const D = HALL.z1 - HALL.z0
  const cw = Math.round(W * ppm)
  const ch = Math.round(D * ppm)
  const c = makeCanvas(cw, ch)
  const ctx = c.getContext('2d')
  const world = () => ctx.setTransform(ppm, 0, 0, ppm, -HALL.x0 * ppm, -HALL.z0 * ppm)
  const rnd = mulberry32(77)
  world()

  const hatch = (x0, z0, w, h, colA, colB, stripe = 0.18, angle = 1) => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, z0, w, h)
    ctx.clip()
    if (colB) {
      ctx.fillStyle = colB
      ctx.fillRect(x0, z0, w, h)
    }
    ctx.fillStyle = colA
    const span = w + h
    for (let k = -span; k < span; k += stripe * 2) {
      ctx.beginPath()
      ctx.moveTo(x0 + k, z0)
      ctx.lineTo(x0 + k + stripe, z0)
      ctx.lineTo(x0 + k + stripe + h * angle, z0 + h)
      ctx.lineTo(x0 + k + h * angle, z0 + h)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  const text = (str, x, z, sizeM, color, { rot = Math.PI / 2, weight = 800, font = FONT_D, alpha = 0.9, spray = true } = {}) => {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate((x - HALL.x0) * ppm, (z - HALL.z0) * ppm)
    ctx.rotate(rot)
    ctx.font = `${weight} ${Math.round(sizeM * ppm)}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    if (spray) {
      ctx.globalAlpha = alpha * 0.28
      ctx.shadowColor = color
      ctx.shadowBlur = Math.max(2, sizeM * ppm * 0.07)
      ctx.fillText(str, 0, 0)
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = alpha
    ctx.fillText(str, 0, 0)
    ctx.restore()
  }

  // Epoxy walkways between the racks (the lanes stop at the middle cross-aisle).
  for (let a = 0; a < AISLES; a++) {
    const x = aisleX(a)
    for (const z0 of RUN_Z0) {
      ctx.fillStyle = 'rgba(52, 92, 82, 0.6)'
      ctx.fillRect(x - 1.52, z0, 3.04, 6)
      // roller texture
      for (let k = 0; k < 90; k++) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.03})`
        ctx.fillRect(x - 1.5 + rnd() * 3, z0 + rnd() * 6, 0.25 + rnd() * 0.9, 0.04 + rnd() * 0.08)
      }
    }
  }

  // Cross-aisle bands with white edge lines and hatched ends.
  for (const zc of [FRONT_Z, MIDDLE_Z, BACK_Z]) {
    ctx.fillStyle = 'rgba(92, 104, 114, 0.38)'
    ctx.fillRect(-2.5, zc - 2, 25, 4)
    ctx.fillStyle = 'rgba(236, 238, 240, 0.88)'
    ctx.fillRect(-2.5, zc - 2, 25, 0.08)
    ctx.fillRect(-2.5, zc + 2 - 0.08, 25, 0.08)
    hatch(21.6, zc - 1.92, 0.9, 3.84, 'rgba(242,194,48,0.92)', 'rgba(20,20,20,0.75)', 0.2)
    if (zc !== FRONT_Z) hatch(-2.5, zc - 1.92, 0.9, 3.84, 'rgba(242,194,48,0.92)', 'rgba(20,20,20,0.75)', 0.2)
  }
  // Direction arrows in the front cross-aisle: inbound lane towards the dock, outbound lane away.
  const chevron = (x, z, dir, size, color) => {
    ctx.save()
    ctx.translate(x, z)
    ctx.scale(dir, 1)
    ctx.fillStyle = color
    for (let k = 0; k < 3; k++) {
      const o = k * size * 0.55
      ctx.beginPath()
      ctx.moveTo(-o - size * 0.5, -size * 0.5)
      ctx.lineTo(-o - size * 0.5 + size * 0.22, -size * 0.5)
      ctx.lineTo(-o + size * 0.0 + size * 0.22, 0)
      ctx.lineTo(-o - size * 0.5 + size * 0.22, size * 0.5)
      ctx.lineTo(-o - size * 0.5, size * 0.5)
      ctx.lineTo(-o, 0)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  for (const x of [2.5, 7.5, 12.5, 17.5]) {
    chevron(x, FRONT_Z - 1.15, -1, 0.5, 'rgba(240,242,244,0.75)')
    chevron(x, FRONT_Z + 1.15, 1, 0.5, 'rgba(240,242,244,0.75)')
  }
  for (const x of [2.5, 12.5]) {
    chevron(x, MIDDLE_Z, -1, 0.42, 'rgba(240,242,244,0.55)')
    chevron(x + 5, BACK_Z, 1, 0.42, 'rgba(240,242,244,0.55)')
  }

  // Pedestrian walkway along the front wall and the right-hand perimeter (green with white edges).
  const walk = (x0, z0, w, h) => {
    ctx.fillStyle = 'rgba(46, 125, 80, 0.55)'
    ctx.fillRect(x0, z0, w, h)
    ctx.fillStyle = 'rgba(240,242,244,0.85)'
    if (w > h) {
      ctx.fillRect(x0, z0, w, 0.07)
      ctx.fillRect(x0, z0 + h - 0.07, w, 0.07)
    } else {
      ctx.fillRect(x0, z0, 0.07, h)
      ctx.fillRect(x0 + w - 0.07, z0, 0.07, h)
    }
  }
  walk(-2.4, -7.3, 28.6, 1.2)
  walk(24.9, -6.1, 1.2, 20.6)
  // footprints in the walkway
  for (let x = 0; x < 26; x += 4.5) {
    for (const [dx, dz] of [[0, -0.18], [0.45, 0.18]]) {
      ctx.save()
      ctx.translate(x + dx, -6.7 + dz)
      ctx.rotate(Math.PI / 2)
      ctx.fillStyle = 'rgba(240,242,244,0.7)'
      ctx.beginPath()
      ctx.ellipse(0, 0, 0.07, 0.13, 0, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(0, 0.19, 0.055, 0.06, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }
  // Forklift lane along the back wall: yellow edges and a dashed centre line.
  ctx.fillStyle = 'rgba(242,194,48,0.85)'
  ctx.fillRect(-9.2, 20.7, 33.8, 0.1)
  ctx.fillRect(-9.2, 23.4, 33.8, 0.1)
  for (let x = -9; x < 24.4; x += 1.6) ctx.fillRect(x, 22.06, 0.9, 0.08)
  text('FORKLIFTS', 4, 21.4, 0.42, 'rgba(242,194,48,0.85)', { rot: 0, weight: 800 })
  text('FORKLIFTS', 17, 22.75, 0.42, 'rgba(242,194,48,0.85)', { rot: Math.PI, weight: 800 })

  // Aisle stencils (1-based, as in the UI) at both ends of each aisle, readable from the dock side (-x looking +x).
  for (let a = 0; a < AISLES; a++) {
    text('A' + (a + 1), aisleX(a), -1.0, 1.05, '#eef0f2', { alpha: 0.86 })
    text('A' + (a + 1), aisleX(a), 17.0, 0.8, '#eef0f2', { alpha: 0.7 })
  }
  // Pick spots: a ring and the 1-based bay number at every bay node.
  for (let a = 0; a < AISLES; a++) {
    for (let b = 0; b < BAYS; b++) {
      const x = aisleX(a)
      const z = bayZ(b)
      ctx.strokeStyle = 'rgba(238,240,242,0.62)'
      ctx.lineWidth = 0.035
      ctx.beginPath()
      ctx.arc(x, z, 0.24, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = 0.02
      ctx.beginPath()
      ctx.moveTo(x - 1.1, z)
      ctx.lineTo(x - 0.34, z)
      ctx.moveTo(x + 0.34, z)
      ctx.lineTo(x + 1.1, z)
      ctx.strokeStyle = 'rgba(238,240,242,0.22)'
      ctx.stroke()
      text(String(b + 1), x, z, 0.27, '#eef0f2', { alpha: 0.72, spray: false, font: FONT_M, weight: 600 })
    }
  }

  // Dock zone: hazard border, tinted fill, stencil, door keep-clear box and dock leveller.
  const dz = { x0: -9.7, x1: -2.9, z0: -5.7, z1: 1.7 }
  ctx.fillStyle = 'rgba(242, 194, 48, 0.07)'
  ctx.fillRect(dz.x0, dz.z0, dz.x1 - dz.x0, dz.z1 - dz.z0)
  const bw = 0.2
  hatch(dz.x0, dz.z0, dz.x1 - dz.x0, bw, 'rgba(242,194,48,0.95)', 'rgba(16,16,16,0.85)', 0.16)
  hatch(dz.x0, dz.z1 - bw, dz.x1 - dz.x0, bw, 'rgba(242,194,48,0.95)', 'rgba(16,16,16,0.85)', 0.16)
  hatch(dz.x1 - bw, dz.z0, bw, dz.z1 - dz.z0, 'rgba(242,194,48,0.95)', 'rgba(16,16,16,0.85)', 0.16)
  hatch(dz.x0, dz.z0, bw, dz.z1 - dz.z0, 'rgba(242,194,48,0.95)', 'rgba(16,16,16,0.85)', 0.16)
  text('PACKING DOCK', -3.5, -4.15, 0.34, '#f2c230', { alpha: 0.9 })
  // drop point for the picker at the dock node
  ctx.strokeStyle = 'rgba(242,194,48,0.9)'
  ctx.lineWidth = 0.06
  ctx.strokeRect(DOCK_X - 0.55, DOCK_Z - 0.55, 1.1, 1.1)
  text('DROP', DOCK_X + 0.36, DOCK_Z, 0.2, '#f2c230', { alpha: 0.85, font: FONT_B, weight: 700, spray: false })
  // keep-clear box in front of the shutter door
  ctx.strokeStyle = 'rgba(242,194,48,0.9)'
  ctx.lineWidth = 0.08
  ctx.strokeRect(-9.55, -4.1, 1.6, 4.2)
  ctx.save()
  ctx.beginPath()
  ctx.rect(-9.55, -4.1, 1.6, 4.2)
  ctx.clip()
  ctx.lineWidth = 0.06
  for (let k = -6; k < 6; k += 0.45) {
    ctx.beginPath()
    ctx.moveTo(-9.55, -4.1 + k)
    ctx.lineTo(-7.95, -2.5 + k)
    ctx.stroke()
  }
  ctx.restore()
  // dock leveller plate (chequer plate) at the threshold
  ctx.fillStyle = 'rgba(120,128,134,0.95)'
  ctx.fillRect(-10, -3.9, 0.55, 3.8)
  ctx.fillStyle = 'rgba(70,76,82,0.9)'
  for (let z = -3.85; z < -0.1; z += 0.12) {
    for (let x = -9.97; x < -9.47; x += 0.12) {
      ctx.save()
      ctx.translate(x + ((Math.round(z * 8) % 2) * 0.06), z)
      ctx.rotate(0.7)
      ctx.fillRect(-0.03, -0.008, 0.06, 0.016)
      ctx.restore()
    }
  }
  // staging bay outline at the back-right corner
  ctx.strokeStyle = 'rgba(238,240,242,0.7)'
  ctx.lineWidth = 0.07
  ctx.setLineDash([0.4, 0.25])
  ctx.strokeRect(23.3, 15.2, 3.3, 4.9)
  ctx.setLineDash([])
  text('STAGING', 24.95, 17.6, 0.36, '#eef0f2', { alpha: 0.6 })
  // floor drains
  for (const [x, z] of [[-7.8, 3.6], [23.6, -5.0], [11.0, 22.2]]) {
    ctx.fillStyle = 'rgba(30,32,34,0.85)'
    ctx.fillRect(x - 0.18, z - 0.18, 0.36, 0.36)
    ctx.fillStyle = 'rgba(110,116,120,0.9)'
    for (let k = 0; k < 6; k++) ctx.fillRect(x - 0.15 + k * 0.055, z - 0.15, 0.025, 0.3)
  }

  // Tyre marks: faint paired arcs in the cross-aisles, the back lane and the dock.
  ctx.lineCap = 'round'
  const tyre = (x0, z0, x1, z1, bend) => {
    const mx = (x0 + x1) / 2 + bend * (z1 - z0) * 0.3
    const mz = (z0 + z1) / 2 - bend * (x1 - x0) * 0.3
    for (const off of [-0.45, 0.45]) {
      ctx.beginPath()
      ctx.moveTo(x0, z0 + off)
      ctx.quadraticCurveTo(mx, mz + off, x1, z1 + off)
      ctx.strokeStyle = `rgba(12,12,12,${0.05 + rnd() * 0.06})`
      ctx.lineWidth = 0.1 + rnd() * 0.05
      ctx.stroke()
    }
  }
  for (let k = 0; k < 26; k++) {
    const lane = [FRONT_Z, MIDDLE_Z, BACK_Z, 22.1][k % 4]
    const x0 = -9 + rnd() * 30
    tyre(x0, lane + (rnd() - 0.5) * 2.4, x0 + 3 + rnd() * 7, lane + (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 0.8)
  }
  for (let k = 0; k < 6; k++) tyre(-9 + rnd() * 2, -5 + rnd() * 6, -4 + rnd() * 1.5, -4 + rnd() * 5, (rnd() - 0.5) * 1.6)

  // Wear: punch tiny holes in the paint, heavier where traffic runs.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  const N = Math.round(cw * ch * 0.006)
  for (let k = 0; k < N; k++) {
    const px = rnd() * cw
    const py = rnd() * ch
    const z = HALL.z0 + py / ppm
    const nearCross = Math.min(Math.abs(z - FRONT_Z), Math.abs(z - MIDDLE_Z), Math.abs(z - BACK_Z)) < 2.2
    if (!nearCross && rnd() < 0.55) continue
    ctx.globalAlpha = 0.2 + rnd() * 0.6
    const s = 1 + rnd() * (rnd() < 0.08 ? 7 : 2.5)
    ctx.fillRect(px, py, s, s * (0.4 + rnd()))
  }
  // long scuffs
  for (let k = 0; k < 160; k++) {
    ctx.globalAlpha = 0.08 + rnd() * 0.18
    ctx.lineWidth = 1 + rnd() * 2
    const px = rnd() * cw
    const py = rnd() * ch
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + (rnd() - 0.5) * 60, py + (rnd() - 0.5) * 18)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return c
}

/** Corrugated board atlas, neutral (tinted by material or instance colour). 2 x 2 regions. */
function genCartonAtlas() {
  const S = 512
  const H = 256
  const c = makeCanvas(S, S)
  const ctx = c.getContext('2d')
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
  const tape = (x, y, w, h) => {
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

/** Bay location labels for the pick-level beams: 10 x 10 cells of 200 x 64 px, cell = slot id. */
function genBeamLabels() {
  const CW = 200
  const CH = 64
  const c = makeCanvas(CW * 10, CH * 10)
  const ctx = c.getContext('2d')
  for (let s = 0; s < SLOTS; s++) {
    const a = slotAisle(s)
    const side = slotSide(s)
    const b = slotBay(s)
    const code = `A${a + 1}-${side === 0 ? 'L' : 'R'}-${String(b + 1).padStart(2, '0')}` // 1-based, as in the UI
    ctx.save()
    ctx.translate((s % 10) * CW, Math.floor(s / 10) * CH)
    ctx.fillStyle = '#f5f5f0'
    ctx.fillRect(2, 2, CW - 4, CH - 4)
    ctx.fillStyle = '#121416'
    ctx.font = `700 27px ${FONT_M}`
    ctx.textBaseline = 'middle'
    ctx.fillText(code, 10, 21)
    // arrow up: this label belongs to the slot above the beam
    ctx.beginPath()
    ctx.moveTo(CW - 22, 10)
    ctx.lineTo(CW - 12, 26)
    ctx.lineTo(CW - 32, 26)
    ctx.closePath()
    ctx.fill()
    drawCode39(ctx, `A${a + 1}${side === 0 ? 'L' : 'R'}${b + 1}`, 10, 38, CW - 20, 18)
    ctx.restore()
  }
  return c
}

/** Sign atlas: 6 hanging signs (1024 x 256), a wall banner (2048 x 256), 8 small signs (256 x 256). */
const SIGN_ATLAS = { w: 2048, h: 1280 }
function signRect(kind, i) {
  // returns [x, y, w, h] in canvas px
  if (kind === 'big') return [(i % 2) * 1024, Math.floor(i / 2) * 256, 1024, 256]
  if (kind === 'banner') return [0, 768, 2048, 256]
  return [i * 256, 1024, 256, 256]
}
function genSigns() {
  const c = makeCanvas(SIGN_ATLAS.w, SIGN_ATLAS.h)
  const ctx = c.getContext('2d')
  ctx.textBaseline = 'middle'
  // Hanging aisle signs (1-based aisle and bay numbers, as in the UI)
  for (let a = 0; a < AISLES; a++) {
    const [x, y, w, h] = signRect('big', a)
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = '#132029'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d9dee2'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.fillStyle = '#f2c230'
    ctx.fillRect(22, 22, 212, h - 44)
    ctx.fillStyle = '#111'
    ctx.font = `800 170px ${FONT_D}`
    ctx.textAlign = 'center'
    ctx.fillText('A' + (a + 1), 128, h / 2 + 8)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f4f6f7'
    ctx.font = `800 118px ${FONT_D}`
    ctx.fillText('AISLE ' + (a + 1), 268, 100)
    ctx.fillStyle = '#9fb0bc'
    ctx.font = `600 46px ${FONT_M}`
    ctx.fillText('BAYS 1-10', 272, 194)
    ctx.restore()
  }
  // Packing dock sign
  {
    const [x, y, w, h] = signRect('big', 5)
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = '#f2c230'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#111'
    for (let k = -2; k < 60; k++) {
      ctx.beginPath()
      ctx.moveTo(k * 36, 0)
      ctx.lineTo(k * 36 + 18, 0)
      ctx.lineTo(k * 36 + 18 - 22, 22)
      ctx.lineTo(k * 36 - 22, 22)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(k * 36, h - 22)
      ctx.lineTo(k * 36 + 18, h - 22)
      ctx.lineTo(k * 36 + 18 - 22, h)
      ctx.lineTo(k * 36 - 22, h)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#111'
    // parcel glyph
    ctx.save()
    ctx.translate(120, h / 2)
    ctx.lineWidth = 10
    ctx.strokeStyle = '#111'
    ctx.strokeRect(-56, -48, 112, 96)
    ctx.fillRect(-10, -48, 20, 40)
    ctx.restore()
    ctx.font = `800 140px ${FONT_D}`
    ctx.textAlign = 'left'
    ctx.fillText('PACKING DOCK', 216, h / 2 + 6)
    ctx.restore()
  }
  // Wall banner
  {
    const [x, y, w, h] = signRect('banner', 0)
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = '#16232c'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff7a1a'
    ctx.fillRect(0, h - 26, w * 0.62, 26)
    ctx.fillStyle = '#39d0ff'
    ctx.fillRect(w * 0.62, h - 26, w * 0.38, 26)
    ctx.fillStyle = '#f4f6f7'
    ctx.font = `800 170px ${FONT_D}`
    ctx.textAlign = 'left'
    ctx.fillText('GHOSTWALK', 60, 112)
    ctx.fillStyle = '#9fb0bc'
    ctx.font = `600 58px ${FONT_M}`
    ctx.textAlign = 'right'
    ctx.fillText('PICK FLOOR 01   5 AISLES   100 SLOTS', w - 60, 112)
    ctx.restore()
  }
  // Small signs
  const small = (i, draw) => {
    const [x, y, w, h] = signRect('small', i)
    ctx.save()
    ctx.translate(x, y)
    ctx.textAlign = 'center'
    draw(w, h)
    ctx.restore()
  }
  small(0, (w, h) => {
    ctx.fillStyle = '#1b2a35'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f2c230'
    ctx.fillRect(0, 0, w, 40)
    ctx.fillStyle = '#111'
    ctx.font = `800 34px ${FONT_D}`
    ctx.fillText('DOOR', w / 2, 22)
    ctx.fillStyle = '#f4f6f7'
    ctx.font = `800 150px ${FONT_D}`
    ctx.fillText('01', w / 2, 150)
  })
  small(1, (w, h) => {
    ctx.fillStyle = '#f4f6f7'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1f5fbf'
    ctx.beginPath()
    ctx.arc(w / 2, 100, 78, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#f4f6f7'
    ctx.fillRect(w / 2 - 34, 70, 68, 70)
    ctx.fillStyle = '#1f5fbf'
    ctx.fillRect(w / 2 - 8, 70, 16, 70)
    ctx.beginPath()
    ctx.arc(w / 2, 52, 16, 0, TAU)
    ctx.fillStyle = '#f4f6f7'
    ctx.fill()
    ctx.fillStyle = '#1f5fbf'
    ctx.font = `800 40px ${FONT_D}`
    ctx.fillText('HI-VIS REQUIRED', w / 2, 214)
  })
  small(2, (w, h) => {
    ctx.fillStyle = '#f4f6f7'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f2c230'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(w / 2, 22)
    ctx.lineTo(w / 2 + 92, 170)
    ctx.lineTo(w / 2 - 92, 170)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.fillRect(w / 2 - 30, 108, 44, 30)
    ctx.fillRect(w / 2 + 14, 88, 6, 50)
    ctx.fillRect(w / 2 + 14, 132, 30, 6)
    ctx.beginPath()
    ctx.arc(w / 2 - 20, 146, 9, 0, TAU)
    ctx.arc(w / 2 + 6, 146, 9, 0, TAU)
    ctx.fill()
    ctx.font = `800 40px ${FONT_D}`
    ctx.fillText('FORKLIFT ROUTE', w / 2, 214)
  })
  small(3, (w, h) => {
    ctx.fillStyle = '#138a43'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f6f7'
    ctx.font = `800 64px ${FONT_D}`
    ctx.fillText('FIRE EXIT', w / 2, 64)
    ctx.beginPath()
    ctx.moveTo(60, 160)
    ctx.lineTo(160, 160)
    ctx.lineTo(160, 130)
    ctx.lineTo(210, 175)
    ctx.lineTo(160, 220)
    ctx.lineTo(160, 190)
    ctx.lineTo(60, 190)
    ctx.closePath()
    ctx.fill()
  })
  small(4, (w, h) => {
    ctx.fillStyle = '#f4f6f7'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d22'
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.arc(w / 2, 108, 80, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.font = `800 110px ${FONT_D}`
    ctx.fillText('5', w / 2, 114)
    ctx.font = `800 40px ${FONT_D}`
    ctx.fillText('KM/H', w / 2, 222)
  })
  small(5, (w, h) => {
    ctx.fillStyle = '#c62828'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f6f7'
    ctx.font = `800 44px ${FONT_D}`
    ctx.fillText('FIRE', w / 2, 40)
    ctx.fillText('EXTINGUISHER', w / 2, 82)
    roundRectPath(ctx, w / 2 - 28, 110, 56, 120, 20)
    ctx.fill()
    ctx.fillRect(w / 2 - 10, 96, 20, 20)
  })
  small(6, (w, h) => {
    ctx.fillStyle = '#138a43'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f6f7'
    ctx.fillRect(w / 2 - 22, 50, 44, 130)
    ctx.fillRect(w / 2 - 65, 93, 130, 44)
    ctx.font = `800 40px ${FONT_D}`
    ctx.fillText('FIRST AID', w / 2, 220)
  })
  small(7, (w, h) => {
    ctx.fillStyle = '#20262b'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f2c230'
    ctx.font = `800 54px ${FONT_D}`
    ctx.fillText('CHARGING', w / 2, 70)
    ctx.fillText('POINT', w / 2, 124)
    ctx.beginPath()
    ctx.moveTo(w / 2 + 10, 150)
    ctx.lineTo(w / 2 - 26, 200)
    ctx.lineTo(w / 2 - 2, 200)
    ctx.lineTo(w / 2 - 12, 240)
    ctx.lineTo(w / 2 + 28, 188)
    ctx.lineTo(w / 2 + 4, 188)
    ctx.closePath()
    ctx.fill()
  })
  return c
}

/** Emissive atlas (unlit): monitor UI, cart tablet, keyboard, LED white, status LEDs. 512 x 256. */
const SCREEN_RECT = {
  monitor: [0, 0, 256, 160],
  tablet: [256, 0, 128, 96],
  white: [384, 0, 64, 64],
  green: [448, 0, 32, 32],
  red: [480, 0, 32, 32],
  amber: [448, 32, 32, 32],
  keyboard: [0, 160, 256, 96],
  glass: [256, 96, 128, 64],
}
function genScreens() {
  const c = makeCanvas(512, 256)
  const ctx = c.getContext('2d')
  const r = SCREEN_RECT
  // monitor UI: pack station screen
  ctx.save()
  ctx.translate(r.monitor[0], r.monitor[1])
  ctx.fillStyle = '#0d1a24'
  ctx.fillRect(0, 0, 256, 160)
  ctx.fillStyle = '#16354a'
  ctx.fillRect(0, 0, 256, 22)
  ctx.fillStyle = '#e7f1f7'
  ctx.font = `700 12px ${FONT_B}`
  ctx.textBaseline = 'middle'
  ctx.fillText('PACK STATION 01', 8, 11)
  ctx.fillStyle = '#3ddc84'
  ctx.beginPath()
  ctx.arc(244, 11, 4, 0, TAU)
  ctx.fill()
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k === 1 ? '#ff7a1a' : '#24465c'
    ctx.fillRect(8, 30 + k * 18, 120, 12)
    ctx.fillStyle = '#7fa3b8'
    ctx.fillRect(134, 33 + k * 18, 40 + ((k * 37) % 50), 6)
  }
  ctx.fillStyle = '#e7f1f7'
  ctx.fillRect(186, 32, 62, 62)
  ctx.fillStyle = '#0d1a24'
  drawCode39(ctx, 'GW01', 190, 40, 54, 30)
  ctx.fillStyle = '#39d0ff'
  ctx.fillRect(8, 142, 160, 8)
  ctx.fillStyle = '#24465c'
  ctx.fillRect(168, 142, 80, 8)
  ctx.restore()
  // tablet on the cart handle
  ctx.save()
  ctx.translate(r.tablet[0], r.tablet[1])
  ctx.fillStyle = '#0c1820'
  ctx.fillRect(0, 0, 128, 96)
  ctx.fillStyle = '#ff7a1a'
  ctx.fillRect(0, 0, 128, 16)
  ctx.fillStyle = '#e7f1f7'
  for (let k = 0; k < 4; k++) ctx.fillRect(8, 24 + k * 16, 70 + ((k * 23) % 40), 7)
  ctx.fillStyle = '#3ddc84'
  ctx.fillRect(8, 82, 112, 6)
  ctx.restore()
  // keyboard keys
  ctx.save()
  ctx.translate(r.keyboard[0], r.keyboard[1])
  ctx.fillStyle = '#16191c'
  ctx.fillRect(0, 0, 256, 96)
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 15; col++) {
      ctx.fillStyle = '#2b3036'
      ctx.fillRect(4 + col * 16.6, 4 + row * 18, 14, 15)
    }
  }
  ctx.restore()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(...r.white)
  ctx.fillStyle = '#4dff8a'
  ctx.fillRect(...r.green)
  ctx.fillStyle = '#ff3b30'
  ctx.fillRect(...r.red)
  ctx.fillStyle = '#ffb020'
  ctx.fillRect(...r.amber)
  // dark glass (night windows / screens off)
  const gg = ctx.createLinearGradient(r.glass[0], r.glass[1], r.glass[0], r.glass[1] + r.glass[3])
  gg.addColorStop(0, '#24384a')
  gg.addColorStop(1, '#0b141c')
  ctx.fillStyle = gg
  ctx.fillRect(...r.glass)
  return c
}
/** uvRect for Bucket.add from a canvas rect [x, y, w, h] on an atlas of size W x H (flipY true). */
function atlasUV(rect, W, H) {
  const [x, y, w, h] = rect
  return [x / W, 1 - (y + h) / H, w / W, h / H]
}

/** Hazard atlas: top half diagonal yellow and black stripes, bottom half bollard bands. */
function genHazard() {
  const c = makeCanvas(256, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f2b90f'
  ctx.fillRect(0, 0, 256, 128)
  ctx.fillStyle = '#16171a'
  for (let k = -256; k < 512; k += 64) {
    ctx.beginPath()
    ctx.moveTo(k, 0)
    ctx.lineTo(k + 32, 0)
    ctx.lineTo(k + 32 - 128, 128)
    ctx.lineTo(k - 128, 128)
    ctx.closePath()
    ctx.fill()
  }
  // bollard (v from bottom: 0 base .. 1 top), canvas rows 128..255 -> top of bollard at row 128
  ctx.fillStyle = '#f2b90f'
  ctx.fillRect(0, 128, 256, 128)
  ctx.fillStyle = '#16171a'
  ctx.fillRect(0, 128 + 18, 256, 16)
  ctx.fillRect(0, 128 + 58, 256, 16)
  ctx.fillStyle = '#e8edf1'
  ctx.fillRect(0, 128 + 38, 256, 14)
  ctx.fillStyle = '#3a3b3d'
  ctx.fillRect(0, 248, 256, 8)
  // wear
  const rnd = mulberry32(5)
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.12})`
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3)
  }
  return c
}
const HAZ_STRIPES = [0, 0.5, 1, 0.5]
const HAZ_BOLLARD = [0, 0, 1, 0.5]

/** Insulated wall panels with a concrete plinth and a clerestory window band. u = 4 m, v = full height. */
function genWall() {
  const W = 512
  const H = 1024
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  const e = makeCanvas(128, 256)
  const ectx = e.getContext('2d')
  const yOf = (m) => H - (m / HALL.h) * H
  ctx.fillStyle = '#d4d8db'
  ctx.fillRect(0, 0, W, H)
  // vertical ribs every 1/3 m
  for (let k = 0; k < 12; k++) {
    const x = (k * W) / 12
    const g = ctx.createLinearGradient(x, 0, x + W / 12, 0)
    g.addColorStop(0, 'rgba(255,255,255,0.10)')
    g.addColorStop(0.12, 'rgba(255,255,255,0.0)')
    g.addColorStop(0.82, 'rgba(0,0,0,0.0)')
    g.addColorStop(0.9, 'rgba(0,0,0,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0.04)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, W / 12, H)
  }
  // horizontal panel joints
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  for (let m = 1.2; m < HALL.h; m += 1.1) ctx.fillRect(0, yOf(m), W, 2)
  // window band 5.5..6.6 m
  const w0 = yOf(6.6)
  const w1 = yOf(5.5)
  ctx.fillStyle = '#2b3946'
  ctx.fillRect(0, w0, W, w1 - w0)
  ectx.fillStyle = '#000'
  ectx.fillRect(0, 0, 128, 256)
  for (let k = 0; k < 4; k++) {
    const x = (k * W) / 4
    const gl = ctx.createLinearGradient(0, w0, 0, w1)
    gl.addColorStop(0, '#7f97ab')
    gl.addColorStop(1, '#4d6275')
    ctx.fillStyle = gl
    ctx.fillRect(x + 8, w0 + 8, W / 4 - 16, w1 - w0 - 16)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x + 8, w0 + 8, (W / 4 - 16) * 0.35, w1 - w0 - 16)
    ectx.fillStyle = '#fff'
    ectx.fillRect((x + 8) / 4, (w0 + 8) / 4, (W / 4 - 16) / 4, (w1 - w0 - 16) / 4)
  }
  // plinth 0..1.2 m painted concrete, yellow line on top
  const p0 = yOf(1.2)
  ctx.fillStyle = '#6b7176'
  ctx.fillRect(0, p0, W, H - p0)
  const rnd = mulberry32(9)
  for (let k = 0; k < 1400; k++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.07})`
    ctx.fillRect(rnd() * W, p0 + rnd() * (H - p0), 1 + rnd() * 3, 1 + rnd() * 3)
  }
  ctx.fillStyle = '#e7b416'
  ctx.fillRect(0, p0 - 10, W, 10)
  // grime at the bottom
  const gr = ctx.createLinearGradient(0, H - 60, 0, H)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = gr
  ctx.fillRect(0, H - 60, W, 60)
  return { color: c, emissive: e }
}

/** Roller shutter (top 3/4) and the dark opening under it (bottom 1/4). 256 x 512. */
function genDoor() {
  const c = makeCanvas(256, 512)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#a9b1b7'
  ctx.fillRect(0, 0, 256, 384)
  for (let y = 0; y < 384; y += 10) {
    const g = ctx.createLinearGradient(0, y, 0, y + 10)
    g.addColorStop(0, 'rgba(255,255,255,0.28)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.0)')
    g.addColorStop(0.85, 'rgba(0,0,0,0.22)')
    g.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = g
    ctx.fillRect(0, y, 256, 10)
  }
  // vision slots
  ctx.fillStyle = '#26333d'
  for (let k = 0; k < 6; k++) ctx.fillRect(18 + k * 38, 160, 28, 7)
  // bottom bar and hazard edge
  ctx.fillStyle = '#2b2f33'
  ctx.fillRect(0, 366, 256, 18)
  ctx.fillStyle = '#f2b90f'
  for (let k = 0; k < 16; k++) if (k % 2 === 0) ctx.fillRect(k * 16, 358, 16, 8)
  // dirt
  const rnd = mulberry32(3)
  for (let k = 0; k < 600; k++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`
    ctx.fillRect(rnd() * 256, rnd() * 384, 2 + rnd() * 10, 1 + rnd() * 2)
  }
  // opening: trailer interior, dark with faint ribs
  const g = ctx.createLinearGradient(0, 384, 0, 512)
  g.addColorStop(0, '#05070a')
  g.addColorStop(1, '#14191e')
  ctx.fillStyle = g
  ctx.fillRect(0, 384, 256, 128)
  ctx.fillStyle = 'rgba(120,140,160,0.08)'
  for (let x = 6; x < 256; x += 22) ctx.fillRect(x, 384, 3, 128)
  return c
}

function genWood() {
  const c = makeCanvas(256, 256)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(256, 256)
  const d = img.data
  const NW = noiseGrid(256, 256, 6, 85, 41)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = NW[y * 256 + x]
      const ring = 0.5 + 0.5 * Math.sin(y * 0.35 + n * 9 + Math.sin(x / 28) * 1.5)
      const g = hashi(x, y, 2)
      const v = 0.72 + ring * 0.12 + (g - 0.5) * 0.06
      const i = (y * 256 + x) * 4
      d[i] = clamp(v, 0, 1) * 255
      d[i + 1] = clamp(v * 0.82, 0, 1) * 255
      d[i + 2] = clamp(v * 0.6, 0, 1) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.fillStyle = 'rgba(60,40,20,0.35)'
  ctx.beginPath()
  ctx.ellipse(170, 90, 9, 5, 0, 0, TAU)
  ctx.fill()
  return c
}

/** Radial falloff: white centre, transparent edge. */
function genRadial(size = 128, power = 1.6) {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1
      const dy = (y + 0.5) / size * 2 - 1
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy))
      const a = Math.pow(1 - r, power) * (1 - smoothstep(0.92, 1, r))
      const i = (y * size + x) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}
/** Soft rectangle (contact shadow / floor glow): solid core, blurred edge. */
function genSoftRect(size = 128, inset = 0.22) {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size * 2 - 1)
      const v = Math.abs((y + 0.5) / size * 2 - 1)
      const k = 1 - inset * 2
      const du = Math.max(0, u - k) / (1 - k)
      const dv = Math.max(0, v - k) / (1 - k)
      const r = Math.min(1, Math.sqrt(du * du + dv * dv))
      const a = 1 - smoothstep(0, 1, r)
      const i = (y * size + x) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = a * a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}
/** Stretch film: semi-transparent horizontal wrap bands with highlights. */
function genFilm() {
  const c = makeCanvas(256, 256)
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  ctx.fillRect(0, 0, 256, 256)
  const rnd = mulberry32(13)
  for (let k = 0; k < 22; k++) {
    const y = rnd() * 256
    const h = 8 + rnd() * 40
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.22})`
    ctx.save()
    ctx.translate(0, y)
    ctx.rotate((rnd() - 0.5) * 0.12)
    ctx.fillRect(-20, 0, 300, h)
    ctx.restore()
  }
  for (let k = 0; k < 40; k++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`
    ctx.lineWidth = 0.5 + rnd() * 1.5
    const y = rnd() * 256
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(80, y + (rnd() - 0.5) * 20, 170, y + (rnd() - 0.5) * 20, 256, y + (rnd() - 0.5) * 6)
    ctx.stroke()
  }
  return c
}
/** Upright punching: white steel with teardrop slots (alpha holes). 64 x 192 = face width x 0.3 m. */
function genHoles() {
  const c = makeCanvas(64, 192)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 192)
  ctx.fillStyle = '#c4c4c4'
  ctx.fillRect(0, 0, 3, 192)
  ctx.fillRect(61, 0, 3, 192)
  ctx.fillStyle = '#000'
  for (let k = 0; k < 6; k++) {
    const y = 6 + k * 32
    for (const cx of [20.5, 43.5]) {
      ctx.beginPath()
      ctx.moveTo(cx - 4.5, y + 4)
      ctx.arc(cx, y + 4, 4.5, Math.PI, 0)
      ctx.lineTo(cx + 4.5, y + 12)
      ctx.lineTo(cx, y + 19)
      ctx.lineTo(cx - 4.5, y + 12)
      ctx.closePath()
      ctx.fill()
    }
  }
  return c
}
/** Wire mesh decking tile: wires on the tile edges (so uv 0,0 is solid wire). */
function genWire() {
  const c = makeCanvas(64, 64)
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 64, 64)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 6)
  ctx.fillRect(0, 0, 7, 64)
  ctx.fillStyle = '#d0d0d0'
  ctx.fillRect(0, 5, 64, 1)
  ctx.fillRect(6, 0, 1, 64)
  return c
}
/** Speckled wear for painted lines (alpha). Tiles. */
function genWear() {
  const c = makeCanvas(128, 128)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(128, 128)
  const d = img.data
  const NW = fbmGrid(128, 128, 8, 3, 61)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const n = NW[y * 128 + x]
      const g = hashi(x, y, 62)
      const v = n * 0.9 + g * 0.25 > 0.4 ? 255 : 40
      const i = (y * 128 + x) * 4
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// ---------------------------------------------------------------------------------------------
// Shader patches (onBeforeCompile). Each gets its own program cache key.
// ---------------------------------------------------------------------------------------------

const GLSL_BAYER = `
float gwBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float gwBayer4(vec2 a) { return gwBayer2(0.5 * a) * 0.25 + gwBayer2(a); }
`

/** Screen-door fade: fragments are discarded as the fade uniform goes 0 -> 1. No sorting needed. */
function patchDither(material, fadeUniform, perInstance, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fadeUniform
    if (perInstance) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFadeK;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFadeK = aFade;')
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFade;\n${perInstance ? 'varying float vFadeK;' : ''}\n${GLSL_BAYER}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>\n{ float gwF = uFade${perInstance ? ' * vFadeK' : ''}; if (gwF > 0.001 && gwBayer4(gl_FragCoord.xy) < gwF) discard; }`,
      )
  }
  material.customProgramCacheKey = () => key
}

/**
 * Near-camera fade for static occluders (columns, racks, signs, pallets): fragments closer than
 * about 3.4 m to the camera are screen-door dithered away, fully gone inside 1.6 m. A low or
 * following camera then sees past a column or upright instead of into it. Shadows are unaffected
 * (the shadow pass uses its own depth material).
 */
function patchNear(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_BAYER}`)
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n{ float gwN = 1.0 - smoothstep(1.6, 3.4, length(vViewPosition)); if (gwN > 0.001 && gwBayer4(gl_FragCoord.xy) < gwN) discard; }',
      )
  }
  material.customProgramCacheKey = () => 'gw-near'
}

/** Per-instance atlas cell: vMapUv = (uv + aCell) / grid. */
function patchAtlas(material, cols, rows, key) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (vMapUv + aCell) * vec2(${(1 / cols).toFixed(6)}, ${(1 / rows).toFixed(6)});`)
  }
  material.customProgramCacheKey = () => key
}

/** Concrete floor: large-scale tone and roughness from a hall-sized map, saw-cut joints on a 6 m grid. */
function patchFloor(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMacro;
uniform vec2 uMacroOrigin;
uniform vec2 uMacroSize;
varying vec2 vFloorXZ;
vec2 gwMacro;
float gwJoint;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
gwMacro = texture2D(uMacro, (vFloorXZ - uMacroOrigin) / uMacroSize).rg;
diffuseColor.rgb *= mix(0.8, 1.13, gwMacro.r);
{
  vec2 jt = fract((vFloorXZ - uMacroOrigin) / 6.0);
  vec2 jd = (0.5 - abs(jt - 0.5)) * 6.0;
  float jdist = min(jd.x, jd.y);
  float jw = max(fwidth(jdist), 1e-4);
  float cover = clamp(0.012 / jw, 0.0, 1.0);
  gwJoint = (1.0 - smoothstep(0.0, jw * 1.2, jdist - 0.004)) * cover;
  float chamfer = (1.0 - smoothstep(0.0, 0.035 + jw, jdist)) * cover;
  diffuseColor.rgb *= (1.0 - 0.55 * gwJoint) * (1.0 - 0.07 * chamfer);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * mix(0.72, 1.22, gwMacro.g) + gwJoint * 0.3, 0.05, 1.0);`,
      )
  }
  material.customProgramCacheKey = () => 'gw-floor'
}

// Unit carton with a 2 x 2 atlas: top (tape), front (tape end), sides (hand hole, arrows), back/bottom.
function cartonGeometry() {
  const pos = []
  const nor = []
  const uv = []
  const idx = []
  const R = { top: [0, 0], front: [1, 0], side: [0, 1], back: [1, 1] }
  const face = (o, ua, va, n, reg) => {
    const base = pos.length / 3
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
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

// Billboard quad shader (instanced): used for fixture glows.
const BILLBOARD_VERT = `
uniform float uSize;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`
const GLOW_FRAG = `
uniform vec3 uColor;
uniform float uFade;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - r, 0.0), 2.4) * (1.0 - uFade);
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`
// ---------------------------------------------------------------------------------------------
// Environment for reflections (PMREM from a tiny procedural room)
// ---------------------------------------------------------------------------------------------

function buildEnvScene() {
  const p = DARK
  const scene = new THREE.Scene()
  const items = []
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 16, 60), new THREE.MeshBasicMaterial({ color: p.envRoom, side: THREE.BackSide }))
  room.position.y = 7
  scene.add(room)
  items.push(room)
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.envStrip).multiplyScalar(p.envStripK) })
  const stripGeo = new THREE.BoxGeometry(1.4, 0.2, 40)
  for (let i = -2; i <= 2; i++) {
    const m = new THREE.Mesh(stripGeo, stripMat)
    m.position.set(i * 9, 14.6, 0)
    scene.add(m)
    items.push(m)
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: p.envFloor }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.95
  scene.add(floor)
  items.push(floor)
  return {
    scene,
    dispose() {
      const seen = new Set()
      for (const m of items) {
        for (const x of [m.geometry, m.material]) {
          if (!seen.has(x)) {
            seen.add(x)
            x.dispose()
          }
        }
      }
    },
  }
}

/**
 * Reflection map for every lit material in the app: a PMREM of the tiny room above, built once.
 * The env scene is freed right away; dispose() frees the render target and the generator.
 */
export function createEnvironment(gl: THREE.WebGLRenderer): EnvironmentHandle {
  const pmrem = new THREE.PMREMGenerator(gl)
  const env = buildEnvScene()
  const rt = pmrem.fromScene(env.scene, 0.04)
  env.dispose()
  return {
    texture: rt.texture,
    dispose() {
      rt.dispose()
      pmrem.dispose()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Warehouse: floor, racks, overstock, dock, building shell, lights
// ---------------------------------------------------------------------------------------------

const RACK_BLUE = '#2a5ea8'
const RACK_ORANGE = '#e8611a'
const SOLID_UV = [0.15, 0.5, 0, 0]

/**
 * buildWarehouse({ quality, overlayPPM = 48 }) -> WarehouseHandle. Everything the builder creates
 * goes into one disposal bag (no shared texture cache), so a rebuild never waits on another owner.
 */
export function buildWarehouse(opts: { quality: WarehouseQuality; overlayPPM?: number }): WarehouseHandle {
  const bag = makeBag()
  const mat = matFactory()
  const group = new THREE.Group()
  group.name = 'warehouse'
  const uni = { overheadFade: { value: 0 }, cut: { value: 0 } }
  const meshes = {}
  // every lit material: the dark env level times its own factor (the Floor Lab set this in setTheme)
  const std = (params, envK = 1) => {
    const m = new THREE.MeshStandardMaterial(params)
    m.envMapIntensity = DARK.envI * envK
    return bag.add(m)
  }
  const addMesh = (name, geo, material, { cast = false, receive = false, order = 0 } = {}) => {
    const m = new THREE.Mesh(geo, material)
    m.name = name
    m.castShadow = cast
    m.receiveShadow = receive
    m.renderOrder = order
    group.add(m)
    bag.add(geo)
    meshes[name] = m
    return m
  }
  const addInst = (name, geo, material, matrices, { cast = false, receive = false, order = 0 } = {}) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, matrices.length))
    m.name = name
    for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i])
    m.count = matrices.length
    m.instanceMatrix.needsUpdate = true
    m.castShadow = cast
    m.receiveShadow = receive
    m.renderOrder = order
    m.computeBoundingSphere()
    group.add(m)
    bag.add(geo)
    meshes[name] = m
    return m
  }

  // Shared primitives (scaled through matrices).
  const UB = bag.add(new THREE.BoxGeometry(1, 1, 1))
  const UC = {}
  const unitCyl = (segs) => UC[segs] || (UC[segs] = bag.add(new THREE.CylinderGeometry(1, 1, 1, segs, 1)))
  const US = bag.add(new THREE.SphereGeometry(1, 14, 10))
  const UP = bag.add(new THREE.PlaneGeometry(1, 1))
  const bx = (b, x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0, uv = null) => b.add(UB, mat(x, y, z, rx, ry, rz, w, h, d), color, uv)
  const cy = (b, x, y, z, r, h, color, segs = 12, rx = 0, ry = 0, rz = 0, uv = null) => b.add(unitCyl(segs), mat(x, y, z, rx, ry, rz, r, h, r), color, uv)
  const sp = (b, x, y, z, r, color, sy = 1) => b.add(US, mat(x, y, z, 0, 0, 0, r, r * sy, r), color)
  const bxP = (b, parent, x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0, uv = null) =>
    b.add(UB, parent.clone().multiply(mat(x, y, z, rx, ry, rz, w, h, d)), color, uv)
  const cyP = (b, parent, x, y, z, r, h, color, segs = 12, rx = 0, ry = 0, rz = 0) =>
    b.add(unitCyl(segs), parent.clone().multiply(mat(x, y, z, rx, ry, rz, r, h, r)), color)

  // ---- textures ----------------------------------------------------------------------------
  const HW = HALL.x1 - HALL.x0
  const HD = HALL.z1 - HALL.z0
  const concrete = genConcrete(512)
  const tConcrete = bag.add(canvasTex(concrete.color, { repeat: [HW / 4, HD / 4], aniso: 16 }))
  const tConcreteR = bag.add(canvasTex(concrete.rough, { repeat: [HW / 4, HD / 4], srgb: false, aniso: 16 }))
  const tMacro = bag.add(canvasTex(genMacro(256), { srgb: false, flipY: false, aniso: 4 }))
  const tOverlay = bag.add(canvasTex(genFloorOverlay(opts.overlayPPM || 48), { aniso: 16 }))
  const tHoles = bag.add(canvasTex(genHoles(), { repeat: [1, 1], srgb: false, aniso: 8 }))
  const tWire = bag.add(canvasTex(genWire(), { repeat: [0.9 / 0.06, 1.1 / 0.06], srgb: false, aniso: 8 }))
  const tWear = bag.add(canvasTex(genWear(), { repeat: [1, 1], srgb: false, aniso: 4 }))
  const tFilm = bag.add(canvasTex(genFilm(), { aniso: 4 }))
  const tSigns = bag.add(canvasTex(genSigns(), { aniso: 8 }))
  const tBeamLabels = bag.add(canvasTex(genBeamLabels(), { aniso: 8 }))
  const wallCanvases = genWall()
  const tWall = bag.add(canvasTex(wallCanvases.color, { repeat: [1, 1], aniso: 8 }))
  const tWallE = bag.add(canvasTex(wallCanvases.emissive, { repeat: [1, 1], aniso: 4 }))
  tWall.wrapT = THREE.ClampToEdgeWrapping
  tWallE.wrapT = THREE.ClampToEdgeWrapping
  const tDoor = bag.add(canvasTex(genDoor(), { aniso: 8 }))
  const tWood = bag.add(canvasTex(genWood(), { repeat: [1, 1], aniso: 8 }))
  const tCarton = bag.add(canvasTex(genCartonAtlas(), { aniso: 8 }))
  const tRadial = bag.add(canvasTex(genRadial(128, 1.6), { srgb: false, aniso: 1 }))
  const tSoft = bag.add(canvasTex(genSoftRect(128, 0.24), { srgb: false, aniso: 4 }))
  const tHaz = bag.add(canvasTex(genHazard(), { aniso: 8 }))
  const tScreens = bag.add(canvasTex(genScreens(), { aniso: 8 }))

  // ---- floor -------------------------------------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(HW, HD).rotateX(-Math.PI / 2)
  floorGeo.translate((HALL.x0 + HALL.x1) / 2, 0, (HALL.z0 + HALL.z1) / 2)
  const floorMat = std({ color: DARK.floor, map: tConcrete, roughnessMap: tConcreteR, roughness: 1, metalness: 0 }, 1)
  patchFloor(floorMat, {
    uMacro: { value: tMacro },
    uMacroOrigin: { value: new THREE.Vector2(HALL.x0, HALL.z0) },
    uMacroSize: { value: new THREE.Vector2(HW, HD) },
  })
  const floor = addMesh('floor', floorGeo, floorMat, { receive: true })
  floor.frustumCulled = false

  const ovGeo = floorGeo.clone()
  ovGeo.translate(0, 0.01, 0)
  const ovMat = std({ map: tOverlay, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 1.2)
  addMesh('floor-markings', ovGeo, ovMat, { receive: true, order: 1 })

  // continuous yellow safety lines along every rack face
  {
    const lb = new Bucket()
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const rnd = mulberry32(17)
    for (let a = 0; a < AISLES; a++) {
      for (const s of [-1, 1]) {
        for (const z0 of RUN_Z0) {
          lb.add(strip, mat(aisleX(a) + s * 1.43, 0.016, z0 + 3, 0, 0, 0, 0.1, 1, 6.0), 0xffffff, [rnd(), rnd(), 0.1 / 1.2, 6 / 1.2])
        }
      }
    }
    strip.dispose()
    const lineMat = std({ color: '#f2c230', alphaMap: tWear, alphaTest: 0.5, roughness: 0.4, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, 1)
    addMesh('safety-lines', lb.build(), lineMat, { receive: true, order: 2 })
  }

  // outside ground (the slab edge is in the painted bucket below)
  const groundGeo = new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2)
  groundGeo.translate(8.5, -0.42, 8)
  const groundMat = std({ color: DARK.ground, roughness: 1, metalness: 0 }, 0.3)
  addMesh('ground', groundGeo, groundMat, { receive: true })

  // ---- buckets for static parts -------------------------------------------------------------
  const steel = new Bucket()
  const paint = new Bucket()
  const wood = new Bucket()
  const signs = new Bucket()
  const screens = new Bucket()
  const haz = new Bucket()
  const overhead = new Bucket()
  const ceiling = new Bucket()
  const leds = new Bucket()
  const skylights = new Bucket()
  const shadowDecals = [] // [x, z, w, d, rotY]

  bx(paint, (HALL.x0 + HALL.x1) / 2, -0.215, (HALL.z0 + HALL.z1) / 2, HW + 0.12, 0.4, HD + 0.12, '#4b5155')

  // ---- racks ---------------------------------------------------------------------------------
  const frameM = []
  const beamM = []
  const deckM = []
  for (let a = 0; a < AISLES; a++) {
    for (let side = 0; side < 2; side++) {
      const rc = rackX(a, side)
      const f = faceSign(side)
      for (const z0 of RUN_Z0) {
        for (let i = 0; i <= 5; i++) frameM.push(mat(rc, 0, z0 + i * BAY_PITCH, 0, side === 0 ? 0 : Math.PI, 0))
        for (let k = 0; k < 5; k++) {
          const zc = z0 + 0.6 + k * BAY_PITCH
          for (const y of LEVELS) {
            beamM.push(mat(rc + BEAM_X, y, zc, 0, 0, 0))
            beamM.push(mat(rc - BEAM_X, y, zc, 0, Math.PI, 0))
            deckM.push(mat(rc, y, zc))
          }
        }
        shadowDecals.push([rc, z0 + 3, 1.55, 6.7, 0])
        // upright protectors on the aisle-side uprights at both ends of the run
        for (const ze of [z0, z0 + 6]) bx(haz, rc + f * UPRIGHT_X, 0.22, ze, 0.13, 0.44, 0.13, 0xffffff, 0, 0, 0, HAZ_STRIPES)
      }
    }
  }
  // frame: two punched uprights, bracing, footplates with anchor bolts, top caps
  {
    const fb = new Bucket()
    const H = RACK_HEIGHT
    for (const sx of [1, -1]) {
      fb.add(UB, mat(sx * UPRIGHT_X, H / 2, 0, 0, 0, 0, 0.07, H, 0.08), RACK_BLUE, [0, 0, 1, H / 0.3])
      fb.add(UB, mat(sx * UPRIGHT_X, 0.006, 0, 0, 0, 0, 0.15, 0.012, 0.17), '#25508f', SOLID_UV)
      for (const dz of [-0.06, 0.06]) fb.add(unitCyl(6), mat(sx * UPRIGHT_X + sx * 0.045, 0.024, dz, 0, 0, 0, 0.011, 0.026, 0.011), '#c3c9ce', SOLID_UV)
      fb.add(UB, mat(sx * UPRIGHT_X, H + 0.004, 0, 0, 0, 0, 0.074, 0.008, 0.084), '#1d3f73', SOLID_UV)
    }
    const inner = UPRIGHT_X - 0.035
    const t = 0.028
    for (const y of [0.12, H - 0.12]) fb.add(UB, mat(0, y, 0, 0, 0, 0, 2 * inner, t, t), RACK_BLUE, SOLID_UV)
    const ys = [0.12, 0.66, 1.2, 1.74, H - 0.12]
    for (let k = 0; k < ys.length - 1; k++) {
      const xa = k % 2 === 0 ? -inner : inner
      const xb = -xa
      const len = Math.hypot(xb - xa, ys[k + 1] - ys[k])
      const ang = Math.atan2(ys[k + 1] - ys[k], xb - xa)
      fb.add(UB, mat(0, (ys[k] + ys[k + 1]) / 2, 0, 0, 0, ang, len, t, t * 0.85), RACK_BLUE, SOLID_UV)
    }
    const frameMat = std({ color: 0xffffff, vertexColors: true, map: tHoles, alphaMap: tHoles, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.48, metalness: 0.3 }, 1)
    addInst('rack-frames', fb.build(), frameMat, frameM, { cast: true, receive: true })
  }
  // step beams with connector plates and locking pins
  {
    const bb = new Bucket()
    const L = BAY_PITCH - 0.08
    bb.add(UB, mat(0, -BEAM_H / 2, 0, 0, 0, 0, 0.055, BEAM_H, L), RACK_ORANGE)
    bb.add(UB, mat(-0.036, -0.032, 0, 0, 0, 0, 0.02, 0.02, L), '#c24f17')
    bb.add(UB, mat(0.0285, -BEAM_H + 0.006, 0, 0, 0, 0, 0.003, 0.008, L), '#f08a4b')
    for (const ez of [-1, 1]) {
      bb.add(UB, mat(-0.004, -0.075, ez * (L / 2 - 0.006), 0, 0, 0, 0.06, 0.16, 0.012), '#9aa3aa')
      bb.add(unitCyl(6), mat(0.03, -0.03, ez * (L / 2 - 0.03), 0, 0, Math.PI / 2, 0.008, 0.012, 0.008), '#d8dde1')
    }
    const beamMat = std({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.25 }, 1)
    addInst('rack-beams', bb.build(), beamMat, beamM, { cast: true, receive: true })
  }
  // wire-mesh decking with support channels
  {
    const db = new Bucket()
    const deckPlane = new THREE.PlaneGeometry(0.9, 1.1).rotateX(-Math.PI / 2)
    db.add(deckPlane, mat(0, -0.004, 0), '#d2d8dc')
    deckPlane.dispose()
    for (const cz of [-0.4, 0, 0.4]) db.add(UB, mat(0, -0.022, cz, 0, 0, 0, 0.88, 0.03, 0.035), '#a9b1b7', [0, 0, 0, 0])
    const deckMat = std({ color: 0xffffff, vertexColors: true, map: tWire, alphaMap: tWire, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, roughness: 0.38, metalness: 0.65 }, 1.4)
    addInst('rack-decks', db.build(), deckMat, deckM, { receive: true, order: 3 })
  }
  // bay location labels on the pick-level beams (cell = slot id)
  {
    const lblGeo = new THREE.PlaneGeometry(0.2, 0.062)
    const cells = new Float32Array(SLOTS * 2)
    const lm = []
    for (let s = 0; s < SLOTS; s++) {
      const a = slotAisle(s)
      const side = slotSide(s)
      const b = slotBay(s)
      const f = faceSign(side)
      lm.push(mat(rackX(a, side) + f * (RACK_HALF + 0.004), PICK_TOP - BEAM_H / 2, bayZ(b), 0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0))
      cells[s * 2] = s % 10
      cells[s * 2 + 1] = 9 - Math.floor(s / 10)
    }
    lblGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2))
    const lblMat = std({ map: tBeamLabels, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, 0.6)
    patchAtlas(lblMat, 10, 10, 'gw-beam-labels')
    addInst('beam-labels', lblGeo, lblMat, lm, { receive: true })
  }
  // row spacers between back-to-back racks
  for (let a = 0; a < AISLES - 1; a++) {
    const x = aisleX(a) + 2.5
    for (const z0 of RUN_Z0) {
      for (let i = 0; i <= 5; i++) for (const y of [0.9, 1.95]) bx(steel, x, y, z0 + i * BAY_PITCH, 0.16, 0.05, 0.05, '#7d868d')
    }
  }
  // end barriers in front of every rack run end
  {
    const spans = [[-2.475, -1.525]]
    for (let a = 0; a < AISLES - 1; a++) spans.push([aisleX(a) + 1.525, aisleX(a) + 3.475])
    spans.push([21.525, 22.475])
    for (const [x0, x1] of spans) {
      for (const z0 of RUN_Z0) {
        for (const [ze, dir] of [[z0, -1], [z0 + 6, 1]]) {
          const z = ze + dir * 0.24
          bx(haz, (x0 + x1) / 2, 0.36, z, x1 - x0 + 0.06, 0.13, 0.09, 0xffffff, 0, 0, 0, HAZ_STRIPES)
          for (const px of [x0 + 0.06, x1 - 0.06]) {
            bx(haz, px, 0.2, z, 0.09, 0.4, 0.09, 0xffffff, 0, 0, 0, [0.5, 0.6, 0, 0])
            bx(steel, px, 0.004, z, 0.18, 0.008, 0.16, '#6f777d')
          }
        }
      }
    }
  }

  // ---- overstock (non-interactive) -----------------------------------------------------------
  const over = [] // [x, y, z, ry, sx, sy, sz, color, fade]
  const films = [] // [x, y, z, ry, sx, sy, sz, fade]
  {
    const rnd = mulberry32(4242)
    const kraft = ['#b48553', '#ab7c4a', '#bd9160', '#a77748', '#b88c5c', '#af8150']
    const colourOf = () => {
      const r = rnd()
      if (r < 0.1) return '#dcdad4'
      if (r < 0.14) return '#8f6e4b'
      if (r < 0.16) return '#5f7f9e'
      return kraft[Math.floor(rnd() * kraft.length)]
    }
    for (let a = 0; a < AISLES; a++) {
      for (let side = 0; side < 2; side++) {
        const rc = rackX(a, side)
        const f = faceSign(side)
        const ry = f > 0 ? Math.PI / 2 : -Math.PI / 2
        for (let b = 0; b < BAYS; b++) {
          const zc = bayZ(b)
          for (const li of [0, 2, 3]) {
            // the cutaway removes only the stock above the pick level; level 0 always stays
            const fade = li === 0 ? 0 : 1
            const base = LEVELS[li] + 0.004
            const clear = li === 0 ? 0.42 : li === 2 ? 0.52 : 0.36
            const r = rnd()
            if (r < 0.1) continue
            if (r < 0.48) {
              const nz = rnd() < 0.5 ? 2 : 3
              const nx = 2
              const nl = rnd() < 0.55 ? 2 : 1
              const bw = 1.0
              const bd = 0.84
              const bh = clear * (0.8 + rnd() * 0.16)
              const cw = bw / nz
              const cd = bd / nx
              const chh = bh / nl
              const col = colourOf()
              for (let l = 0; l < nl; l++) {
                for (let i = 0; i < nz; i++) {
                  for (let j = 0; j < nx; j++) {
                    over.push([rc + (j - (nx - 1) / 2) * cd, base + chh * (l + 0.5), zc + (i - (nz - 1) / 2) * cw, ry, cw - 0.012, chh - 0.006, cd - 0.012, col, fade])
                  }
                }
              }
              films.push([rc, base + bh / 2 + 0.004, zc, ry, bw + 0.024, bh + 0.014, bd + 0.024, fade])
            } else {
              let zc0 = zc - 0.53
              while (zc0 < zc + 0.4) {
                const w = 0.28 + rnd() * 0.42
                if (zc0 + w > zc + 0.54) break
                const d = 0.42 + rnd() * 0.4
                const h = clear * (0.42 + rnd() * 0.52)
                const col = colourOf()
                const x = rc + f * (0.42 - d / 2)
                const jit = (rnd() - 0.5) * 0.08
                over.push([x, base + h / 2, zc0 + w / 2, ry + jit, w, h, d, col, fade])
                if (h < clear * 0.55 && rnd() < 0.45) {
                  const h2 = Math.min(clear - h - 0.02, h * (0.6 + rnd() * 0.4))
                  if (h2 > 0.12) over.push([x, base + h + h2 / 2, zc0 + w / 2, ry + (rnd() - 0.5) * 0.15, w * 0.85, h2, d * 0.85, colourOf(), fade])
                }
                zc0 += w + 0.02 + rnd() * 0.07
              }
            }
          }
        }
      }
    }
  }
  // parcels riding the conveyor (own small instanced mesh, animated in update)
  const PARCELS = 3
  const parcelDims = [[0.36, 0.22, 0.3], [0.5, 0.3, 0.36], [0.3, 0.18, 0.26]]

  // ---- dock ----------------------------------------------------------------------------------
  const pallet = (x, z, ry, y0 = 0) => {
    const pm = mat(x, y0, z, 0, ry, 0)
    const tone = '#c9a36e'
    for (const px of [-0.527, 0, 0.527]) for (const pz of [-0.3275, 0, 0.3275]) bxP(wood, pm, px, 0.061, pz, 0.145, 0.078, 0.1, '#b48c58')
    for (const pz of [-0.3275, 0, 0.3275]) bxP(wood, pm, 0, 0.011, pz, 1.2, 0.022, 0.1, tone)
    for (const px of [-0.527, 0, 0.527]) bxP(wood, pm, px, 0.111, 0, 0.145, 0.022, 0.8, tone)
    for (const pz of [-0.3275, -0.165, 0, 0.165, 0.3275]) bxP(wood, pm, 0, 0.133, pz, 1.2, 0.022, pz === 0 || Math.abs(pz) > 0.3 ? 0.145 : 0.1, '#d1ab76')
    if (y0 === 0) shadowDecals.push([x, z, 1.6, 1.1, ry])
    return pm
  }
  // packing bench
  const benchX = -5.75
  const benchZ = -2
  {
    bx(wood, benchX, 0.8775, benchZ, 0.8, 0.045, 2.4, '#d8b88a')
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(steel, benchX + sx * 0.35, 0.4275, benchZ + sz * 1.15, 0.05, 0.855, 0.05, '#59636b')
    bx(steel, benchX, 0.18, benchZ, 0.74, 0.025, 2.3, '#6b757c')
    for (const sz of [-1, 1]) bx(steel, benchX, 0.12, benchZ + sz * 1.15, 0.7, 0.04, 0.04, '#59636b')
    // overhead frame with shelf and light bar
    for (const sz of [-1.1, 1.1]) bx(steel, -6.1, 1.475, benchZ + sz, 0.045, 1.15, 0.045, '#59636b')
    bx(steel, -6.1, 2.05, benchZ, 0.045, 0.045, 2.25, '#59636b')
    bx(steel, -5.96, 1.85, benchZ, 0.32, 0.022, 2.24, '#6b757c')
    bx(screens, -5.92, 1.828, benchZ, 0.07, 0.016, 2.0, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.white, 512, 256))
    // paper rolls on the shelf
    for (const z of [-2.7, -2.3]) cy(paint, -5.96, 1.95, z, 0.08, 0.36, '#ece8df', 16, Math.PI / 2, 0, 0)
    // monitor on a pole, screen faces the picker (+x)
    cy(steel, -6.02, 0.906, -1.45, 0.07, 0.012, '#3a4046', 16)
    cy(steel, -6.02, 1.07, -1.45, 0.016, 0.34, '#3a4046', 8)
    bx(paint, -6.0, 1.3, -1.45, 0.035, 0.34, 0.55, '#16191c', 0, 0, 0.06)
    screens.add(UP, mat(-5.981, 1.301, -1.45, 0, Math.PI / 2, 0, 0.51, 0.31, 1).multiply(mat(0, 0, 0, -0.06, 0, 0)), 0xffffff, atlasUV(SCREEN_RECT.monitor, 512, 256))
    // keyboard and mouse
    bx(paint, -5.56, 0.909, -1.45, 0.17, 0.018, 0.45, '#22262b')
    screens.add(UP, mat(-5.56, 0.9185, -1.45, -Math.PI / 2, 0, -Math.PI / 2, 0.44, 0.16, 1), 0xffffff, atlasUV(SCREEN_RECT.keyboard, 512, 256))
    bx(paint, -5.57, 0.912, -1.07, 0.1, 0.024, 0.06, '#22262b')
    // label printer with a label coming out and a status LED
    bx(paint, -5.86, 1.0, -2.78, 0.24, 0.2, 0.26, '#2a2e33')
    bx(paint, -5.86, 1.105, -2.78, 0.24, 0.012, 0.26, '#3a4046')
    bx(paint, -5.735, 0.985, -2.78, 0.004, 0.06, 0.1, '#f4f2ec', 0, 0, -0.35)
    bx(screens, -5.738, 1.07, -2.69, 0.004, 0.012, 0.012, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.green, 512, 256))
    // scale with a parcel being packed
    bx(steel, -5.6, 0.918, -2.12, 0.34, 0.035, 0.34, '#9aa3aa')
    bx(screens, -5.428, 0.92, -2.12, 0.004, 0.02, 0.08, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.green, 512, 256))
    // tape gun
    bx(paint, -5.45, 0.94, -0.95, 0.06, 0.05, 0.16, '#c62828')
    cy(paint, -5.45, 0.98, -0.9, 0.05, 0.05, '#b98a4e', 14, 0, 0, Math.PI / 2)
    // anti-fatigue mat where the picker stands
    bx(paint, -4.85, 0.006, benchZ, 0.95, 0.012, 2.3, '#1c1f22')
    shadowDecals.push([benchX, benchZ, 1.3, 2.9, 0])
  }
  // open parcel on the scale, flat-packed sheets on the lower shelf, stock on the top shelf
  over.push([-5.6, 0.936 + 0.11, -2.12, 0, 0.32, 0.22, 0.26, '#c9955c', 0])
  over.push([-5.6, 0.936 + 0.22 + 0.06, -2.12 - 0.13, 0.5, 0.32, 0.13, 0.004, '#c9955c', 0])
  over.push([-5.6, 0.936 + 0.22 + 0.06, -2.12 + 0.13, -0.5, 0.32, 0.13, 0.004, '#c9955c', 0])
  for (let k = 0; k < 7; k++) over.push([benchX + 0.02, 0.2 + k * 0.012, benchZ - 0.4 + (k % 2) * 0.02, Math.PI / 2, 0.9, 0.01, 0.6, '#c08a52', 0])
  over.push([benchX, 0.2 + 0.18, benchZ + 0.6, 0.1, 0.4, 0.34, 0.5, '#c9955c', 0])
  over.push([-5.96, 1.97, benchZ + 0.5, 0, 0.4, 0.22, 0.28, '#d3a46c', 0])
  over.push([-5.96, 1.96, benchZ + 0.85, 0, 0.3, 0.2, 0.26, '#f2f0ea', 0])

  // roller conveyor from the bench, through the half-open shutter door
  {
    const x0 = -6.25
    const x1 = -10.3
    const len = x0 - x1
    const xm = (x0 + x1) / 2
    for (const s of [-1, 1]) {
      bx(steel, xm, 0.8, benchZ + s * 0.33, len, 0.11, 0.04, '#7c868e')
      bx(steel, xm, 0.93, benchZ + s * 0.35, len, 0.02, 0.02, '#c3c9ce')
    }
    for (let x = x0 - 0.05; x > x1; x -= 0.1) cy(steel, x, 0.83, benchZ, 0.03, 0.62, '#b6bdc3', 10, Math.PI / 2, 0, 0)
    for (const lx of [-6.6, -8.2, -9.7]) {
      for (const s of [-1, 1]) bx(steel, lx, 0.39, benchZ + s * 0.3, 0.05, 0.78, 0.05, '#59636b')
      bx(steel, lx, 0.25, benchZ, 0.04, 0.04, 0.6, '#59636b')
    }
    bx(paint, -7.1, 0.66, benchZ - 0.42, 0.2, 0.26, 0.1, '#c9ced2')
    bx(screens, -7.06, 0.7, benchZ - 0.473, 0.04, 0.04, 0.004, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.green, 512, 256))
    bx(screens, -7.14, 0.7, benchZ - 0.473, 0.04, 0.04, 0.004, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.red, 512, 256))
    shadowDecals.push([xm, benchZ, len + 0.4, 1.0, 0])
  }
  // wrapped pallet waiting for the truck, empty pallet stack, pallet jack
  {
    pallet(-8.4, -5.05, 0)
    const layers = 4
    const lh = 0.27
    for (let l = 0; l < layers; l++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          if (l === layers - 1 && i === 2) continue
          over.push([-8.4 + (i - 1) * 0.4, 0.144 + lh * (l + 0.5), -5.05 + (j - 0.5) * 0.4, 0, 0.39, lh - 0.006, 0.39, l % 2 ? '#c08a52' : '#c9955c', 0])
        }
      }
    }
    films.push([-8.4, 0.144 + (layers * lh) / 2, -5.05, 0, 1.23, layers * lh + 0.02, 0.83, 0])
    for (let k = 0; k < 4; k++) pallet(-8.45 + (k % 2) * 0.03, 0.95, 0.03 * (k - 1.5), k * 0.144)
    const jm = mat(-6.85, 0, 0.95, 0, 0.5, 0)
    for (const s of [-1, 1]) {
      bxP(paint, jm, s * 0.2, 0.045, 0.1, 0.16, 0.06, 1.15, '#f2b705')
      cyP(paint, jm, s * 0.2, 0.04, 0.62, 0.035, 0.07, '#16181b', 12, 0, 0, Math.PI / 2)
    }
    bxP(paint, jm, 0, 0.12, -0.55, 0.56, 0.18, 0.22, '#f2b705')
    cyP(paint, jm, 0, 0.32, -0.6, 0.07, 0.3, '#b3261e', 14)
    cyP(paint, jm, 0, 0.09, -0.62, 0.08, 0.08, '#16181b', 14, 0, 0, Math.PI / 2)
    cyP(steel, jm, 0, 0.82, -0.78, 0.016, 0.9, '#2b2f33', 8, -0.42, 0, 0)
    bxP(paint, jm, 0, 1.22, -0.96, 0.24, 0.035, 0.035, '#16181b', -0.42, 0, 0)
    shadowDecals.push([-6.85, 0.95, 0.9, 1.6, 0.5])
  }
  // bollards around the dock zone
  for (const [x, z] of [[-2.95, -5.65], [-2.95, 1.65], [-9.35, -4.35], [-9.35, 0.35], [-6.0, 1.75]]) {
    cy(haz, x, 0.5, z, 0.1, 1.0, 0xffffff, 16, 0, 0, 0, HAZ_BOLLARD)
    sp(haz, x, 1.0, z, 0.1, '#f2b90f', 0.45)
    cy(steel, x, 0.006, z, 0.16, 0.012, '#6f777d', 16)
  }
  // roller shutter door (own mesh), frame, bumpers, door controls
  const doorGeo = (() => {
    const b = new Bucket()
    b.add(UP, mat(-9.975, 2.775, -2, 0, Math.PI / 2, 0, 4.0, 3.25, 1), 0xffffff, [0, 0.25, 1, 0.75])
    b.add(UP, mat(-9.976, 0.575, -2, 0, Math.PI / 2, 0, 4.0, 1.15, 1), 0xffffff, [0, 0, 1, 0.25])
    return b.build()
  })()
  for (const z of [-4.07, 0.07]) {
    bx(steel, -9.93, 2.3, z, 0.1, 4.6, 0.12, '#6f777d')
    bx(haz, -9.92, 0.5, z, 0.115, 1.0, 0.135, 0xffffff, 0, 0, 0, HAZ_STRIPES)
    bx(paint, -9.9, 0.42, z + (z < 0 ? -0.22 : 0.22), 0.16, 0.42, 0.24, '#141618')
  }
  cy(steel, -9.72, 4.75, -2, 0.32, 4.4, '#7c868e', 20, Math.PI / 2, 0, 0)
  bx(paint, -9.8, 4.3, -4.45, 0.3, 0.42, 0.22, '#4a5259')
  bx(paint, -9.9, 1.25, 0.55, 0.08, 0.24, 0.14, '#3a4046')
  bx(screens, -9.855, 1.3, 0.55, 0.004, 0.04, 0.04, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.green, 512, 256))

  // ---- building: walls, columns, wall furniture --------------------------------------------
  const wallGeo = (() => {
    const parts = []
    const add = (cx, cz, len, ry) => {
      const g = new THREE.PlaneGeometry(len, HALL.h)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 4))
      g.rotateY(ry)
      g.translate(cx, HALL.h / 2, cz)
      parts.push(g)
    }
    add((HALL.x0 + HALL.x1) / 2, HALL.z1, HW, Math.PI)
    add((HALL.x0 + HALL.x1) / 2, HALL.z0, HW, 0)
    add(HALL.x0, (HALL.z0 + HALL.z1) / 2, HD, Math.PI / 2)
    add(HALL.x1, (HALL.z0 + HALL.z1) / 2, HD, -Math.PI / 2)
    const g = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    return g
  })()
  const wallMat = std({ color: DARK.wall, map: tWall, emissive: DARK.wallWindow, emissiveMap: tWallE, emissiveIntensity: DARK.wallWindowK, roughness: 0.78, metalness: 0.08 }, 0.6)
  addMesh('walls', wallGeo, wallMat, { receive: true })
  const doorMat = std({ map: tDoor, roughness: 0.5, metalness: 0.4 }, 1)
  addMesh('shutter-door', doorGeo, doorMat, { receive: true })

  const column = (x, z) => {
    bx(steel, x, 4.25, z, 0.3, 8.5, 0.02, '#3f4a54')
    bx(steel, x, 4.25, z - 0.14, 0.3, 8.5, 0.025, '#46525c')
    bx(steel, x, 4.25, z + 0.14, 0.3, 8.5, 0.025, '#46525c')
    bx(steel, x, 4.25, z, 0.025, 8.5, 0.28, '#3f4a54')
    bx(steel, x, 0.01, z, 0.5, 0.02, 0.5, '#59636b')
    bx(haz, x, 0.6, z, 0.36, 1.2, 0.36, 0xffffff, 0, 0, 0, HAZ_STRIPES)
    shadowDecals.push([x, z, 0.9, 0.9, 0])
  }
  for (const x of [-9.75, -1.5, 6.5, 14.5, 22.5, 26.75]) column(x, 23.75)
  for (const x of [-1.5, 6.5, 14.5, 22.5]) column(x, -7.75)
  for (const z of [-7.75, 0, 8, 16]) column(26.75, z)
  for (const z of [-7.75, 8, 16]) column(-9.75, z)

  bx(paint, 26.96, 1.05, 4, 0.04, 2.1, 1.0, '#8e979e')
  bx(steel, 26.97, 1.05, 4, 0.04, 2.2, 1.12, '#5b646b')
  bx(steel, 26.92, 1.0, 4, 0.04, 0.04, 0.8, '#c3c9ce')
  screens.add(UP, mat(26.935, 1.6, 4, 0, -Math.PI / 2, 0, 0.3, 0.4, 1), 0xffffff, atlasUV(SCREEN_RECT.glass, 512, 256))
  const extinguisher = (x, z, ry) => {
    const m = mat(x, 0, z, 0, ry, 0)
    cyP(paint, m, 0, 0.42, 0.1, 0.085, 0.56, '#c62828', 16)
    cyP(paint, m, 0, 0.74, 0.1, 0.03, 0.08, '#202326', 10)
    bxP(paint, m, 0.06, 0.76, 0.12, 0.12, 0.02, 0.03, '#202326')
    bxP(steel, m, 0, 0.55, 0.02, 0.14, 0.24, 0.02, '#7c868e')
  }
  extinguisher(-9.95, 3.0, Math.PI / 2)
  extinguisher(14.5, 23.95, Math.PI)
  extinguisher(26.95, 12.8, -Math.PI / 2)
  bx(paint, -9.94, 1.6, 4.6, 0.12, 0.85, 0.6, '#a9b0b5')
  bx(paint, -9.875, 1.6, 4.6, 0.01, 0.8, 0.02, '#6f777d')
  bx(paint, 26.94, 1.8, -5, 0.12, 0.9, 0.7, '#a9b0b5')
  bx(paint, 26.94, 1.45, 12, 0.12, 0.4, 0.5, '#138a43')
  bx(paint, 21, 1.2, 23.93, 0.6, 0.9, 0.12, '#2a2e33')
  bx(screens, 20.85, 1.45, 23.866, 0.04, 0.04, 0.004, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.amber, 512, 256))
  bx(screens, 21.15, 1.45, 23.866, 0.04, 0.04, 0.004, 0xffffff, 0, 0, 0, atlasUV(SCREEN_RECT.green, 512, 256))
  bx(paint, (HALL.x0 + HALL.x1) / 2, 6.85, HALL.z1 - 0.15, HW - 0.4, 0.06, 0.06, '#3a4046')
  bx(paint, HALL.x1 - 0.15, 6.85, (HALL.z0 + HALL.z1) / 2, 0.06, 0.06, HD - 0.4, '#3a4046')

  // parked forklift on the back lane, staging pallets
  {
    const fm = mat(24.6, 0, 21.9, 0, -Math.PI / 2, 0)
    bxP(paint, fm, 0, 0.72, -0.25, 1.0, 0.8, 1.25, '#f2b705')
    bxP(paint, fm, 0, 0.62, -0.98, 1.02, 0.66, 0.32, '#3a3f44')
    for (const sx of [-1, 1]) {
      cyP(paint, fm, sx * 0.47, 0.26, 0.38, 0.26, 0.2, '#17191c', 18, 0, 0, Math.PI / 2)
      cyP(paint, fm, sx * 0.47, 0.22, -0.75, 0.22, 0.18, '#17191c', 18, 0, 0, Math.PI / 2)
      cyP(steel, fm, sx * 0.475, 0.26, 0.38, 0.12, 0.21, '#9aa3aa', 12, 0, 0, Math.PI / 2)
      bxP(steel, fm, sx * 0.42, 1.58, 0.25, 0.05, 1.4, 0.05, '#22262a')
      bxP(steel, fm, sx * 0.42, 1.68, -0.75, 0.05, 1.2, 0.05, '#22262a')
      bxP(steel, fm, sx * 0.3, 1.2, 0.68, 0.08, 2.3, 0.12, '#2b3035')
      bxP(steel, fm, sx * 0.22, 0.05, 1.25, 0.12, 0.05, 1.05, '#2b3035')
    }
    bxP(steel, fm, 0, 2.3, -0.25, 0.9, 0.05, 1.1, '#22262a')
    for (let k = 0; k < 4; k++) bxP(steel, fm, 0, 2.3, -0.7 + k * 0.3, 0.88, 0.03, 0.03, '#22262a')
    bxP(steel, fm, 0, 1.35, 0.68, 0.66, 0.08, 0.08, '#2b3035')
    bxP(steel, fm, 0, 0.36, 0.76, 0.7, 0.36, 0.05, '#2b3035')
    bxP(paint, fm, 0, 1.25, -0.42, 0.5, 0.12, 0.45, '#1b1d20')
    bxP(paint, fm, 0, 1.52, -0.62, 0.48, 0.5, 0.1, '#1b1d20', -0.15, 0, 0)
    cyP(paint, fm, 0, 1.55, 0.12, 0.13, 0.03, '#1b1d20', 16, 0.9, 0, 0)
    screens.add(UB, fm.clone().multiply(mat(0, 2.38, -0.6, 0, 0, 0, 0.1, 0.1, 0.1)), 0xffffff, atlasUV(SCREEN_RECT.amber, 512, 256))
    shadowDecals.push([24.6, 21.9, 1.8, 3.0, Math.PI / 2])
    pallet(24.3, 16.4, Math.PI / 2)
    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) over.push([24.3 + (i - 0.5) * 0.4, 0.144 + 0.3 * (l + 0.5), 16.4 + (j - 1) * 0.4, 0, 0.39, 0.294, 0.39, '#c9955c', 0])
      }
    }
    films.push([24.3, 0.144 + 0.45, 16.4, 0, 0.83, 0.92, 1.23, 0])
    pallet(25.7, 18.7, Math.PI / 2)
    for (let i = 0; i < 2; i++) over.push([25.7, 0.144 + 0.22 + i * 0.44, 18.7, 0.1 * i, 0.7, 0.42, 1.0, i ? '#f2f0ea' : '#b98450', 0])
  }

  // ---- signs -------------------------------------------------------------------------------
  const signFaces = (cx, cy0, cz, w, h, rect) => {
    const uv = atlasUV(rect, SIGN_ATLAS.w, SIGN_ATLAS.h)
    signs.add(UP, mat(cx + 0.016, cy0, cz, 0, Math.PI / 2, 0, w, h, 1), 0xffffff, uv)
    signs.add(UP, mat(cx - 0.016, cy0, cz, 0, -Math.PI / 2, 0, w, h, 1), 0xffffff, uv)
    bx(steel, cx, cy0, cz, 0.03, h + 0.05, w + 0.05, '#1a1f24')
    for (const s of [-1, 1]) overhead.add(unitCyl(5), mat(cx, (cy0 + h / 2 + 8.2) / 2, cz + s * (w / 2 - 0.15), 0, 0, 0, 0.007, 8.2 - cy0 - h / 2, 0.007), '#8b949b')
  }
  for (let a = 0; a < AISLES; a++) {
    signFaces(aisleX(a), 3.35, -0.75, 2.0, 0.5, signRect('big', a))
    signFaces(aisleX(a), 3.35, 16.75, 2.0, 0.5, signRect('big', a))
  }
  signFaces(benchX, 3.15, benchZ, 2.6, 0.65, signRect('big', 5))
  const wallSign = (x, y, z, w, h, ry, rect) => signs.add(UP, mat(x, y, z, 0, ry, 0, w, h, 1), 0xffffff, atlasUV(rect, SIGN_ATLAS.w, SIGN_ATLAS.h))
  wallSign(8.5, 4.4, HALL.z1 - 0.02, 9.0, 1.125, Math.PI, signRect('banner', 0))
  wallSign(HALL.x0 + 0.02, 4.95, -2, 0.62, 0.62, Math.PI / 2, signRect('small', 0))
  wallSign(HALL.x0 + 0.02, 2.2, 1.35, 0.6, 0.6, Math.PI / 2, signRect('small', 1))
  wallSign(-6, 2.3, HALL.z1 - 0.02, 0.6, 0.6, Math.PI, signRect('small', 2))
  wallSign(HALL.x1 - 0.02, 2.3, 21, 0.6, 0.6, -Math.PI / 2, signRect('small', 2))
  wallSign(HALL.x1 - 0.02, 2.5, 4, 0.5, 0.5, -Math.PI / 2, signRect('small', 3))
  wallSign(26.58, 2.1, 8, 0.45, 0.45, -Math.PI / 2, signRect('small', 4))
  wallSign(HALL.x0 + 0.02, 1.35, 3.0, 0.32, 0.32, Math.PI / 2, signRect('small', 5))
  wallSign(14.5, 1.35, HALL.z1 - 0.02, 0.32, 0.32, Math.PI, signRect('small', 5))
  wallSign(HALL.x1 - 0.02, 1.95, 12, 0.4, 0.4, -Math.PI / 2, signRect('small', 6))
  wallSign(21, 2.1, HALL.z1 - 0.02, 0.5, 0.5, Math.PI, signRect('small', 7))
  wallSign(HALL.x1 - 0.02, 3.4, -5, 0.6, 0.6, -Math.PI / 2, signRect('small', 1))

  // ---- overhead: trusses, purlins, ceiling, fixtures, sprinkler mains ----------------------
  {
    const yTop = 8.95
    const yBot = 8.2
    for (const zt of [-7.75, 0, 8, 16, 23.75]) {
      bx(overhead, (HALL.x0 + HALL.x1) / 2, yTop, zt, HW, 0.14, 0.14, '#6b747c')
      bx(overhead, (HALL.x0 + HALL.x1) / 2, yBot, zt, HW, 0.12, 0.12, '#6b747c')
      let k = 0
      for (let x = HALL.x0 + 0.9; x < HALL.x1 - 0.9; x += 1.85, k++) {
        bx(overhead, x, (yTop + yBot) / 2, zt, 0.05, yTop - yBot, 0.05, '#7a838a')
        const len = Math.hypot(0.925, yTop - yBot)
        bx(overhead, x + 0.4625, (yTop + yBot) / 2, zt, len, 0.045, 0.045, '#7a838a', 0, 0, Math.atan2(yTop - yBot, 0.925) * (k % 2 ? 1 : -1))
      }
    }
    for (let x = HALL.x0 + 2; x < HALL.x1; x += 3.5) bx(overhead, x, 9.1, (HALL.z0 + HALL.z1) / 2, 0.08, 0.16, HD, '#59626a')
    const ceil = new THREE.PlaneGeometry(HW, HD).rotateX(Math.PI / 2)
    ceiling.add(ceil, mat((HALL.x0 + HALL.x1) / 2, 9.22, (HALL.z0 + HALL.z1) / 2), '#3a4148')
    ceil.dispose()
    for (const zs of [4, 12, 20]) bx(overhead, (HALL.x0 + HALL.x1) / 2, 7.95, zs, HW - 0.5, 0.09, 0.09, '#b3261e')
    for (let x = HALL.x0 + 3.75; x < HALL.x1 - 2; x += 7) {
      const sky = new THREE.PlaneGeometry(1.4, HD - 3).rotateX(Math.PI / 2)
      skylights.add(sky, mat(x, 9.2, (HALL.z0 + HALL.z1) / 2), 0xffffff)
      sky.dispose()
    }
    const disc = new THREE.CircleGeometry(0.22, 20).rotateX(Math.PI / 2)
    for (const [fx, fz] of FIXTURES) {
      cy(overhead, fx, 6.3, fz, 0.26, 0.1, '#2c3136', 20)
      overhead.add(unitCyl(20), mat(fx, 6.42, fz, 0, 0, 0, 0.12, 0.14, 0.12), '#3a4046')
      for (let k = 0; k < 8; k++) bx(overhead, fx + Math.cos((k * TAU) / 8) * 0.2, 6.36, fz + Math.sin((k * TAU) / 8) * 0.2, 0.012, 0.06, 0.1, '#20252a', 0, (-k * TAU) / 8, 0)
      overhead.add(unitCyl(5), mat(fx, (6.49 + 8.14) / 2, fz, 0, 0, 0, 0.006, 8.14 - 6.49, 0.006), '#8b949b')
      leds.add(disc, mat(fx, 6.245, fz), 0xffffff)
    }
    disc.dispose()
  }

  // ---- merged meshes ------------------------------------------------------------------------
  const steelMat = std({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.55 }, 1.2)
  addMesh('steel', steel.build(), steelMat, { cast: true, receive: true })
  const paintMat = std({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.08 }, 0.8)
  addMesh('painted', paint.build(), paintMat, { cast: true, receive: true })
  const woodMat = std({ color: 0xffffff, vertexColors: true, map: tWood, roughness: 0.82, metalness: 0 }, 0.5)
  addMesh('wood', wood.build(), woodMat, { cast: true, receive: true })
  const hazMat = std({ color: 0xffffff, vertexColors: true, map: tHaz, roughness: 0.5, metalness: 0.12 }, 0.8)
  addMesh('hazard', haz.build(), hazMat, { cast: true, receive: true })
  const signMat = std({ color: 0xffffff, map: tSigns, emissive: 0xffffff, emissiveMap: tSigns, emissiveIntensity: DARK.signGlow, roughness: 0.5, metalness: 0 }, 0.6)
  addMesh('signs', signs.build(), signMat)
  for (const m of [steelMat, paintMat, woodMat, hazMat, signMat]) patchNear(m)
  const screenMat = bag.add(new THREE.MeshBasicMaterial({ map: tScreens, color: new THREE.Color().setScalar(DARK.screenK) }))
  addMesh('screens', screens.build(), screenMat)
  const overheadMat = std({ color: DARK.ceiling, vertexColors: true, roughness: 0.75, metalness: 0.35 }, 0.6)
  patchDither(overheadMat, uni.overheadFade, false, 'gw-overhead')
  const overheadMesh = addMesh('overhead', overhead.build(), overheadMat)
  // ceiling, skylights and LED discs face down: back-face culling hides them from above
  const ceilingMat = std({ color: DARK.ceiling, vertexColors: true, roughness: 0.9, metalness: 0.1 }, 0.4)
  addMesh('ceiling', ceiling.build(), ceilingMat)
  const ledMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(DARK.led).multiplyScalar(DARK.ledK) }))
  addMesh('led-fixtures', leds.build(), ledMat)
  const skyMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(DARK.skylight).multiplyScalar(DARK.skylightK) }))
  addMesh('skylights', skylights.build(), skyMat)

  // fixture glows (billboards), floor light pools, contact shadows
  const glowMat = bag.add(
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(DARK.led).multiplyScalar(DARK.glowK) }, uSize: { value: 1.7 }, uFade: { value: 0 } }]),
      vertexShader: BILLBOARD_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  )
  glowMat.uniforms.uFade = uni.overheadFade
  const glowMesh = addInst('fixture-glow', new THREE.PlaneGeometry(1, 1), glowMat, FIXTURES.map(([x, z]) => mat(x, 6.2, z)), { order: 8 })
  glowMesh.frustumCulled = false

  const decalGeo = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const poolMat = bag.add(new THREE.MeshBasicMaterial({ color: DARK.pool, map: tRadial, transparent: true, opacity: DARK.poolK, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }))
  addInst('light-pools', decalGeo(), poolMat, FIXTURES.map(([x, z], i) => mat(x, 0.024, z, 0, 0, 0, i < 25 ? 5.6 : 4.6, 1, i < 25 ? 5.6 : 4.6)), { order: 5 })
  const contactMat = bag.add(new THREE.MeshBasicMaterial({ color: 0x000000, map: tSoft, transparent: true, opacity: DARK.contact, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }))
  addInst('contact-shadows', decalGeo(), contactMat, shadowDecals.map(([x, z, w, d, ry]) => mat(x, 0.02, z, 0, ry, 0, w, 1, d)), { order: 4 })

  // overstock cartons and stretch film (instanced, cut away when looking straight down)
  const cartonGeo = cartonGeometry()
  const fadeAttr = new Float32Array(over.length)
  over.forEach((o, i) => (fadeAttr[i] = o[8]))
  cartonGeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fadeAttr, 1))
  const overMat = std({ color: 0xffffff, map: tCarton, roughness: 0.86, metalness: 0 }, 0.5)
  patchDither(overMat, uni.cut, true, 'gw-overstock')
  const overMesh = addInst('overstock', cartonGeo, overMat, over.map((o) => mat(o[0], o[1], o[2], 0, o[3], 0, o[4], o[5], o[6])), { cast: true, receive: true })
  {
    const c = new THREE.Color()
    over.forEach((o, i) => overMesh.setColorAt(i, c.set(o[7])))
    overMesh.instanceColor.needsUpdate = true
  }
  const parcelGeo = cartonGeometry()
  parcelGeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(PARCELS), 1))
  // parcels move with the ambient clock, so they cast no shadow: the shadow map is only redrawn
  // when the app says something that casts one has moved
  const parcels = addInst('conveyor-parcels', parcelGeo, overMat, parcelDims.map(() => mat(0, -10, 0)), { cast: false, receive: true })
  parcels.frustumCulled = false
  parcels.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  {
    const c = new THREE.Color()
    ;['#c9955c', '#d3a46c', '#f2f0ea'].forEach((h, i) => parcels.setColorAt(i, c.set(h)))
    parcels.instanceColor.needsUpdate = true
  }
  const filmGeo = new THREE.BoxGeometry(1, 1, 1)
  const filmFade = new Float32Array(films.length)
  films.forEach((o, i) => (filmFade[i] = o[7]))
  filmGeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(filmFade, 1))
  const filmMat = std({ color: 0xffffff, map: tFilm, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0, depthWrite: false }, 1.6)
  patchDither(filmMat, uni.cut, true, 'gw-film')
  addInst('stretch-film', filmGeo, filmMat, films.map((o) => mat(o[0], o[1], o[2], 0, o[3], 0, o[4], o[5], o[6])), { order: 6 })

  // ---- camera-driven fades -----------------------------------------------------------------
  // The floor is never culled, so its onBeforeRender runs once per frame with the active camera
  // (the result shows from the next frame). Overhead steel and the fixture glows fade out as the
  // camera rises to the follow height (y 7.5); the down-facing ceiling, LEDs and skylights are
  // dropped above the roof, where they would only cost draw calls.
  const camPos = new THREE.Vector3()
  const camDir = new THREE.Vector3()
  const underRoof = [meshes.ceiling, meshes['led-fixtures'], meshes.skylights]
  let cutOverride = null
  floor.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)
    const of = smoothstep(6.5, 7.4, camPos.y)
    uni.overheadFade.value = of
    const show = of < 0.999
    overheadMesh.visible = show
    glowMesh.visible = show
    const under = camPos.y < HALL.roof
    for (let i = 0; i < underRoof.length; i++) underRoof[i].visible = under
    uni.cut.value = cutOverride !== null ? cutOverride : smoothstep(0.86, 0.96, -camDir.y)
  }

  // ---- per-frame ---------------------------------------------------------------------------
  const tmpM = new THREE.Matrix4()
  const tmpP = new THREE.Vector3()
  const tmpQ = new THREE.Quaternion()
  const tmpS = new THREE.Vector3()
  const yAxis = new THREE.Vector3(0, 1, 0)
  function update(_dt, t) {
    for (let k = 0; k < PARCELS; k++) {
      const u = (t * 0.085 + k / PARCELS) % 1
      const d = parcelDims[k]
      tmpP.set(lerp(-6.3, -10.6, u), 0.86 + d[1] / 2, benchZ + (k - 1) * 0.04)
      tmpQ.setFromAxisAngle(yAxis, (k - 1) * 0.12)
      tmpS.set(d[0], d[1], d[2])
      tmpM.compose(tmpP, tmpQ, tmpS)
      parcels.setMatrixAt(k, tmpM)
    }
    parcels.instanceMatrix.needsUpdate = true
  }

  // MQ has no real shadows, so the contact decals under racks, pallets and the bench get stronger.
  function setQuality(q) {
    contactMat.opacity = Math.min(1, DARK.contact * (q === 'high' ? 1 : 1.3))
  }

  // GPU resources only: three re-uploads them if a StrictMode remount renders the group again.
  function dispose() {
    for (const m of Object.values(meshes)) if (m.isInstancedMesh) m.dispose()
    bag.dispose()
  }

  setQuality(opts.quality)

  return {
    group,
    update,
    setQuality,
    setCutaway(v) {
      cutOverride = v === null || v === undefined ? null : clamp(v, 0, 1)
    },
    dispose,
  }
}
