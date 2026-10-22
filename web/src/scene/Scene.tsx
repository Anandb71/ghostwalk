// R3F root. App renders <Scene /> full-bleed behind the UI panels: the canvas fills its nearest
// positioned parent (absolute, inset 0) and sits in its own stacking context (z-index 0) so the
// in-scene Html labels never cover the UI.
import { lazy, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useStore } from '../store'
import AnnealFx from './AnnealFx'
import CameraRig, { INITIAL_CAMERA } from './CameraRig'
import Cartons from './Cartons'
import Floor from './Floor'
import HeatTiles from './HeatTiles'
import Pickers from './Pickers'
import Racks from './Racks'
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

const clearSelection = () => {
  const s = useStore.getState()
  if (s.selectedSlot !== null) s.selectSlot(null)
}

export default function Scene() {
  return (
    <Canvas
      className="absolute inset-0"
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      dpr={[1, 1.5]}
      shadows={false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [...INITIAL_CAMERA.pos], fov: 45, near: 0.1, far: 220 }}
      onPointerMissed={clearSelection}
    >
      <color attach="background" args={[PALETTE.bg]} />
      <fog attach="fog" args={[PALETTE.bg, 42, 105]} />
      <hemisphereLight args={['#cfdcff', '#161c28', 1.25]} />
      <directionalLight position={[-14, 30, -8]} intensity={1.9} />
      <directionalLight position={[24, 14, 26]} intensity={0.35} color="#9fc4ff" />
      <CameraRig />
      <Floor />
      <HeatTiles />
      <Racks />
      <Cartons />
      <Pickers />
      <AnnealFx />
      <MaybeEffects />
    </Canvas>
  )
}
