import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt } from '../data/geo'
import { mkAsphalt, mkConcretePath, mkRedBike, fbGranite, useTexOr } from './assets'
import { resample, ribbon } from './util'

const yOf = (x: number, z: number) => heightAt(x, z)

/** Дорожная сеть из alm.json: улицы, тротуары, разметка, дорожки аллеи. */
export default function Roads() {
  const asphalt = useMemo(() => mkAsphalt(), [])
  const walkTex = useMemo(mkConcretePath, [])
  const bikeTex = useMemo(mkRedBike, [])
  const granite = useTexOr('granite', fbGranite, [1, 1])

  const data = useMemo(() => {
    const road: THREE.BufferGeometry[] = []
    const side: THREE.BufferGeometry[] = []
    const marks: THREE.BufferGeometry[] = []
    for (const r of ALM.roads) {
      const pts = resample(r.points, 22)
      road.push(ribbon(pts, r.width, yOf, 8, 0.05))
      // тротуары
      const off = r.width / 2 + 2.6
      const shift = (o: number) =>
        pts.map(([x, z], i) => {
          const a = pts[Math.max(0, i - 1)]
          const b = pts[Math.min(pts.length - 1, i + 1)]
          const dx = b[0] - a[0]
          const dz = b[1] - a[1]
          const l = Math.hypot(dx, dz) || 1
          return [x - (-dz / l) * o * -1, z - (dx / l) * o] as [number, number]
        })
      // корректный перпендикуляр
      const shiftP = (o: number) =>
        pts.map(([x, z], i) => {
          const a = pts[Math.max(0, i - 1)]
          const b = pts[Math.min(pts.length - 1, i + 1)]
          const dx = b[0] - a[0]
          const dz = b[1] - a[1]
          const l = Math.hypot(dx, dz) || 1
          return [x + (-dz / l) * o, z + (dx / l) * o] as [number, number]
        })
      void shift
      side.push(ribbon(shiftP(off), 4, yOf, 4, 0.06))
      side.push(ribbon(shiftP(-off), 4, yOf, 4, 0.06))
      // осевая пунктирная разметка
      for (let i = 0; i < pts.length - 1; i += 2) {
        const [x0, z0] = pts[i]
        const [x1, z1] = pts[i + 1]
        const g = new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0) * 0.55, 0.22)
        g.rotateX(-Math.PI / 2)
        g.rotateY(-Math.atan2(z1 - z0, x1 - x0))
        g.translate((x0 + x1) / 2, yOf((x0 + x1) / 2, (z0 + z1) / 2) + 0.09, (z0 + z1) / 2)
        marks.push(g)
      }
    }
    return {
      road: mergeGeometries(road, false)!,
      side: mergeGeometries(side, false)!,
      marks: mergeGeometries(marks, false)!,
    }
  }, [])

  const alley = useMemo(() => {
    const walk = ribbon(resample(ALM.alley.walk, 14), 4.5, yOf, 5, 0.07)
    const bike = ribbon(resample(ALM.alley.bike, 14), 3, yOf, 4, 0.06)
    const run = ribbon(resample(ALM.alley.run, 14), 2.4, yOf, 4, 0.06)
    return { walk, bike, run }
  }, [])

  return (
    <group>
      <mesh geometry={data.road} receiveShadow>
        <meshStandardMaterial map={asphalt} roughness={0.95} />
      </mesh>
      <mesh geometry={data.side} receiveShadow>
        <meshStandardMaterial map={granite} roughness={0.9} color="#d8d4c9" />
      </mesh>
      <mesh geometry={data.marks}>
        <meshStandardMaterial color="#cfd2cd" roughness={0.8} />
      </mesh>
      <mesh geometry={alley.walk} receiveShadow>
        <meshStandardMaterial map={walkTex} roughness={0.92} />
      </mesh>
      <mesh geometry={alley.bike} receiveShadow>
        <meshStandardMaterial map={bikeTex} roughness={0.95} />
      </mesh>
      <mesh geometry={alley.run} receiveShadow>
        <meshStandardMaterial color="#c96f35" roughness={0.97} />
      </mesh>
    </group>
  )
}
