// The 100 cartons: ONE InstancedMesh (1 draw call) placed at slotPosition(displayAssignment[sku]),
// coloured by product rank (1 = hot orange ... 100 = cool blue). Whenever the displayed assignment
// changes (swap, Baseline/SA apply, live SA progress) each moved carton fly-lerps to its new slot
// in 300 ms with an ease-out arc. An invisible, enlarged twin mesh shares the instance matrices and
// takes the raycasts: hover -> store.setHover(slot), click -> store.selectSlot(slot) (the store
// swaps on the second click). Selected slot = emissive halo ring, hovered = outline + Html label.
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SLOTS, slotPosition, slotSide } from '../sim/layout'
import { displayAssignment, useStore, type GhostState } from '../store'
import { PALETTE, rankColor } from './shared'

const N = SLOTS // 100 products <-> 100 slots
const FLY_S = 0.3

const BOX_GEO = new THREE.BoxGeometry(0.8, 0.8, 1.0)
const HIT_GEO = new THREE.BoxGeometry(1.05, 1.05, 1.25) // ~1.3x hit target
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false }) // raycast only, never drawn
const OUTLINE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 1.14))
const HALO_GEO = new THREE.TorusGeometry(0.68, 0.045, 10, 48).rotateY(Math.PI / 2) // ring faces the aisle (x)

interface FlyState {
  cur: Float32Array // displayed position (incl. arc) per sku
  from: Float32Array
  to: Float32Array
  start: Float64Array // flight start (s), -1 = at rest
  slots: Int16Array // slot currently assigned per sku, -1 = none
  placed: boolean
  flying: boolean
}

/** Slot the given sku is displayed at (-1 if none). Read-only view for other scene parts. */
export const cartonSlots = new Int16Array(N).fill(-1)

const nowS = () => performance.now() / 1000

/** Offset from the slot centre toward its aisle (side 0 racks face +x, side 1 face -x). */
const aisleFacing = (slot: number) => (slotSide(slot) === 0 ? 1 : -1)

export default function Cartons() {
  const products = useStore((s) => s.data?.products ?? null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const hitRef = useRef<THREE.InstancedMesh>(null)
  const hoverLocal = useRef<number | null>(null)
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0.04 }), [])
  const fly = useMemo<FlyState>(
    () => ({
      cur: new Float32Array(N * 3),
      from: new Float32Array(N * 3),
      to: new Float32Array(N * 3),
      start: new Float64Array(N).fill(-1),
      slots: new Int16Array(N).fill(-1),
      placed: false,
      flying: false,
    }),
    [],
  )

  // one-time mesh setup: colour attribute up front (shader compiled with it), hit mesh shares matrices
  useLayoutEffect(() => {
    const mesh = meshRef.current
    const hit = hitRef.current
    if (!mesh || !hit) return
    if (!mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3)
    hit.instanceMatrix = mesh.instanceMatrix
    hit.count = 0
    mesh.visible = false
  }, [])

  // colours by product rank
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !products) return
    const c = new THREE.Color()
    for (let i = 0; i < N; i++) mesh.setColorAt(i, rankColor(products[i]?.rank ?? N, c))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [products])

  // follow the displayed assignment (player layout, or the live SA layout while annealing)
  useEffect(() => {
    const apply = (state: GhostState) => {
      const mesh = meshRef.current
      const hit = hitRef.current
      if (!mesh || !hit) return
      const asg = displayAssignment(state)
      if (!asg || asg.length < N || !state.data) {
        if (fly.placed) {
          fly.placed = false
          fly.flying = false
          fly.slots.fill(-1)
          fly.start.fill(-1)
          cartonSlots.fill(-1)
          mesh.visible = false
          hit.count = 0
        }
        return
      }
      const arr = mesh.instanceMatrix.array as Float32Array
      const now = nowS()
      let changed = false
      for (let i = 0; i < N; i++) {
        const slot = asg[i]
        if (slot === fly.slots[i]) continue
        changed = true
        fly.slots[i] = slot
        cartonSlots[i] = slot
        const p = slotPosition(slot)
        const o = i * 3
        fly.to[o] = p.x
        fly.to[o + 1] = p.y
        fly.to[o + 2] = p.z
        if (!fly.placed) {
          fly.cur[o] = p.x
          fly.cur[o + 1] = p.y
          fly.cur[o + 2] = p.z
          arr[i * 16 + 12] = p.x
          arr[i * 16 + 13] = p.y
          arr[i * 16 + 14] = p.z
        } else {
          fly.from[o] = fly.cur[o]
          fly.from[o + 1] = fly.cur[o + 1]
          fly.from[o + 2] = fly.cur[o + 2]
          fly.start[i] = now
          fly.flying = true
        }
      }
      if (!fly.placed) {
        fly.placed = true
        mesh.visible = true
        hit.count = N
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        hit.computeBoundingSphere()
      } else if (changed) {
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    apply(useStore.getState())
    return useStore.subscribe(apply)
  }, [fly])

  useEffect(
    () => () => {
      document.body.style.cursor = ''
    },
    [],
  )

  useFrame(() => {
    if (!fly.flying) return
    const mesh = meshRef.current
    const hit = hitRef.current
    if (!mesh || !hit) return
    const arr = mesh.instanceMatrix.array as Float32Array
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
        fly.start[i] = -1
      } else {
        const k = 1 - (1 - e) * (1 - e) * (1 - e)
        const dx = fly.to[o] - fly.from[o]
        const dz = fly.to[o + 2] - fly.from[o + 2]
        const arc = Math.min(1.4, 0.12 * Math.hypot(dx, dz)) * Math.sin(Math.PI * k)
        fly.cur[o] = fly.from[o] + dx * k
        fly.cur[o + 1] = fly.from[o + 1] + (fly.to[o + 1] - fly.from[o + 1]) * k + arc
        fly.cur[o + 2] = fly.from[o + 2] + dz * k
        active++
      }
      arr[i * 16 + 12] = fly.cur[o]
      arr[i * 16 + 13] = fly.cur[o + 1]
      arr[i * 16 + 14] = fly.cur[o + 2]
    }
    mesh.instanceMatrix.needsUpdate = true
    if (active === 0) {
      fly.flying = false
      mesh.computeBoundingSphere()
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
      <instancedMesh ref={meshRef} args={[BOX_GEO, material, N]} frustumCulled={false} />
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
  const haloRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const h = haloRef.current
    if (!h) return
    const k = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 6)
    h.scale.setScalar(k)
  })

  const hover = hoverSlot !== null && hoverSku >= 0 && products ? { slot: hoverSlot, p: products[hoverSku], pos: slotPosition(hoverSlot) } : null
  const sel = selectedSlot !== null && selectedSku >= 0 && products ? { slot: selectedSlot, p: products[selectedSku], pos: slotPosition(selectedSlot) } : null

  return (
    <group>
      {sel ? (
        <group position={[sel.pos.x, sel.pos.y, sel.pos.z]}>
          <mesh ref={haloRef} geometry={HALO_GEO} position={[aisleFacing(sel.slot) * 0.44, 0, 0]} renderOrder={6}>
            <meshStandardMaterial color={PALETTE.solid} emissive={PALETTE.solid} emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          {sel.slot !== hoverSlot ? (
            <Html position={[0, 0.95, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
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
          <Html position={[0, 1.05, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div style={tagStyle(false)}>
              <span style={{ fontWeight: 700 }}>{hover.p?.sku}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span>{hover.p?.desc}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hover.p?.picks ?? 0} picks</span>
              <span style={{ opacity: 0.55 }}> · #{hover.p?.rank}</span>
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
