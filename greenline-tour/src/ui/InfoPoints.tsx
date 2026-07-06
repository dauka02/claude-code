import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { heightAt, pathXAt } from '../world/constants'
import { playerPos, useTour } from '../store'
import ru from './ru.json'

export interface PointDef {
  id: string
  z: number
  offset: number
  title: string
  lines: string[]
  x?: number
}

export const POINTS: (PointDef & { x: number })[] = (ru.points as PointDef[]).map((p) => ({
  ...p,
  x: pathXAt(p.z) + p.offset,
}))

/** Glowing green beacons along the route; nearing one opens its card. */
export default function InfoPoints() {
  const setActivePoint = useTour((s) => s.setActivePoint)
  const groupRef = useRef<THREE.Group>(null!)
  const tAcc = useRef(0)

  const ringGeo = useMemo(() => new THREE.TorusGeometry(0.55, 0.05, 8, 32), [])
  const beamGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.16, 0.26, 2.6, 10, 1, true)
    g.translate(0, 1.4, 0)
    return g
  }, [])
  const ringMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4CAF50',
        emissive: '#4CAF50',
        emissiveIntensity: 1.8,
        roughness: 0.4,
      }),
    [],
  )
  const beamMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#6fdc74',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useFrame((state, delta) => {
    // pulse
    const t = state.clock.elapsedTime
    ringMat.emissiveIntensity = 1.5 + Math.sin(t * 2.5) * 0.7
    beamMat.opacity = 0.16 + (Math.sin(t * 2.5) + 1) * 0.05
    if (groupRef.current) groupRef.current.rotation.y = 0 // keep static

    // proximity check ~5×/sec
    tAcc.current += delta
    if (tAcc.current < 0.2) return
    tAcc.current = 0
    let found: string | null = null
    for (const p of POINTS) {
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 3.6) {
        found = p.id
        break
      }
    }
    setActivePoint(found)
  })

  return (
    <group ref={groupRef}>
      {POINTS.map((p) => {
        const y = heightAt(p.x, p.z)
        return (
          <group key={p.id} position={[p.x, y + 0.06, p.z]}>
            <mesh geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} />
            <mesh geometry={beamGeo} material={beamMat} />
          </group>
        )
      })}
    </group>
  )
}
