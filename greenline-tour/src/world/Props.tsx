import * as THREE from 'three'
import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  COURT,
  LENGTH,
  PATH_CURVE,
  RUBBER,
  WATER_LEVEL,
  heightAt,
  pathXAt,
  rng,
} from './constants'
import { offsetPolyline, samplePath, wallGeometry, type Pt } from './geometry'
import { useWallSegments } from './Boulevard'
import {
  makeChainlinkTexture,
  makeGlowTexture,
  makeStelaTexture,
  makeWoodTexture,
} from './textures'
import { useTour } from '../store'

export const MODELS = {
  kulan: '/assets/models/kulan.glb',
  stela: '/assets/models/stela.glb',
  bench: '/assets/models/bench_angular.glb',
  lamp: '/assets/models/lamp.glb',
} as const

/* ------------------------------------------------------------------ */
/* GLB loading with graceful procedural fallback                       */
/* ------------------------------------------------------------------ */

class GLBBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    /* asset missing — procedural fallback stays */
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

/** Hero asset: try the Higgsfield GLB, fall back to procedural geometry. */
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

/* ------------------------------------------------------------------ */
/* Street lamps — 8.5 m, wood-painted metal, 4 heads, 3000K            */
/* ------------------------------------------------------------------ */

let lampCache: { x: number; z: number; y: number }[] | null = null
export function lampPositions() {
  if (lampCache) return lampCache
  const pts = samplePath(PATH_CURVE, 64)
  const res: { x: number; z: number; y: number }[] = []
  for (let i = 2; i < pts.length - 2; i += 2) {
    const side = (i / 2) % 2 === 0 ? 1 : -1
    const [o] = offsetPolyline(pts.slice(i, i + 2), side * 2.9)
    if (o.z < 4 || o.z > LENGTH - 4) continue
    res.push({ x: o.x, z: o.z, y: heightAt(o.x, o.z) })
  }
  lampCache = res
  return res
}

const HEAD_OFFSETS: [number, number, number][] = [
  [0.32, 7.55, 0],
  [-0.3, 7.85, 0.1],
  [0.1, 8.15, -0.3],
  [-0.08, 8.32, 0.28],
]

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

export function Lamps() {
  const night = useTour((s) => s.night)
  const positions = useMemo(lampPositions, [])
  const bodyRef = useRef<THREE.InstancedMesh>(null!)
  const headsRef = useRef<THREE.InstancedMesh>(null!)
  const headsMat = useRef<THREE.MeshStandardMaterial>(null!)
  const glowMat = useRef<THREE.PointsMaterial>(null!)

  const bodyGeo = useMemo(lampBodyGeometry, [])
  const headsGeo = useMemo(lampHeadsGeometry, [])
  const glowTex = useMemo(makeGlowTexture, [])

  const glowGeo = useMemo(() => {
    const pos: number[] = []
    for (const l of positions)
      for (const [hx, hy, hz] of HEAD_OFFSETS) pos.push(l.x + hx, l.y + hy, l.z + hz)
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
      headsMat.current.emissiveIntensity = THREE.MathUtils.lerp(
        headsMat.current.emissiveIntensity,
        night ? 3.2 : 0.0,
        k,
      )
    if (glowMat.current)
      glowMat.current.opacity = THREE.MathUtils.lerp(glowMat.current.opacity, night ? 0.55 : 0, k)
  })

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, positions.length]} castShadow frustumCulled={false}>
        {/* metal painted as natural wood */}
        <meshStandardMaterial color="#8a6a44" roughness={0.6} metalness={0.35} />
      </instancedMesh>
      <instancedMesh ref={headsRef} args={[headsGeo, undefined, positions.length]} frustumCulled={false}>
        <meshStandardMaterial
          ref={headsMat}
          color="#d8d4c8"
          emissive="#ffbe78"
          emissiveIntensity={0}
          roughness={0.4}
        />
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
      {/* one hero GLB lamp by the entrance plaza */}
      <Hero
        url={MODELS.lamp}
        height={8.5}
        position={[pathXAt(14) + 4.2, heightAt(pathXAt(14) + 4.2, 14), 14]}
        fallback={null}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Benches (classic + angular on retaining walls) and urns             */
/* ------------------------------------------------------------------ */

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

function angularBenchGeometry(): THREE.BufferGeometry {
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

export function Benches() {
  const wood = useMemo(makeWoodTexture, [])
  const segs = useWallSegments()
  const classicGeo = useMemo(classicBenchGeometry, [])
  const angularGeo = useMemo(angularBenchGeometry, [])
  const classicRef = useRef<THREE.InstancedMesh>(null!)
  const angularRef = useRef<THREE.InstancedMesh>(null!)
  const urnRef = useRef<THREE.InstancedMesh>(null!)

  const classicSpots = useMemo(() => {
    const pts = samplePath(PATH_CURVE, 40)
    const res: { p: Pt; rot: number }[] = []
    for (let i = 3; i < pts.length - 2; i += 3) {
      const side = i % 2 === 0 ? 1 : -1
      const [o] = offsetPolyline(pts.slice(i, i + 2), side * 2.7)
      const dir = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
      res.push({ p: o, rot: dir + (side > 0 ? Math.PI : 0) })
    }
    return res
  }, [])

  const angularSpots = useMemo(() => {
    const res: { p: Pt; rot: number }[] = []
    segs.forEach((s, i) => {
      if (s.type === 2 || i % 3 !== 0) return
      const mid = Math.floor(s.pts.length / 2)
      const a = s.pts[Math.max(0, mid - 1)]
      const b = s.pts[Math.min(s.pts.length - 1, mid + 1)]
      const dir = Math.atan2(b.x - a.x, b.z - a.z)
      res.push({ p: s.pts[mid], rot: dir + Math.PI / 2 + (s.side > 0 ? Math.PI : 0) })
    })
    return res
  }, [segs])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    classicSpots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(new THREE.Vector3(s.p.x, heightAt(s.p.x, s.p.z), s.p.z), q, new THREE.Vector3(1, 1, 1))
      classicRef.current.setMatrixAt(i, m)
      // urn next to bench
      q.setFromAxisAngle(up, s.rot)
      const ux = s.p.x + Math.cos(s.rot) * 1.3
      const uz = s.p.z - Math.sin(s.rot) * 1.3
      m.compose(new THREE.Vector3(ux, heightAt(ux, uz), uz), q, new THREE.Vector3(1, 1, 1))
      urnRef.current.setMatrixAt(i, m)
    })
    classicRef.current.instanceMatrix.needsUpdate = true
    urnRef.current.instanceMatrix.needsUpdate = true
    angularSpots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(
        new THREE.Vector3(s.p.x, heightAt(s.p.x, s.p.z) + 0.42, s.p.z),
        q,
        new THREE.Vector3(1, 1, 1),
      )
      angularRef.current.setMatrixAt(i, m)
    })
    angularRef.current.instanceMatrix.needsUpdate = true
  }, [classicSpots, angularSpots])

  return (
    <group>
      <instancedMesh ref={classicRef} args={[classicGeo, undefined, classicSpots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={urnRef} args={[urnGeo(), undefined, classicSpots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#26282a" roughness={0.7} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={angularRef} args={[angularGeo, undefined, angularSpots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.75} />
      </instancedMesh>
      {/* hero GLB angular bench showcased near the first type-2 wall */}
      <Hero
        url={MODELS.bench}
        height={0.85}
        position={[pathXAt(52) - 3.4, heightAt(pathXAt(52) - 3.4, 52), 52]}
        rotationY={0.9}
        fallback={null}
      />
    </group>
  )
}

function urnGeo() {
  const g = new THREE.CylinderGeometry(0.22, 0.18, 0.6, 10)
  g.translate(0, 0.3, 0)
  return g
}

/* ------------------------------------------------------------------ */
/* Stela THE GREEN LINE                                                */
/* ------------------------------------------------------------------ */

export function Stela() {
  const night = useTour((s) => s.night)
  const mapTex = useMemo(makeStelaTexture, [])
  const screenMat = useRef<THREE.MeshStandardMaterial>(null!)
  const x = pathXAt(8) - 5
  const z = 10
  const y = heightAt(x, z)
  useFrame((_, delta) => {
    if (screenMat.current)
      screenMat.current.emissiveIntensity = THREE.MathUtils.lerp(
        screenMat.current.emissiveIntensity,
        night ? 1.6 : 0.55,
        Math.min(1, delta * 2),
      )
  })
  const fallback = (
    <group position={[x, y, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.62, 2.6, 0.3]} />
        <meshStandardMaterial color="#22262b" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.32, 0.16]}>
        <planeGeometry args={[0.54, 2.3]} />
        <meshStandardMaterial
          ref={screenMat}
          map={mapTex}
          emissive="#cfe8d2"
          emissiveMap={mapTex}
          emissiveIntensity={0.55}
          roughness={0.4}
        />
      </mesh>
    </group>
  )
  return <Hero url={MODELS.stela} height={2.6} position={[x, y, z]} rotationY={0.5} fallback={fallback} />
}

/* ------------------------------------------------------------------ */
/* Kulan play sculpture (~6 m, stacked wooden slats) + play props      */
/* ------------------------------------------------------------------ */

function kulanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const slat = 0.16
  // body: horizontal slat stack, elliptical profile
  for (let i = 0; i < 11; i++) {
    const y = 2.3 + i * slat
    const t = (i / 10) * Math.PI
    const w = 1.15 * (0.55 + 0.45 * Math.sin(t))
    const l = 3.4 * (0.62 + 0.38 * Math.sin(t))
    const g = new THREE.BoxGeometry(w, slat * 0.82, l)
    g.translate(0, y, -0.2)
    parts.push(g)
  }
  // neck: rising slanted stack
  for (let i = 0; i < 12; i++) {
    const y = 3.5 + i * slat
    const k = i / 11
    const g = new THREE.BoxGeometry(0.75 - k * 0.25, slat * 0.82, 1.15 - k * 0.35)
    g.translate(0, y, 1.35 + k * 0.9)
    parts.push(g)
  }
  // head: forward stack
  for (let i = 0; i < 5; i++) {
    const y = 5.42 + i * slat * 0.9
    const g = new THREE.BoxGeometry(0.5, slat * 0.75, 1.15 - i * 0.12)
    g.translate(0, y, 2.65 + i * 0.1)
    parts.push(g)
  }
  // ears
  for (const sx of [-0.14, 0.14]) {
    const ear = new THREE.BoxGeometry(0.1, 0.42, 0.16)
    ear.translate(sx, 6.25, 2.4)
    parts.push(ear)
  }
  // legs
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
  // slide from the side opening
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

export function Kulan() {
  const wood = useMemo(makeWoodTexture, [])
  const geo = useMemo(kulanGeometry, [])
  const x = RUBBER.x + 2
  const z = RUBBER.z + 6
  const y = heightAt(x, z)
  const fallback = (
    <mesh geometry={geo} position={[x, y, z]} rotation={[0, -0.7, 0]} castShadow receiveShadow>
      <meshStandardMaterial map={wood} roughness={0.8} />
    </mesh>
  )
  return <Hero url={MODELS.kulan} height={6} position={[x, y, z]} rotationY={-0.7} fallback={fallback} />
}

/** Green "cactus" play poles + small climbing logs on the rubber surface. */
export function PlayProps() {
  const rand = rng(6161)
  const poles = useMemo(() => {
    const res: { x: number; z: number; h: number; r: number }[] = []
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2
      const rr = rand() * 0.75
      const x = RUBBER.x - 4 + Math.cos(a) * RUBBER.rx * rr
      const z = RUBBER.z - 10 + Math.sin(a) * RUBBER.rz * rr * 0.5
      res.push({ x, z, h: 0.9 + rand() * 1.8, r: 0.12 + rand() * 0.1 })
    }
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => {
    const g = new THREE.CapsuleGeometry(1, 1, 3, 8)
    return g
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    poles.forEach((p, i) => {
      m.makeScale(p.r, p.h / 2, p.r)
      m.setPosition(p.x, heightAt(p.x, p.z) + p.h / 2, p.z)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [poles])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, poles.length]} castShadow frustumCulled={false}>
      <meshStandardMaterial color="#5fae57" roughness={0.7} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Basketball court: chain-link fence + hoops                          */
/* ------------------------------------------------------------------ */

export function Court() {
  const chain = useMemo(makeChainlinkTexture, [])
  const H = 4
  const { x, z, w, l } = COURT
  const postsRef = useRef<THREE.InstancedMesh>(null!)
  const posts = useMemo(() => {
    const res: [number, number][] = []
    const step = 4
    for (let i = 0; i <= w; i += step) {
      res.push([x - w / 2 + i, z - l / 2], [x - w / 2 + i, z + l / 2])
    }
    for (let j = step; j < l; j += step) {
      res.push([x - w / 2, z - l / 2 + j], [x + w / 2, z - l / 2 + j])
    }
    return res
  }, [x, z, w, l])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    posts.forEach(([px, pz], i) => {
      m.identity()
      m.setPosition(px, H / 2, pz)
      postsRef.current.setMatrixAt(i, m)
    })
    postsRef.current.instanceMatrix.needsUpdate = true
  }, [posts])

  const fenceMat = (
    <meshStandardMaterial
      color="#9aa0a5"
      alphaMap={chain}
      transparent
      alphaTest={0.35}
      side={THREE.DoubleSide}
      roughness={0.6}
      metalness={0.6}
    />
  )
  chain.repeat.set(w / 0.55, H / 0.55)
  const chainL = chain.clone()
  chainL.repeat.set(l / 0.55, H / 0.55)

  return (
    <group>
      {/* fence sides (gate gap on the west side) */}
      <mesh position={[x, H / 2, z - l / 2]}>
        <planeGeometry args={[w, H]} />
        {fenceMat}
      </mesh>
      <mesh position={[x, H / 2, z + l / 2]}>
        <planeGeometry args={[w, H]} />
        {fenceMat}
      </mesh>
      <mesh position={[x + w / 2, H / 2, z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[l, H]} />
        <meshStandardMaterial
          color="#9aa0a5"
          alphaMap={chainL}
          transparent
          alphaTest={0.35}
          side={THREE.DoubleSide}
          roughness={0.6}
          metalness={0.6}
        />
      </mesh>
      <mesh position={[x - w / 2, H / 2, z + l / 4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[l / 2 - 2, H]} />
        <meshStandardMaterial
          color="#9aa0a5"
          alphaMap={chainL}
          transparent
          alphaTest={0.35}
          side={THREE.DoubleSide}
          roughness={0.6}
          metalness={0.6}
        />
      </mesh>
      <instancedMesh ref={postsRef} args={[postGeo(), undefined, posts.length]} frustumCulled={false}>
        <meshStandardMaterial color="#3a3d40" roughness={0.5} metalness={0.7} />
      </instancedMesh>
      <Hoop x={x} z={z - l / 2 + 1.6} rot={0} />
      <Hoop x={x} z={z + l / 2 - 1.6} rot={Math.PI} />
    </group>
  )
}

function postGeo() {
  const g = new THREE.CylinderGeometry(0.05, 0.05, 4, 6)
  return g
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

/* ------------------------------------------------------------------ */
/* Terraced concrete seating steps at the big pond                     */
/* ------------------------------------------------------------------ */

export function PondTerraces() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const cx = 14
    const cz = 300
    for (let step = 0; step < 3; step++) {
      const pts: Pt[] = []
      for (let a = Math.PI * 0.75; a <= Math.PI * 1.45; a += 0.06) {
        const r = 1.04 + step * 0.16
        pts.push({ x: cx + Math.cos(a) * 12 * r, z: cz + Math.sin(a) * 26 * 0.5 * r })
      }
      const yTop = WATER_LEVEL + 0.32 + step * 0.3
      parts.push(wallGeometry(pts, 1.4, 0.28, () => yTop - 0.28, 2))
    }
    return mergeGeometries(parts, false)!
  }, [])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#b9b3a8" roughness={0.9} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Entrance bollards with warm light rings                             */
/* ------------------------------------------------------------------ */

export function Bollards() {
  const night = useTour((s) => s.night)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const spots = useMemo(() => {
    const res: [number, number][] = []
    for (let i = 0; i < 8; i++) res.push([pathXAt(4) - 11 + i * 3.2, 17])
    for (let i = 0; i < 6; i++) res.push([pathXAt(LENGTH - 4) - 8 + i * 3.2, LENGTH - 16])
    return res
  }, [])
  const bodyRef = useRef<THREE.InstancedMesh>(null!)
  const ringRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([bx, bz], i) => {
      m.identity()
      m.setPosition(bx, heightAt(bx, bz), bz)
      bodyRef.current.setMatrixAt(i, m)
      ringRef.current.setMatrixAt(i, m)
    })
    bodyRef.current.instanceMatrix.needsUpdate = true
    ringRef.current.instanceMatrix.needsUpdate = true
  }, [spots])
  useFrame((_, delta) => {
    if (matRef.current)
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity,
        night ? 2.4 : 0.15,
        Math.min(1, delta * 2),
      )
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

export default function Props() {
  return (
    <group>
      <Lamps />
      <Benches />
      <Stela />
      <Kulan />
      <PlayProps />
      <Court />
      <PondTerraces />
      <Bollards />
    </group>
  )
}
