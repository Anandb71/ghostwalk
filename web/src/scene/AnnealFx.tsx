// Optimiser feedback: every time store.anneal.lastSwap changes, a brief additive spark bursts at
// both swapped cartons' new slots (the cartons themselves fly via Cartons.tsx). Pooled instanced
// mesh, 1 draw call, no allocation per frame. (Heat-tile dimming while running lives in HeatTiles.)
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { slotPosition } from '../sim/layout'
import { displayAssignment, useStore } from '../store'
import { writeScaleTranslate } from './shared'

const POOL = 16
const LIFE_S = 0.55
const SPARK_GEO = new THREE.IcosahedronGeometry(0.5, 1)
const BASE = new THREE.Color('#ffd27a')

export default function AnnealFx() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const pool = useMemo(
    () => ({
      born: new Float64Array(POOL).fill(-1),
      x: new Float32Array(POOL),
      y: new Float32Array(POOL),
      z: new Float32Array(POOL),
      next: 0,
      live: 0,
    }),
    [],
  )
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (mesh) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3)
      ;(mesh.instanceMatrix.array as Float32Array).fill(0)
      mesh.instanceMatrix.needsUpdate = true
    }
    return useStore.subscribe((state, prev) => {
      const swap = state.anneal.lastSwap
      if (!swap || swap === prev.anneal.lastSwap) return
      const asg = displayAssignment(state)
      if (!asg) return
      const now = performance.now() / 1000
      for (const sku of swap) {
        const slot = asg[sku]
        if (slot === undefined) continue
        const p = slotPosition(slot)
        const i = pool.next
        pool.next = (pool.next + 1) % POOL
        pool.born[i] = now
        pool.x[i] = p.x
        pool.y[i] = p.y
        pool.z[i] = p.z
        pool.live = POOL
      }
    })
  }, [pool])

  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh || pool.live === 0) return
    const arr = mesh.instanceMatrix.array as Float32Array
    const now = performance.now() / 1000
    let alive = 0
    for (let i = 0; i < POOL; i++) {
      const b = pool.born[i]
      if (b < 0) continue
      const e = (now - b) / LIFE_S
      if (e >= 1) {
        pool.born[i] = -1
        writeScaleTranslate(arr, i, 0, 0, 0, 0)
        continue
      }
      alive++
      const fade = (1 - e) * (1 - e)
      writeScaleTranslate(arr, i, 0.35 + 1.5 * (1 - (1 - e) * (1 - e)), pool.x[i], pool.y[i], pool.z[i])
      mesh.setColorAt(i, tmp.copy(BASE).multiplyScalar(fade * 1.6))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    pool.live = alive
  })

  return <instancedMesh ref={ref} args={[SPARK_GEO, material, POOL]} frustumCulled={false} renderOrder={7} />
}
