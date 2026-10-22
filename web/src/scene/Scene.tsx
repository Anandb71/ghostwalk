// R3F root. App renders <Scene /> full-bleed behind the UI panels: the canvas fills its nearest
// positioned parent (absolute, inset 0) and sits in its own stacking context (z-index 0) so the
// in-scene Html labels never cover the UI.
// Lights follow the Floor Lab: a hemisphere fill and a key light at both qualities; at HQ the key
// casts a 2048 shadow map (PCF) and 4 point lights hang under the fixtures. Shadows and extra lights
// exist only at HQ, so MQ never renders a shadow pass. Switching quality recompiles the lit
// materials once (the lights hash changes); pick MQ or HQ before recording.
import { lazy, Suspense, useLayoutEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import AnnealFx from './AnnealFx'
import CameraRig, { INITIAL_CAMERA } from './CameraRig'
import Cartons from './Cartons'
import Floor from './Floor'
import HeatTiles from './HeatTiles'
import Pickers from './Pickers'
import { PALETTE } from './shared'

const Effects = lazy(() => import('./Effects'))

function MaybeEffects() {
  const quality = useStore((s) => s.quality)
  if (quality !== 'high') return null
  return (
    <Suspense fallback={null}>
      <Effects />
    </Suspense>
  )
}

// Key light about 46 degrees up from the far corner, aimed at the middle of the racks, so the racks
// throw readable shadows across the aisles in every view.
const KEY_TARGET: readonly [number, number, number] = [8.5, 0, 8]
const KEY_POS = new THREE.Vector3(-0.62, 0.72, -0.31)
  .normalize()
  .multiplyScalar(46)
  .add(new THREE.Vector3(...KEY_TARGET))
  .toArray()

function KeyLight({ hq }: { hq: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const l = ref.current
    if (!l) return
    // the target is not in the scene graph, so its world matrix is set once by hand
    l.target.position.set(...KEY_TARGET)
    l.target.updateMatrixWorld()
    l.shadow.mapSize.set(2048, 2048)
    const sc = l.shadow.camera
    sc.left = -26
    sc.right = 26
    sc.top = 24
    sc.bottom = -24
    sc.near = 10
    sc.far = 90
    sc.updateProjectionMatrix()
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.025
  }, [])
  // castShadow follows quality: three only recompiles materials when the lights hash changes, not
  // when renderer.shadowMap.enabled alone flips
  return <directionalLight ref={ref} color="#d6e1ff" intensity={1.25 * (hq ? 2.5 : 1.35)} position={KEY_POS} castShadow={hq} />
}

const FIXTURE_LIGHTS: readonly (readonly [number, number])[] = [
  [-6.2, -1.6],
  [5, 3],
  [15, 13],
  [10, 18],
]

/** HQ only: warm point lights under four of the ceiling fixtures (dock, aisles, back lane). */
function FixtureLights() {
  return (
    <>
      {FIXTURE_LIGHTS.map(([x, z]) => (
        <pointLight key={`${x},${z}`} color="#ffd09a" intensity={26} distance={16} decay={2} position={[x, 5.6, z]} />
      ))}
    </>
  )
}

const clearSelection = () => {
  const s = useStore.getState()
  if (s.selectedSlot !== null) s.selectSlot(null)
}

export default function Scene() {
  const quality = useStore((s) => s.quality)
  const hq = quality === 'high'
  return (
    <Canvas
      className="absolute inset-0"
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      dpr={[1, 1.5]}
      // 'percentage' = PCFShadowMap; R3F maps `true` to PCFSoftShadowMap, which r186 removed
      shadows={hq ? 'percentage' : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [...INITIAL_CAMERA.pos], fov: 45, near: 0.1, far: 220 }}
      onPointerMissed={clearSelection}
    >
      <color attach="background" args={[PALETTE.bg]} />
      <fog attach="fog" args={[PALETTE.bg, 46, 128]} />
      {/* props, not args, so a quality change updates the light instead of recreating it */}
      <hemisphereLight color="#a8bdd4" groundColor="#2a2e33" intensity={hq ? 0.546 : 0.8925} />
      <KeyLight hq={hq} />
      {hq ? <FixtureLights /> : null}
      <CameraRig />
      <Floor />
      <HeatTiles />
      <Cartons />
      <Pickers />
      <AnnealFx />
      <MaybeEffects />
    </Canvas>
  )
}
