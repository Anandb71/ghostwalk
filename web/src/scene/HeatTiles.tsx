// Heatmap of rack visits: one instanced floor tile per bay node (50 tiles, 1 draw call) in the
// walkway in front of the bay, coloured by store.scores.player.train.visitsPerNode with a
// viridis-like ramp. Shown only when store.showHeat and the train score exists; dimmed while
// the optimiser runs (the live layout no longer matches these visits).
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AISLES, BAYS, bayNode, bayZ, aisleX, WALKWAY } from '../sim/layout'
import { useStore } from '../store'
import { viridis } from './shared'

const TILE_COUNT = AISLES * BAYS
const TILE_GEO = new THREE.PlaneGeometry(WALKWAY - 0.25, 1.08).rotateX(-Math.PI / 2)

export default function HeatTiles() {
  const showHeat = useStore((s) => s.showHeat)
  const visits = useStore((s) => s.scores.player.train?.visitsPerNode ?? null)
  const annealing = useStore((s) => s.anneal.running)
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  )

  // static tile positions
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    for (let a = 0; a < AISLES; a++) {
      for (let b = 0; b < BAYS; b++) mesh.setMatrixAt(a * BAYS + b, m.makeTranslation(aisleX(a), 0.012, bayZ(b)))
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TILE_COUNT * 3), 3)
  }, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || !visits) return
    let max = 0
    for (let a = 0; a < AISLES; a++) for (let b = 0; b < BAYS; b++) max = Math.max(max, visits[bayNode(a, b)] ?? 0)
    const c = new THREE.Color()
    for (let a = 0; a < AISLES; a++) {
      for (let b = 0; b < BAYS; b++) {
        const v = visits[bayNode(a, b)] ?? 0
        // sqrt spreads the long tail so mid-frequency bays stay distinguishable
        mesh.setColorAt(a * BAYS + b, viridis(max > 0 ? Math.sqrt(v / max) : 0, c))
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [visits])

  useLayoutEffect(() => {
    material.opacity = annealing ? 0.38 : 0.8
  }, [annealing, material])

  return <instancedMesh ref={ref} args={[TILE_GEO, material, TILE_COUNT]} visible={showHeat && !!visits} renderOrder={2} />
}
