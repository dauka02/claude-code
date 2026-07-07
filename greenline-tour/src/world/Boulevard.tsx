import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  SEGMENTS,
  heightAt,
  promAt,
  rng,
  type SegModel,
} from '../data/geometry'
import { blobGeometry, blobPoints, offsetPolyline, ribbonGeometry, wallGeometry, type Pt } from './geometry'
import {
  fallbackGravel,
  fallbackGrass,
  fallbackPaving,
  fallbackStone,
  makeCourtTexture,
  makeRubberTexture,
  makeTrackTexture,
  makeWoodTexture,
  useTexOrFallback,
} from './textures'

/* ------------------------------ terrain ------------------------------ */

function Terrain({ seg }: { seg: SegModel }) {
  const grass = useTexOrFallback('grass', fallbackGrass, [seg.lengthM / 12, 18])
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const strip = new THREE.PlaneGeometry(seg.lengthM + 90, seg.halfW * 2 + 12, Math.round(seg.lengthM / 4), 30)
    strip.rotateX(-Math.PI / 2)
    strip.translate(seg.lengthM / 2, 0, 0)
    parts.push(strip)
    if (seg.branch) {
      const last = seg.branch.pts[seg.branch.pts.length - 1]
      const bLen = last.z - 25
      const b = new THREE.PlaneGeometry(90, bLen + 60, 24, Math.round(bLen / 4))
      b.rotateX(-Math.PI / 2)
      b.translate(seg.branch.pts[Math.floor(seg.branch.pts.length / 2)].x, 0, 25 + bLen / 2 + 15)
      parts.push(b)
    }
    const g = mergeGeometries(parts, false)!
    const p = g.attributes.position
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      p.setY(i, heightAt(seg, x, z))
      const t = 0.85 + 0.3 * Math.sin(x * 0.8 + z * 0.53) * Math.sin(z * 0.31)
      c.setRGB(0.95 * t, 1.0 * t, 0.9 * t)
      // ярче на лужайках
      for (const l of seg.lawns) {
        if (Math.hypot(x - l.cx, z - l.cz) < l.r) c.setRGB(0.62 * t, 1.15 * t, 0.55 * t)
      }
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [seg])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={grass} vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

/* ------------------------- streets & crossings ------------------------ */

function Streets({ seg }: { seg: SegModel }) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const mk = (w: number, l: number, x: number, z: number, y = -0.02) => {
      const g = new THREE.PlaneGeometry(w, l)
      g.rotateX(-Math.PI / 2)
      g.translate(x, y, z)
      parts.push(g)
    }
    // фланговые улицы вдоль полосы
    for (const side of [-1, 1]) {
      mk(seg.lengthM + 90, 3, seg.lengthM / 2, side * (seg.halfW + 1.5), 0) // parking lane
      mk(seg.lengthM + 90, 9, seg.lengthM / 2, side * (seg.halfW + 7.5)) // roadway
      mk(seg.lengthM + 90, 46, seg.lengthM / 2, side * (seg.halfW + 35), 0.05) // sidewalk + ground
    }
    // торцевые улицы
    for (const c of seg.crossings) {
      if (c.street) continue
      mk(16, seg.halfW * 2 + 110, c.x < seg.lengthM / 2 ? c.x - 6 : c.x + 6, 0)
    }
    // пересечение Айтеке би (s1) + фланги рукава
    if (seg.branch) {
      const cross = seg.crossings.find((c) => c.street)
      if (cross) mk(14, seg.halfW * 2 + 8, cross.x + 10, 0)
      const bPts = seg.branch.pts
      const last = bPts[bPts.length - 1]
      for (const side of [-1, 1]) {
        // упрощённо: прямые фланги вдоль рукава
        const midX = bPts[Math.floor(bPts.length / 2)].x
        mk(8, last.z - 20, midX + side * 38, (last.z + 25) / 2, -0.02)
      }
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#5a5c5e" roughness={0.95} metalness={0} />
    </mesh>
  )
}

function Crosswalks({ seg }: { seg: SegModel }) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const c of seg.crossings) {
      const at = promAt(seg, THREE.MathUtils.clamp(c.x, 0, seg.lengthM))
      for (let i = -3; i <= 3; i++) {
        const g = new THREE.PlaneGeometry(2.2, 0.9)
        g.rotateX(-Math.PI / 2)
        if (c.street) {
          g.rotateY(Math.PI / 2)
          g.translate(c.x + 10 + i * 1.8, 0.02, at.z)
        } else {
          g.translate(at.x + i * 1.8, 0.02, at.z)
          g.translate(c.x < 0 ? c.x - at.x + 2 : c.x - at.x - 2, 0, 0)
        }
        parts.push(g)
      }
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#cfd2d4" roughness={0.9} />
    </mesh>
  )
}

/* ------------------------------- paths -------------------------------- */

function yOf(seg: SegModel) {
  return (x: number, z: number) => heightAt(seg, x, z)
}

function PavedPaths({ seg }: { seg: SegModel }) {
  const paving = useTexOrFallback('paving', fallbackPaving, [1, 1])
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const p of seg.paths) {
      if (p.kind !== 'promenade' && p.kind !== 'loop' && p.kind !== 'branch') continue
      parts.push(ribbonGeometry(p.pts, p.width, yOf(seg), 5.2))
    }
    // площади
    for (const pl of seg.plazas) {
      const disc = new THREE.CircleGeometry(pl.r, 48)
      disc.rotateX(-Math.PI / 2)
      disc.translate(pl.cx, 0.028, pl.cz)
      const pos = disc.attributes.position
      const uv = disc.attributes.uv
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 5.2, pos.getZ(i) / 5.2)
      parts.push(disc)
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={paving} roughness={0.85} metalness={0.02} />
    </mesh>
  )
}

/** Кольцо с крестом на центральной площади (рисунок мощения из генплана). */
function PlazaRing({ seg }: { seg: SegModel }) {
  const ring = seg.plazas.find((p) => p.ring)
  const geo = useMemo(() => {
    if (!ring) return null
    const parts: THREE.BufferGeometry[] = []
    const mkRing = (r0: number, r1: number) => {
      const g = new THREE.RingGeometry(r0, r1, 64)
      g.rotateX(-Math.PI / 2)
      g.translate(ring.cx, 0.045, ring.cz)
      parts.push(g)
    }
    mkRing(ring.r * 0.55, ring.r * 0.62)
    mkRing(ring.r * 0.92, ring.r * 0.99)
    for (let k = 0; k < 4; k++) {
      const g = new THREE.PlaneGeometry(ring.r * 0.36, 1.4)
      g.rotateX(-Math.PI / 2)
      g.rotateY((k * Math.PI) / 2 + Math.PI / 4)
      const dx = Math.cos((k * Math.PI) / 2 + Math.PI / 4) * ring.r * 0.77
      const dz = Math.sin((k * Math.PI) / 2 + Math.PI / 4) * ring.r * 0.77
      g.translate(ring.cx + dx, 0.045, ring.cz + dz)
      parts.push(g)
    }
    return mergeGeometries(parts, false)!
  }, [ring])
  if (!geo) return null
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#8b8378" roughness={0.9} />
    </mesh>
  )
}

function Tracks({ seg }: { seg: SegModel }) {
  const bikeTex = useMemo(() => makeTrackTexture('#a5402a', 'rgba(60,20,12,0.35)'), [])
  const runTex = useMemo(() => makeTrackTexture('#d06a2f', 'rgba(120,45,15,0.35)'), [])
  const bike = useMemo(() => {
    const parts = seg.paths.filter((p) => p.kind === 'bike').map((p) => ribbonGeometry(p.pts, p.width, yOf(seg), 2, 0.026))
    return parts.length ? mergeGeometries(parts, false)! : null
  }, [seg])
  const run = useMemo(() => {
    const parts = seg.paths.filter((p) => p.kind === 'run').map((p) => ribbonGeometry(p.pts, p.width, yOf(seg), 2, 0.026))
    return parts.length ? mergeGeometries(parts, false)! : null
  }, [seg])
  return (
    <group>
      {bike && (
        <mesh geometry={bike} receiveShadow>
          <meshStandardMaterial map={bikeTex} roughness={0.95} />
        </mesh>
      )}
      {run && (
        <mesh geometry={run} receiveShadow>
          <meshStandardMaterial map={runTex} roughness={0.95} />
        </mesh>
      )}
    </group>
  )
}

/** Гравийные тропинки-связки от променада к боковым тротуарам и павильонам. */
function GravelPaths({ seg }: { seg: SegModel }) {
  const gravel = useTexOrFallback('gravel', fallbackGravel, [1, 1])
  const geo = useMemo(() => {
    const rand = rng(919 + seg.lengthM)
    const parts: THREE.BufferGeometry[] = []
    const mk = (a: Pt, b: Pt, wob = 3) => {
      const mid = { x: (a.x + b.x) / 2 + (rand() - 0.5) * wob * 2, z: (a.z + b.z) / 2 + (rand() - 0.5) * wob }
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x, 0, a.z),
        new THREE.Vector3(mid.x, 0, mid.z),
        new THREE.Vector3(b.x, 0, b.z),
      ])
      const pts = curve.getSpacedPoints(24).map((p) => ({ x: p.x, z: p.z }))
      parts.push(ribbonGeometry(pts, 1.7, yOf(seg), 3, 0.024))
    }
    // связки к боковым тротуарам
    const step = 68
    for (let m = step; m < seg.lengthM - 30; m += step) {
      const a = promAt(seg, m)
      const side = m % (step * 2) < step ? -1 : 1
      mk(a, { x: a.x + (rand() - 0.5) * 16, z: side * (seg.halfW - 1) })
    }
    // тропинки к павильонам
    for (const [px, pz] of seg.pavilions) {
      let best = seg.promenade.pts[0]
      let bd = Infinity
      for (const p of seg.promenade.pts) {
        const d = Math.hypot(p.x - px, p.z - pz)
        if (d < bd) {
          bd = d
          best = p
        }
      }
      mk(best, { x: px, z: pz }, 1.5)
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={gravel} roughness={1} metalness={0} />
    </mesh>
  )
}

/* --------------------- подпорные стены (1 очередь) --------------------- */

export function useWallSegments(seg: SegModel) {
  return useMemo(() => {
    if (seg.id !== 's1') return []
    const rand = rng(4242)
    const pts = seg.promenade.pts
    const segs: { pts: Pt[]; type: 1 | 2; side: number }[] = []
    let cursor = 6
    let count1 = 0
    const type2At = [7, 21, 36, 50]
    let unit = 0
    while (cursor < pts.length - 14 && count1 + 4 <= 52) {
      const isType2 = type2At.includes(unit) && segs.filter((s) => s.type === 2).length < 4
      const segLen = isType2 ? 17 : 5 + Math.floor(rand() * 4)
      const side = rand() > 0.5 ? 1 : -1
      const start = Math.floor(cursor)
      const end = Math.min(pts.length - 1, start + segLen)
      const center = pts.slice(start, end)
      if (center.length > 2) {
        const off = offsetPolyline(center, side * (2.8 + rand() * 0.8))
        segs.push({ pts: off, type: isType2 ? 2 : 1, side })
        if (!isType2) count1++
      }
      cursor += segLen + 2 + rand() * 3
      unit++
    }
    return segs
  }, [seg])
}

function RetainingWalls({ seg }: { seg: SegModel }) {
  const stone = useTexOrFallback('stone', fallbackStone, [1, 1])
  const segs = useWallSegments(seg)
  const geo = useMemo(() => {
    if (!segs.length) return null
    const parts = segs.map((s) =>
      wallGeometry(s.pts, s.type === 2 ? 0.55 : 0.4, s.type === 2 ? 0.6 : 0.45, yOf(seg), 2.2),
    )
    return mergeGeometries(parts, false)!
  }, [segs, seg])
  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial map={stone} roughness={0.9} metalness={0} />
    </mesh>
  )
}

/* ----------------------- мостки над дождевыми садами ------------------- */

function Boardwalk({ seg }: { seg: SegModel }) {
  const wood = useMemo(() => makeWoodTexture(), [])
  const data = useMemo(() => {
    if (!seg.swales.length) return null
    const rand = rng(77)
    const way: THREE.Vector3[] = []
    const sw = [...seg.swales].sort((a, b) => a.cx - b.cx)
    const first = sw[0]
    way.push(new THREE.Vector3(first.cx - first.rx - 6, 0, first.cz * 0.4))
    for (const s of sw) {
      way.push(new THREE.Vector3(s.cx - s.rx * 0.4, 0, s.cz + (rand() - 0.5) * 3))
      way.push(new THREE.Vector3(s.cx + s.rx * 0.5, 0, s.cz * 0.75))
    }
    const last = sw[sw.length - 1]
    way.push(new THREE.Vector3(last.cx + last.rx + 6, 0, last.cz * 0.3))
    const curve = new THREE.CatmullRomCurve3(way, false, 'catmullrom', 0.15)
    const pts = curve.getSpacedPoints(110).map((p) => ({ x: p.x, z: p.z }))
    const yDeck = (x: number, z: number) => Math.max(heightAt(seg, x, z), -0.05) + 0.32
    const deckGeo = ribbonGeometry(pts, 1.7, yDeck, 0.9, 0)
    const postParts: THREE.BufferGeometry[] = []
    for (let i = 4; i < pts.length - 4; i += 7) {
      for (const off of [-0.7, 0.7]) {
        const o = offsetPolyline(pts.slice(i, i + 2), off)[0]
        const top = yDeck(o.x, o.z)
        const g = new THREE.CylinderGeometry(0.06, 0.06, top - heightAt(seg, o.x, o.z) + 0.55, 6)
        g.translate(o.x, top - (top - heightAt(seg, o.x, o.z) + 0.55) / 2, o.z)
        postParts.push(g)
      }
    }
    return { deck: deckGeo, posts: mergeGeometries(postParts, false)! }
  }, [seg])
  if (!data) return null
  return (
    <group>
      <mesh geometry={data.deck} castShadow receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </mesh>
      <mesh geometry={data.posts} castShadow>
        <meshStandardMaterial color="#6b5236" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* -------------------- покрытия: резина, корт, площадки ------------------ */

function PlaySurfaces({ seg }: { seg: SegModel }) {
  const rubberTex = useMemo(() => makeRubberTexture(), [])
  const courtTex = useMemo(() => makeCourtTexture(), [])
  const rubberGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const blobs: { cx: number; cz: number; rx: number; rz: number; seed: number }[] = []
    if (seg.rubber) blobs.push({ cx: seg.rubber.cx, cz: seg.rubber.cz, rx: seg.rubber.rx, rz: seg.rubber.rz, seed: 3 })
    seg.playgrounds.forEach((p, i) => blobs.push({ cx: p.cx, cz: p.cz, rx: p.rx, rz: p.rz, seed: 5 + i }))
    for (const b of blobs) {
      const pts = blobPoints(b.cx, b.cz, b.rx, b.rz, 0.2, 0.2, b.seed)
      const g = blobGeometry(pts, 0, 7)
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) p.setY(i, heightAt(seg, p.getX(i), p.getZ(i)) + 0.04)
      g.computeVertexNormals()
      parts.push(g)
    }
    return parts.length ? mergeGeometries(parts, false)! : null
  }, [seg])
  return (
    <group>
      {rubberGeo && (
        <mesh geometry={rubberGeo} receiveShadow>
          <meshStandardMaterial map={rubberTex} roughness={0.95} />
        </mesh>
      )}
      {seg.court && (
        <mesh position={[seg.court.x, 0.03, seg.court.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[seg.court.w, seg.court.l]} />
          <meshStandardMaterial map={courtTex} roughness={0.92} />
        </mesh>
      )}
    </group>
  )
}

export default function Boulevard({ segId }: { segId: keyof typeof SEGMENTS }) {
  const seg = SEGMENTS[segId]
  return (
    <group>
      <Terrain seg={seg} />
      <Streets seg={seg} />
      <Crosswalks seg={seg} />
      <PavedPaths seg={seg} />
      <PlazaRing seg={seg} />
      <Tracks seg={seg} />
      <GravelPaths seg={seg} />
      <RetainingWalls seg={seg} />
      <Boardwalk seg={seg} />
      <PlaySurfaces seg={seg} />
    </group>
  )
}
