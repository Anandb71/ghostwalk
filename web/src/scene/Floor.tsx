// Floor plane, painted floor markings (one canvas texture: cross-aisles, walkway edges, the walkable
// aisle graph, rack footprints, dock zone, "DOCK" and aisle labels) and the packing dock props.
// Draw calls: 2 for the floor + 5 for the dock.
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  AISLES,
  aisleX,
  BACK_Z,
  CROSS_AISLE,
  DOCK_X,
  DOCK_Z,
  EDGES,
  FRONT_Z,
  MIDDLE_Z,
  NODES,
  RACK_OFFSET,
  RACK_DEPTH,
  WALKWAY,
} from '../sim/layout'
import { PALETTE } from './shared'

// Overlay bounds (world metres) and resolution.
const XMIN = -10
const XMAX = 26
const ZMIN = -8
const ZMAX = 22
const PX = 40 // pixels per metre

const BLOCKS: readonly [number, number][] = [
  [0, 6],
  [10, 16],
]

function paintMarkings(): HTMLCanvasElement {
  const W = (XMAX - XMIN) * PX
  const H = (ZMAX - ZMIN) * PX
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return c
  const X = (x: number) => (x - XMIN) * PX
  const Z = (z: number) => (z - ZMIN) * PX
  const left = aisleX(0) - RACK_OFFSET - RACK_DEPTH / 2 // outer edge of the first rack
  const right = aisleX(AISLES - 1) + RACK_OFFSET + RACK_DEPTH / 2

  g.clearRect(0, 0, W, H)

  // soft "contact shadow" under every rack block
  g.fillStyle = 'rgba(0,0,0,0.35)'
  for (let a = 0; a < AISLES; a++) {
    for (const side of [-1, 1]) {
      const cx = aisleX(a) + side * RACK_OFFSET
      for (const [z0, z1] of BLOCKS) {
        g.fillRect(X(cx - 0.62), Z(z0 - 0.12), 1.24 * PX, (z1 - z0 + 0.24) * PX)
      }
    }
  }

  // cross-aisle bands + dashed safety edges
  for (const zc of [FRONT_Z, MIDDLE_Z, BACK_Z]) {
    const z0 = zc - CROSS_AISLE / 2
    const z1 = zc + CROSS_AISLE / 2
    g.fillStyle = 'rgba(255,255,255,0.028)'
    g.fillRect(X(left), Z(z0), (right - left) * PX, CROSS_AISLE * PX)
    g.strokeStyle = 'rgba(232,185,35,0.55)'
    g.lineWidth = 0.07 * PX
    g.setLineDash([0.6 * PX, 0.4 * PX])
    for (const z of [z0, z1]) {
      g.beginPath()
      g.moveTo(X(left), Z(z))
      g.lineTo(X(right), Z(z))
      g.stroke()
    }
  }
  g.setLineDash([])

  // walkway edges along the rack faces (solid yellow)
  g.strokeStyle = 'rgba(232,185,35,0.7)'
  g.lineWidth = 0.06 * PX
  for (let a = 0; a < AISLES; a++) {
    for (const side of [-1, 1]) {
      const x = aisleX(a) + side * (WALKWAY / 2 - 0.05)
      for (const [z0, z1] of BLOCKS) {
        g.beginPath()
        g.moveTo(X(x), Z(z0))
        g.lineTo(X(x), Z(z1))
        g.stroke()
      }
    }
  }

  // the walkable aisle graph: pickers only ever move along these lines
  g.strokeStyle = 'rgba(57,208,255,0.22)'
  g.lineWidth = 0.05 * PX
  for (const [u, v] of EDGES) {
    g.beginPath()
    g.moveTo(X(NODES[u].x), Z(NODES[u].z))
    g.lineTo(X(NODES[v].x), Z(NODES[v].z))
    g.stroke()
  }
  for (const n of NODES) {
    const r = n.kind === 'bay' ? 0.08 : 0.14
    g.fillStyle = n.kind === 'bay' ? 'rgba(57,208,255,0.35)' : 'rgba(57,208,255,0.55)'
    g.beginPath()
    g.arc(X(n.x), Z(n.z), r * PX, 0, Math.PI * 2)
    g.fill()
  }

  // dock zone: tinted fill, hazard-striped border
  const dx0 = DOCK_X - 4
  const dx1 = DOCK_X + 1.4
  const dz0 = DOCK_Z - 3
  const dz1 = DOCK_Z + 3
  g.fillStyle = 'rgba(255,122,26,0.07)'
  g.fillRect(X(dx0), Z(dz0), (dx1 - dx0) * PX, (dz1 - dz0) * PX)
  g.lineWidth = 0.14 * PX
  g.strokeStyle = 'rgba(10,10,10,0.9)'
  g.strokeRect(X(dx0), Z(dz0), (dx1 - dx0) * PX, (dz1 - dz0) * PX)
  g.strokeStyle = 'rgba(232,185,35,0.85)'
  g.setLineDash([0.3 * PX, 0.3 * PX])
  g.strokeRect(X(dx0), Z(dz0), (dx1 - dx0) * PX, (dz1 - dz0) * PX)
  g.setLineDash([])

  // labels: text "up" points to +x so they read left-to-right from the overview and top cameras
  const label = (text: string, x: number, z: number, sizeM: number, color: string) => {
    g.save()
    g.translate(X(x), Z(z))
    g.rotate(Math.PI / 2)
    g.font = `700 ${Math.round(sizeM * PX)}px ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = color
    g.fillText(text, 0, 0)
    g.restore()
  }
  label('DOCK', DOCK_X - 3.0, DOCK_Z, 1.1, 'rgba(255,170,90,0.85)')
  for (let a = 0; a < AISLES; a++) label(`A${a + 1}`, aisleX(a), FRONT_Z - CROSS_AISLE / 2 - 1.3, 0.9, 'rgba(200,214,240,0.55)')

  return c
}

export default function Floor() {
  const gl = useThree((s) => s.gl)
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(paintMarkings())
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
  useEffect(() => {
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    texture.needsUpdate = true
  }, [gl, texture])
  useEffect(() => () => texture.dispose(), [texture])

  const cx = (XMIN + XMAX) / 2
  const cz = (ZMIN + ZMAX) / 2

  return (
    <group>
      {/* base floor */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]}>
        <planeGeometry args={[90, 80]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.95} metalness={0} />
      </mesh>
      {/* painted markings */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.004, cz]} renderOrder={1}>
        <planeGeometry args={[XMAX - XMIN, ZMAX - ZMIN]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <Dock />
    </group>
  )
}

function Dock() {
  const tx = DOCK_X - 1.6 // bench sits beside the dock node so the picker stands next to it
  return (
    <group>
      {/* packing bench */}
      <mesh position={[tx, 0.42, DOCK_Z]}>
        <boxGeometry args={[0.8, 0.84, 1.7]} />
        <meshStandardMaterial color="#2a3346" roughness={0.8} />
      </mesh>
      <mesh position={[tx, 0.87, DOCK_Z]}>
        <boxGeometry args={[0.95, 0.06, 1.9]} />
        <meshStandardMaterial color="#5b6b88" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[tx, 1.07, DOCK_Z + 0.4]}>
        <boxGeometry args={[0.45, 0.34, 0.45]} />
        <meshStandardMaterial color={PALETTE.cardboard} roughness={0.9} />
      </mesh>
      {/* pallet with outbound stack */}
      <mesh position={[tx, 0.07, DOCK_Z - 2.0]}>
        <boxGeometry args={[1.2, 0.14, 1.0]} />
        <meshStandardMaterial color="#8a6a45" roughness={0.95} />
      </mesh>
      <mesh position={[tx, 0.5, DOCK_Z - 2.0]}>
        <boxGeometry args={[1.0, 0.72, 0.85]} />
        <meshStandardMaterial color="#b98a55" roughness={0.9} />
      </mesh>
    </group>
  )
}
