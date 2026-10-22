// The picking floor: the Floor Lab warehouse (lab/warehouse.ts: concrete floor and painted markings
// with 1-based aisle stencils and bay numbers, racks and overstock, the packing dock, walls, signs,
// overhead, light pools, contact shadows) plus one app overlay, the walkable aisle graph.
// Also owns scene.environment (the warehouse's procedural PMREM), so every lit material compiles
// once, already with its reflections, at both qualities.
// Draw calls: about 22 for the warehouse from the overview and top cameras (26 meshes; overhead and
// glows hide above 7.4 m, ceiling, LEDs and skylights above 9.2 m) + 1 for the aisle graph.
// Driven by store.quality (contact-shadow strength) and store.showHeat (rack overstock cut away, so
// every heat-tinted pick carton shows from the overview); useFrame moves the conveyor parcels.
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EDGES, NODES } from '../sim/layout'
import { useStore } from '../store'
import { buildWarehouse, createEnvironment, type EnvironmentHandle } from './lab/warehouse'

// Aisle graph overlay bounds (world metres) and resolution.
const XMIN = -10
const XMAX = 26
const ZMIN = -8
const ZMAX = 22
const PX = 40 // pixels per metre

/** The walkable aisle graph: pickers only ever move along these lines. */
function paintAisleGraph(): HTMLCanvasElement {
  const W = (XMAX - XMIN) * PX
  const H = (ZMAX - ZMIN) * PX
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return c
  const X = (x: number) => (x - XMIN) * PX
  const Z = (z: number) => (z - ZMIN) * PX

  g.clearRect(0, 0, W, H)
  // alphas sit higher than on the old dark floor so the graph still reads on the light concrete
  g.strokeStyle = 'rgba(57,208,255,0.3)'
  g.lineWidth = 0.05 * PX
  for (const [u, v] of EDGES) {
    g.beginPath()
    g.moveTo(X(NODES[u].x), Z(NODES[u].z))
    g.lineTo(X(NODES[v].x), Z(NODES[v].z))
    g.stroke()
  }
  for (const n of NODES) {
    const r = n.kind === 'bay' ? 0.08 : 0.14
    g.fillStyle = n.kind === 'bay' ? 'rgba(57,208,255,0.45)' : 'rgba(57,208,255,0.6)'
    g.beginPath()
    g.arc(X(n.x), Z(n.z), r * PX, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

export default function Floor() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const quality = useStore((s) => s.quality)
  const showHeat = useStore((s) => s.showHeat)

  // Built once; quality only changes material values, never the meshes.
  const wh = useMemo(() => buildWarehouse({ quality: useStore.getState().quality }), [])
  useEffect(() => () => wh.dispose(), [wh])
  useEffect(() => wh.setQuality(quality), [wh, quality])
  // Heat on: overstock above the pick level is cut away; off: automatic (cut only in the top view)
  useEffect(() => wh.setCutaway(showHeat ? 1 : null), [wh, showHeat])

  // Layout effect: the environment exists before the first frame compiles the lit materials.
  useLayoutEffect(() => {
    let env: EnvironmentHandle
    try {
      env = createEnvironment(gl)
    } catch (err) {
      console.warn('ghostwalk: environment map skipped', err)
      return
    }
    scene.environment = env.texture
    return () => {
      if (scene.environment === env.texture) scene.environment = null
      env.dispose()
    }
  }, [gl, scene])

  useFrame((s, dt) => wh.update(Math.min(dt, 0.1), s.clock.elapsedTime))

  const graph = useMemo(() => {
    const tex = new THREE.CanvasTexture(paintAisleGraph())
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
  useEffect(() => {
    graph.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    graph.needsUpdate = true
  }, [gl, graph])
  useEffect(() => () => graph.dispose(), [graph])

  return (
    <group>
      <primitive object={wh.group} />
      {/* above the painted markings (y 0.01, order 1), below the heat tiles (order 2) */}
      <mesh rotation-x={-Math.PI / 2} position={[(XMIN + XMAX) / 2, 0.014, (ZMIN + ZMAX) / 2]} renderOrder={1.5}>
        <planeGeometry args={[XMAX - XMIN, ZMAX - ZMIN]} />
        <meshBasicMaterial map={graph} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
