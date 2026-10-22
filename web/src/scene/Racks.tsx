// Pallet racking for 5 aisles x 2 sides, two blocks of 5 bays each. Three InstancedMeshes
// (uprights, beams, carton decks) = 3 draw calls. The tops are open (beams only) so the
// cartons stay visible from the overview and top cameras.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AISLES, aisleX, BAY_PITCH, RACK_DEPTH, RACK_HEIGHT, RACK_OFFSET } from '../sim/layout'
import { PALETTE } from './shared'

const BLOCK_Z0 = [0, 10] // block start z (bays 0..4, 5..9)
const BAYS_PER_BLOCK = 5
const BLOCK_LEN = BAYS_PER_BLOCK * BAY_PITCH // 6.0
const FACE = RACK_DEPTH / 2 - 0.04 // upright offset from the rack centre line
const BEAM_LEVELS = [0.55, 1.55, RACK_HEIGHT - 0.05]
const DECK_Y = 0.58 // carton shelf; deck top at 0.6, carton centre at 1.0

interface Racking {
  posts: THREE.Matrix4[]
  beams: THREE.Matrix4[]
  decks: THREE.Matrix4[]
}

function buildRacking(): Racking {
  const posts: THREE.Matrix4[] = []
  const beams: THREE.Matrix4[] = []
  const decks: THREE.Matrix4[] = []
  for (let a = 0; a < AISLES; a++) {
    for (const side of [-1, 1]) {
      const cx = aisleX(a) + side * RACK_OFFSET
      for (const z0 of BLOCK_Z0) {
        const zc = z0 + BLOCK_LEN / 2
        for (let i = 0; i <= BAYS_PER_BLOCK; i++) {
          for (const f of [-1, 1]) posts.push(new THREE.Matrix4().makeTranslation(cx + f * FACE, RACK_HEIGHT / 2, z0 + i * BAY_PITCH))
        }
        for (const y of BEAM_LEVELS) {
          for (const f of [-1, 1]) beams.push(new THREE.Matrix4().makeTranslation(cx + f * FACE, y, zc))
        }
        decks.push(new THREE.Matrix4().makeTranslation(cx, DECK_Y, zc))
      }
    }
  }
  return { posts, beams, decks }
}

function Instanced({ geometry, material, matrices }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices])
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} />
}

export default function Racks() {
  const racking = useMemo(buildRacking, [])
  const res = useMemo(
    () => ({
      postGeo: new THREE.BoxGeometry(0.07, RACK_HEIGHT, 0.07),
      beamGeo: new THREE.BoxGeometry(0.05, 0.09, BLOCK_LEN),
      deckGeo: new THREE.BoxGeometry(RACK_DEPTH - 0.06, 0.04, BLOCK_LEN - 0.04),
      postMat: new THREE.MeshStandardMaterial({ color: PALETTE.rackPost, roughness: 0.6, metalness: 0.35 }),
      beamMat: new THREE.MeshStandardMaterial({ color: PALETTE.rackBeam, roughness: 0.5, metalness: 0.4 }),
      deckMat: new THREE.MeshStandardMaterial({ color: PALETTE.rackDeck, roughness: 0.85, metalness: 0.1 }),
    }),
    [],
  )
  return (
    <group>
      <Instanced geometry={res.postGeo} material={res.postMat} matrices={racking.posts} />
      <Instanced geometry={res.beamGeo} material={res.beamMat} matrices={racking.beams} />
      <Instanced geometry={res.deckGeo} material={res.deckMat} matrices={racking.decks} />
    </group>
  )
}
