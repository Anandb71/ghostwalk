// Port of the Floor Lab picker (ghostwalk-handbook interactive/lab3d/models.js @ 29e6039, buildPicker),
// typed and adapted to the app: no THREE parameter, dark theme inlined, no name-tag sprites (Picker.tsx
// keeps its drei Html label), no shared texture cache, and the rig never moves its own group.
//
// A skinned worker in a hi-vis vest and hard hat pushing a two-tier picking cart with a tote. Body and
// cart are ONE merged SkinnedMesh (18 bones, vertex colours, an emissive mask for the reflective tape,
// a rim light; the ghost adds scanlines and fresnel alpha). Carried cartons are an InstancedMesh of up
// to 48 minis parented to the cart bone. A floor blob (soft shadow, or an additive cyan glow for the
// ghost) and a floor ring in the picker's colour make it read from the overview camera.
// Draw calls: solid 4 (body, minis, blob, ring); ghost 5 (depth pre-pass, body, minis, blob, ring).
//
// Driven by drive() once per frame with the pose the parent root already has (Walker writes position
// and smoothed heading). The walk cycle comes from the distance actually moved, so feet do not slide
// at normal speeds (cadence is capped when playback is fast). drive() allocates nothing.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { angleDelta, PALETTE } from '../shared'

/** What the walk wants the rig to do this frame. One mutable object per walker, never React state. */
export interface PickerDrive {
  moving: boolean
  picking: boolean
  /** world point the worker turns to and reaches for while picking (a rack face) */
  targetX: number
  targetZ: number
  /** order lines in the tote; minis drop in or vanish when this changes */
  carried: number
}

export interface PickerRig {
  /** identity transform: the parent root carries position and heading */
  group: THREE.Group
  /** x, z, heading = the parent's pose (heading = atan2(dx, dz), 0 faces +z); dt in seconds, t = clock */
  drive(x: number, z: number, heading: number, d: PickerDrive | null, dt: number, t: number): void
  /** frees GPU resources only; safe to call twice and to keep rendering afterwards (StrictMode) */
  dispose(): void
}

const TAU = Math.PI * 2
const MAX_CARRIED = 48
const STRIDE = 1.35 // metres per full walk cycle (two steps)
const A_UP = 0.29 // upper arm
const A_FORE = 0.28 // forearm to grip

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function hashi(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

interface Disposable {
  dispose(): void
}

/** Everything the builder creates. dispose() frees but keeps the list, so a second call still works. */
function makeBag() {
  const items = new Set<Disposable>()
  return {
    add<T extends Disposable>(x: T): T {
      items.add(x)
      return x
    },
    dispose(): void {
      for (const x of items) x.dispose()
    },
  }
}

type MatFn = (x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number, sx?: number, sy?: number, sz?: number) => THREE.Matrix4

function matFactory(): MatFn {
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

/** Radial falloff: white centre, transparent edge (the floor blob). */
function genRadial(size: number, power: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1
      const dy = ((y + 0.5) / size) * 2 - 1
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

interface PickerUniforms {
  rim: { value: THREE.Color }
  rimPow: { value: number }
  time: { value: number }
  ghost: { value: number }
}

/** Rim light, emissive mask and (for the ghost) scanlines and fresnel alpha. */
function patchPicker(material: THREE.Material, u: PickerUniforms, key: string): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = u.rim
    shader.uniforms.uRimPow = u.rimPow
    shader.uniforms.uTime = u.time
    shader.uniforms.uGhost = u.ghost
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;\nvarying float vWorldY;')
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
vEmit = aEmit;
#ifdef USE_INSTANCING
vWorldY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
#else
vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;
#endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRim;\nuniform float uRimPow;\nuniform float uTime;\nuniform float uGhost;\nvarying float vEmit;\nvarying float vWorldY;',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit;')
      .replace(
        '#include <opaque_fragment>',
        `{
  float gwFr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), uRimPow);
  outgoingLight += uRim * gwFr;
  if (uGhost > 0.5) {
    float scan = 0.5 + 0.5 * sin(vWorldY * 62.0 - uTime * 7.0);
    outgoingLight += uRim * scan * 0.14;
    diffuseColor.a = clamp(diffuseColor.a * (0.78 + 0.22 * scan) + gwFr * 0.8, 0.0, 1.0);
  }
}
#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => key
}

/**
 * Builds one picker. ghost = translucent cyan rig for the old layout (no shadows, drawn late in the
 * transparent queue); otherwise the orange-vested worker that casts shadows at HQ.
 */
export function buildPicker(opts: { ghost: boolean }): PickerRig {
  const ghost = opts.ghost
  const bag = makeBag()
  const mat = matFactory()
  const group = new THREE.Group()
  group.name = ghost ? 'picker-ghost' : 'picker'

  // ---- skeleton --------------------------------------------------------------------------------
  const bones: THREE.Bone[] = []
  const mk = (parent: THREE.Bone | null, x: number, y: number, z: number): THREE.Bone => {
    const b = new THREE.Bone()
    b.position.set(x, y, z)
    if (parent) parent.add(b)
    bones.push(b)
    return b
  }
  const root = mk(null, 0, 0, 0)
  const hips = mk(root, 0, 0.93, 0)
  const spine = mk(hips, 0, 0.09, 0)
  const head = mk(spine, 0, 0.48, 0)
  const shL = mk(spine, 0.2, 0.4, 0)
  const elL = mk(shL, 0, -0.29, 0)
  const shR = mk(spine, -0.2, 0.4, 0)
  const elR = mk(shR, 0, -0.29, 0)
  const thL = mk(hips, 0.1, -0.03, 0)
  const knL = mk(thL, 0, -0.41, 0)
  const ftL = mk(knL, 0, -0.41, 0)
  const thR = mk(hips, -0.1, -0.03, 0)
  const knR = mk(thR, 0, -0.41, 0)
  const ftR = mk(knR, 0, -0.41, 0)
  const cart = mk(root, 0, 0, 0)
  const WHEELS: readonly (readonly [number, number, number])[] = [
    [0.22, 0.058, 0.5],
    [-0.22, 0.058, 0.5],
    [0.22, 0.058, 1.14],
    [-0.22, 0.058, 1.14],
  ]
  const wheels = WHEELS.map(([x, y, z]) => mk(cart, x, y, z))

  // ---- geometry (mesh space, rest pose, facing +z) -------------------------------------------
  const C = {
    skin: '#c99278', skinDark: '#b07a62', trousers: '#36435a', shirt: '#4a5666', vest: '#ff6a13', reflect: '#e3e8ec',
    boot: '#2a2420', sole: '#121212', glove: '#33373c', hat: '#f6c90e', hair: '#3a2a1f', belt: '#1c1e21',
    steel: '#8b959e', steelDark: '#5c666e', rubber: '#1b1d20', tote: '#2c6fd1', toteRim: '#4a89e6', grip: '#17191c',
    scanner: '#1f2227', screen: '#7fd4ff',
  } as const
  const parts: THREE.BufferGeometry[] = []
  const tmpC = new THREE.Color()
  // every part is rigidly bound to one bone (weight 1) and carries its colour and emissive mask per vertex
  const part = (geo: THREE.BufferGeometry, matrix: THREE.Matrix4, bone: THREE.Bone, color: string, emit = 0): void => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.applyMatrix4(matrix)
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    const n = g.attributes.position.count
    const si = new Uint16Array(n * 4)
    const sw = new Float32Array(n * 4)
    const col = new Float32Array(n * 3)
    const em = new Float32Array(n)
    const bi = bones.indexOf(bone)
    tmpC.set(color)
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi
      sw[i * 4] = 1
      col[i * 3] = tmpC.r
      col[i * 3 + 1] = tmpC.g
      col[i * 3 + 2] = tmpC.b
      em[i] = emit
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(em, 1))
    g.clearGroups()
    g.morphAttributes = {}
    parts.push(g)
  }
  const UB = new THREE.BoxGeometry(1, 1, 1)
  const US = new THREE.SphereGeometry(1, 16, 12)
  const UC = new THREE.CylinderGeometry(1, 1, 1, 16, 1)
  const UCopen = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true)
  const UHemi = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2)
  const caps: THREE.BufferGeometry[] = []
  const cap = (r: number, l: number): THREE.BufferGeometry => {
    const g = new THREE.CapsuleGeometry(r, l, 4, 12)
    caps.push(g)
    return g
  }

  // legs
  const legs: readonly (readonly [number, THREE.Bone, THREE.Bone, THREE.Bone])[] = [
    [1, thL, knL, ftL],
    [-1, thR, knR, ftR],
  ]
  for (const [s, th, kn, ft] of legs) {
    const x = 0.1 * s
    part(cap(0.068, 0.3), mat(x, 0.695, 0), th, C.trousers)
    part(US, mat(x, 0.49, 0, 0, 0, 0, 0.06, 0.06, 0.06), kn, C.trousers)
    part(UB, mat(x, 0.5, 0.056, 0, 0, 0, 0.1, 0.11, 0.03), kn, C.belt) // knee pad
    part(cap(0.056, 0.32), mat(x, 0.29, 0), kn, C.trousers)
    part(US, mat(x, 0.1, 0, 0, 0, 0, 0.058, 0.05, 0.065), ft, C.boot)
    part(UB, mat(x, 0.05, 0.045, 0, 0, 0, 0.11, 0.09, 0.26), ft, C.boot)
    part(UB, mat(x, 0.012, 0.045, 0, 0, 0, 0.118, 0.024, 0.275), ft, C.sole)
    part(UB, mat(x, 0.07, 0.17, 0, 0, 0, 0.1, 0.05, 0.04), ft, '#3a332d') // toe cap
  }
  // pelvis and belt
  part(cap(0.125, 0.12), mat(0, 0.93, 0, 0, 0, Math.PI / 2, 1, 1, 0.78), hips, C.trousers)
  part(UC, mat(0, 1.0, 0, 0, 0, 0, 0.147, 0.05, 0.147 * 0.8), hips, C.belt)
  part(UB, mat(0, 1.0, 0.118, 0, 0, 0, 0.05, 0.035, 0.01), hips, '#9aa3aa')
  part(UB, mat(-0.16, 0.96, -0.05, 0, 0, 0, 0.06, 0.11, 0.07), hips, C.scanner)
  // torso, hi-vis vest, reflective tape
  part(cap(0.15, 0.3), mat(0, 1.23, 0, 0, 0, 0, 1.2, 1, 0.72), spine, C.shirt)
  part(cap(0.16, 0.25), mat(0, 1.245, 0, 0, 0, 0, 1.2, 1, 0.78), spine, C.vest, 0.22)
  for (const y of [1.12, 1.29]) part(UCopen, mat(0, y, 0, 0, 0, 0, 0.1645 * 1.2, 0.038, 0.1645 * 0.78), spine, C.reflect, 0.55)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(UB, mat(sx * 0.085, 1.34, sz * 0.125, 0, 0, 0, 0.036, 0.32, 0.008), spine, C.reflect, 0.55)
  part(UB, mat(0, 1.2, -0.128, 0, 0, 0, 0.16, 0.05, 0.006), spine, '#1b1d20')
  // neck, head, hard hat
  part(UC, mat(0, 1.53, 0, 0, 0, 0, 0.048, 0.1, 0.048), head, C.skin)
  part(US, mat(0, 1.635, 0.005, 0, 0, 0, 0.098, 0.115, 0.105), head, C.skin)
  part(US, mat(0, 1.623, 0.106, 0, 0, 0, 0.02, 0.026, 0.022), head, C.skinDark) // nose
  for (const sx of [-1, 1]) part(US, mat(sx * 0.098, 1.63, 0, 0, 0, 0, 0.012, 0.024, 0.018), head, C.skinDark) // ears
  part(US, mat(0, 1.648, -0.03, 0, 0, 0, 0.096, 0.085, 0.09), head, C.hair)
  part(UHemi, mat(0, 1.672, 0, 0, 0, 0, 0.123, 0.105, 0.135), head, C.hat, 0.05)
  part(UC, mat(0, 1.674, 0.012, 0, 0, 0, 0.142, 0.012, 0.155), head, C.hat, 0.05)
  part(UB, mat(0, 1.674, 0.15, 0, 0, 0, 0.2, 0.012, 0.07), head, C.hat, 0.05) // peak
  part(UB, mat(0, 1.772, 0, 0, 0, 0, 0.028, 0.026, 0.22), head, C.hat, 0.05) // ridge
  // arms
  const arms: readonly (readonly [number, THREE.Bone, THREE.Bone])[] = [
    [1, shL, elL],
    [-1, shR, elR],
  ]
  for (const [s, sh, el] of arms) {
    const x = 0.2 * s
    part(US, mat(x, 1.42, 0, 0, 0, 0, 0.058, 0.058, 0.058), sh, C.shirt)
    part(cap(0.047, 0.2), mat(x, 1.28, 0), sh, C.shirt)
    part(US, mat(x, 1.13, 0, 0, 0, 0, 0.047, 0.047, 0.047), el, C.shirt)
    part(cap(0.043, 0.19), mat(x, 1.0, 0), el, C.shirt)
    part(UC, mat(x, 0.9, 0, 0, 0, 0, 0.047, 0.035, 0.047), el, C.glove)
    part(US, mat(x, 0.85, 0.005, 0, 0, 0, 0.042, 0.056, 0.036), el, C.glove)
  }
  // wrist scanner with its red window
  part(UB, mat(0.245, 0.97, 0, 0, 0, 0, 0.03, 0.075, 0.062), elL, C.scanner)
  part(UB, mat(0.2615, 0.975, 0, 0, 0, 0, 0.003, 0.045, 0.042), elL, '#ff4b3a', 1.2)
  // cart: two-tier picking trolley with a tote on top
  const cartParts: [THREE.BufferGeometry, THREE.Matrix4, string][] = [
    [UB, mat(0, 0.165, 0.82, 0, 0, 0, 0.52, 0.03, 0.78), C.steel],
    [UB, mat(0, 0.585, 0.82, 0, 0, 0, 0.52, 0.025, 0.78), C.steel],
    [UC, mat(0, 1.04, 0.355, 0, 0, Math.PI / 2, 0.017, 0.56, 0.017), C.steel],
  ]
  for (const sx of [-1, 1]) {
    for (const z of [0.44, 1.2]) cartParts.push([UC, mat(sx * 0.25, 0.375, z, 0, 0, 0, 0.013, 0.44, 0.013), C.steelDark])
    cartParts.push([UC, mat(sx * 0.25, 0.815, 0.4, -0.176, 0, 0, 0.015, 0.457, 0.015), C.steelDark])
    cartParts.push([UC, mat(sx * 0.2, 1.04, 0.355, 0, 0, Math.PI / 2, 0.024, 0.13, 0.024), C.grip])
    cartParts.push([UB, mat(sx * 0.214, 0.71, 0.82, 0, 0, 0, 0.012, 0.22, 0.66), C.tote])
    cartParts.push([UB, mat(sx * 0.216, 0.822, 0.82, 0, 0, 0, 0.02, 0.014, 0.67), C.toteRim])
    cartParts.push([UB, mat(0, 0.71, 0.82 + sx * 0.324, 0, 0, 0, 0.44, 0.22, 0.012), C.tote])
    cartParts.push([UB, mat(0, 0.822, 0.82 + sx * 0.326, 0, 0, 0, 0.45, 0.014, 0.02), C.toteRim])
    cartParts.push([UB, mat(0, 0.78, 0.82 + sx * 0.331, 0, 0, 0, 0.12, 0.035, 0.003), '#16314f']) // tote handle slot
  }
  cartParts.push([UB, mat(0, 0.603, 0.82, 0, 0, 0, 0.44, 0.012, 0.66), C.tote])
  // caster forks
  for (const [x, , z] of WHEELS) {
    for (const s of [-1, 1]) cartParts.push([UB, mat(x + s * 0.026, 0.1, z, 0, 0, 0, 0.01, 0.07, 0.045), C.steelDark])
    cartParts.push([UB, mat(x, 0.142, z, 0, 0, 0, 0.07, 0.01, 0.07), C.steelDark])
  }
  for (const [g, m, c] of cartParts) part(g, m, cart, c)
  // tablet on the handle, facing the worker
  {
    const base = mat(0, 1.1, 0.39, -0.5, 0, 0)
    part(UB, base.clone().multiply(mat(0, 0, 0, 0, 0, 0, 0.17, 0.12, 0.02)), cart, C.rubber)
    part(UB, base.clone().multiply(mat(0, 0, -0.011, 0, 0, 0, 0.15, 0.1, 0.002)), cart, C.screen, 0.9)
    part(UB, mat(0, 1.06, 0.37, 0, 0, 0, 0.03, 0.06, 0.03), cart, C.rubber)
  }
  // wheels spin on their own bones
  wheels.forEach((wb, i) => {
    const [x, y, z] = WHEELS[i]
    part(UC, mat(x, y, z, 0, 0, Math.PI / 2, 0.058, 0.032, 0.058), wb, C.rubber)
    part(UC, mat(x, y, z, 0, 0, Math.PI / 2, 0.026, 0.036, 0.026), wb, '#9aa3aa')
    part(UB, mat(x, y, z, 0, 0, 0, 0.037, 0.09, 0.012), wb, '#9aa3aa')
  })

  const merged = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  for (const g of [UB, US, UC, UCopen, UHemi, ...caps]) g.dispose()
  const geo = bag.add(merged ?? new THREE.BufferGeometry())
  geo.computeBoundingSphere()

  // ---- materials and meshes -------------------------------------------------------------------
  // dark-theme values of the Floor Lab setTheme(), inlined
  const uniforms: PickerUniforms = {
    rim: { value: new THREE.Color(ghost ? PALETTE.ghost : PALETTE.solid).multiplyScalar(ghost ? 1.5 : 0.28) },
    rimPow: { value: ghost ? 2.2 : 3.0 },
    time: { value: 0 },
    ghost: { value: ghost ? 1 : 0 },
  }
  const ghostBase = 0.3
  let bodyMat: THREE.MeshStandardMaterial
  let mesh: THREE.SkinnedMesh
  if (ghost) {
    bodyMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: PALETTE.ghost,
        emissive: PALETTE.ghost,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    )
    patchPicker(bodyMat, uniforms, 'gw-picker-ghost')
    // depth pre-pass in the transparent queue so only the nearest ghost surface shows
    const depthMat = bag.add(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true }))
    geo.clearGroups()
    geo.addGroup(0, geo.attributes.position.count, 0)
    geo.addGroup(0, geo.attributes.position.count, 1)
    mesh = new THREE.SkinnedMesh(geo, [depthMat, bodyMat])
    mesh.renderOrder = 12
  } else {
    bodyMat = bag.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.05 }))
    patchPicker(bodyMat, uniforms, 'gw-picker')
    mesh = new THREE.SkinnedMesh(geo, bodyMat)
    mesh.castShadow = true // effective only when the renderer has shadows (HQ)
    mesh.receiveShadow = true
  }
  mesh.name = ghost ? 'ghost-body' : 'picker-body'
  mesh.frustumCulled = false
  mesh.add(root)
  group.add(mesh)
  mesh.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  mesh.bind(skeleton)

  // mini cartons in the tote (children of the cart bone): two layers in the tote, two on the lower
  // shelf, then the same again heaped higher. Plain boxes: no atlas is needed at 0.18 m.
  let miniMat: THREE.MeshStandardMaterial
  if (ghost) {
    miniMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: PALETTE.ghost,
        emissive: PALETTE.ghost,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    )
    patchPicker(miniMat, uniforms, 'gw-picker-ghost-mini')
  } else {
    // ~ the average of the Floor Lab carton atlas, so instance tones read like the rack cartons
    miniMat = bag.add(new THREE.MeshStandardMaterial({ color: '#e5e1da', roughness: 0.85 }))
  }
  const miniGeo = bag.add(new THREE.BoxGeometry(1, 1, 1))
  // the patched ghost shader reads aEmit: give the minis an explicit zero instead of a stale default
  miniGeo.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(miniGeo.attributes.position.count), 1))
  const mini = new THREE.InstancedMesh(miniGeo, miniMat, MAX_CARRIED)
  mini.name = ghost ? 'ghost-carried' : 'picker-carried'
  mini.frustumCulled = false
  mini.castShadow = !ghost
  mini.renderOrder = ghost ? 13 : 0
  mini.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  if (!ghost) {
    const c = new THREE.Color()
    const tones = ['#c9955c', '#d3a46c', '#bf8a52', '#f0ede6', '#c48f57']
    for (let i = 0; i < MAX_CARRIED; i++) mini.setColorAt(i, c.set(tones[i % tones.length]))
    if (mini.instanceColor) mini.instanceColor.needsUpdate = true
  }
  mini.count = 0
  cart.add(mini)
  const miniSlot = new Float32Array(MAX_CARRIED * 4) // x, y, z, yaw per slot
  for (let i = 0; i < MAX_CARRIED; i++) {
    const band = Math.floor(i / 12) // 0 tote, 1 lower shelf, 2 tote heaped, 3 lower shelf full
    const tier = band % 2
    const k = i % 12
    const layer = Math.floor(k / 6) + (band >= 2 ? 2 : 0)
    const cell = k % 6
    miniSlot[i * 4] = (cell % 2 ? 0.1 : -0.1) + (hashi(i, 1, 9) - 0.5) * 0.02
    miniSlot[i * 4 + 1] = tier === 0 ? 0.609 + 0.05 + layer * 0.102 : 0.18 + 0.05 + layer * 0.097
    miniSlot[i * 4 + 2] = 0.6 + Math.floor(cell / 2) * 0.22 + (hashi(i, 2, 9) - 0.5) * 0.02
    miniSlot[i * 4 + 3] = (hashi(i, 3, 9) - 0.5) * 0.3
  }

  // floor contact: a soft blob shadow for the worker, a cyan glow for the ghost
  const radial = bag.add(new THREE.CanvasTexture(genRadial(128, 1.6)))
  radial.colorSpace = THREE.NoColorSpace
  const blobMat = bag.add(
    ghost
      ? new THREE.MeshBasicMaterial({ color: PALETTE.ghost, map: radial, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.MeshBasicMaterial({ color: 0x000000, map: radial, transparent: true, opacity: 0.55, depthWrite: false }),
  )
  const blob = new THREE.Mesh(bag.add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), blobMat)
  blob.name = ghost ? 'ghost-floor-glow' : 'picker-blob-shadow'
  blob.position.set(0, 0.03, 0.5)
  blob.scale.set(ghost ? 1.5 : 1.15, 1, ghost ? 2.6 : 2.3)
  blob.renderOrder = 5
  group.add(blob)

  // floor ring in the picker's colour, so the worker reads from the overview camera
  const ringMat = bag.add(
    new THREE.MeshBasicMaterial({
      color: ghost ? PALETTE.ghost : PALETTE.solid,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -7,
    }),
  )
  const ring = new THREE.Mesh(bag.add(new THREE.RingGeometry(0.5, 0.62, 48).rotateX(-Math.PI / 2)), ringMat)
  ring.name = ghost ? 'ghost-floor-ring' : 'picker-floor-ring'
  ring.position.set(0, 0.036, 0.42)
  ring.renderOrder = 6
  group.add(ring)

  // ---- animation state ------------------------------------------------------------------------
  const st = {
    init: false,
    x: 0,
    z: 0,
    t: 0,
    heading: 0,
    walking: false,
    phase: 0,
    wheel: 0,
    walkW: 0,
    pickW: 0,
    picking: false,
    hasTarget: false,
    tx: 0,
    tz: 0,
    carried: 0,
    lastCarried: 0,
  }
  const miniOn = new Float32Array(MAX_CARRIED).fill(-1) // time the carton was added (-1 = absent)
  const miniOff = new Float32Array(MAX_CARRIED).fill(-1) // time it was removed
  let miniLive = true // a carton is dropping in or vanishing: recompose the mini matrices
  const mV = new THREE.Vector3()
  const mS = new THREE.Vector3()
  const mQ = new THREE.Quaternion()
  const mE = new THREE.Euler()
  const mM = new THREE.Matrix4()
  const armOut = [0, 0]

  /** Two-bone IK in the sagittal plane: shoulder pitch and elbow bend that put the hand on (ty, tz). */
  function solveArm(shY: number, shZ: number, ty: number, tz: number, lean: number): void {
    const dy = ty - shY
    const dz = tz - shZ
    const d = Math.hypot(dy, dz)
    const tt = Math.atan2(dz, -dy)
    let up = tt
    let bend = 0
    if (d < A_UP + A_FORE - 1e-3) {
      const al = Math.acos(clamp((A_UP * A_UP + d * d - A_FORE * A_FORE) / (2 * A_UP * d), -1, 1))
      const be = Math.acos(clamp((A_UP * A_UP + A_FORE * A_FORE - d * d) / (2 * A_UP * A_FORE), -1, 1))
      up = tt - al
      bend = Math.PI - be
    }
    armOut[0] = -up - lean
    armOut[1] = -bend
  }

  function poseArm(sh: THREE.Bone, el: THREE.Bone, side: number, t: number, lean: number, pushSh: number, pushEl: number, pw: number): void {
    const reach = 1.02 + 0.2 * Math.sin(t * 3.6 + (side > 0 ? 0 : 1.3))
    const pickSh = -reach - lean
    const pickEl = -0.25 - 0.3 * (0.5 + 0.5 * Math.sin(t * 3.6 + (side > 0 ? 0.6 : 1.9)))
    sh.rotation.set(lerp(pushSh, pickSh, pw), 0, side * lerp(0.05, 0.16, pw))
    el.rotation.set(lerp(pushEl, pickEl, pw), 0, 0)
  }

  function animate(t: number, dt: number): void {
    st.walkW += ((st.walking ? 1 : 0) - st.walkW) * (1 - Math.exp(-dt * 7))
    const prevPick = st.pickW
    st.pickW += ((st.picking ? 1 : 0) - st.pickW) * (1 - Math.exp(-dt * 5))
    const pw = st.pickW
    // stepping in to (or back from) the rack shuffles the feet
    const stepping = Math.min(1, (Math.abs(st.pickW - prevPick) / Math.max(dt, 1e-3)) * 0.9)
    if (stepping > 0.02) st.phase = (st.phase + TAU * 1.7 * dt * stepping) % TAU
    const w = Math.max(st.walkW * (1 - 0.9 * pw), stepping * 0.6)
    const ph = st.phase
    const s1 = Math.sin(ph)
    const c1 = Math.cos(ph)

    // legs
    const A = 0.46 * w
    thL.rotation.x = -A * s1
    thR.rotation.x = A * s1
    knL.rotation.x = (0.06 + 0.95 * Math.max(0, c1)) * w
    knR.rotation.x = (0.06 + 0.95 * Math.max(0, -c1)) * w
    ftL.rotation.x = -(thL.rotation.x + knL.rotation.x) * 0.85 + 0.3 * Math.max(0, -s1) * w
    ftR.rotation.x = -(thR.rotation.x + knR.rotation.x) * 0.85 + 0.3 * Math.max(0, s1) * w

    // body: bob, sway, lean; turn and step towards the pick target (yaw is local to the heading)
    let yaw = 0
    let step = 0
    if (st.hasTarget) {
      const dx = st.tx - st.x
      const dz = st.tz - st.z
      yaw = angleDelta(st.heading, Math.atan2(dx, dz))
      step = clamp(Math.hypot(dx, dz) - 0.78, 0, 0.95)
    }
    const breathe = Math.sin(t * 1.7) * 0.004 * (1 - st.walkW)
    hips.position.set(Math.sin(yaw * pw) * step * pw, 0.93 - 0.03 * w * Math.abs(s1) + breathe, Math.cos(yaw * pw) * step * pw)
    hips.rotation.set(0, 0.08 * s1 * w + yaw * pw, 0.03 * c1 * w)
    const leanPush = 0.06 + 0.09 * st.walkW
    const leanPick = 0.3 + 0.07 * Math.sin(t * 3.6)
    const lean = lerp(leanPush, leanPick, pw)
    spine.rotation.set(lean + Math.sin(t * 1.7) * 0.012 * (1 - st.walkW), -0.08 * s1 * w, 0)
    head.rotation.set(-lean * 0.65 + 0.18 * pw, 0.35 * Math.sin(t * 0.43) * (1 - st.walkW) * (1 - pw), 0)

    // arms: two-bone IK onto the cart handle, blended with a reaching pick cycle
    const shY = hips.position.y + 0.09 + 0.4 * Math.cos(lean)
    const shZ = 0.4 * Math.sin(lean)
    solveArm(shY, shZ, 1.06, 0.36, lean)
    const pushSh = armOut[0]
    const pushEl = armOut[1]
    poseArm(shL, elL, 1, t, lean, pushSh, pushEl, pw)
    poseArm(shR, elR, -1, t, lean, pushSh, pushEl, pw)

    // cart wheels
    for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x = st.wheel

    // carried cartons drop into the tote with a small bounce (matrices only while one moves)
    if (miniLive) poseMini(t)

    uniforms.time.value = t
    if (ghost) bodyMat.opacity = ghostBase + 0.04 * Math.sin(t * 11.0) * Math.sin(t * 3.7)
  }

  function poseMini(t: number): void {
    let live = false
    let shown = 0
    for (let i = 0; i < MAX_CARRIED; i++) {
      let s = 0
      let lift = 0
      if (miniOn[i] >= 0 && t < miniOn[i] + 0.4) live = true
      if (miniOn[i] >= 0 && t >= miniOn[i]) {
        const u = clamp((t - miniOn[i]) / 0.38, 0, 1)
        s = Math.min(1, u * 4)
        lift = (1 - u) * (1 - u) * 0.45 - Math.sin(u * Math.PI) * 0.02
      }
      if (miniOff[i] >= 0) {
        const u = clamp((t - miniOff[i]) / 0.22, 0, 1)
        s = 1 - u
        if (u >= 1) miniOff[i] = -1
        else live = true
      }
      if (s <= 0.001) continue
      const o = i * 4
      mV.set(miniSlot[o], miniSlot[o + 1] + lift, miniSlot[o + 2])
      mE.set(0, miniSlot[o + 3], 0)
      mQ.setFromEuler(mE)
      mS.set(0.18 * s, 0.1 * s, 0.19 * s)
      mM.compose(mV, mQ, mS)
      mini.setMatrixAt(i, mM)
      shown = i + 1
    }
    // slots below the highest visible one that are not shown yet collapse out of sight
    for (let i = 0; i < shown; i++) {
      if ((miniOn[i] < 0 || t < miniOn[i]) && miniOff[i] < 0) {
        mS.set(0, 0, 0)
        mM.compose(mV.set(0, -10, 0), mQ.identity(), mS)
        mini.setMatrixAt(i, mM)
      }
    }
    mini.count = shown
    mini.instanceMatrix.needsUpdate = true
    miniLive = live
  }

  function setPicking(on: boolean, tx: number, tz: number): void {
    st.picking = on
    // the target is kept after the pick so the turn and step blend back out smoothly
    if (on) {
      st.hasTarget = true
      st.tx = tx
      st.tz = tz
    }
  }

  function setCarried(n: number): void {
    const target = Math.min(Math.max(0, Math.round(n)), MAX_CARRIED)
    for (let i = 0; i < MAX_CARRIED; i++) {
      if (i < target && miniOn[i] < 0) {
        // several at once (a fast pick) drop in one after another
        miniOn[i] = st.t + (i >= st.carried ? (i - st.carried) * 0.08 : 0)
        miniOff[i] = -1
        miniLive = true
      } else if (i >= target && miniOn[i] >= 0) {
        miniOn[i] = -1
        miniOff[i] = st.t
        miniLive = true
      }
    }
    st.carried = target
  }

  function drive(x: number, z: number, heading: number, d: PickerDrive | null, dt: number, t: number): void {
    const step = dt > 0.1 ? 0.1 : dt > 0 ? dt : 0
    let move = 0
    if (st.init) {
      move = Math.hypot(x - st.x, z - st.z)
      if (move > 3) move = 0 // teleport (reset, restart)
    }
    st.init = true
    st.x = x
    st.z = z
    st.t = t
    st.heading = heading // already smoothed by Walker; the root group carries it
    st.walking = d !== null && d.moving
    let dPh = (move / STRIDE) * TAU
    if (step > 0) dPh = Math.min(dPh, TAU * 2.3 * step)
    if (st.walking && move === 0 && step > 0) dPh = TAU * (1.2 / STRIDE) * step
    st.phase = (st.phase + dPh) % TAU
    st.wheel = (st.wheel + Math.min(move, 0.5) / 0.058) % TAU
    setPicking(d !== null && d.picking, d ? d.targetX : 0, d ? d.targetZ : 0)
    const carried = d ? d.carried : 0
    if (carried !== st.lastCarried) {
      st.lastCarried = carried
      setCarried(carried)
    }
    animate(t, step)
  }

  function dispose(): void {
    // GPU resources only: never removeFromParent, so a StrictMode remount keeps rendering
    skeleton.dispose()
    mini.dispose()
    bag.dispose()
  }

  animate(0, 0)

  return { group, drive, dispose }
}
