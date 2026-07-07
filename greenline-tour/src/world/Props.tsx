import * as THREE from 'three'
import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  SEGMENTS,
  WATER_LEVEL,
  heightAt,
  promAt,
  rng,
  type SegModel,
} from '../data/geometry'
import { offsetPolyline, wallGeometry, type Pt } from './geometry'
import { useWallSegments } from './Boulevard'
import {
  makeChainlinkTexture,
  makeGlowTexture,
  makeStelaTexture,
  makeWoodTexture,
} from './textures'
import { useTour } from '../store'
import Stage2Props from './PropsStage2'

export const MODELS = {
  kulan: '/assets/models/kulan.glb',
  stela: '/assets/models/stela.glb',
  bench: '/assets/models/bench_angular.glb',
  lamp: '/assets/models/lamp.glb',
  pergola: '/assets/models/pergola.glb',
  tunnel: '/assets/models/tunnel_portal.glb',
  stela2: '/assets/models/stela_greenline.glb',
} as const

/* ---------------- GLB c процедурным фолбэком ---------------- */

class GLBBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    /* ассет не скачан — остаётся процедурный фолбэк */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function ScaledGLB({
  url,
  height,
  position,
  rotationY = 0,
}: {
  url: string
  height: number
  position: [number, number, number]
  rotationY?: number
}) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = height / (size.y || 1)
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y -= box2.min.y
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    const wrap = new THREE.Group()
    wrap.add(c)
    return wrap
  }, [scene, height])
  return <primitive object={obj} position={position} rotation={[0, rotationY, 0]} />
}

export function Hero({
  url,
  height,
  position,
  rotationY = 0,
  fallback,
}: {
  url: string
  height: number
  position: [number, number, number]
  rotationY?: number
  fallback: React.ReactNode
}) {
  return (
    <GLBBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ScaledGLB url={url} height={height} position={position} rotationY={rotationY} />
      </Suspense>
    </GLBBoundary>
  )
}

/* ---------------- фонари 8,5 м / 4 плафона / 3000K ---------------- */

const HEAD_OFFSETS: [number, number, number][] = [
  [0.32, 7.55, 0],
  [-0.3, 7.85, 0.1],
  [0.1, 8.15, -0.3],
  [-0.08, 8.32, 0.28],
]

const lampCache = new Map<string, { x: number; z: number; y: number }[]>()
export function lampPositions(seg: SegModel) {
  const c = lampCache.get(seg.id)
  if (c) return c
  const res: { x: number; z: number; y: number }[] = []
  const put = (pts: Pt[], step: number) => {
    for (let i = 4; i < pts.length - 4; i += step) {
      const side = (i / step) % 2 === 0 ? 1 : -1
      const [o] = offsetPolyline(pts.slice(i, i + 2), side * 3.1)
      res.push({ x: o.x, z: o.z, y: heightAt(seg, o.x, o.z) })
    }
  }
  put(seg.promenade.pts, 13)
  if (seg.branch) put(seg.branch.pts, 15)
  lampCache.set(seg.id, res)
  return res
}

function lampBodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const pole = new THREE.CylinderGeometry(0.038, 0.06, 7.7, 8)
  pole.translate(0, 0.8 + 3.85, 0)
  parts.push(pole)
  const base = new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8)
  base.translate(0, 0.4, 0)
  parts.push(base)
  for (const [hx, hy, hz] of HEAD_OFFSETS) {
    const arm = new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(hx, hz) + 0.12, 5)
    arm.rotateZ(Math.PI / 2)
    arm.rotateY(Math.atan2(hz, hx) === 0 ? 0 : -Math.atan2(hz, hx))
    arm.translate(hx / 2, hy, hz / 2)
    parts.push(arm)
  }
  return mergeGeometries(parts, false)!
}

function lampHeadsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const [hx, hy, hz] of HEAD_OFFSETS) {
    const g = new THREE.CylinderGeometry(0.085, 0.1, 0.26, 8)
    g.translate(hx, hy, hz)
    parts.push(g)
  }
  return mergeGeometries(parts, false)!
}

export function Lamps({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const positions = useMemo(() => lampPositions(seg), [seg])
  const bodyRef = useRef<THREE.InstancedMesh>(null!)
  const headsRef = useRef<THREE.InstancedMesh>(null!)
  const headsMat = useRef<THREE.MeshStandardMaterial>(null!)
  const glowMat = useRef<THREE.PointsMaterial>(null!)

  const bodyGeo = useMemo(lampBodyGeometry, [])
  const headsGeo = useMemo(lampHeadsGeometry, [])
  const glowTex = useMemo(makeGlowTexture, [])

  const glowGeo = useMemo(() => {
    const pos: number[] = []
    for (const l of positions) for (const [hx, hy, hz] of HEAD_OFFSETS) pos.push(l.x + hx, l.y + hy, l.z + hz)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [positions])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    positions.forEach((l, i) => {
      q.setFromAxisAngle(up, (i * 977) % 6.28)
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(1, 1, 1))
      bodyRef.current.setMatrixAt(i, m)
      headsRef.current.setMatrixAt(i, m)
    })
    bodyRef.current.instanceMatrix.needsUpdate = true
    headsRef.current.instanceMatrix.needsUpdate = true
  }, [positions])

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 2)
    if (headsMat.current)
      headsMat.current.emissiveIntensity = THREE.MathUtils.lerp(headsMat.current.emissiveIntensity, night ? 3.2 : 0.0, k)
    if (glowMat.current) glowMat.current.opacity = THREE.MathUtils.lerp(glowMat.current.opacity, night ? 0.55 : 0, k)
  })

  const heroSpot = promAt(seg, seg.lengthM - 14)

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, positions.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#8a6a44" roughness={0.6} metalness={0.35} />
      </instancedMesh>
      <instancedMesh ref={headsRef} args={[headsGeo, undefined, positions.length]} frustumCulled={false}>
        <meshStandardMaterial ref={headsMat} color="#d8d4c8" emissive="#ffbe78" emissiveIntensity={0} roughness={0.4} />
      </instancedMesh>
      <points geometry={glowGeo} frustumCulled={false}>
        <pointsMaterial
          ref={glowMat}
          map={glowTex}
          size={1.4}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <Hero
        url={MODELS.lamp}
        height={8.5}
        position={[heroSpot.x + 4, heightAt(seg, heroSpot.x + 4, heroSpot.z), heroSpot.z]}
        fallback={null}
      />
    </group>
  )
}

/* ---------------- скамьи и урны ---------------- */

function classicBenchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.BoxGeometry(1.8, 0.05, 0.09)
    slat.translate(0, 0.46, -0.22 + i * 0.11)
    parts.push(slat)
  }
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.BoxGeometry(1.8, 0.05, 0.09)
    slat.rotateX(-0.35)
    slat.translate(0, 0.62 + i * 0.13, 0.3 + i * 0.045)
    parts.push(slat)
  }
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.BoxGeometry(0.06, 0.46, 0.5)
    leg.translate(sx, 0.23, 0)
    parts.push(leg)
    const back = new THREE.BoxGeometry(0.06, 0.55, 0.08)
    back.rotateX(-0.35)
    back.translate(sx, 0.7, 0.33)
    parts.push(back)
  }
  return mergeGeometries(parts, false)!
}

export function angularBenchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const seat = new THREE.BoxGeometry(1.9, 0.07, 0.55)
  seat.translate(0, 0.06, 0.1)
  parts.push(seat)
  const back = new THREE.BoxGeometry(1.9, 0.07, 0.75)
  back.rotateX(Math.PI / 2 - 0.9)
  back.translate(0, 0.32, -0.33)
  parts.push(back)
  for (const sx of [-0.7, 0.7]) {
    const arm = new THREE.BoxGeometry(0.05, 0.02, 0.4)
    arm.translate(sx, 0.26, 0.05)
    parts.push(arm)
  }
  return mergeGeometries(parts, false)!
}

function urnGeo() {
  const g = new THREE.CylinderGeometry(0.22, 0.18, 0.6, 10)
  g.translate(0, 0.3, 0)
  return g
}

export function Benches({ seg }: { seg: SegModel }) {
  const wood = useMemo(makeWoodTexture, [])
  const walls = useWallSegments(seg)
  const classicGeo = useMemo(classicBenchGeometry, [])
  const angularGeo = useMemo(angularBenchGeometry, [])
  const classicRef = useRef<THREE.InstancedMesh>(null!)
  const angularRef = useRef<THREE.InstancedMesh>(null!)
  const urnRef = useRef<THREE.InstancedMesh>(null!)

  const classicSpots = useMemo(() => {
    const res: { p: Pt; rot: number }[] = []
    const pts = seg.promenade.pts
    const step = Math.floor(pts.length / (seg.lengthM / 38))
    for (let i = step; i < pts.length - step; i += step) {
      const side = i % 2 === 0 ? 1 : -1
      const [o] = offsetPolyline(pts.slice(i, i + 2), side * 2.9)
      // не ставим скамьи в изгородь лужайки, на площадки и в бассейны
      if (seg.lawns.some((l) => Math.hypot(o.x - l.cx, o.z - l.cz) < l.r + 4.5)) continue
      if (seg.smallPool && Math.hypot(o.x - seg.smallPool.cx, o.z - seg.smallPool.cz) < seg.smallPool.r + 3) continue
      const dir = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
      res.push({ p: o, rot: dir + (side > 0 ? Math.PI : 0) })
    }
    return res
  }, [seg])

  const angularSpots = useMemo(() => {
    const res: { p: Pt; rot: number; onWall: boolean }[] = []
    walls.forEach((s, i) => {
      if (s.type === 2 || i % 3 !== 0) return
      const mid = Math.floor(s.pts.length / 2)
      const a = s.pts[Math.max(0, mid - 1)]
      const b = s.pts[Math.min(s.pts.length - 1, mid + 1)]
      const dir = Math.atan2(b.x - a.x, b.z - a.z)
      res.push({ p: s.pts[mid], rot: dir + Math.PI / 2 + (s.side > 0 ? Math.PI : 0), onWall: true })
    })
    // эко-скамьи на гравии (2 очередь)
    if (seg.id !== 's1') {
      const rand = rng(515)
      const pts = seg.promenade.pts
      for (let i = 20; i < pts.length - 20; i += 46) {
        const side = rand() > 0.5 ? 1 : -1
        const [o] = offsetPolyline(pts.slice(i, i + 2), side * (5 + rand() * 3))
        const dir = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
        res.push({ p: o, rot: dir + (side > 0 ? Math.PI : 0), onWall: false })
      }
    }
    return res
  }, [walls, seg])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    classicSpots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(new THREE.Vector3(s.p.x, heightAt(seg, s.p.x, s.p.z), s.p.z), q, new THREE.Vector3(1, 1, 1))
      classicRef.current.setMatrixAt(i, m)
      const ux = s.p.x + Math.cos(s.rot) * 1.3
      const uz = s.p.z - Math.sin(s.rot) * 1.3
      m.compose(new THREE.Vector3(ux, heightAt(seg, ux, uz), uz), q, new THREE.Vector3(1, 1, 1))
      urnRef.current.setMatrixAt(i, m)
    })
    classicRef.current.instanceMatrix.needsUpdate = true
    urnRef.current.instanceMatrix.needsUpdate = true
    angularSpots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(
        new THREE.Vector3(s.p.x, heightAt(seg, s.p.x, s.p.z) + (s.onWall ? 0.42 : 0.05), s.p.z),
        q,
        new THREE.Vector3(1, 1, 1),
      )
      angularRef.current.setMatrixAt(i, m)
    })
    angularRef.current.instanceMatrix.needsUpdate = true
  }, [classicSpots, angularSpots, seg])

  const heroSpot = promAt(seg, 52)

  return (
    <group>
      <instancedMesh ref={classicRef} args={[classicGeo, undefined, classicSpots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={urnRef} args={[urnGeo(), undefined, classicSpots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#26282a" roughness={0.7} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={angularRef} args={[angularGeo, undefined, Math.max(1, angularSpots.length)]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.75} />
      </instancedMesh>
      <Hero
        url={MODELS.bench}
        height={0.85}
        position={[heroSpot.x - 3.4, heightAt(seg, heroSpot.x - 3.4, heroSpot.z), heroSpot.z]}
        rotationY={0.9}
        fallback={null}
      />
    </group>
  )
}

/* ---------------- стела THE GREEN LINE (1 очередь) ---------------- */

export function Stela({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const mapTex = useMemo(makeStelaTexture, [])
  const screenMat = useRef<THREE.MeshStandardMaterial>(null!)
  const spot = promAt(seg, seg.lengthM - 10)
  const x = spot.x - 4.5
  const z = spot.z + 1
  const y = heightAt(seg, x, z)
  useFrame((_, delta) => {
    if (screenMat.current)
      screenMat.current.emissiveIntensity = THREE.MathUtils.lerp(
        screenMat.current.emissiveIntensity,
        night ? 1.6 : 0.55,
        Math.min(1, delta * 2),
      )
  })
  if (seg.id !== 's1') return null
  const fallback = (
    <group position={[x, y, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.62, 2.6, 0.3]} />
        <meshStandardMaterial color="#22262b" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.32, 0.16]}>
        <planeGeometry args={[0.54, 2.3]} />
        <meshStandardMaterial ref={screenMat} map={mapTex} emissive="#cfe8d2" emissiveMap={mapTex} emissiveIntensity={0.55} roughness={0.4} />
      </mesh>
    </group>
  )
  return (
    <group>
      <Hero url={MODELS.stela} height={2.6} position={[x, y, z]} rotationY={0.5} fallback={fallback} />
      {/* вторая стела у западного входа */}
      <Hero
        url={MODELS.stela}
        height={2.6}
        position={[promAt(seg, 10).x + 4, heightAt(seg, promAt(seg, 10).x + 4, promAt(seg, 10).z), promAt(seg, 10).z]}
        rotationY={-2.2}
        fallback={null}
      />
    </group>
  )
}

/* ---------------- кулан и игровые элементы (1 очередь) ---------------- */

function kulanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const slat = 0.16
  for (let i = 0; i < 11; i++) {
    const y = 2.3 + i * slat
    const t = (i / 10) * Math.PI
    const w = 1.15 * (0.55 + 0.45 * Math.sin(t))
    const l = 3.4 * (0.62 + 0.38 * Math.sin(t))
    const g = new THREE.BoxGeometry(w, slat * 0.82, l)
    g.translate(0, y, -0.2)
    parts.push(g)
  }
  for (let i = 0; i < 12; i++) {
    const y = 3.5 + i * slat
    const k = i / 11
    const g = new THREE.BoxGeometry(0.75 - k * 0.25, slat * 0.82, 1.15 - k * 0.35)
    g.translate(0, y, 1.35 + k * 0.9)
    parts.push(g)
  }
  for (let i = 0; i < 5; i++) {
    const y = 5.42 + i * slat * 0.9
    const g = new THREE.BoxGeometry(0.5, slat * 0.75, 1.15 - i * 0.12)
    g.translate(0, y, 2.65 + i * 0.1)
    parts.push(g)
  }
  for (const sx of [-0.14, 0.14]) {
    const ear = new THREE.BoxGeometry(0.1, 0.42, 0.16)
    ear.translate(sx, 6.25, 2.4)
    parts.push(ear)
  }
  for (const [lx, lz] of [
    [-0.42, -1.5],
    [0.42, -1.5],
    [-0.42, 0.9],
    [0.42, 0.9],
  ]) {
    const leg = new THREE.BoxGeometry(0.3, 2.3, 0.42)
    leg.translate(lx, 1.15, lz)
    parts.push(leg)
  }
  const slide = new THREE.BoxGeometry(0.8, 0.08, 3.6)
  slide.rotateX(-0.62)
  slide.translate(1.05, 1.55, -1.2)
  parts.push(slide)
  for (const off of [-0.42, 0.42]) {
    const rail = new THREE.BoxGeometry(0.06, 0.16, 3.6)
    rail.rotateX(-0.62)
    rail.translate(1.05 + off, 1.68, -1.2)
    parts.push(rail)
  }
  return mergeGeometries(parts, false)!
}

export function Kulan({ seg }: { seg: SegModel }) {
  const wood = useMemo(makeWoodTexture, [])
  const geo = useMemo(kulanGeometry, [])
  if (!seg.kulan) return null
  const { x, z } = seg.kulan
  const y = heightAt(seg, x, z)
  const fallback = (
    <mesh geometry={geo} position={[x, y, z]} rotation={[0, -0.7, 0]} castShadow receiveShadow>
      <meshStandardMaterial map={wood} roughness={0.8} />
    </mesh>
  )
  return <Hero url={MODELS.kulan} height={6} position={[x, y, z]} rotationY={-0.7} fallback={fallback} />
}

/** Зелёные «кактусы» + деревянное игровое оборудование на площадках. */
export function PlayProps({ seg }: { seg: SegModel }) {
  const wood = useMemo(makeWoodTexture, [])
  const poleRef = useRef<THREE.InstancedMesh>(null!)
  const data = useMemo(() => {
    const rand = rng(6161)
    const poles: { x: number; z: number; h: number; r: number }[] = []
    const frames: { x: number; z: number; rot: number; s: number }[] = []
    const areas: { cx: number; cz: number; rx: number; rz: number }[] = []
    if (seg.rubber) areas.push(seg.rubber)
    areas.push(...seg.playgrounds)
    for (const a of areas) {
      for (let i = 0; i < 6; i++) {
        const ang = rand() * Math.PI * 2
        poles.push({
          x: a.cx + Math.cos(ang) * a.rx * rand() * 0.7,
          z: a.cz + Math.sin(ang) * a.rz * rand() * 0.7,
          h: 0.9 + rand() * 1.8,
          r: 0.12 + rand() * 0.1,
        })
      }
      for (let i = 0; i < 3; i++) {
        frames.push({
          x: a.cx + (rand() - 0.5) * a.rx,
          z: a.cz + (rand() - 0.5) * a.rz,
          rot: rand() * Math.PI,
          s: 0.8 + rand() * 0.5,
        })
      }
    }
    return { poles, frames }
  }, [seg])

  const poleGeo = useMemo(() => new THREE.CapsuleGeometry(1, 1, 3, 8), [])
  const frameGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    // деревянная рама-лазалка (как на рендерах детских площадок)
    for (const [x0, z0, x1, z1] of [
      [-1.2, 0, 1.2, 0],
      [0, -1, 0, 1],
    ]) {
      const beam = new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0) || 0.14, 0.14, 0.14)
      beam.rotateY(Math.atan2(z1 - z0, x1 - x0))
      beam.translate((x0 + x1) / 2, 1.35, (z0 + z1) / 2)
      parts.push(beam)
    }
    for (const [px, pz] of [
      [-1.2, 0],
      [1.2, 0],
      [0, -1],
      [0, 1],
    ]) {
      const post = new THREE.BoxGeometry(0.12, 1.4, 0.12)
      post.translate(px, 0.7, pz)
      parts.push(post)
    }
    const bar = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6)
    bar.rotateZ(Math.PI / 2)
    bar.translate(0, 1.05, 0.5)
    parts.push(bar)
    return mergeGeometries(parts, false)!
  }, [])
  const frameRef = useRef<THREE.InstancedMesh>(null!)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    data.poles.forEach((p, i) => {
      m.makeScale(p.r, p.h / 2, p.r)
      m.setPosition(p.x, heightAt(seg, p.x, p.z) + p.h / 2, p.z)
      poleRef.current.setMatrixAt(i, m)
    })
    poleRef.current.instanceMatrix.needsUpdate = true
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    data.frames.forEach((f, i) => {
      q.setFromAxisAngle(up, f.rot)
      m.compose(new THREE.Vector3(f.x, heightAt(seg, f.x, f.z), f.z), q, new THREE.Vector3(f.s, f.s, f.s))
      frameRef.current.setMatrixAt(i, m)
    })
    frameRef.current.instanceMatrix.needsUpdate = true
  }, [data, seg])

  if (!data.poles.length) return null
  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, undefined, data.poles.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#5fae57" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={frameRef} args={[frameGeo, undefined, Math.max(1, data.frames.length)]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.85} />
      </instancedMesh>
    </group>
  )
}

/* ---------------- корт (1 очередь) ---------------- */

export function Court({ seg }: { seg: SegModel }) {
  const chain = useMemo(makeChainlinkTexture, [])
  const chainL = useMemo(() => {
    const t = chain.clone()
    return t
  }, [chain])
  const postsRef = useRef<THREE.InstancedMesh>(null!)
  const H = 4
  const c = seg.court
  const posts = useMemo(() => {
    if (!c) return [] as [number, number][]
    const res: [number, number][] = []
    const step = 4
    for (let i = 0; i <= c.w; i += step) res.push([c.x - c.w / 2 + i, c.z - c.l / 2], [c.x - c.w / 2 + i, c.z + c.l / 2])
    for (let j = step; j < c.l; j += step) res.push([c.x - c.w / 2, c.z - c.l / 2 + j], [c.x + c.w / 2, c.z - c.l / 2 + j])
    return res
  }, [c])
  useLayoutEffect(() => {
    if (!c || !postsRef.current) return
    const m = new THREE.Matrix4()
    posts.forEach(([px, pz], i) => {
      m.identity()
      m.setPosition(px, H / 2, pz)
      postsRef.current.setMatrixAt(i, m)
    })
    postsRef.current.instanceMatrix.needsUpdate = true
  }, [posts, c])
  if (!c) return null
  chain.repeat.set(c.w / 0.55, H / 0.55)
  chainL.repeat.set(c.l / 0.55, H / 0.55)
  return (
    <group>
      {[c.z - c.l / 2, c.z + c.l / 2].map((zz, i) => (
        <mesh key={i} position={[c.x, H / 2, zz]}>
          <planeGeometry args={[c.w, H]} />
          <meshStandardMaterial color="#9aa0a5" alphaMap={chain} transparent alphaTest={0.35} side={THREE.DoubleSide} roughness={0.6} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[c.x + c.w / 2, H / 2, c.z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[c.l, H]} />
        <meshStandardMaterial color="#9aa0a5" alphaMap={chainL} transparent alphaTest={0.35} side={THREE.DoubleSide} roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[c.x - c.w / 2, H / 2, c.z + c.l / 4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[c.l / 2 - 2, H]} />
        <meshStandardMaterial color="#9aa0a5" alphaMap={chainL} transparent alphaTest={0.35} side={THREE.DoubleSide} roughness={0.6} metalness={0.6} />
      </mesh>
      <instancedMesh ref={postsRef} args={[postGeo(), undefined, Math.max(1, posts.length)]} frustumCulled={false}>
        <meshStandardMaterial color="#3a3d40" roughness={0.5} metalness={0.7} />
      </instancedMesh>
      <Hoop x={c.x} z={c.z - c.l / 2 + 1.6} rot={0} />
      <Hoop x={c.x} z={c.z + c.l / 2 - 1.6} rot={Math.PI} />
    </group>
  )
}

function postGeo() {
  return new THREE.CylinderGeometry(0.05, 0.05, 4, 6)
}

function Hoop({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 3.5, 8]} />
        <meshStandardMaterial color="#2f3235" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.2, 0.65]}>
        <boxGeometry args={[1.8, 1.05, 0.05]} />
        <meshStandardMaterial color="#e8ecec" roughness={0.4} />
      </mesh>
      <mesh position={[0, 3.05, 0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.23, 0.02, 8, 16]} />
        <meshStandardMaterial color="#d96a2b" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

/* ---------------- террасные ступени у пруда ---------------- */

export function PondTerraces({ seg }: { seg: SegModel }) {
  const geo = useMemo(() => {
    const pond = seg.ponds[0]
    if (!pond) return null
    const parts: THREE.BufferGeometry[] = []
    for (let step = 0; step < 3; step++) {
      const pts: Pt[] = []
      for (let a = Math.PI * 0.75; a <= Math.PI * 1.45; a += 0.06) {
        const r = 1.04 + step * 0.16
        pts.push({ x: pond.cx + Math.cos(a) * pond.rx * r, z: pond.cz + Math.sin(a) * pond.rz * r })
      }
      const yTop = WATER_LEVEL + 0.32 + step * 0.3
      parts.push(wallGeometry(pts, 1.4, 0.28, () => yTop - 0.28, 2))
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#b9b3a8" roughness={0.9} />
    </mesh>
  )
}

/* ---------------- болларды входов ---------------- */

export function Bollards({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const spots = useMemo(() => {
    const res: [number, number][] = []
    const a = promAt(seg, 6)
    const b = promAt(seg, seg.lengthM - 6)
    for (let i = 0; i < 7; i++) res.push([a.x, a.z - 9 + i * 3])
    for (let i = 0; i < 7; i++) res.push([b.x, b.z - 9 + i * 3])
    return res
  }, [seg])
  const bodyRef = useRef<THREE.InstancedMesh>(null!)
  const ringRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([bx, bz], i) => {
      m.identity()
      m.setPosition(bx, heightAt(seg, bx, bz), bz)
      bodyRef.current.setMatrixAt(i, m)
      ringRef.current.setMatrixAt(i, m)
    })
    bodyRef.current.instanceMatrix.needsUpdate = true
    ringRef.current.instanceMatrix.needsUpdate = true
  }, [spots, seg])
  useFrame((_, delta) => {
    if (matRef.current)
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(matRef.current.emissiveIntensity, night ? 2.4 : 0.15, Math.min(1, delta * 2))
  })
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[bollardGeo(), undefined, spots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#2c2f33" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={ringRef} args={[bollardRingGeo(), undefined, spots.length]} frustumCulled={false}>
        <meshStandardMaterial ref={matRef} color="#d8cdb8" emissive="#ffc98a" emissiveIntensity={0.15} />
      </instancedMesh>
    </group>
  )
}

function bollardGeo() {
  const g = new THREE.CylinderGeometry(0.075, 0.09, 0.85, 8)
  g.translate(0, 0.425, 0)
  return g
}
function bollardRingGeo() {
  const g = new THREE.CylinderGeometry(0.078, 0.078, 0.08, 8)
  g.translate(0, 0.78, 0)
  return g
}

/* ---------------- порталы между этапами ---------------- */

export function Portals({ seg }: { seg: SegModel }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state) => {
    if (matRef.current) matRef.current.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 2.2) * 0.15
  })
  return (
    <group>
      {seg.portals.map((p) => {
        const y = heightAt(seg, p.x, p.z)
        return (
          <group key={p.to + p.x} position={[p.x, y, p.z]}>
            <mesh position={[0, 1.6, 0]}>
              <torusGeometry args={[1.9, 0.1, 10, 40]} />
              <meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={1.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.6, 0]}>
              <circleGeometry args={[1.8, 32]} />
              <meshBasicMaterial ref={matRef} color="#8ff2a0" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export default function Props({ segId }: { segId: keyof typeof SEGMENTS }) {
  const seg = SEGMENTS[segId]
  return (
    <group>
      <Lamps seg={seg} />
      <Benches seg={seg} />
      <Stela seg={seg} />
      <Kulan seg={seg} />
      <PlayProps seg={seg} />
      <Court seg={seg} />
      <PondTerraces seg={seg} />
      <Bollards seg={seg} />
      <Portals seg={seg} />
      {seg.id !== 's1' && <Stage2Props seg={seg} />}
    </group>
  )
}
