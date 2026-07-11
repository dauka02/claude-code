import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt } from '../data/geo'
import { mkPeople, mkWood } from './assets'
import { alongPoly, polyLength, resample } from './util'
import { useApp } from '../store/useAppStore'

function rng(seedInit: number) {
  let a = seedInit >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------- фонари ---------------- */

function Lamps() {
  const data = useMemo(() => {
    const dbl: [number, number, number][] = [] // бульварные двойные
    const park: [number, number, number][] = [] // парковые торшеры 4 м
    for (const r of ALM.roads) {
      if (r.kind !== 'boulevard') continue
      const pts = resample(r.points, 34)
      for (const [x, z] of pts) dbl.push([x, heightAt(x, z), z])
    }
    const wpts = resample(ALM.alley.walk, 36)
    for (const [x, z] of wpts) park.push([x + 2.6, heightAt(x + 2.6, z), z])
    return { dbl, park }
  }, [])

  const dblGeo = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 6)
    pole.translate(0, 4.5, 0)
    const arm1 = new THREE.BoxGeometry(3.6, 0.12, 0.12)
    arm1.translate(0, 8.8, 0)
    const h1 = new THREE.BoxGeometry(0.7, 0.15, 0.3)
    h1.translate(1.7, 8.95, 0)
    const h2 = h1.clone()
    h2.translate(-3.4, 0, 0)
    return mergeGeometries([pole, arm1, h1, h2], false)!
  }, [])
  const parkGeo = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 4, 6)
    pole.translate(0, 2, 0)
    const head = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8)
    head.translate(0, 4.15, 0)
    return mergeGeometries([pole, head], false)!
  }, [])

  const dblRef = useRef<THREE.InstancedMesh>(null!)
  const parkRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    data.dbl.forEach(([x, y, z], i) => {
      m.identity()
      m.setPosition(x, y, z)
      dblRef.current.setMatrixAt(i, m)
    })
    dblRef.current.instanceMatrix.needsUpdate = true
    data.park.forEach(([x, y, z], i) => {
      m.identity()
      m.setPosition(x, y, z)
      parkRef.current.setMatrixAt(i, m)
    })
    parkRef.current.instanceMatrix.needsUpdate = true
  }, [data])

  return (
    <group>
      <instancedMesh ref={dblRef} args={[dblGeo, undefined, data.dbl.length]} frustumCulled={false}>
        <meshStandardMaterial color="#3d4145" roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={parkRef} args={[parkGeo, undefined, data.park.length]} frustumCulled={false}>
        <meshStandardMaterial color="#4a4640" roughness={0.6} metalness={0.4} />
      </instancedMesh>
    </group>
  )
}

/* ---------------- скамьи вдоль аллеи ---------------- */

function Benches() {
  const wood = useMemo(mkWood, [])
  const spots = useMemo(() => {
    const pts = resample(ALM.alley.walk, 52)
    return pts.map(([x, z], i) => ({ x: x - 3, z, rot: (i * 977) % 6.28 * 0 }))
  }, [])
  const geo = useMemo(() => {
    const seat = new THREE.BoxGeometry(1.9, 0.08, 0.55)
    seat.translate(0, 0.45, 0)
    const legs = new THREE.BoxGeometry(1.7, 0.42, 0.08)
    legs.translate(0, 0.21, 0)
    const back = new THREE.BoxGeometry(1.9, 0.5, 0.07)
    back.rotateX(-0.2)
    back.translate(0, 0.72, -0.28)
    return mergeGeometries([seat, legs, back], false)!
  }, [])
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach((s, i) => {
      m.identity()
      m.setPosition(s.x, heightAt(s.x, s.z), s.z)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, spots.length]} castShadow frustumCulled={false}>
      <meshStandardMaterial map={wood} roughness={0.8} />
    </instancedMesh>
  )
}

/* ---------------- машины ---------------- */

function carGeo(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(4.2, 0.9, 1.8)
  body.translate(0, 0.65, 0)
  const cab = new THREE.BoxGeometry(2.2, 0.7, 1.6)
  cab.translate(-0.2, 1.4, 0)
  return mergeGeometries([body, cab], false)!
}

const CAR_COLORS = ['#c8c9cc', '#3f4750', '#7a2f2a', '#2f4d6e', '#e8e6e0', '#54524c']

function Cars() {
  const quality = useApp((s) => s.quality)
  const geo = useMemo(carGeo, [])
  const parked = useMemo(() => {
    const rand = rng(777)
    const res: { x: number; z: number; rot: number; c: number }[] = []
    for (const r of ALM.roads) {
      if (r.kind !== 'boulevard') continue
      const pts = resample(r.points, 60)
      for (const [x, z] of pts) {
        if (rand() < 0.5) continue
        const off = r.width / 2 - 1.4
        res.push({ x, z: z + (rand() < 0.5 ? off : -off), rot: rand() * 0.06, c: Math.floor(rand() * 6) })
      }
    }
    return res.slice(0, 46)
  }, [])
  const parkedRef = useRef<THREE.InstancedMesh>(null!)
  const movingRef = useRef<THREE.InstancedMesh>(null!)
  const movers = useMemo(() => {
    const rand = rng(555)
    const blvds = ALM.roads.filter((r) => r.kind === 'boulevard' && r.points.length > 20)
    return Array.from({ length: quality === 'low' ? 6 : 14 }, (_, i) => ({
      road: blvds[i % blvds.length],
      d: rand() * 2000,
      speed: 7 + rand() * 5,
      side: rand() < 0.5 ? -3.2 : 3.2,
      c: Math.floor(rand() * 6),
    }))
  }, [quality])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    parked.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot)
      m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), q, new THREE.Vector3(1, 1, 1))
      parkedRef.current.setMatrixAt(i, m)
      parkedRef.current.setColorAt(i, color.set(CAR_COLORS[p.c]))
    })
    parkedRef.current.instanceMatrix.needsUpdate = true
    if (parkedRef.current.instanceColor) parkedRef.current.instanceColor.needsUpdate = true
    movers.forEach((mv, i) => movingRef.current.setColorAt(i, color.set(CAR_COLORS[mv.c])))
    if (movingRef.current.instanceColor) movingRef.current.instanceColor.needsUpdate = true
  }, [parked, movers])

  useFrame((_, delta) => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    movers.forEach((mv, i) => {
      const len = polyLength(mv.road.points)
      mv.d = (mv.d + mv.speed * delta) % len
      const p = alongPoly(mv.road.points, mv.d)
      const nx = -p.dz * mv.side
      const nz = p.dx * mv.side
      q.setFromAxisAngle(up, -Math.atan2(p.dz, p.dx) + (mv.side > 0 ? Math.PI : 0))
      m.compose(
        new THREE.Vector3(p.x + nx, heightAt(p.x + nx, p.z + nz) + 0.02, p.z + nz),
        q,
        new THREE.Vector3(1, 1, 1),
      )
      movingRef.current.setMatrixAt(i, m)
    })
    movingRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={parkedRef} args={[geo, undefined, parked.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.4} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={movingRef} args={[geo, undefined, movers.length]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.4} metalness={0.5} />
      </instancedMesh>
    </group>
  )
}

/* ---------------- люди (билборды) ---------------- */

function People() {
  const tex = useMemo(mkPeople, [])
  const count = 150
  const ref = useRef<THREE.InstancedMesh>(null!)
  const walkers = useMemo(() => {
    const rand = rng(999)
    return Array.from({ length: 26 }, () => ({
      d: rand() * 6000,
      speed: 0.9 + rand() * 0.7,
    }))
  }, [])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.62, 1.85)
    g.translate(0, 0.925, 0)
    // случайный силуэт из атласа 8 колонок
    return g
  }, [])

  const statics = useMemo(() => {
    const rand = rng(313)
    const res: { x: number; z: number }[] = []
    const spots = [...ALM.pois.map((p) => [p.x, p.z] as [number, number])]
    for (const [px, pz] of spots) {
      for (let i = 0; i < 9; i++) res.push({ x: px + (rand() * 2 - 1) * 26, z: pz + (rand() * 2 - 1) * 22 })
    }
    return res.slice(0, count - walkers.length)
  }, [walkers.length])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    statics.forEach((s, i) => {
      m.identity()
      m.setPosition(s.x, heightAt(s.x, s.z), s.z)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [statics])

  useFrame(({ camera }, delta) => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    // билборды к камере (только yaw)
    const face = Math.atan2(camera.position.x, camera.position.z)
    void face
    const wlen = polyLength(ALM.alley.walk)
    walkers.forEach((w, i) => {
      w.d = (w.d + w.speed * delta) % wlen
      const p = alongPoly(ALM.alley.walk, w.d)
      const yaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), q, new THREE.Vector3(1, 1, 1))
      ref.current.setMatrixAt(statics.length + i, m)
    })
    // статичные — тоже поворачиваем к камере раз в кадр (дёшево при 150)
    statics.forEach((s, i) => {
      const yaw = Math.atan2(camera.position.x - s.x, camera.position.z - s.z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z), q, new THREE.Vector3(1, 1, 1))
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial map={tex} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.9} />
    </instancedMesh>
  )
}

export default function Life() {
  return (
    <group>
      <Lamps />
      <Benches />
      <Cars />
      <People />
    </group>
  )
}
