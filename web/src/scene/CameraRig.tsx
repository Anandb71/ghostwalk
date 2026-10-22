// drei CameraControls with three presets driven by store.camera:
//  overview — 3/4 view from the dock side, aisles run left -> right
//  follow   — chase camera on the solid picker (reads followTarget every frame)
//  top      — straight-down plan view for swapping (same orientation as overview: +x up, +z right)
// Transitions are smooth (CameraControls damping).
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useStore, type CameraPreset } from '../store'
import { followTarget } from './shared'

type V3 = readonly [number, number, number]

export const CAMERA_PRESETS: Record<'overview' | 'top', { pos: V3; target: V3 }> = {
  overview: { pos: [-13, 23, 1.5], target: [9.5, 0, 8.5] },
  top: { pos: [9.49, 44, 8.5], target: [9.5, 0, 8.5] },
}

const FOLLOW_OFFSET: V3 = [-7, 7.5, -1.5]

export const INITIAL_CAMERA = CAMERA_PRESETS.overview

export default function CameraRig() {
  const ref = useRef<CameraControls>(null)
  const camera = useStore((s) => s.camera)
  const presetRef = useRef<CameraPreset>(camera)
  presetRef.current = camera

  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (camera === 'follow') {
      c.smoothTime = 0.35
      return
    }
    c.smoothTime = 0.55
    const { pos, target } = CAMERA_PRESETS[camera]
    void c.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], true)
  }, [camera])

  useFrame(() => {
    const c = ref.current
    if (!c || presetRef.current !== 'follow') return
    const { x, z } = followTarget
    void c.setLookAt(x + FOLLOW_OFFSET[0], FOLLOW_OFFSET[1], z + FOLLOW_OFFSET[2], x, 0.7, z, true)
  })

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={4}
      maxDistance={85}
      maxPolarAngle={Math.PI * 0.46}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
    />
  )
}
