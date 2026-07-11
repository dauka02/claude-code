import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt } from '../data/geo'
import { alongPoly, polyLength, resample, ribbon } from './util'

const DECK_Y = 9

/** LRT-эстакада вдоль оси: опоры, коробчатая балка, пути, станции. */
export default function LRT() {
  const pts = useMemo(() => resample(ALM.lrt.points, 18), [])

  const piers = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const path = ALM.lrt.points
    const len = polyLength(path)
    for (let d = 14; d < len - 10; d += 27) {
      const { x, z } = alongPoly(path, d)
      const h = DECK_Y - heightAt(x, z)
      const col = new THREE.CylinderGeometry(0.85, 1.05, h, 10)
      col.translate(x, heightAt(x, z) + h / 2, z)
      parts.push(col)
      const cap = new THREE.BoxGeometry(6.4, 0.8, 1.6)
      cap.rotateY(-Math.atan2(alongPoly(path, d).dz, alongPoly(path, d).dx) + Math.PI / 2)
      cap.translate(x, DECK_Y - 0.6, z)
      parts.push(cap)
    }
    return mergeGeometries(parts, false)!
  }, [])

  const deck = useMemo(() => {
    const g = ribbon(pts, 7.6, () => DECK_Y, 10, 0)
    const g2 = ribbon(pts, 8.2, () => DECK_Y - 1.1, 10, 0)
    const rails: THREE.BufferGeometry[] = [g, g2]
    for (const o of [-2.1, -1.1, 1.1, 2.1]) {
      const rp = pts.map(([x, z], i) => {
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const dx = b[0] - a[0]
        const dz = b[1] - a[1]
        const l = Math.hypot(dx, dz) || 1
        return [x + (-dz / l) * o, z + (dx / l) * o] as [number, number]
      })
      rails.push(ribbon(rp, 0.14, () => DECK_Y + 0.1, 4, 0))
    }
    // бортики
    for (const o of [-3.6, 3.6]) {
      const rp = pts.map(([x, z], i) => {
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const dx = b[0] - a[0]
        const dz = b[1] - a[1]
        const l = Math.hypot(dx, dz) || 1
        return [x + (-dz / l) * o, z + (dx / l) * o] as [number, number]
      })
      const wall = ribbon(rp, 0.25, () => DECK_Y + 0.55, 4, 0)
      rails.push(wall)
    }
    return mergeGeometries(rails.map((r) => (r.index ? r.toNonIndexed() : r)), false)!
  }, [pts])

  const stations = useMemo(() => {
    const path = ALM.lrt.points
    const res: { x: number; z: number; rot: number }[] = []
    for (const m of ALM.lrt.stopsAtM) {
      const total = polyLength(path)
      const d = Math.min((m / ALM.lrt.stationAtM) * total, total - 30)
      const p = alongPoly(path, d)
      res.push({ x: p.x, z: p.z, rot: -Math.atan2(p.dz, p.dx) })
    }
    return res
  }, [])

  return (
    <group>
      <mesh geometry={piers} castShadow receiveShadow>
        <meshStandardMaterial color="#b9b4a8" roughness={0.85} />
      </mesh>
      <mesh geometry={deck} castShadow>
        <meshStandardMaterial color="#9a958a" roughness={0.7} metalness={0.15} />
      </mesh>
      {stations.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
          <mesh position={[0, DECK_Y + 2.6, 0]} castShadow>
            <boxGeometry args={[38, 4.6, 11]} />
            <meshPhysicalMaterial color="#cfe0e4" roughness={0.15} metalness={0.2} transparent opacity={0.55} />
          </mesh>
          <mesh position={[0, DECK_Y + 5.1, 0]} castShadow>
            <boxGeometry args={[42, 0.5, 13]} />
            <meshStandardMaterial color="#3f444a" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* лестничный объём */}
          <mesh position={[12, DECK_Y / 2, 8.5]} castShadow>
            <boxGeometry args={[6, DECK_Y, 4]} />
            <meshStandardMaterial color="#b8b2a6" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
