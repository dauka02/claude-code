import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SEGMENTS, heightAt, promAt, type SegId } from '../data/geometry'
import { playerPos, useTour } from '../store'
import ru from './ru.json'

export interface PointDef {
  id: string
  m: number
  offset: number
  title: string
  lines: string[]
}

export function pointsFor(segId: SegId): (PointDef & { x: number; z: number })[] {
  const seg = SEGMENTS[segId]
  return (ru.points[segId] as PointDef[]).map((p) => {
    const at = promAt(seg, p.m)
    return { ...p, x: at.x + (Math.abs(p.offset) > 1 ? 0 : 0) + 0, z: at.z + p.offset }
  })
}

/** Зелёные маяки вдоль маршрута; подход < 3,6 м открывает карточку. */
export default function InfoPoints({ segId }: { segId: SegId }) {
  const setActivePoint = useTour((s) => s.setActivePoint)
  const seg = SEGMENTS[segId]
  const points = useMemo(() => pointsFor(segId), [segId])
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
    const t = state.clock.elapsedTime
    ringMat.emissiveIntensity = 1.5 + Math.sin(t * 2.5) * 0.7
    beamMat.opacity = 0.16 + (Math.sin(t * 2.5) + 1) * 0.05
    tAcc.current += delta
    if (tAcc.current < 0.2) return
    tAcc.current = 0
    let found: string | null = null
    for (const p of points) {
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 3.6) {
        found = p.id
        break
      }
    }
    setActivePoint(found)
  })

  return (
    <group>
      {points.map((p) => {
        const y = heightAt(seg, p.x, p.z)
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
