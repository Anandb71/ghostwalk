// The 100 cartons, Floor Lab models (lab/cartons.ts): TWO InstancedMeshes (2 draw calls), kraft
// bodies with tape, hand holes and print, and one shipping label per sku (SKU, description, barcode,
// TRAIN rank) on the face that looks into the aisle. Each carton sits on the pick beam at
// displayAssignment[sku]. Heat off = plain cardboard; Heat on (store.showHeat) eases in a tint by
// TRAIN pick rank (sim.trainRanks: 1–15 Nov only, 1 = hot orange ... 100 = cool blue, the ramp of the
// 2D slot map; the month-wide Product.rank includes held-out picks and is never shown). Whenever the
// displayed assignment changes (swap, Baseline/SA apply, live SA progress) each moved carton
// fly-lerps to its new slot in 300 ms with an ease-out arc, turning to face its new aisle. An
// invisible, enlarged twin mesh with its own translation-only matrices takes the raycasts:
// hover -> store.setHover(slot), click -> store.selectSlot(slot) (the store swaps on the second
// click). Selected slot = emissive halo ring, hovered = outline + Html label.
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SLOTS, slotSide } from '../sim/layout'
import { trainRanks } from '../sim/data'
import { displayAssignment, useStore, type GhostState } from '../store'
import { PALETTE, angleDelta } from './shared'
import { cartonPose, createCartonResources, slotCartonCentre, writeCartonMatrix, writeLabelMatrix } from './lab/cartons'

const N = SLOTS // 100 products <-> 100 slots
const FLY_S = 0.3

// hit box: stays inside the bay (1.2 m along z) and the 1.28 m between back-to-back cartons (x)
const HIT_GEO = new THREE.BoxGeometry(0.95, 0.8, 1.12)
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false }) // raycast only, never drawn
const OUTLINE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.62, 0.92))
const HALO_GEO = new THREE.TorusGeometry(0.55, 0.04, 10, 48).rotateY(Math.PI / 2) // ring faces the aisle (x)

interface FlyState {
  cur: Float32Array // displayed position (incl. arc) per sku
  from: Float32Array
  to: Float32Array
  curR: Float32Array // displayed heading (ry) per sku
  fromR: Float32Array
  toR: Float32Array
  start: Float64Array // flight start (s), -1 = at rest
  slots: Int16Array // slot currently assigned per sku, -1 = none
  placed: boolean
  flying: boolean
}

/** Slot the given sku is displayed at (-1 if none). Read-only view for other scene parts. */
export const cartonSlots = new Int16Array(N).fill(-1)

const nowS = () => performance.now() / 1000
const pose = new Float32Array(4) // cartonPose scratch: x, y, z, ry

/** Offset from the slot centre toward its aisle (side 0 racks face +x, side 1 face -x). */
const aisleFacing = (slot: number) => (slotSide(slot) === 0 ? 1 : -1)

/** Write body, label and hit matrices of sku i from its displayed pose (no allocation). */
function writeInstance(fly: FlyState, size: Float32Array, body: Float32Array, labels: Float32Array, hit: Float32Array, i: number): void {
  const o = i * 3
  const x = fly.cur[o]
  const y = fly.cur[o + 1]
  const z = fly.cur[o + 2]
  const ry = fly.curR[i]
  writeCartonMatrix(body, i, x, y, z, ry, size[o], size[o + 1], size[o + 2])
  writeLabelMatrix(labels, i, x, y, z, ry, size[o + 2])
  // the hit box keeps its identity rotation/scale: translation only
  hit[i * 16 + 12] = x
  hit[i * 16 + 13] = y
  hit[i * 16 + 14] = z
}

export default function Cartons() {
  const products = useStore((s) => s.data?.products ?? null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const hitRef = useRef<THREE.InstancedMesh>(null)
  const hoverLocal = useRef<number | null>(null)
  const res = useMemo(createCartonResources, [])
  useEffect(() => () => res.dispose(), [res])
  const fly = useMemo<FlyState>(
    () => ({
      cur: new Float32Array(N * 3),
      from: new Float32Array(N * 3),
      to: new Float32Array(N * 3),
      curR: new Float32Array(N),
      fromR: new Float32Array(N),
      toR: new Float32Array(N),
      start: new Float64Array(N).fill(-1),
      slots: new Int16Array(N).fill(-1),
      placed: false,
      flying: false,
    }),
    [],
  )

  // one-time mesh setup: kraft colour attribute up front (shader compiled with it); the hit mesh
  // keeps its own translation-only matrices (the body matrices carry rotation and per-sku scale)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    const labels = labelRef.current
    const hit = hitRef.current
    if (!mesh || !labels || !hit) return
    // StrictMode re-runs this effect with the same `fly`: forget earlier placements so the follow
    // effect below places (and shows) every carton again instead of seeing "nothing changed".
    fly.placed = false
    fly.flying = false
    fly.slots.fill(-1)
    fly.start.fill(-1)
    if (!mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(res.kraft.slice(), 3)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    labels.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.visible = false
    labels.visible = false
    hit.count = 0
  }, [fly, res])

  // labels and heat colours by train pick rank (never the month-wide rank: that includes held-out picks)
  useLayoutEffect(() => {
    if (products) res.setProducts(products, trainRanks(products))
  }, [products, res])

  // follow the displayed assignment (player layout, or the live SA layout while annealing)
  useEffect(() => {
    const apply = (state: GhostState) => {
      const mesh = meshRef.current
      const labels = labelRef.current
      const hit = hitRef.current
      if (!mesh || !labels || !hit) return
      const asg = displayAssignment(state)
      if (!asg || asg.length < N || !state.data) {
        if (fly.placed) {
          fly.placed = false
          fly.flying = false
          fly.slots.fill(-1)
          fly.start.fill(-1)
          cartonSlots.fill(-1)
          mesh.visible = false
          labels.visible = false
          hit.count = 0
        }
        return
      }
      const body = mesh.instanceMatrix.array as Float32Array
      const lab = labels.instanceMatrix.array as Float32Array
      const hits = hit.instanceMatrix.array as Float32Array
      const size = res.size
      const now = nowS()
      for (let i = 0; i < N; i++) {
        const slot = asg[i]
        if (slot === fly.slots[i]) continue
        fly.slots[i] = slot
        cartonSlots[i] = slot
        const o = i * 3
        cartonPose(slot, size[o + 2], size[o + 1], pose, 0)
        fly.to[o] = pose[0]
        fly.to[o + 1] = pose[1]
        fly.to[o + 2] = pose[2]
        fly.toR[i] = pose[3]
        if (!fly.placed) {
          fly.cur[o] = pose[0]
          fly.cur[o + 1] = pose[1]
          fly.cur[o + 2] = pose[2]
          fly.curR[i] = pose[3]
          writeInstance(fly, size, body, lab, hits, i)
        } else {
          fly.from[o] = fly.cur[o]
          fly.from[o + 1] = fly.cur[o + 1]
          fly.from[o + 2] = fly.cur[o + 2]
          fly.fromR[i] = fly.curR[i]
          fly.start[i] = now
          fly.flying = true
        }
      }
      if (!fly.placed) {
        fly.placed = true
        mesh.visible = true
        labels.visible = true
        hit.count = N
        mesh.instanceMatrix.needsUpdate = true
        labels.instanceMatrix.needsUpdate = true
        hit.instanceMatrix.needsUpdate = true
        hit.computeBoundingSphere()
      }
    }
    apply(useStore.getState())
    return useStore.subscribe(apply)
  }, [fly, res])

  useEffect(
    () => () => {
      document.body.style.cursor = ''
    },
    [],
  )

  useFrame((_, delta) => {
    // ease the heat tint toward the Heat toggle (uniform only: no recompiles, no re-uploads)
    const dt = Math.min(delta, 0.1)
    const heat = res.uHeat
    const target = useStore.getState().showHeat ? 1 : 0
    if (heat.value !== target) {
      heat.value += (target - heat.value) * (1 - Math.exp(-dt * 6))
      if (Math.abs(target - heat.value) <= 1e-3) heat.value = target
    }

    if (!fly.flying) return
    const mesh = meshRef.current
    const labels = labelRef.current
    const hit = hitRef.current
    if (!mesh || !labels || !hit) return
    const body = mesh.instanceMatrix.array as Float32Array
    const lab = labels.instanceMatrix.array as Float32Array
    const hits = hit.instanceMatrix.array as Float32Array
    const size = res.size
    const now = nowS()
    let active = 0
    for (let i = 0; i < N; i++) {
      const st = fly.start[i]
      if (st < 0) continue
      const o = i * 3
      const e = (now - st) / FLY_S
      if (e >= 1) {
        fly.cur[o] = fly.to[o]
        fly.cur[o + 1] = fly.to[o + 1]
        fly.cur[o + 2] = fly.to[o + 2]
        fly.curR[i] = fly.toR[i]
        fly.start[i] = -1
      } else {
        const k = 1 - (1 - e) * (1 - e) * (1 - e)
        const dx = fly.to[o] - fly.from[o]
        const dz = fly.to[o + 2] - fly.from[o + 2]
        const arc = Math.min(1.4, 0.12 * Math.hypot(dx, dz)) * Math.sin(Math.PI * k)
        fly.cur[o] = fly.from[o] + dx * k
        fly.cur[o + 1] = fly.from[o + 1] + (fly.to[o + 1] - fly.from[o + 1]) * k + arc
        fly.cur[o + 2] = fly.from[o + 2] + dz * k
        // a swap across the aisle turns the carton 180 degrees so its label ends up facing the aisle
        fly.curR[i] = fly.fromR[i] + angleDelta(fly.fromR[i], fly.toR[i]) * k
        active++
      }
      writeInstance(fly, size, body, lab, hits, i)
    }
    mesh.instanceMatrix.needsUpdate = true
    labels.instanceMatrix.needsUpdate = true
    hit.instanceMatrix.needsUpdate = true
    if (active === 0) {
      fly.flying = false
      hit.computeBoundingSphere()
    }
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const id = e.instanceId
    if (id === undefined) return
    const slot = fly.slots[id]
    if (slot < 0 || hoverLocal.current === slot) return
    hoverLocal.current = slot
    document.body.style.cursor = 'pointer'
    useStore.getState().setHover(slot)
  }
  const onOut = () => {
    if (hoverLocal.current === null) return
    hoverLocal.current = null
    document.body.style.cursor = ''
    useStore.getState().setHover(null)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const id = e.instanceId
    if (id === undefined) return
    const slot = fly.slots[id]
    if (slot >= 0) useStore.getState().selectSlot(slot)
  }

  return (
    <group>
      <instancedMesh ref={meshRef} args={[res.bodyGeo, res.bodyMat, N]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={labelRef} args={[res.labelGeo, res.labelMat, N]} frustumCulled={false} receiveShadow />
      <instancedMesh ref={hitRef} args={[HIT_GEO, HIT_MAT, N]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      <CartonMarkers />
    </group>
  )
}

/** sku displayed at a slot, as a primitive selector (stable for zustand). */
const skuAt = (s: GhostState, slot: number | null): number => {
  if (slot === null) return -1
  const a = displayAssignment(s)
  return a ? a.indexOf(slot) : -1
}

function CartonMarkers() {
  const hoverSlot = useStore((s) => s.hoverSlot)
  const selectedSlot = useStore((s) => s.selectedSlot)
  const hoverSku = useStore((s) => skuAt(s, s.hoverSlot))
  const selectedSku = useStore((s) => skuAt(s, s.selectedSlot))
  const products = useStore((s) => s.data?.products ?? null)
  const ranks = useMemo(() => (products ? trainRanks(products) : null), [products])
  const haloRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const h = haloRef.current
    if (!h) return
    const k = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 6)
    h.scale.setScalar(k)
  })

  const hover = hoverSlot !== null && hoverSku >= 0 && products ? { slot: hoverSlot, p: products[hoverSku], pos: slotCartonCentre(hoverSlot) } : null
  const sel = selectedSlot !== null && selectedSku >= 0 && products ? { slot: selectedSlot, p: products[selectedSku], pos: slotCartonCentre(selectedSlot) } : null

  return (
    <group>
      {sel ? (
        <group position={[sel.pos.x, sel.pos.y, sel.pos.z]}>
          <mesh ref={haloRef} geometry={HALO_GEO} position={[aisleFacing(sel.slot) * 0.33, 0, 0]} renderOrder={6}>
            <meshStandardMaterial color={PALETTE.solid} emissive={PALETTE.solid} emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          {sel.slot !== hoverSlot ? (
            <Html position={[0, 0.62, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div style={tagStyle(true)}>{sel.p?.sku}</div>
            </Html>
          ) : null}
        </group>
      ) : null}
      {hover ? (
        <group position={[hover.pos.x, hover.pos.y, hover.pos.z]}>
          <lineSegments geometry={OUTLINE_GEO}>
            <lineBasicMaterial color="#ffffff" toneMapped={false} />
          </lineSegments>
          <Html position={[0, 0.72, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div style={tagStyle(false)}>
              <span style={{ fontWeight: 700 }}>{hover.p?.sku}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span>{hover.p?.desc}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hover.p?.picksTrain ?? 0} train picks</span>
              <span style={{ opacity: 0.55 }}> · #{ranks ? ranks[hoverSku] : '—'}</span>
            </div>
          </Html>
        </group>
      ) : null}
    </group>
  )
}

function tagStyle(selected: boolean): CSSProperties {
  return {
    whiteSpace: 'nowrap',
    padding: selected ? '1px 7px' : '3px 9px',
    borderRadius: 6,
    fontSize: selected ? 10 : 11,
    lineHeight: 1.35,
    color: '#e6edf7',
    background: 'rgba(11,15,23,0.88)',
    border: `1px solid ${selected ? 'rgba(255,122,26,0.7)' : 'rgba(230,237,247,0.25)'}`,
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    userSelect: 'none',
  }
}
