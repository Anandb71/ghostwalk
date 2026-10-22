// Procedural picker from the Floor Lab (lab/picker.ts, no GLB): a skinned worker in a hi-vis vest
// and hard hat pushing a two-tier picking cart whose tote fills with a mini carton per order line,
// a floor blob and a floor ring. variant 'solid' = orange "you" (4 draw calls, casts shadows at
// HQ), 'ghost' = translucent cyan old layout with scanlines (5 draw calls). Faces local +z.
// Walker moves the root group (position + smoothed heading) at useFrame priority -1; this
// component's useFrame (priority 0) runs after it and feeds that pose plus the optional
// PickerDrive (walking, picking target, lines carried) into the rig's walk cycle and pick pose.
// The body ref is an empty group: Walker's legacy bob and lean land there, not on the rig.
import { useEffect, useMemo, type RefObject } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { buildPicker, type PickerDrive } from './lab/picker'
import { PALETTE } from './shared'

export type PickerVariant = 'solid' | 'ghost'
export type { PickerDrive } from './lab/picker'

/** Fresh drive state for one walker (pass the function itself to useState). */
export const newPickerDrive = (): PickerDrive => ({ moving: false, picking: false, targetX: 0, targetZ: 0, carried: 0 })

export interface PickerProps {
  variant: PickerVariant
  rootRef: RefObject<THREE.Group | null>
  bodyRef: RefObject<THREE.Group | null>
  label?: string
  labelY?: number
  /** walk state written by Walker each frame; without it the rig idles (no picking, empty tote) */
  drive?: PickerDrive
}

// Ghost programs (skinned transparent body, its depth pre-pass, ghost minis) compile on first use,
// which is a visible hitch when a race is started by hand. Once per page, shortly after the idle
// solid picker mounts, a never-drawn ghost rig is compiled against the live scene and its materials
// are kept, so the shared programs stay cached for the real ghost. Nothing is uploaded but programs.
let ghostWarmed = false
const warmKeep: Set<THREE.Material>[] = [] // never disposed: disposing would release the programs
const WARM_DELAY_MS = 1500

function useGhostWarmup(enabled: boolean) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!enabled || ghostWarmed) return
    const id = window.setTimeout(() => {
      if (ghostWarmed) return
      ghostWarmed = true
      try {
        const warm = buildPicker({ ghost: true })
        warmKeep.push(gl.compile(warm.group, camera, scene))
      } catch {
        // warm-up is an optimisation only; the ghost still compiles on first draw
      }
    }, WARM_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [enabled, gl, scene, camera])
}

export default function Picker({ variant, rootRef, bodyRef, label, labelY = 2.3, drive }: PickerProps) {
  const rig = useMemo(() => buildPicker({ ghost: variant === 'ghost' }), [variant])
  // GPU resources only: StrictMode's simulated unmount + remount keeps rendering the same rig
  useEffect(() => () => rig.dispose(), [rig])
  useGhostWarmup(variant === 'solid')

  // priority 0: after Walker (-1), so the rig sees this frame's root pose
  useFrame((s, delta) => {
    const r = rootRef.current
    if (r) rig.drive(r.position.x, r.position.z, r.rotation.y, drive ?? null, Math.min(delta, 0.1), s.clock.elapsedTime)
  })

  return (
    <group ref={rootRef}>
      <group ref={bodyRef} />
      <primitive object={rig.group} />
      {label ? (
        <Html position={[0, labelY, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              whiteSpace: 'nowrap',
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: variant === 'ghost' ? PALETTE.ghost : PALETTE.solid,
              background: 'rgba(11,15,23,0.82)',
              border: `1px solid ${variant === 'ghost' ? 'rgba(57,208,255,0.55)' : 'rgba(255,122,26,0.6)'}`,
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        </Html>
      ) : null}
    </group>
  )
}
