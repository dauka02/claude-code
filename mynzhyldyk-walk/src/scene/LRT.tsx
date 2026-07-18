import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt } from '../data/geo'
import { alongPoly, polyLength, resample, ribbon } from './util'

const DECK_Y = 9

/** Виадук вдоль ул. Ш.Калдаякова (N-S, презентация стр.18-19):
    опоры с граффити, балка, пути, велодорожка под эстакадой, состав. */
function KaldayakovaViaduct() {
  const road = ALM.roads.find((r) => r.id === 'city_shamshi')!
  const pts = useMemo(() => resample(road.points, 20), [road])

  const graffiti = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 128
    cv.height = 192
    const c = cv.getContext('2d')!
    c.fillStyle = '#b9b4a8'
    c.fillRect(0, 0, 128, 192)
    let s = 99
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const cols = ['#c94f8a', '#3f8fc4', '#e8a428', '#4aa06a', '#8a5fc4', '#e05a3a']
    for (let i = 0; i < 26; i++) {
      c.fillStyle = cols[Math.floor(rnd() * cols.length)]
      c.globalAlpha = 0.75
      c.beginPath()
      c.ellipse(rnd() * 128, 40 + rnd() * 150, 8 + rnd() * 22, 6 + rnd() * 14, rnd() * 3, 0, 6.28)
      c.fill()
    }
    c.globalAlpha = 1
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  const piers = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const len = polyLength(road.points)
    for (let d = 16; d < len - 10; d += 30) {
      const { x, z, dx, dz } = alongPoly(road.points, d)
      const h = DECK_Y + 2 - heightAt(x, z)
      const col = new THREE.BoxGeometry(1.7, h, 1.2)
      col.rotateY(-Math.atan2(dz, dx))
      col.translate(x, heightAt(x, z) + h / 2, z)
      parts.push(col.toNonIndexed())
      const cap = new THREE.BoxGeometry(6.8, 0.8, 1.6)
      cap.rotateY(-Math.atan2(dz, dx) + Math.PI / 2)
      cap.translate(x, DECK_Y + 1.4, z)
      parts.push(cap.toNonIndexed())
    }
    return mergeGeometries(parts, false)!
  }, [road])

  const deck = useMemo(() => {
    const g = ribbon(pts, 7.2, () => DECK_Y + 2, 10, 0)
    const g2 = ribbon(pts, 7.8, () => DECK_Y + 0.9, 10, 0)
    const parts = [g, g2]
    for (const o of [-1.6, 1.6]) {
      const rp = pts.map(([x, z], i) => {
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const ddx = b[0] - a[0]
        const ddz = b[1] - a[1]
        const l = Math.hypot(ddx, ddz) || 1
        return [x + (-ddz / l) * o, z + (ddx / l) * o] as [number, number]
      })
      parts.push(ribbon(rp, 0.14, () => DECK_Y + 2.12, 4, 0))
    }
    return mergeGeometries(parts.map((r) => (r.index ? r.toNonIndexed() : r)), false)!
  }, [pts])

  // велодорожка под эстакадой
  const bike = useMemo(() => {
    const rp = pts.map(([x, z], i) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const ddx = b[0] - a[0]
      const ddz = b[1] - a[1]
      const l = Math.hypot(ddx, ddz) || 1
      return [x + (-ddz / l) * 8.4, z + (ddx / l) * 8.4] as [number, number]
    })
    return ribbon(rp, 2.6, (x, z) => heightAt(x, z), 5, 0.08)
  }, [pts])

  // граффити-плоскости на каждой третьей опоре
  const murals = useMemo(() => {
    const res: { x: number; z: number; rot: number }[] = []
    const len = polyLength(road.points)
    let k = 0
    for (let d = 16; d < len - 10; d += 30) {
      if (k++ % 3) continue
      const { x, z, dx, dz } = alongPoly(road.points, d)
      res.push({ x, z, rot: -Math.atan2(dz, dx) })
    }
    return res
  }, [road])

  // состав на эстакаде
  const train = useMemo(() => {
    const p = alongPoly(road.points, polyLength(road.points) * 0.42)
    return { x: p.x, z: p.z, rot: -Math.atan2(p.dz, p.dx) }
  }, [road])

  return (
    <group>
      <mesh geometry={piers} castShadow receiveShadow>
        <meshStandardMaterial color="#b9b4a8" roughness={0.85} />
      </mesh>
      <mesh geometry={deck} castShadow>
        <meshStandardMaterial color="#9a958a" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh geometry={bike} receiveShadow>
        <meshStandardMaterial color="#9e3f2e" roughness={0.95} />
      </mesh>
      {murals.map((mu, i) => (
        <mesh key={i} position={[mu.x, heightAt(mu.x, mu.z) + 3.2, mu.z]} rotation={[0, mu.rot, 0]}>
          <planeGeometry args={[1.75, 6]} />
          <meshStandardMaterial map={graffiti} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <group position={[train.x, DECK_Y + 3.1, train.z]} rotation={[0, train.rot, 0]}>
        {[-13, 0, 13].map((o) => (
          <mesh key={o} position={[o, 0, 0]} castShadow>
            <boxGeometry args={[12.4, 2.6, 2.5]} />
            <meshStandardMaterial color="#e8eaec" roughness={0.35} metalness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, -0.6, 0]}>
          <boxGeometry args={[38.6, 0.5, 2.6]} />
          <meshStandardMaterial color="#2f6ea6" roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

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
      <KaldayakovaViaduct />
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
