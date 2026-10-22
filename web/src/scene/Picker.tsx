// Procedural picker rig (no GLB): capsule body, head, a small push cart carrying two cartons.
// Faces local +z. variant 'solid' = orange "you", 'ghost' = translucent cyan old layout.
// The rig itself is static; Walker moves the root group and animates the body ref.
import type { RefObject } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { PALETTE } from './shared'

export type PickerVariant = 'solid' | 'ghost'

const GEO = {
  body: new THREE.CapsuleGeometry(0.26, 0.62, 6, 14),
  head: new THREE.SphereGeometry(0.19, 18, 14),
  cart: new THREE.BoxGeometry(0.62, 0.36, 0.78),
  handle: new THREE.BoxGeometry(0.62, 0.05, 0.05),
  box: new THREE.BoxGeometry(0.3, 0.24, 0.32),
}

function makeMaterials(variant: PickerVariant) {
  if (variant === 'ghost') {
    const ghost = (opacity: number) =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.ghost,
        emissive: PALETTE.ghost,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity,
        depthWrite: false,
        roughness: 0.4,
      })
    const m = ghost(0.35)
    const faint = ghost(0.22)
    return { body: m, head: m, cart: faint, handle: faint, box: faint }
  }
  return {
    body: new THREE.MeshStandardMaterial({ color: PALETTE.solid, emissive: PALETTE.solid, emissiveIntensity: 0.18, roughness: 0.55 }),
    head: new THREE.MeshStandardMaterial({ color: '#f3d2b0', roughness: 0.7 }),
    cart: new THREE.MeshStandardMaterial({ color: '#7d889e', roughness: 0.45, metalness: 0.5 }),
    handle: new THREE.MeshStandardMaterial({ color: '#c9d1e0', roughness: 0.35, metalness: 0.6 }),
    box: new THREE.MeshStandardMaterial({ color: PALETTE.cardboard, roughness: 0.9 }),
  }
}

const MATS: Record<PickerVariant, ReturnType<typeof makeMaterials>> = {
  solid: makeMaterials('solid'),
  ghost: makeMaterials('ghost'),
}

export interface PickerProps {
  variant: PickerVariant
  rootRef: RefObject<THREE.Group | null>
  bodyRef: RefObject<THREE.Group | null>
  label?: string
  labelY?: number
}

export default function Picker({ variant, rootRef, bodyRef, label, labelY = 2.3 }: PickerProps) {
  const m = MATS[variant]
  const ro = variant === 'ghost' ? 5 : 0 // ghost draws after opaque geometry
  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        <mesh geometry={GEO.body} material={m.body} position={[0, 0.6, 0]} renderOrder={ro} />
        <mesh geometry={GEO.head} material={m.head} position={[0, 1.42, 0]} renderOrder={ro} />
      </group>
      {/* push cart in front of the picker */}
      <mesh geometry={GEO.cart} material={m.cart} position={[0, 0.5, 0.78]} renderOrder={ro} />
      <mesh geometry={GEO.handle} material={m.handle} position={[0, 0.98, 0.36]} renderOrder={ro} />
      <mesh geometry={GEO.box} material={m.box} position={[-0.13, 0.8, 0.66]} renderOrder={ro} />
      <mesh geometry={GEO.box} material={m.box} position={[0.12, 0.8, 0.92]} rotation-y={0.3} renderOrder={ro} />
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
