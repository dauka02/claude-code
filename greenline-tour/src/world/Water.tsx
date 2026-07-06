import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PONDS, SWALES, WATER_LEVEL } from './constants'
import { blobGeometry, blobPoints } from './geometry'
import { makeWaterNormalTexture } from './textures'
import { useTour } from '../store'

/**
 * Ponds (zone 220–360 m) + shallow rain-water channels in the swales.
 * Reflection comes from scene.environment (sky PMREM), ripples from a
 * scrolling procedural normal map.
 */
export default function Water() {
  const night = useTour((s) => s.night)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const normalMap = useMemo(makeWaterNormalTexture, [])

  const geo = useMemo(() => {
    const parts = PONDS.map((p, i) =>
      blobGeometry(blobPoints(p.x, p.z, p.rx, p.rz, p.rot, 0.14, i + 2, 56), WATER_LEVEL, 6),
    )
    // shallow water in two of the swales
    for (const s of [SWALES[1], SWALES[3]]) {
      parts.push(
        blobGeometry(blobPoints(s.x, s.z, s.rx * 0.55, s.rz * 0.55, s.rot, 0.2, 9), -0.42, 4),
      )
    }
    return mergeGeometries(parts, false)!
  }, [])

  useFrame((state, delta) => {
    normalMap.offset.x += delta * 0.012
    normalMap.offset.y += delta * 0.017
    const m = matRef.current
    if (!m) return
    const targetColor = night ? 0x0a1420 : 0x1e3a40
    m.color.lerp(new THREE.Color(targetColor), Math.min(1, delta * 2))
    m.envMapIntensity = THREE.MathUtils.lerp(m.envMapIntensity, night ? 0.35 : 1.15, Math.min(1, delta * 2))
    void state
  })

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        color="#1e3a40"
        roughness={0.08}
        metalness={0.35}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.35, 0.35)}
        envMapIntensity={1.15}
        transparent
        opacity={0.94}
      />
    </mesh>
  )
}
