import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, WATER_Y } from '../data/geo'
import { mkWaterNormal } from './assets'
import { resample, ribbon } from './util'

/** Ишим + озёра + SuDS-каналы: нормал-рябь, отражение неба через env. */
export default function Water() {
  const normalMap = useMemo(mkWaterNormal, [])
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    parts.push(ribbon(resample(ALM.river.points, 30), ALM.river.width, () => WATER_Y, 40, 0))
    for (const l of ALM.lakes) {
      const g = new THREE.CircleGeometry(1, 48)
      g.scale(l.rx + 6, l.rz + 6, 1)
      g.rotateX(-Math.PI / 2)
      g.translate(l.x, WATER_Y + 0.25, l.z)
      const uv = g.attributes.uv
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 30, p.getZ(i) / 30)
      parts.push(g)
    }
    for (const s of ALM.suds) parts.push(ribbon(resample(s, 14), 5, () => -0.5, 10, 0))
    return mergeGeometries(
      parts.map((g) => (g.index ? g.toNonIndexed() : g)),
      false,
    )!
  }, [])

  useFrame((_, delta) => {
    normalMap.offset.x += delta * 0.008
    normalMap.offset.y += delta * 0.011
  })

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        ref={matRef}
        color="#274a52"
        roughness={0.08}
        metalness={0.3}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.3, 0.3)}
        envMapIntensity={1.2}
        transparent
        opacity={0.94}
      />
    </mesh>
  )
}
